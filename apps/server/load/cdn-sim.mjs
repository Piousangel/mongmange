#!/usr/bin/env node
// B7 CDN 흉내(Firebase Hosting `/m/**` 앞단 자리) — 공유 캐시가 원 서버(Nest)에 얼마를 넘기는지 보려는 도구. 새 의존성 없음.
// 실제 Firebase 동작(요청 합치기·엣지 수·stale 처리)은 [확인 필요: B6 실측] — 여기서는 두 끝을 켜고 끌 수 있게 했다.
//
//   node cdn-sim.mjs --port 8161 --origin http://127.0.0.1:8160 --edges 4 --ttl-scale 0.05 --collapse 1
//
//  - GET이고 응답 Cache-Control에 s-maxage(없으면 public max-age)가 있으면 URL 단위로 캐시. no-store·POST는 그대로 통과.
//  - --edges N: 클라이언트 IP(XFF 첫 값) 해시로 엣지 N개에 나눠 따로 캐시(엣지마다 미적중이 한 번씩 난다)
//  - --ttl-scale: 시험 시간을 줄이려 TTL을 곱한다(0.05 → s-maxage 300초가 15초)
//  - --collapse 1: 같은 키의 동시 미적중을 원 서버 요청 하나로 합친다(0이면 동시 미적중이 전부 원 서버로)
//  - 응답에 x-cache: HIT|MISS. GET /__stats → {hit, miss, pass, originRequests}
import http from 'node:http';

const a = Object.fromEntries(
  process.argv.slice(2).reduce((acc, x, i, all) => (x.startsWith('--') ? (acc.push([x.slice(2), all[i + 1]]), acc) : acc), []),
);
const PORT = Number(a.port ?? 8161);
const ORIGIN = new URL(a.origin ?? 'http://127.0.0.1:8160');
const EDGES = Number(a.edges ?? 1);
const SCALE = Number(a['ttl-scale'] ?? 1);
const COLLAPSE = (a.collapse ?? '1') === '1';
if (ORIGIN.hostname !== '127.0.0.1') throw new Error('원 서버는 127.0.0.1만');

const agent = new http.Agent({ keepAlive: true, maxSockets: 256 });
const caches = Array.from({ length: EDGES }, () => new Map());
const inflight = new Map();
const stats = { hit: 0, miss: 0, pass: 0, originRequests: 0 };

function ttlOf(cc) {
  if (!cc || /no-store|private/.test(cc)) return 0;
  const s = /s-maxage=(\d+)/.exec(cc) ?? (/public/.test(cc) ? /max-age=(\d+)/.exec(cc) : null);
  return s ? Number(s[1]) * 1000 * SCALE : 0;
}
function edgeOf(req) {
  const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  let h = 0;
  for (const ch of ip) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % EDGES;
}
function toOrigin(req, body) {
  stats.originRequests++;
  return new Promise((resolve, reject) => {
    const r = http.request(
      { host: ORIGIN.hostname, port: ORIGIN.port, path: req.url, method: req.method, headers: req.headers, agent },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      },
    );
    r.on('error', reject);
    r.end(body);
  });
}
function send(res, o, tag) {
  const h = { ...o.headers, 'x-cache': tag };
  delete h['transfer-encoding'];
  delete h.connection;
  h['content-length'] = o.body.length;
  res.writeHead(o.status, h);
  res.end(o.body);
}

http
  .createServer(async (req, res) => {
    if (req.url === '/__stats') return res.end(JSON.stringify(stats));
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    try {
      if (req.method !== 'GET') {
        stats.pass++;
        return send(res, await toOrigin(req, body), 'PASS');
      }
      const cache = caches[edgeOf(req)];
      const key = `${edgeOf(req)}|${req.url}`;
      const hit = cache.get(req.url);
      if (hit && hit.exp > Date.now()) {
        stats.hit++;
        return send(res, hit.o, 'HIT');
      }
      stats.miss++;
      let p = COLLAPSE ? inflight.get(key) : undefined;
      if (!p) {
        p = toOrigin(req, body).finally(() => inflight.delete(key));
        if (COLLAPSE) inflight.set(key, p);
      }
      const o = await p;
      const ttl = ttlOf(o.headers['cache-control']);
      if (ttl > 0 && o.status < 500) cache.set(req.url, { o, exp: Date.now() + ttl });
      send(res, o, 'MISS');
    } catch {
      res.writeHead(502).end('bad gateway');
    }
  })
  .listen(PORT, '127.0.0.1', () => console.log(`cdn-sim :${PORT} → ${ORIGIN.origin} edges=${EDGES} ttlScale=${SCALE} collapse=${COLLAPSE}`));
