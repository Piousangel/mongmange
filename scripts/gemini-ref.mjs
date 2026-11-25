// C14b 꿈 모티프 레퍼런스(참고용 — 앱 번들 금지, docs/team/license-ledger.md) 생성: Gemini API 이미지 모델을 직접 부른다.
// 키는 환경 변수 GEMINI_API_KEY 또는 --env <.env.local 경로>에서 GEMINI_API_KEY 한 줄만 읽는다. 키는 출력·파일에 남기지 않는다.
// 사용: node scripts/gemini-ref.mjs [--env <경로>] [--only letter,palm] [--flash 4] [--pro 2] [--out docs/creative/c14b-ref]
//       node scripts/gemini-ref.mjs --set object [--pro 3]  — C14b 4차 '사물 한 겹'(마블링·배경 없이 한지 위 사물만, 1024px 이상, pro만).
//       사물 원본은 <모티프>-o<n>.png로 둔다(손질 원료 — scripts/motif-raster.mjs가 읽는다)
// 결과: <out>/<모티프>-f<n>.jpg(flash), <모티프>-p<n>.jpg(pro). PNG는 macOS sips로 640px JPG로 줄여 둔다.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
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
const OUT = path.resolve(opt('out', 'docs/creative/c14b-ref'));
const MODELS = { f: 'gemini-3.1-flash-image', p: 'gemini-3-pro-image' };
const N = { f: Number(opt('flash', 4)), p: Number(opt('pro', 2)) };

const COMMON =
  'Style: traditional East Asian sumi ink on warm off-white hanji paper, suminagashi floating-ink marbling — grey ink bands that bend, part and pool around the subject so the water itself forms the image. ' +
  'Ink-wash planes have crisp edges with a slightly darker wet rim where ink pooled while drying, visible paper fibre grain inside, and dry-brush (bibaek) streaks at the end of brush strokes. ' +
  'Monochrome grey to black ink only, at most a hair-thin trace of muted gold. No outlines like icons, no geometric clip-art, no text, no letters, no signature, no seal, no people, no animals, no creature, no black blob with eyes. Portrait 4:5, generous empty paper.';
const OBJECT_COMMON =
  'Style: a single object painted in traditional East Asian sumi ink on plain warm off-white hanji paper, nothing else on the page. ' +
  'Soft ink-wash planes with crisp edges and a darker wet rim where ink pooled while drying, granulation along the edges, one brush direction inside each plane, dry-brush (bibaek) streaks where the brush ran dry. ' +
  'Pure greyscale ink, no colour, no marbling, no water ripples, no background texture or scenery, no shadow on the ground, no outline drawing, no text, no seal, no signature, no people, no creature, no black blob with eyes. ' +
  'The object is centred with wide empty paper around it. Square image.';
