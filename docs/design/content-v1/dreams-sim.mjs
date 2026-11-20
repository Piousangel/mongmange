// 꿈 카드 고르기 규칙 시뮬레이터 — dreams-30days.md v1.1 2-5절 사양을 그대로 옮긴 것(core 구현 아님).
// 실행: node docs/design/content-v1/dreams-sim.mjs [회수=3000]
// 보는 것: 구역별 30·90밤 동안 규칙 R1~R4 위반(= 완화가 일어난 밤) 수, 30밤 안 같은 장면 재등장, '처음 꾼 꿈' 간격.
// C6(11-20): core 구현과 대조하려고 MOTIFS·pick·run·table을 내보낸다(packages/core/test/dream-rules.test.ts가 이 파일을 직접 불러
// ① 한 밤씩 같은 장면을 고르는지 ② core 고르기로 돌린 표가 아래 2-6 표와 같은지 본다). 규칙·수치는 바꾸지 않았다.
import { pathToFileURL } from 'node:url';

export const MOTIFS = [
  // id, zone, family, unlockAtCards  (dreams-30days.md 1-3 표와 같아야 한다)
  ['near-alone.quilt', 'near-alone', 'bed', 0],
  ['near-alone.teacup', 'near-alone', 'tea', 0],
  ['near-alone.inkstone', 'near-alone', 'desk', 3],
  ['near-alone.washing-line', 'near-alone', 'cloth', 7],
  ['near-alone.sprout', 'near-alone', 'plant', 12],
  ['near-with.window-hand', 'near-with', 'hand', 0],
  ['near-with.teacup-two', 'near-with', 'tea', 0],
  ['near-with.umbrella', 'near-with', 'rain', 3],
  ['near-with.letter', 'near-with', 'paper', 7],
  ['near-with.palm', 'near-with', 'hand', 12],
  ['far-alone.mountain', 'far-alone', 'land', 0],
  ['far-alone.sea', 'far-alone', 'sea', 0],
  ['far-alone.paper-boat', 'far-alone', 'sea', 3],
  ['far-alone.kite', 'far-alone', 'sky', 7],
  ['far-alone.path', 'far-alone', 'land', 12],
  ['far-with.stars-drops', 'far-with', 'stars', 0],
  ['far-with.sea-hand', 'far-with', 'sea', 0],
  ['far-with.geese', 'far-with', 'sky', 3],
  ['far-with.star-bridge', 'far-with', 'stars', 7],
  ['far-with.night-train', 'far-with', 'train', 12], // 형상 시험 실패 시 far-with.stepping-stones(가족 stones, 같은 해금)
  ['center.rain', 'center', 'rain', 0],
  ['center.moon', 'center', 'moon', 0],
  ['center.leaf', 'center', 'plant', 5],
  ['center.snow', 'center', 'snow', 9],
  ['center.wind', 'center', 'wind', 15],
].map(([id, zone, family, unlock]) => ({ id, zone, family, unlock }));

const W_SCENE = Number(process.env.W_SCENE ?? 18); // R1: 최근 18장 안 같은 장면 금지
const W_MOTIF = 2; // R2: 최근 2장 안 같은 모티프 금지
const W_FAMILY = 1; // R3: 직전 1장과 같은 가족 금지
const RUN_COMP = 3; // R4: 같은 구도 3장 연속 금지
const FIRST_GAP = 2; // R5: 직전 처음 꾼 꿈 뒤 2장 안이면 새 모티프 가중 낮춤
const MOON_PROTECT = 3;
const W_UNSEEN = Number(process.env.W_UNSEEN ?? 8); // 안 나온 장면 가중(30밤 재등장 줄이기) // 첫 3장은 보름 모티프 없음

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const famOf = (id, motifs = MOTIFS) => (id.startsWith('moon-') ? 'moon' : motifs.find((m) => m.id === id).family);

/** 2-5 사양. history = [{motifId, comp}] 오래된 것 → 최근. 반환: {pick, relaxed: Set}. motifs = 모티프 표(기본 위 표) */
export function pick(zone, history, rand, moonWindow, motifs = MOTIFS) {
  const n = history.length;
  const seenMotifs = new Set(history.map((h) => h.motifId));
  const pool = motifs.filter((m) => (m.zone === zone || m.zone === 'center') && m.unlock <= n)
    .filter((m) => !(moonWindow && m.id === 'center.moon'))
    .sort((a, b) => (a.id < b.id ? -1 : 1)); // 결정성: id 오름차순
  const scenes = [];
  for (const m of pool) for (const c of [0, 1, 2]) scenes.push({ motifId: m.id, comp: c });
  const key = (s) => `${s.motifId}/${s.comp}`;
  const lastIdx = (s) => { for (let i = n - 1; i >= 0; i--) if (key(history[i]) === key(s)) return i; return -1; };
  const recent = (k) => history.slice(Math.max(0, n - k));
  const R = {
    R1: (s) => !recent(W_SCENE).some((h) => key(h) === key(s)),
    R2: (s) => !recent(W_MOTIF).some((h) => h.motifId === s.motifId),
    R3: (s) => !recent(W_FAMILY).some((h) => famOf(h.motifId, motifs) === famOf(s.motifId, motifs)),
    R4: (s) => !(n >= RUN_COMP - 1 && recent(RUN_COMP - 1).every((h) => h.comp === s.comp)),
  };
  // 완화 순서: R4 → R3 → R2 → R1 (뒤쪽일수록 끝까지 지킨다)
  const order = ['R4', 'R3', 'R2', 'R1'];
  let active = [...order];
  let cands = [];
  const relaxed = new Set();
  for (;;) {
    cands = scenes.filter((s) => active.every((r) => R[r](s)));
    if (cands.length > 0 || active.length === 0) break;
    const r = active.shift();
    relaxed.add(r);
  }
  if (cands.length === 0) cands = scenes;
  // R1이 풀린 경우에도 '가장 오래된 장면'부터: 마지막으로 나온 때가 가장 이른 것들
  if (relaxed.has('R1')) {
    const oldest = Math.min(...cands.map(lastIdx));
    cands = cands.filter((s) => lastIdx(s) === oldest);
  }
  // 우선(규칙 아님): 남은 후보 중 아직 안 나온 장면이 있으면 그것들만 — 30밤 무반복에 가깝게
  if (!relaxed.has('R1')) { const u = cands.filter((s) => lastIdx(s) === -1); if (u.length > 0) cands = u; }
  // R5 가중
  let lastFirst = -99;
  { const seen = new Set(); history.forEach((h, i) => { if (!seen.has(h.motifId)) { seen.add(h.motifId); lastFirst = i; } }); }
  const wNew = n - lastFirst <= FIRST_GAP ? 0.25 : 2;
  // 가중 = 모티프 가중(R5)
  const weights = cands.map((s) => (seenMotifs.has(s.motifId) ? 1 : wNew));
  let t = rand() * weights.reduce((a, b) => a + b, 0);
  let i = 0; for (; i < cands.length - 1; i++) { t -= weights[i]; if (t < 0) break; }
  return { pick: cands[i], relaxed };
}

