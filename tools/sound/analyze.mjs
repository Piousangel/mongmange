// 효과음 검수: node tools/sound/analyze.mjs  (실패 항목이 있으면 exit 1)
// 귀 대신 숫자로 본다 — 포맷·피크·RMS·클리핑·양끝 클릭·루프 이음새·대역별 에너지(장난감 같은 고음 과다).
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SR, fft, nextPow2, decodeWav, hp } from './dsp.mjs';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'apps', 'mobile', 'assets', 'sounds');
const db = (v) => (v <= 0 ? -Infinity : 20 * Math.log10(v));
const BANDS = [[0, 250], [250, 1000], [1000, 4000], [4000, 8000], [8000, 22050]];

// 기준(v0): 4k 위 에너지 ≤ 3%, 8k 위 ≤ 0.5%, 무게중심 ≤ 2000Hz, 클리핑 0, 피크 ≤ -1dBFS,
// 원샷 양끝 1ms RMS ≤ -40dBFS·첫/끝 샘플 ≤ -60dBFS(클릭 없음), 루프 이음새 점프 ≤ 평소 샘플 변화의 4배, 이음새 레벨 차 ≤ max(3dB, 내부 이웃 창 차 p95+1dB).
// 폰 스피커 근사(리뷰 S2): 400Hz 2차 HP 두 단(4차) 뒤 RMS ≥ -30dBFS. 원샷은 가장 큰 300ms 창(소리가 실제로 나는 구간),
// 루프는 전체 RMS. 파일 레벨 기준이다(soundMap 음량 곱은 별도 — 문서 3절 표 참고).
const LIM = { hi4k: 0.03, hi8k: 0.005, centroid: 2000, edgeDb: -40, seamRatio: 4, peakDb: -1, spkDb: -30 };
const speaker = (x) => hp(hp(x, 400, 0.707), 400, 0.707);
function maxWindowRms(x, sec = 0.3, hopSec = 0.05) {
  const n = Math.round(sec * SR), h = Math.round(hopSec * SR);
  if (x.length <= n) return rms(x);
  let m = 0; for (let a = 0; a + n <= x.length; a += h) m = Math.max(m, rms(x, a, a + n));
  return m;
}

function spectrum(x) {
  const n = nextPow2(x.length);
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < x.length; i++) re[i] = x[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (x.length - 1)));
  fft(re, im);
  const band = BANDS.map(() => 0);
  let tot = 0, cw = 0;
  for (let k = 1; k < n / 2; k++) {
    const f = (k * SR) / n, p = re[k] * re[k] + im[k] * im[k];
    tot += p; cw += f * p;
    band[BANDS.findIndex(([a, b]) => f >= a && f < b)] += p;
  }
  return { share: band.map((b) => b / tot), centroid: cw / tot };
}

function rms(x, a = 0, b = x.length) { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); }

let fails = 0;
const files = readdirSync(DIR).filter((f) => f.endsWith('.wav')).sort();
console.log('file                      len(s)  peak   rms    clip  <250  250-1k 1-4k  4-8k  >8k   cent  spk(HP400) drop  edges/seam(jump, lvl/p95)  verdict');
for (const f of files) {
  const w = decodeWav(readFileSync(join(DIR, f)));
  const x = w.x, loop = f.includes('_loop');
  const issues = [];
  if (w.sr !== SR || w.bits !== 16 || w.ch !== 1) issues.push(`format ${w.sr}/${w.bits}/${w.ch}`);
  let peak = 0, clip = 0;
  for (const v of x) { const a = Math.abs(v); peak = Math.max(peak, a); if (a >= 32767 / 32768) clip++; }
  const { share, centroid } = spectrum(x);
  let edge;
  if (loop) {
    let sd = 0; for (let i = 1; i < x.length; i++) sd += Math.abs(x[i] - x[i - 1]);
    const meanStep = sd / (x.length - 1), jump = Math.abs(x[0] - x[x.length - 1]);
    const n50 = Math.round(0.25 * SR); // 저역 노이즈라 창을 넉넉히
    const lvl = db(rms(x, x.length - n50) / rms(x, 0, n50));
    // 이음새 레벨 차를 '루프 안쪽 이웃 창끼리의 평소 레벨 차(상위 95%)'와 비교한다 — 저역 노이즈는 원래 출렁인다.
    const diffs = [];
    for (let a = n50; a + 2 * n50 <= x.length; a += n50) diffs.push(Math.abs(db(rms(x, a + n50, a + 2 * n50) / rms(x, a, a + n50))));
    diffs.sort((p, q) => p - q);
    const p95 = diffs[Math.floor(diffs.length * 0.95)] ?? 0;
    edge = `seam ${(jump / meanStep).toFixed(2)}x ${lvl.toFixed(1)}/${p95.toFixed(1)}dB`;
    if (jump / meanStep > LIM.seamRatio) issues.push('seam jump');
    if (Math.abs(lvl) > Math.max(3, p95 + 1)) issues.push('seam level');
  } else {
    // 첫·끝 샘플이 0 근처이고 첫 1ms가 조용하면(=페이드로 0에서 출발) 클릭 없음
    const n1 = Math.round(0.001 * SR);
    const a = db(rms(x, 0, n1)), b = db(rms(x, x.length - n1));
    const s0 = db(Math.abs(x[0]) + 1e-9), s1 = db(Math.abs(x[x.length - 1]) + 1e-9);
    edge = `in ${a.toFixed(0)} out ${b === -Infinity ? '-inf' : b.toFixed(0)}dB`;
    if (a > LIM.edgeDb || b > LIM.edgeDb || s0 > -60 || s1 > -60) issues.push('edge click');
  }
  const sx = speaker(x);
  const spk = db(loop ? rms(sx) : maxWindowRms(sx));
  const spkDrop = db(rms(x) / rms(sx));
  if (spk < LIM.spkDb) issues.push('speaker too quiet');
  if (clip) issues.push('clipping');
  if (db(peak) > LIM.peakDb) issues.push('peak');
  if (share[3] + share[4] > LIM.hi4k) issues.push('>4k too bright');
  if (share[4] > LIM.hi8k) issues.push('>8k hiss');
  if (centroid > LIM.centroid) issues.push('centroid high');
  if (issues.length) fails++;
  const pct = (v) => (v * 100).toFixed(1).padStart(5);
  console.log(
    `${f.padEnd(25)} ${(x.length / SR).toFixed(2).padStart(6)} ${db(peak).toFixed(1).padStart(5)} ${db(rms(x)).toFixed(1).padStart(6)} ${String(clip).padStart(4)} ` +
    `${share.map(pct).join(' ')} ${centroid.toFixed(0).padStart(5)}  ${spk.toFixed(1).padStart(6)} ${spkDrop.toFixed(1).padStart(5)}    ${edge.padEnd(26)} ${issues.length ? 'FAIL ' + issues.join(', ') : 'ok'}`,
  );
}
console.log(`\n${files.length} files, ${fails} failed. (대역 값은 에너지 비율 %, cent = 스펙트럼 무게중심 Hz, spk = 400Hz HP 근사 RMS(원샷 최대 300ms 창), drop = 전체 RMS 하락 dB)`);
process.exit(fails ? 1 : 0);
