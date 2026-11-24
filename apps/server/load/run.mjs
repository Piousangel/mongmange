#!/usr/bin/env node
// B7 부하 발생기 — 새 의존성 없음(Node 내장 http만). 대상은 127.0.0.1만 허용한다(외부 호스트로 부하를 보내지 않는다).
//
// 두 방식
//  - open(기본): 목표 rps로 일정하게 쏜다(응답이 늦어도 다음 요청은 제때 나감 → 실제 사용자 유입처럼 줄이 쌓이는 모양이 보인다)
//  - closed: 동시 연결 N개가 응답을 받자마자 다음을 보낸다(처리량 한계·무릎 찾기)
//
// 클라이언트 IP 흉내: 서버는 XFF 오른쪽에서 TRUSTED_PROXY_HOPS_WEB(로컬 2)번째를 클라이언트로 본다.
//  --ip unique  요청마다 다른 IPv4(입소문: 서로 다른 사람들)    → "10.a.b.c, 35.191.0.1"
//  --ip pool:N  N개 IP를 돌려 씀
//  --ip fixed   한 IP(레이트 리밋 경계 시험)
//  --ip none    XFF 없음(소켓 주소 = 도커 게이트웨이 하나)
//
// 예) node run.mjs --url http://127.0.0.1:8160/m/B7HQTPX1 --rps 60 --sec 20 --ip unique
//     node run.mjs --url http://127.0.0.1:8160/m/B7HQTPX1/seen --method POST --rps 60 --sec 20 --ip unique
//     node run.mjs --url http://127.0.0.1:8160/m/B7HQTPX1 --mode closed --conc 40 --sec 15 --ip unique
import http from 'node:http';
import { performance } from 'node:perf_hooks';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
    return acc;
  }, []),
);
const url = new URL(args.url ?? 'http://127.0.0.1:8160/healthz');
if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname)) {
  console.error('대상은 로컬 주소(127.0.0.1)만 허용합니다');
  process.exit(2);
}
const method = (args.method ?? 'GET').toUpperCase();
const mode = args.mode ?? 'open';
const rps = Number(args.rps ?? 20);
const sec = Number(args.sec ?? 10);
const conc = Number(args.conc ?? 20);
const timeoutMs = Number(args.timeout ?? 10_000);
const ipMode = args.ip ?? 'unique';
const label = args.label ?? `${method} ${url.pathname}`;
const body = args.body ?? (method === 'POST' ? '' : undefined);
const ctype = args.ctype;
const extraHeaders = args.header ? Object.fromEntries([args.header.split(/:\s*/)]) : {};

const agent = new http.Agent({ keepAlive: true, maxSockets: Math.max(conc, 512) });

let seq = 0;
const pool = ipMode.startsWith('pool:') ? Number(ipMode.slice(5)) : 0;
function clientIp() {
  const n = ipMode === 'fixed' ? 7 : pool ? seq % pool : seq;
  seq++;
  return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
}

const lat = [];
const status = {};
let errors = 0;
let timeouts = 0;
let inflight = 0;
let maxInflight = 0;
const errKinds = {};

function once() {
  return new Promise((resolve) => {
    const headers = { ...extraHeaders };
    if (ipMode !== 'none') headers['x-forwarded-for'] = `${clientIp()}, 35.191.0.1`;
    if (body !== undefined) {
      headers['content-length'] = Buffer.byteLength(body);
      if (ctype) headers['content-type'] = ctype;
    }
    const t0 = performance.now();
    inflight++;
    maxInflight = Math.max(maxInflight, inflight);
    let done = false;
    const finish = (code) => {
      if (done) return;
      done = true;
      inflight--;
      const ms = performance.now() - t0;
      if (code === 'timeout') timeouts++;
      else if (typeof code === 'string') {
        errors++;
        errKinds[code] = (errKinds[code] ?? 0) + 1;
      } else {
        status[code] = (status[code] ?? 0) + 1;
        lat.push(ms);
      }
      resolve();
    };
    const req = http.request({ host: url.hostname, port: url.port, path: url.pathname + url.search, method, headers, agent }, (res) => {
      res.resume();
      res.on('end', () => finish(res.statusCode));
      res.on('error', (e) => finish(e.code ?? 'res_error'));
    });
    req.setTimeout(timeoutMs, () => {
      finish('timeout');
      req.destroy();
    });
    req.on('error', (e) => finish(e.code ?? 'req_error'));
    if (body !== undefined) req.end(body);
    else req.end();
  });
}

function pct(sorted, p) {
  if (!sorted.length) return null;
  return +sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))].toFixed(1);
}

const start = performance.now();
const pending = [];
if (mode === 'closed') {
  const until = start + sec * 1000;
  const worker = async () => {
    while (performance.now() < until) await once();
  };
  await Promise.all(Array.from({ length: conc }, worker));
} else {
  // open: 10ms 틱마다 그때까지 나가야 할 만큼 보낸다
  let sent = 0;
  await new Promise((resolve) => {
    const tick = setInterval(() => {
      const elapsed = (performance.now() - start) / 1000;
      if (elapsed >= sec) {
        clearInterval(tick);
        resolve();
        return;
      }
      const due = Math.floor(elapsed * rps);
      while (sent < due) {
        pending.push(once());
        sent++;
      }
    }, 10);
  });
  await Promise.all(pending);
}
const wall = (performance.now() - start) / 1000;
lat.sort((a, b) => a - b);
const total = lat.length + errors + timeouts;
const out = {
  label,
  mode,
  target: mode === 'open' ? `${rps} rps × ${sec}s` : `conc ${conc} × ${sec}s`,
  ip: ipMode,
  sent: total,
  achievedRps: +(total / wall).toFixed(1),
  status,
  errors,
  errKinds,
  timeouts,
  maxInflight,
  ms: { p50: pct(lat, 50), p95: pct(lat, 95), p99: pct(lat, 99), max: lat.length ? +lat[lat.length - 1].toFixed(1) : null },
};
console.log(JSON.stringify(out));
agent.destroy();