/** 한 회차. pickFn = 고르기 함수(기본 위 pick — 시험은 core 고르기를 같은 자리에 넣는다) */
export function run(zone, nights, seed, withMoon, pickFn = pick) {
  const rand = mulberry32(seed);
  const moonOffset = Math.floor(rand() * 30); // 보름 당일 밤의 위치(29.5일 주기)
  const isMoon = (night) => withMoon && [-1, 0, 1].some((d) => {
    for (let k = 0; k < 5; k++) if (night === Math.round(moonOffset + k * 29.53) + d) return true; return false;
  });
  const hist = [];
  const out = { R1: 0, R2: 0, R3: 0, R4: 0, repeat30: 0, firstNights: [] };
  const seen = new Set();
  for (let night = 1; night <= nights; night++) {
    const z = zone === 'center*' ? (rand() < 0.5 ? 'near' : 'far') + '-' + (rand() < 0.5 ? 'with' : 'alone') : zone;
    if (isMoon(night) && hist.length >= MOON_PROTECT) {
      hist.push({ motifId: 'moon-xx', comp: 1 });
      continue;
    }
    const { pick: p, relaxed } = pickFn(z, hist, rand, isMoon(night));
    for (const r of relaxed) out[r]++;
    if (night <= 30 && hist.some((h) => h.motifId === p.motifId && h.comp === p.comp)) out.repeat30++;
    if (!seen.has(p.motifId)) { seen.add(p.motifId); out.firstNights.push(night); }
    hist.push(p);
  }
  return out;
}

/** 2-6 표 한 줄씩(nightsList = 볼 밤 수, 기본 30·90): { zone, nights, moon, R1..R4, repeat30(회차당 평균, 소수 3자리), gap(소수 2자리) } */
export function table(RUNS, zones = ['near-alone', 'near-with', 'far-alone', 'far-with', 'center*'], pickFn = pick, nightsList = [30, 90]) {
  const rows = [];
  for (const nights of nightsList) for (const withMoon of [false, true]) for (const z of zones) {
    const agg = { R1: 0, R2: 0, R3: 0, R4: 0, repeat30: 0, gap: 0 };
    for (let s = 1; s <= RUNS; s++) {
      const o = run(z, nights, s * 7919 + nights, withMoon, pickFn);
      for (const k of ['R1', 'R2', 'R3', 'R4', 'repeat30']) agg[k] += o[k];
      const f = o.firstNights.filter((x) => x <= 30); let g = 0;
      for (let i = 1; i < f.length; i++) g = Math.max(g, f[i] - f[i - 1] - 1);
      agg.gap += g;
    }
    rows.push({ zone: z, nights, moon: withMoon, R1: agg.R1, R2: agg.R2, R3: agg.R3, R4: agg.R4, repeat30: (agg.repeat30 / RUNS).toFixed(3), gap: (agg.gap / RUNS).toFixed(2) });
  }
  return rows;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const RUNS = Number(process.argv[2] ?? 3000);
  const zones = process.env.ZONES ? process.env.ZONES.split(',') : undefined;
  console.log(`회수 ${RUNS} · R1 ${W_SCENE}장 · R2 ${W_MOTIF}장 · R3 ${W_FAMILY}장 · R4 ${RUN_COMP}연속 금지 · 보름 보호 ${MOON_PROTECT}장`);
  console.log('구역 | 밤 | 보름 | R1 R2 R3 R4 위반(모든 회차 합) | 1~30밤 같은 장면 재등장(회차당 평균) | 처음 꾼 꿈 최장 공백(밤, 회차 평균)');
  for (const r of table(RUNS, zones)) console.log(`${r.zone} | ${r.nights} | ${r.moon ? '있음' : '없음'} | ${r.R1} ${r.R2} ${r.R3} ${r.R4} | ${r.repeat30} | ${r.gap}`);
  // 처음 꾼 꿈 밤별 확률(near-alone, 보름 없음)
  const RUN2 = Math.min(RUNS, 3000); const hit = Array(31).fill(0);
  for (let s = 1; s <= RUN2; s++) for (const x of run('near-alone', 30, s * 104729, false).firstNights) hit[x]++;
  console.log('처음 꾼 꿈 밤별 확률(near-alone, 1~30밤):', hit.slice(1).map((h) => (h / RUN2).toFixed(2)).join(' '));
}
