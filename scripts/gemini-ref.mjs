// C14b 꿈 모티프 레퍼런스(참고용 — 앱 번들 금지, docs/team/license-ledger.md) 생성: Gemini API 이미지 모델을 직접 부른다.
// 키는 환경 변수 GEMINI_API_KEY 또는 --env <.env.local 경로>에서 GEMINI_API_KEY 한 줄만 읽는다. 키는 출력·파일에 남기지 않는다.
// 사용: node scripts/gemini-ref.mjs [--env <경로>] [--only letter,palm] [--flash 4] [--pro 2] [--out docs/creative/c14b-ref]
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
const only = opt('only') ? opt('only').split(',') : Object.keys(SUBJECT);
const made = [];
for (const m of only) {
  for (const t of ['f', 'p']) {
    for (let i = 1; i <= N[t]; i++) {
      const name = `${m}-${t}${i}`;
      const body = {
        contents: [{ parts: [{ text: `${SUBJECT[m]} ${COMMON} Variation ${i}.` }] }],
        generationConfig: { responseModalities: ['IMAGE'] },
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
      execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', '-Z', '640', png, '--out', path.join(OUT, `${name}.jpg`)], { stdio: 'ignore' });
      rmSync(png);
      made.push(`${name} ${MODELS[t]}`);
      console.log('saved', name, MODELS[t]);
    }
  }
}
console.log(`made ${made.length}`);
