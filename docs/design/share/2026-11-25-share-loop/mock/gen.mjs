// 공유 루프 v1 시안용 꿈 그림 생성(탐색 전용 — 앱·마케팅 사용 금지, docs/team/license-ledger.md).
// 키는 저장소 루트 .env.local의 GEMINI_API_KEY 한 줄만 이 스크립트 안에서 읽고, 출력·파일에 남기지 않는다.
// 장마다 최대 3안. 402가 나면 즉시 멈춘다.
// 사용: node gen.mjs [--only morning,ire] [--n 1] [--model flash|pro]
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '../../../../..');
const KEY = /^GEMINI_API_KEY\s*=\s*"?([^"\n]+)"?\s*$/m.exec(readFileSync(path.join(ROOT, '.env.local'), 'utf8'))[1].trim();
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const MODEL = opt('model', 'flash') === 'pro' ? 'gemini-3-pro-image' : 'gemini-3.1-flash-image';
const N = Math.min(3, Number(opt('n', 1)));
const ONLY = opt('only', '').split(',').filter(Boolean);
const REF = readFileSync(path.join(ROOT, 'docs/design/meetings/2026-11-25-owner-direction/exp/ref-mong.png')).toString('base64');
const LOG = path.join(DIR, 'gen-log.txt');

const STYLE = 'Style: traditional East Asian sumi ink wash on warm off-white hanji paper, soft grey-to-black ink planes with darker wet rims where ink pooled, paper fibre grain, dry-brush streaks, suminagashi marbled water bands that flow between objects and connect them into one scene. At most one muted accent colour (pale gold). Calm, dreamy, generous empty paper. Absolutely no text, no letters, no Korean or Chinese characters, no signature, no seal, no people, no faces other than the creature.';
const CHAR = 'The attached image is the main character, Mongmangi: a small round black ink-drop creature with two white dot eyes and three little brush-hair strokes on top. Keep its shape, proportions and two white eyes exactly; small, round, cute, never scary.';
const SHOTS = {
  morning: { ar: '9:16', text: `${CHAR} Scene: one morning dream picture. Mongmangi sleeps curled on a small paper boat drifting on marbled ink water; above it a gentle rain falls from a single cloud onto an oiled-paper umbrella that floats open like a little roof over the boat; a tiny kite trails in the breeze. The objects are connected by the flowing water bands and the rain, forming one calm scene, not separate stickers. Upper two thirds of the image is the dream, lower third is quiet empty paper. ${STYLE}` },
  ire: { ar: '4:5', text: `${CHAR} Scene: a single horizontal hanging-scroll panel showing seven small dream vignettes flowing left to right along one continuous marbled ink river (a paper boat, a teacup with steam, a kite, an umbrella in rain, a quilt, stepping stones, a lantern), each blending into the next; Mongmangi appears small, riding the river at the right end. Mounted on a pale silk scroll border with wooden rollers at top and bottom. ${STYLE}` },
  scroll: { ar: '9:16', text: `${CHAR} Scene: a tall vertical hand scroll unrolled from top to bottom, four ink-wash dream panels stacked and joined by one continuous flowing ink river that winds down through all four (dawn mist with a kite, rain with an umbrella and boat, a night with a paper window and teacups, a calm moonlit sea), the ink gradually deepening from pale at the top to rich at the bottom; at the very bottom Mongmangi, now a little bigger with four bold brush strokes on its body, sits awake looking up at the whole scroll. ${STYLE}` },
};

async function gen(name, i) {
  const shot = SHOTS[name];
  const out = path.join(DIR, `gen-${name}-${MODEL.includes('pro') ? 'p' : 'f'}${i}.png`);
  if (existsSync(out)) return { ok: true, skipped: true };
  const t0 = Date.now();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ inlineData: { mimeType: 'image/png', data: REF } }, { text: shot.text }] }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: shot.ar } },
    }),
  });
  const ms = Date.now() - t0;
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300).replaceAll(KEY, '***');
    appendFileSync(LOG, `${new Date().toISOString()} ${name}#${i} ${MODEL} HTTP ${res.status} ${ms}ms ${body.replace(/\s+/g, ' ')}\n`);
    return { ok: false, status: res.status };
  }
  const j = await res.json();
  const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part) { appendFileSync(LOG, `${new Date().toISOString()} ${name}#${i} 이미지 없음 ${ms}ms\n`); return { ok: false, status: 'noimg' }; }
  writeFileSync(out, Buffer.from(part.inlineData.data, 'base64'));
  appendFileSync(LOG, `${new Date().toISOString()} ${name}#${i} OK ${MODEL} ${ms}ms usage=${JSON.stringify(j.usageMetadata ?? {})}\n`);
  return { ok: true };
}

for (const name of Object.keys(SHOTS)) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  for (let i = 1; i <= N; i++) {
    const r = await gen(name, i);
    if (!r.ok) { console.log(name, i, '실패', r.status); if (r.status === 402) { console.log('402 — 중단'); process.exit(0); } break; }
    console.log(name, i, r.skipped ? '있음' : 'OK');
  }
}
