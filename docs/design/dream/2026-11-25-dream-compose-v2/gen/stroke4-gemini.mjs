// 몸 4획 몽망이 시안(Gemini) — 3안 × 2묶음 = 6장, 탐색 전용(앱 에셋 아님).
// 11-25 실행 시도: 같은 날 dream-compose.mjs probe가 402(선불 크레딧 소진)라 **실행하지 않았다**. 충전 뒤 그대로 실행한다.
// 키는 .env.local의 GEMINI_API_KEY 한 줄만 이 스크립트 안에서 읽고 출력·파일에 남기지 않는다. 첫 호출이 실패하면 바로 멈춘다.
// 실행: node docs/design/dream/2026-11-25-dream-compose-v2/gen/stroke4-gemini.mjs
// 비용: gemini-3.1-flash-image 1K 6장 ≈ $0.40(회의 2-tech-art 단가 $0.067 기준)
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '../../../../..');
const KEY = /^GEMINI_API_KEY\s*=\s*"?([^"\n]+)"?\s*$/m.exec(readFileSync(path.join(ROOT, '.env.local'), 'utf8'))[1].trim();
const MODEL = 'gemini-3.1-flash-image';
const REF = readFileSync(path.join(ROOT, 'docs/design/meetings/2026-11-25-owner-direction/exp/ref-mong.png')).toString('base64');
const LOG = path.join(DIR, 'log.txt');

const BASE =
  'The attached image is Mongmangi: a small round black ink-drop creature, wide bean/mochi dome (width:height 1.25:1), flat bottom, two white paper-dot eyes, three short brush hairs at the top right. ' +
  'IMPORTANT: keep the body silhouette, size and proportions EXACTLY as in the reference — the body must not grow, stretch or change shape. ' +
  'Style: sumi ink on warm off-white hanji paper, plain background, centered, lots of empty paper, square 1:1. No text, no letters, no seal, no signature, no other creatures, no faces other than its two white dots.';
const VARIANTS = {
  A: 'Around the body there are exactly FOUR bold hand-painted brush strokes in soft grey ink (lighter than the black body), separated from the body by a thin gap of paper: one sweeping along the back, one curving along the front side, one low flat stroke beneath it like a little mat, and one large broken circle (enso) framing the whole creature. Each stroke has visible brush pressure, a thick belly and a dry-brush tail.',
  B: 'Exactly FOUR bold hand-painted brush strokes in soft grey ink hug the body like a scarf or mantle, two on the back and two on the front side, never on top of the head and never on the black body itself, separated from the body by a thin line of paper. Visible brush pressure and dry-brush tails.',
  C: 'Exactly FOUR thick broken arcs of grey brush ink at increasing distances encircle the creature like ripples around a drop, each arc a different length and gap position, painted by hand with visible pressure and dry-brush ends. The arcs never touch the body.',
};
const SHOTS = [];
for (const batch of [1, 2]) for (const [k, v] of Object.entries(VARIANTS)) SHOTS.push({ name: `stroke4-${k}-${batch}`, text: `${BASE} ${v}${batch === 2 ? ' Make the four strokes clearly different in length and curvature, as if written by a different person.' : ''}` });

async function gen(shot) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify({ contents: [{ parts: [{ inlineData: { mimeType: 'image/png', data: REF } }, { text: shot.text }] }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1' } } }),
  });
  if (!res.ok) { appendFileSync(LOG, `${new Date().toISOString()} ${shot.name} HTTP ${res.status} ${(await res.text()).slice(0, 200).replaceAll(KEY, '***')}\n`); return false; }
  const j = await res.json();
  const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part) { appendFileSync(LOG, `${new Date().toISOString()} ${shot.name} 이미지 없음\n`); return false; }
  writeFileSync(path.join(DIR, `${shot.name}.png`), Buffer.from(part.inlineData.data, 'base64'));
  appendFileSync(LOG, `${new Date().toISOString()} ${shot.name} OK ${MODEL} usage=${JSON.stringify(j.usageMetadata ?? {})}\n`);
  writeFileSync(path.join(DIR, `${shot.name}.prompt.txt`), shot.text);
  return true;
}
for (const s of SHOTS) { if (!(await gen(s))) { console.log(s.name, '실패 → 중단'); break; } console.log('saved', s.name); }
