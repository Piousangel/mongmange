// V30 선행: 밥·간식 아이콘과 벼루 연지 상태 레퍼런스(탐색 — 앱 사용 전 손질·아트 리뷰 필요, docs/team/license-ledger.md) 생성.
// Gemini API 이미지 모델을 직접 부른다. C14b `scripts/gemini-ref.mjs`(사물 한 겹 세트)를 참고해 따로 만들었다.
// 키는 환경 변수 GEMINI_API_KEY 또는 --env <.env.local 경로>에서 GEMINI_API_KEY 한 줄만 읽는다. 키는 출력·파일에 남기지 않는다.
// 사용: node scripts/gemini-meal-ref.mjs --env .env.local [--only clear-ink,dewdrop] [--flash 4] [--pro 2] [--jobs 4] [--out docs/creative/meal-ref]
// 결과: <out>/<품목>-f<n>.jpg(gemini-3.1-flash-image), <품목>-p<n>.jpg(gemini-3-pro-image).
//       요청은 1:1·2K(2048px). 저장소에는 macOS sips로 1536px JPG(품질 90)로 줄여 둔다(1024px 이상 유지). 프롬프트 원문은 <out>/prompts.json.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
function key() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const f = opt('env');
  if (!f) throw new Error('GEMINI_API_KEY 없음(환경 변수 또는 --env)');
  const m = /^GEMINI_API_KEY\s*=\s*"?([^"\n]+)"?\s*$/m.exec(readFileSync(f, 'utf8'));
  if (!m) throw new Error('env 파일에 GEMINI_API_KEY 없음');
  return m[1].trim();
}
const KEY = key();
const OUT = path.resolve(opt('out', 'docs/creative/meal-ref'));
const MODELS = { f: 'gemini-3.1-flash-image', p: 'gemini-3-pro-image' };
const N = { f: Number(opt('flash', 4)), p: Number(opt('pro', 2)) };
const JOBS = Number(opt('jobs', 4));
const FORCE = args.includes('--force');

// 공통 조건: 한지 위 먹, 먹 한 색(+ 필요하면 아주 옅은 색 한 점), 64pt에서 읽히는 단순한 실루엣,
// 과하게 먹음직스럽지 않음·폭식 연상 없음(넘침·수북함·여러 개·김·윤기 금지), 생명체·글자 0.
const COMMON =
  'Style: a single small object painted in traditional East Asian sumi ink on plain warm off-white hanji paper, nothing else on the page. ' +
  'Soft ink-wash planes with crisp edges and a darker wet rim where ink pooled while drying, one brush direction inside each plane, a little dry-brush (bibaek) at stroke ends. ' +
  'Simple bold silhouette that stays readable when shrunk to a tiny 64-pixel app icon: one object, few tones, no fine clutter. ' +
  'Greyscale ink only unless told otherwise. Calm, quiet and modest — not appetising, not glossy, no steam, no sparkles, no food-advert look, never a heap, pile, overflowing or many servings. ' +
  'No creature, no character, no face, no eyes, no hands, no people, no animals, no text, no letters, no numbers, no seal, no signature, no outline icon, no clip-art, no shadow on the ground, no background scenery. ' +
  'Centred with wide empty paper around it. Square image.';

