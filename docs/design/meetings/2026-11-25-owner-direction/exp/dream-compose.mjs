// 실험: 쓴 낱말 누적 → 꿈 그림 1장 (Gemini 이미지). 회의 2026-11-25-owner-direction.
// 키는 .env.local의 GEMINI_API_KEY 한 줄만 이 스크립트 안에서 읽고, 출력·파일에 남기지 않는다.
// 첫 호출(probe)이 실패하면(402 등) 바로 멈춘다 — '충전 뒤 실행할 실험'.
// 실행: node docs/design/meetings/2026-11-25-owner-direction/exp/dream-compose.mjs
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '../../../../..');
const KEY = /^GEMINI_API_KEY\s*=\s*"?([^"\n]+)"?\s*$/m.exec(readFileSync(path.join(ROOT, '.env.local'), 'utf8'))[1].trim();
const MODEL = 'gemini-3.1-flash-image';
const REF = readFileSync(path.join(DIR, 'ref-mong.png')).toString('base64');
const LOG = path.join(DIR, 'log.txt');

const STYLE =
  'Style: traditional East Asian sumi ink wash on warm off-white hanji paper, soft grey-to-black ink planes with darker wet rims, paper fibre grain, dry-brush streaks, ' +
  'at most one muted accent colour (pale gold). Calm, gentle, dreamy, lots of empty paper. Portrait 4:5. Absolutely no text, no letters, no Korean or Chinese characters, no signature, no seal, no people.';
const CHAR =
  'The attached image is the main character, Mongmangi: a small round black ink-drop creature with two white dot eyes and three little brush-hair strokes on top. ' +
  'Keep its shape, proportions and two white eyes exactly; it must stay small, round, cute and never scary.';

// 누적 꿈: 1밤 기쁨 → 2밤 +팝콘 → 3밤 +비 (+돌봄: 밥을 먹은 날)
const SHOTS = [
  { name: 'n1-joy', text: `${CHAR} Scene: Mongmangi is asleep and dreaming. Its dream floats above it like a soft cloud of ink: the feeling of JOY shown as little bouncing round light-filled blossoms and sparkles. ${STYLE}` },
  { name: 'n2-joy-popcorn', text: `${CHAR} Scene: Mongmangi is asleep and dreaming. Its dream floats above it: joyful bouncing blossoms (from last night's dream) now mixed with big fluffy POPCORN kernels popping and drifting like clouds, Mongmangi riding one kernel happily. ${STYLE}` },
  { name: 'n3-joy-popcorn-rain-meal', text: `${CHAR} Scene: Mongmangi is asleep and dreaming. Its dream floats above it: joyful bouncing blossoms and fluffy popcorn clouds, and now a gentle RAIN falls from the popcorn clouds; Mongmangi holds a tiny rice bowl (it ate well today) and catches raindrops in it, smiling. ${STYLE}` },
  // 일관성 확인: 같은 프롬프트 두 번째(결정성·편차 관찰)
  { name: 'n3-repeat', text: null },
  // A+B=C: 기쁨 + 팝콘 → '축제'(미리 정한 조합표 결과라고 가정)
  { name: 'chain-festival', text: `${CHAR} Scene: Mongmangi is asleep and dreaming. Its dream floats above it: a tiny night FESTIVAL born from joy and popcorn — paper lanterns, popcorn confetti, Mongmangi dancing in the middle. ${STYLE}` },
];
SHOTS[3].text = SHOTS[2].text;

async function gen(shot) {
  const t0 = Date.now();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ inlineData: { mimeType: 'image/png', data: REF } }, { text: shot.text }] }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '4:5' } },
    }),
  });
  const ms = Date.now() - t0;
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300).replaceAll(KEY, '***');
    appendFileSync(LOG, `${new Date().toISOString()} ${shot.name} HTTP ${res.status} ${ms}ms ${body}\n`);
    return { ok: false, status: res.status };
  }
  const j = await res.json();
  const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  const usage = JSON.stringify(j.usageMetadata ?? {});
  if (!part) {
    appendFileSync(LOG, `${new Date().toISOString()} ${shot.name} 이미지 없음 ${ms}ms ${JSON.stringify(j).slice(0, 200)}\n`);
    return { ok: false, status: 'noimg' };
  }
  writeFileSync(path.join(DIR, `${shot.name}.png`), Buffer.from(part.inlineData.data, 'base64'));
  appendFileSync(LOG, `${new Date().toISOString()} ${shot.name} OK ${MODEL} ${ms}ms usage=${usage}\n`);
  return { ok: true };
}

const first = await gen(SHOTS[0]);
if (!first.ok) {
  console.log('probe 실패', first.status, '→ 중단(충전 뒤 실행)');
  process.exit(0);
}
for (const s of SHOTS.slice(1)) {
  const r = await gen(s);
  if (!r.ok) { console.log(s.name, '실패', r.status); break; }
}
console.log('끝');