const OBJECT = {
  letter: 'Object: one sheet of thin washi paper lying at a slight angle, one corner folded over so the fold shows a darker tone and the paper thickness; not an envelope, no writing. (Reference chosen: letter-f2 — pale plane, darker wet rim, folded corner.)',
  kite: 'Object: a Korean stingray kite (gaori-yeon) — a diamond of paper with faint bamboo spine marks, ink pooled darkest at the top corner and fading downward, a short tail of two loose ink ribbons from the bottom corner; no hole, no string. (Reference: kite-f3.)',
  umbrella: 'Object: an oiled-paper umbrella seen from the side — half-moon canopy with scalloped wavy rib tips along its lower edge where ink pooled darker, thin drips of ink running down from the rib tips, the shaft one short dry-brush stroke ending under the canopy (not piercing above it). (Reference: umbrella-f3.)',
  boat: 'Object: a small folded paper boat — a light sail plane and a darker hull plane, folds shown only by tonal difference, a few short curling ink swirls of water hugging just under the hull. (Reference: boat-p1.)',
  palm: 'Object: the soft ink-wash shadow of an open cupped palm seen from the side, a broad shallow bowl-shaped crescent made with one wide loaded brush, darker ink pooled at the bottom of the bowl; no separate fingers, no fingernails, no lines of the hand. (Reference: palm-f4 — U shape with pooled ink.)',
  window: 'Object: a Korean paper window (changhoji) — one pale ink-wash pane with a darker wet rim, two narrow vertical mullion gaps of unequal width and slightly different tilt, and the faint soft shadow of an open hand pressed behind the paper; not a grid. (Reference: window-f2.)',
};
const SUBJECT = {
  letter: 'Subject: a single sheet of folded washi paper that has slipped in under a door. The door gap is one horizontal dry-brush stroke; the paper is one pale ink-wash plane lying at an angle with one folded corner a shade darker; the marbled bands are drawn toward the gap and curve around the sheet. Not an envelope.',
  palm: 'Subject: an open cupped palm made only by the water — marbled bands rise on both sides and sag in the middle like a bowl, with a deep pool of ink at the bottom that has a crisp wet rim. No fingers, no hand outline.',
  window: 'Subject: a paper window at night — one soft ink-wash pane with a wet rim, crossed by two narrow bright gaps of unpainted paper with different widths and slightly different tilts (not a grid, not a cross), a faint pale shadow of an open hand behind the paper; marbled rings bend around the pane.',
  kite: 'Subject: a stingray kite high in one corner — one ink-wash diamond plane, darkest where ink pooled at its top point, no sticks, no hole; a hair-thin dry-brush string falls toward the lower corner; the tail is a ribbon of marbled band unravelling from the kite and the bands below rise toward it.',
  boat: 'Subject: a small folded paper boat far off on the water — only two ink-wash planes (a light sail and a darker hull) with wet rims and no outline; the marbled bands are pressed down beneath the boat and trail behind it as a wake.',
  umbrella: 'Subject: one umbrella seen from the side — the canopy is a single soft half-moon ink-wash plane with ink pooled along its scalloped lower edge, the shaft one dry-brush stroke; marbled bands run off both canopy tips like rain. Space under the canopy left empty.',
  path: 'Subject: a winding path that is not drawn but left white — a narrow S-shaped channel of bare paper between marbled ink bands, wide near the bottom and narrowing as it recedes to an upper corner, no outline, no circles at its head.',
};

mkdirSync(OUT, { recursive: true });
const objectSet = opt('set') === 'object';
const only = opt('only') ? opt('only').split(',') : Object.keys(objectSet ? OBJECT : SUBJECT);
const made = [];
for (const m of only) {
  for (const t of objectSet ? ['p'] : ['f', 'p']) {
    for (let i = 1; i <= N[t]; i++) {
      const name = objectSet ? `${m}-o${i}` : `${m}-${t}${i}`;
      const text = objectSet ? `${OBJECT[m]} ${OBJECT_COMMON} Variation ${i}.` : `${SUBJECT[m]} ${COMMON} Variation ${i}.`;
      const body = {
        contents: [{ parts: [{ text }] }],
        generationConfig: objectSet ? { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1', imageSize: '2K' } } : { responseModalities: ['IMAGE'] },
      };
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELS[t]}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        console.log(name, 'HTTP', res.status, (await res.text()).slice(0, 300).replaceAll(KEY, '***'));
        continue;
      }
      const j = await res.json();
      const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
      if (!part) {
        console.log(name, '이미지 없음', JSON.stringify(j).slice(0, 200));
        continue;
      }
      const png = path.join(OUT, `${name}.png`);
      writeFileSync(png, Buffer.from(part.inlineData.data, 'base64'));
      if (objectSet) {
        made.push(`${name} ${MODELS[t]}`);
        console.log('saved', name, MODELS[t]);
        continue;
      }
      execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', '-Z', '640', png, '--out', path.join(OUT, `${name}.jpg`)], { stdio: 'ignore' });
      rmSync(png);
      made.push(`${name} ${MODELS[t]}`);
      console.log('saved', name, MODELS[t]);
    }
  }
}
console.log(`made ${made.length}`);