const ITEMS = {
  // 밥 3
  'clear-ink':
    'Object: one small shallow ceramic spoon seen from slightly above, holding a little pool of thin watery grey ink that sits well below the rim. The spoon bowl is one pale wash plane, the ink a slightly darker plane with a wet rim. Just one modest spoonful, nothing spilling.',
  'pine-pollen-ink':
    'Object: one small shallow ceramic spoon seen from slightly above, holding a little pool of grey ink with three or four tiny specks of pine pollen floating on it. The pollen specks are the only colour in the image: a very faint, muted, dusty pale yellow, like old paper, barely there. Ink sits below the rim, nothing spilling.',
  'dew-ink':
    'Object: one small shallow ceramic spoon seen from slightly above, holding very pale, almost clear ink diluted with water — the lightest wash in the set, with a single soft ring where a drop of water has just mixed in. Greyscale only. Ink sits below the rim.',
  // 간식 3
  'patterned-chip':
    'Object: one single small rounded ink stick piece, like a Korean dasik pressed sweet but made of solid black ink, lying flat and seen from above, with a simple pressed flower or lattice pattern on its face shown only by tonal difference (lighter pressed lines inside the dark plane). Only one piece. Not a cookie, not a biscuit, not chocolate.',
  'ink-ribbon':
    'Object: one single long thin ribbon of pulled ink, like a soft strand of ink taffy, drawn as one loose S-curve with one calligraphic brushstroke — thick and dark at one end, thinning with dry-brush streaks at the other. Only one strand. Not a noodle, not a worm, not a snake.',
  dewdrop:
    'Object: a single round drop of water about to fall from the spout tip of a small Korean ceramic water dropper (yeonjeok); only the spout tip is visible at the top edge, the drop is a pale clear ink-wash circle with a darker wet rim and a small bright unpainted highlight. Greyscale only.',
  // 벼루 연지 상태 3 (같은 벼루, 연지 안만 다름)
  'inkstone-empty':
    'Object: a simple rectangular Korean inkstone (byeoru) seen from directly above, with a flat grinding surface and a small round well (yeonji) at the top end. The well is dry and empty: only a faint dry grey stain at its bottom. Plain stone, no carvings, no ink stick, no brush.',
  'inkstone-spoon':
    'Object: a simple rectangular Korean inkstone (byeoru) seen from directly above, with a flat grinding surface and a small round well (yeonji) at the top end. A little ink — about one spoonful — has gathered at the bottom of the well: a small dark pool with a wet rim, most of the well still dry. Plain stone, no carvings, no ink stick, no brush.',
  'inkstone-clear':
    'Object: a simple rectangular Korean inkstone (byeoru) seen from directly above, with a flat grinding surface and a small round well (yeonji) at the top end. The well holds a calm, clear pool of ink with a soft faint sheen on its surface (an unpainted pale highlight), filled but not overflowing. Plain stone, no carvings, no ink stick, no brush.',
};

mkdirSync(OUT, { recursive: true });
const only = opt('only') ? opt('only').split(',') : Object.keys(ITEMS);
const jobs = [];
for (const m of only) {
  if (!ITEMS[m]) throw new Error(`모르는 품목: ${m}`);
  for (const t of ['f', 'p']) for (let i = 1; i <= N[t]; i++) jobs.push({ m, t, i });
}
const promptLog = path.join(OUT, 'prompts.json');
const prompts = existsSync(promptLog) ? JSON.parse(readFileSync(promptLog, 'utf8')) : {};

async function run({ m, t, i }) {
  const name = `${m}-${t}${i}`;
  const jpg = path.join(OUT, `${name}.jpg`);
  if (existsSync(jpg) && !FORCE) return console.log('skip', name);
  const text = `${ITEMS[m]} ${COMMON} Variation ${i}.`;
  const body = {
    contents: [{ parts: [{ text }] }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1', imageSize: '2K' } },
  };
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELS[t]}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.log(name, 'HTTP', res.status, (await res.text()).slice(0, 200).replaceAll(KEY, '***'));
      await new Promise((r) => setTimeout(r, 4000 * attempt));
      continue;
    }
    const j = await res.json();
    const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!part) {
      console.log(name, '이미지 없음', JSON.stringify(j).slice(0, 160));
      continue;
    }
    const png = path.join(OUT, `${name}.png`);
    writeFileSync(png, Buffer.from(part.inlineData.data, 'base64'));
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '90', '-Z', '1536', png, '--out', jpg], { stdio: 'ignore' });
    rmSync(png);
    prompts[name] = { model: MODELS[t], date: '2026-11-25', size: '2K 1:1 → 1536 JPG', prompt: text };
    return console.log('saved', name, MODELS[t]);
  }
  console.log('FAIL', name);
}

let next = 0;
await Promise.all(
  Array.from({ length: JOBS }, async () => {
    while (next < jobs.length) await run(jobs[next++]);
  }),
);
writeFileSync(promptLog, JSON.stringify(prompts, null, 2) + '\n');
console.log(`done ${Object.keys(prompts).length} prompts logged`);
