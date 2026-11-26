// 의제 3 대표 시안용 — 사진 질감 조각(창·벼루·편지)을 '담묵 번짐' 기준 언어로 다시 그린 견본, 최대 3장. 탐색 전용(앱 에셋 아님).
// 키는 .env.local의 GEMINI_API_KEY만 이 스크립트 안에서 읽고 출력·파일에 남기지 않는다. 실패(402 등)하면 바로 멈춘다(재시도 0).
// 실행(저장소 루트): node docs/design/meetings/2026-11-26-planning-2/exp/gen/gen.mjs
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '../../../../../..');
const KEY = /^GEMINI_API_KEY\s*=\s*"?([^"\n]+)"?\s*$/m.exec(readFileSync(path.join(ROOT, '.env.local'), 'utf8'))[1].trim();
const MODEL = 'gemini-3.1-flash-image';
const LOG = path.join(DIR, 'log.txt');
const STYLE = 'Korean sumi-e ink wash painting (damuk bleeding style) on plain warm off-white hanji paper, single object centered with lots of empty paper around it. ' +
  'Rules: no outlines, edges dissolve into soft ink bleed; only three ink tones (dark ink, mid grey wash, pale wash) of ONE warm black ink, no other colors; ' +
  'no photographic texture, no wood grain, no stone surface detail, no 3D shading, no reflections; loose expressive brush strokes with dry-brush tails. Plain background, no text, no letters, no seal, no signature, no people, no hands. Square 1:1.';
const SHOTS = [
  { name: 'style-window', text: `${STYLE} Subject: a small traditional Korean paper lattice window (changhoji), seen from the front, warm and quiet, a few lattice bars suggested by brush strokes only.` },
  { name: 'style-inkstone', text: `${STYLE} Subject: a small Korean inkstone (byeoru) with a little pool of ink, seen from a low three-quarter angle.` },
  { name: 'style-letter', text: `${STYLE} Subject: a folded paper letter, softly curved, intact and clean (not torn, not wet).` },
];
for (const s of SHOTS) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY }, body: JSON.stringify({ contents: [{ parts: [{ text: s.text }] }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1' } } }) });
  if (!res.ok) { appendFileSync(LOG, `${new Date().toISOString()} ${s.name} HTTP ${res.status} ${(await res.text()).slice(0, 160).replaceAll(KEY, '***')}\n`); console.log(s.name, 'HTTP', res.status, '→ 중단'); break; }
  const j = await res.json(); const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part) { appendFileSync(LOG, `${new Date().toISOString()} ${s.name} 이미지 없음\n`); console.log('이미지 없음 → 중단'); break; }
  writeFileSync(path.join(DIR, `${s.name}.png`), Buffer.from(part.inlineData.data, 'base64')); writeFileSync(path.join(DIR, `${s.name}.prompt.txt`), s.text);
  appendFileSync(LOG, `${new Date().toISOString()} ${s.name} OK ${MODEL} usage=${JSON.stringify(j.usageMetadata ?? {})}\n`); console.log('saved', s.name);
}
