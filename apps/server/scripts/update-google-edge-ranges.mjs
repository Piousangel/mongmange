#!/usr/bin/env node
// `/m/**` 앞단 확인용 Google 대역 갱신(B7a·B6 1안, src/common/web-edge.ts). 새 의존성 없음.
//
// 출처(Google 공식 — "Obtain Google IP address ranges", cloud.google.com/vpc/docs/configure-private-google-access#ip-addr-range):
//   https://www.gstatic.com/ipranges/goog.json   Google이 쓰는 공개 대역 전체(고객 Cloud 대역 포함)
//   https://www.gstatic.com/ipranges/cloud.json  고객이 빌려 쓸 수 있는 Google Cloud 대역(GCE·Cloud Run·Functions 출구 등)
// 결과 = goog − cloud: **Google 자체 서비스(Firebase Hosting·Google 프런트엔드 포함)만 쓰는 대역.** cloud를 빼지 않으면 공격자가 GCE VM 하나로 통과한다.
//
// 쓰는 법(apps/server에서): node scripts/update-google-edge-ranges.mjs [--check] [goog.json cloud.json]
//   인자가 없으면 내려받는다. src/common/google-edge-ranges.ts를 다시 쓰고, 대역 수를 출력한다 → 리뷰 후 커밋·배포.
//   --check: 파일을 쓰지 않고, 지금 스냅숏과 다르면 exit 1(대역이 바뀜 → 갱신 필요).
//   주기: **매일**(Google 문서 권고 — "자주 바뀌니 매일 자동으로", B7a 리뷰 L4). B6에서 매일 도는 예약 CI 작업이 `--check`를 돌려
//   바뀌었으면 갱신 PR·알림을 만든다. 부팅 때 스냅숏이 WEB_EDGE_STALE_DAYS(7일)를 넘으면 경고 로그 `web_edge_ranges_stale`.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../src/common/google-edge-ranges.ts');
const GOOG = 'https://www.gstatic.com/ipranges/goog.json';
const CLOUD = 'https://www.gstatic.com/ipranges/cloud.json';

async function load(arg, url) {
  if (arg) return JSON.parse(readFileSync(arg, 'utf8'));
  const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
}

/** CIDR → [시작, 끝] BigInt 구간 */
function range(cidr) {
  const [addr, lenS] = cidr.split('/');
  const v6 = addr.includes(':');
  const bits = v6 ? 128 : 32;
  const len = Number(lenS);
  let n = 0n;
  if (v6) {
    const [h, t] = addr.includes('::') ? addr.split('::') : [addr, ''];
    const hs = h ? h.split(':') : [];
    const ts = t ? t.split(':') : [];
    const groups = [...hs, ...new Array(8 - hs.length - ts.length).fill('0'), ...ts];
    for (const g of groups) n = (n << 16n) | BigInt(parseInt(g || '0', 16));
  } else {
    for (const o of addr.split('.')) n = (n << 8n) | BigInt(Number(o));
  }
  const size = 1n << BigInt(bits - len);
  const start = (n / size) * size;
  return { v6, start, end: start + size - 1n };
}

/** 구간 목록 a에서 b를 뺀다(둘 다 정렬·병합 전제 없음) */
function subtract(a, b) {
  let out = a.map((r) => [r.start, r.end]);
  for (const { start: bs, end: be } of b) {
    const next = [];
    for (const [s, e] of out) {
      if (be < s || bs > e) next.push([s, e]);
      else {
        if (bs > s) next.push([s, bs - 1n]);
        if (be < e) next.push([be + 1n, e]);
      }
    }
    out = next;
  }
  out.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
  const merged = [];
  for (const r of out) {
    const last = merged.at(-1);
    if (last && r[0] <= last[1] + 1n) last[1] = r[1] > last[1] ? r[1] : last[1];
    else merged.push([...r]);
  }
  return merged;
}

const args = process.argv.slice(2);
const check = args.includes('--check');
const files = args.filter((a) => a !== '--check');
const [goog, cloud] = await Promise.all([load(files[0], GOOG), load(files[1], CLOUD)]);
const cidrs = (j) => j.prefixes.map((p) => p.ipv4Prefix ?? p.ipv6Prefix).filter(Boolean).map(range);
const g = cidrs(goog);
const c = cidrs(cloud);
const v4 = subtract(g.filter((r) => !r.v6), c.filter((r) => !r.v6));
const v6 = subtract(g.filter((r) => r.v6), c.filter((r) => r.v6));
if (v4.length === 0 || v6.length === 0) throw new Error('대역이 비었습니다 — 출처 형식이 바뀌었는지 확인');
const hex = (n) => '0x' + n.toString(16);
const body = `// 자동 생성 — 손으로 고치지 않는다. 갱신: apps/server/scripts/update-google-edge-ranges.mjs (매일 --check, 바뀌면 갱신 — B6 예약 작업)
// 출처: ${GOOG} − ${CLOUD} (Google 자체 서비스 대역 = Firebase Hosting·Google 프런트엔드)
// goog syncToken ${goog.syncToken} (${goog.creationTime}) / cloud syncToken ${cloud.syncToken} (${cloud.creationTime})
export const GOOGLE_EDGE_RANGES = {
  createdAt: '${String(goog.creationTime).slice(0, 10)}',
  /** [시작, 끝] 포함 구간(정렬·병합됨) */
  v4: [
${v4.map(([s, e]) => `    [${Number(s)}, ${Number(e)}],`).join('\n')}
  ] as ReadonlyArray<readonly [number, number]>,
  v6: [
${v6.map(([s, e]) => `    [${hex(s)}n, ${hex(e)}n],`).join('\n')}
  ] as ReadonlyArray<readonly [bigint, bigint]>,
} as const;
`;
if (check) {
  let cur = '';
  try {
    cur = readFileSync(OUT, 'utf8');
  } catch {
    // 없으면 다름
  }
  // 머리 주석의 syncToken·시각은 날마다 바뀌므로 대역 본문만 비교한다
  const strip = (t) => t.replace(/^\/\/.*\n/gm, '').replace(/createdAt: '[^']*'/, '');
  if (strip(cur) !== strip(body)) {
    console.error(`Google 대역이 바뀌었습니다(v4 ${v4.length}·v6 ${v6.length} 구간) — 갱신 필요`);
    process.exit(1);
  }
  console.log('Google 대역 그대로');
  process.exit(0);
}
writeFileSync(OUT, body);
console.log(`goog ${g.length} − cloud ${c.length} → v4 ${v4.length} 구간, v6 ${v6.length} 구간 → ${OUT}`);
