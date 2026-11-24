// 위기 대조 v0.4 재구현 — rules-v0.json(rulesVer 0.4.0) + README 5절 + heart-grain-48 8-2(v0.4 ⓐ~ⓕ)를 문서 그대로 옮김.
// 작성: 독립 안전 평가자 v3(2026-11-25). crisis-match-v03.mjs(v0.3 평가기)를 바탕으로 v0.4에서 더해진 것을 구현했다:
//   ⓐ 완곡 핵 combo.strong3(→④ strong)·combo.soft2(→⑧ soft) + 열린 음절 축약형 확장(ㅏ·ㅓ 흡수, ㅜ→ㅝ, ㅗ→ㅘ)
//   ⓑⓒ ko.pairs [A]×[B] (한 음절 끼움, 음절·음운 키 두 공간) — level strong은 ④, soft는 ⑧
//   ⓓ en.pairs (pairGap [a-z]{0,7}) — strong은 ⑦(⑧en), soft는 ⑧ / typoDeletion(가운데 글자 하나 빠짐 → strong)
//   ⓔ 예외 목록(데이터 그대로) / ⓕ normalizationOrder(가림 → leet '!' → 낮춤·예외 → 문장부호 제거)
// 앱 코드가 아니다. 규칙 파일은 고치지 않았다. 애매한 해석은 [해석]으로 적었다. 원칙은 문서대로 '놓치지 않는 쪽'.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const lexDir = path.resolve(here, '..');
const load = (f) => JSON.parse(fs.readFileSync(path.join(lexDir, f), 'utf8'));
export const RULES = load('rules-v0.json');
if (RULES.rulesVer !== '0.4.0') throw new Error(`v0.4 평가기인데 규칙 판이 ${RULES.rulesVer}`);
const LEX = { ko: load('ko-sample.json'), en: load('en-sample.json') };
const C = RULES.crisis;
const WILD = '\u0000'; // 가림 * 자리

// ---------- 정규화 ----------
const STRIP = new Set([...RULES.common.stripChars]);
export function normalize(s, keepMask = false) {
  let t = s.normalize('NFC').replace(/[A-Z]/g, (c) => c.toLowerCase());
  return [...t].filter((c) => (keepMask && c === '*') || (!STRIP.has(c) && !/\s/.test(c))).map((c) => (c === '*' ? WILD : c)).join('');
}

// ---------- 한글 ----------
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const isSyl = (c) => c >= '가' && c <= '힣';
const isJamo = (c) => c >= 'ㄱ' && c <= 'ㅣ';
const isVowel = (c) => !!c && JUNG.includes(c);
const decomp = (c) => { const n = c.charCodeAt(0) - 0xac00; return [CHO[Math.floor(n / 588)], JUNG[Math.floor((n % 588) / 28)], JONG[n % 28]]; };
const comp = (l, v, t = '') => String.fromCharCode(0xac00 + (CHO.indexOf(l) * 21 + JUNG.indexOf(v)) * 28 + JONG.indexOf(t));

export function composeJamo(s) {
  const a = [...s]; let out = '';
  for (let i = 0; i < a.length; i++) {
    const c = a[i];
    if (CHO.includes(c) && isVowel(a[i + 1] ?? '')) {
      let T = '', used = 2; const n2 = a[i + 2], n3 = a[i + 3];
      if (n2 && JONG.indexOf(n2) > 0 && !isVowel(n3 ?? '')) { T = n2; used = 3; }
      out += comp(c, a[i + 1], T); i += used - 1;
    } else out += c;
  }
  return out;
}
function collapseRuns(s, to) {
  let t = s.replace(/(.)\1{2,}/gu, (m, c) => c.repeat(to));
  return t.replace(/(..)\1+/gu, '$1');
}

// ---------- ⑤ 음운 키 pk ----------
const SPLIT_CLUSTER = { 'ㄳ': 'ㄱㅅ', 'ㄵ': 'ㄴㅈ', 'ㄶ': 'ㄴㅎ', 'ㄺ': 'ㄹㄱ', 'ㄻ': 'ㄹㅁ', 'ㄼ': 'ㄹㅂ', 'ㄽ': 'ㄹㅅ', 'ㄾ': 'ㄹㅌ', 'ㄿ': 'ㄹㅍ', 'ㅀ': 'ㄹㅎ', 'ㅄ': 'ㅂㅅ' };
const TENSE = { 'ㄲ': 'ㄱ', 'ㄸ': 'ㄷ', 'ㅃ': 'ㅂ', 'ㅆ': 'ㅅ', 'ㅉ': 'ㅈ' };
const PLAIN = { ...TENSE, 'ㅋ': 'ㄱ', 'ㅌ': 'ㄷ', 'ㅍ': 'ㅂ', 'ㅊ': 'ㅈ' };
// [해석] '모음 혼동 … 등' — 문서에 적힌 것 + 같은 방향의 이중모음 단순화(ㅑ→ㅏ, ㅛ→ㅜ, ㅘ→ㅏ, ㅝ→ㅓ, ㅙ→ㅔ)
const VFOLD = { 'ㅠ': 'ㅜ', 'ㅗ': 'ㅜ', 'ㅛ': 'ㅜ', 'ㅕ': 'ㅓ', 'ㅝ': 'ㅓ', 'ㅑ': 'ㅏ', 'ㅘ': 'ㅏ', 'ㅐ': 'ㅔ', 'ㅒ': 'ㅔ', 'ㅖ': 'ㅔ', 'ㅙ': 'ㅔ', 'ㅟ': 'ㅣ', 'ㅞ': 'ㅣ', 'ㅚ': 'ㅣ', 'ㅢ': 'ㅣ' };
export function pk(s) {
  const syl = [...s].map((c) => (isSyl(c) ? decomp(c) : c === WILD ? [WILD] : isJamo(c) ? [c] : null)).filter(Boolean);
  // 열린 음절 뒤 된소리 첫소리 → 앞 음절 받침 + 예사소리 첫소리
  for (let i = 1; i < syl.length; i++) {
    const p = syl[i - 1], c = syl[i];
    if (p.length === 3 && p[2] === '' && c.length === 3 && TENSE[c[0]]) { p[2] = TENSE[c[0]]; c[0] = TENSE[c[0]]; }
  }
  let out = [];
  for (const g of syl) {
    if (g.length === 1) { out.push(...[...(SPLIT_CLUSTER[g[0]] ?? g[0])]); continue; }
    let [l, v, t] = g;
    if (l === 'ㄷ' && (v === 'ㅠ' || v === 'ㅕ')) l = 'ㅈ';
    out.push(l, v, ...[...(SPLIT_CLUSTER[t] ?? t)]);
  }
  return out.map((j) => PLAIN[j] ?? VFOLD[j] ?? j).filter((j) => j && j !== 'ㅎ' && j !== 'ㅇ').join('');
}

// ---------- ② 변형 ----------
export function koVariants(norm) {
  const base = [...norm].filter((c) => isSyl(c) || isJamo(c) || /[a-z0-9]/.test(c) || c === WILD).join('');
  const composed = composeJamo(base);
  const syl = [...composed].filter((c) => isSyl(c) || c === WILD).join('');
  const all = [...new Set([base, composed, syl, collapseRuns(syl, 1), collapseRuns(syl, 2), collapseRuns(composed, 1)])].filter(Boolean);
  return { base, composed, syl, all, pks: [...new Set(all.map(pk))].filter(Boolean) };
}
const LEET = C.en.leet;
const dedupe = (s) => s.replace(/(.)\1+/g, '$1');
export function enVariants(norm) {
  const lower = norm.toLowerCase();
  const conv = (x) => [...x].map((c) => (c === WILD ? WILD : LEET[c] ?? c)).join('').replace(new RegExp(`[^a-z${WILD}]`, 'g'), '');
  const letters = conv(lower), twoLetters = conv(lower.replace(/2/g, 'to'));
  return { letters, all: [...new Set([letters, twoLetters, dedupe(letters), dedupe(twoLetters)])].filter(Boolean) };
}

// 와일드카드 포함 부분 일치
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function contains(v, stem) {
  if (!v.includes(WILD)) return v.includes(stem);
  // v의 * 자리는 stem의 아무 한 글자와 맞을 수 있다: v의 창마다 비교
  const a = [...v], b = [...stem];
  for (let i = 0; i + b.length <= a.length; i++) if (b.every((ch, j) => a[i + j] === WILD || a[i + j] === ch)) return true;
  return false;
}

// ---------- ④ 조합 규칙 → 정규식(음절·음운 키 두 공간) ----------
function attach(core, intent) {
  // 열린 음절 핵: 지+어→져, 지+을→질, +으→(으 탈락). [해석] 지 이외(끝내)도 같은 원리로 축약형을 더한다.
  const out = [core + intent];
  const last = core.at(-1);
  if (isSyl(last)) {
    const [l, v, t] = decomp(last);
    if (t === '') {
      const head = core.slice(0, -1);
      if (intent.startsWith('어')) {
        // [해석] v0.4 완곡 핵(떠나·가·그만두 …)도 열린 음절이라 같은 원리를 넓힌다: ㅏ·ㅓ·ㅐ·ㅔ는 어를 흡수, ㅣ→ㅕ, ㅜ→ㅝ, ㅗ→ㅘ
        const fused = v === 'ㅣ' ? comp(l, 'ㅕ') : ['ㅐ', 'ㅔ', 'ㅏ', 'ㅓ'].includes(v) ? last : v === 'ㅜ' ? comp(l, 'ㅝ') : v === 'ㅗ' ? comp(l, 'ㅘ') : null;
        if (fused) out.push(head + fused + intent.slice(1));
      }
      if (intent.startsWith('을')) out.push(head + comp(l, v, 'ㄹ') + intent.slice(1));
      if (intent.startsWith('으')) out.push(core + intent.slice(1));
    }
  }
  return out;
}
function comboProtos(group) {
  const ps = [];
  for (const c of group.cores) for (const it of group.intents) ps.push(...attach(c, it));
  return ps;
}
const toSylRe = (p) => new RegExp([...p].map((c) => (c === '~' ? '.?' : c === '≈' ? '.{0,2}' : esc(c))).join(''));
// 음운 키 공간: 한 음절 ≈ 최대 3자모(ㅇ·ㅎ 지움 뒤)
const toPkRe = (p) => new RegExp(p.split(/([~≈])/).map((seg) => (seg === '~' ? '.{0,3}' : seg === '≈' ? '.{0,6}' : esc(pk(seg)))).join(''));
const COMBO = {};
for (const lv of ['strong', 'soft', 'strong2', 'strong3', 'soft2']) {
  const protos = comboProtos(C.ko.combo[lv]);
  COMBO[lv] = protos.map((p) => ({ p, syl: toSylRe(p), pk: toPkRe(p) }));
}
// ⓑⓒ ko 조합쌍: A + (한 음절 끼움) + B. 음절 공간 '.?', 음운 키 공간 '.{0,3}'
const KO_PAIRS = C.ko.pairs.map((pr) => ({ level: pr.level, name: pr.name, res: pr.A.flatMap((a) => pr.B.map((b) => ({ syl: new RegExp(esc(a) + '.?' + esc(b)), pk: new RegExp(esc(pk(a)) + '.{0,3}' + esc(pk(b))) }))) }));
const koPair = (level, sylVars, pks) => KO_PAIRS.find((pr) => pr.level === level && pr.res.some((r) => sylVars.some((v) => r.syl.test(v)) || pks.some((k) => r.pk.test(k))));
// ⓓ en 구문쌍: A + [a-z]{0,7} + B (와일드카드 자리도 한 글자로 허용)
const GAP = C.en.pairGap.split(' ')[0].replace('[a-z]', `[a-z${WILD}]`);
const wildEsc = (s) => [...s].map((c) => `[${esc(c)}${WILD}]`).join('');
const EN_PAIRS = C.en.pairs.map((pr) => ({ level: pr.level, re: new RegExp(`(?:${pr.A.map(wildEsc).join('|')})${GAP}(?:${pr.B.map(wildEsc).join('|')})`) }));
const enPair = (level, vars) => EN_PAIRS.find((pr) => pr.level === level && vars.some((v) => pr.re.test(v) || pr.re.test(dedupe(v))));
const STRONG_PK = C.ko.strongPhonetic.map(pk), SOFT_PK = C.ko.softPhonetic.map(pk);
// ⑩ 조합 원형(끼움 없는 꼴) 음운 키
// [해석] ⑩ '조합 원형'에 v0.4 strong3·soft2도 넣는다(조합 규칙의 원형이므로). EDIT_PROTO_SET=v03 이면 v0.3 범위만
const EDIT_GROUPS = process.env.EDIT_PROTO_SET === 'v03' ? ['strong', 'strong2', 'soft'] : ['strong', 'strong2', 'soft', 'strong3', 'soft2'];
const EDIT_PROTOS = [...new Set(EDIT_GROUPS.flatMap((g) => COMBO[g]).map((x) => pk(x.p.replace(/[~≈]/g, ''))).filter((k) => k.length >= C.ko.editDistanceMinJamo))];
function lev1(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, e = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++e > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return e + (a.length - i) + (b.length - j) <= 1;
}

// ---------- ⑦ 수단어 해시 ----------
const h16 = (s) => crypto.createHash('sha256').update(C.hashPepper + s).digest('hex').slice(0, 16);
function meansHit(vars) {
  const S = new Set(C.meansHashes.strong), W = new Set(C.meansHashes.soft);
  let soft = false;
  for (const v of vars) {
    const a = [...v];
    for (let i = 0; i < a.length; i++) for (let n = 2; n <= 8 && i + n <= a.length; n++) {
      const h = h16(a.slice(i, i + n).join(''));
      if (S.has(h)) return 'strong';
      if (W.has(h)) soft = true;
    }
  }
  return soft ? 'soft' : null;
}

// ---------- 위기 대조 ①~⑩ ----------
function crisisCore(norm, raw) {
  const ko = koVariants(norm), en = enVariants(norm);
  const anyIn = (vars, stems) => stems.find((s) => vars.some((v) => contains(v, s)));
  const sylVars = ko.all.filter((v) => [...v].some(isSyl));
  // ③ ko 표준 줄기
  let s = anyIn(ko.all, C.ko.strong); if (s) return ['strong', `③ko:${s}`];
  // ④ 조합(음절·음운 키) + 음운 줄기
  for (const g of ['strong', 'strong2', 'strong3']) for (const x of COMBO[g]) { if (sylVars.some((v) => x.syl.test(v)) || ko.pks.some((k) => x.pk.test(k))) return ['strong', `④combo:${x.p}`]; }
  let pr = koPair('strong', sylVars, ko.pks); if (pr) return ['strong', `④pair:${pr.name}`];
  s = STRONG_PK.find((k) => ko.pks.some((v) => v.includes(k))); if (s) return ['strong', `⑤pk`];
  // ⑥ 초성 4자 이상 원형 일치
  s = C.ko.choseongStrong.find((c) => ko.base.includes(c)); if (s) return ['strong', `⑥초성4:${s}`];
  // ⑦ 수단어 해시(strong 먼저)
  const mh = meansHit([...ko.all, ...en.all]);
  if (mh === 'strong') return ['strong', '⑦means'];
  // ⑧(en strong) 줄기·자리바꿈·경계
  s = C.en.strong.find((st) => en.all.some((v) => contains(v, st) || contains(v, dedupe(st)))); if (s) return ['strong', `⑧en:${s}`];
  for (const st of C.en.strong.filter((x) => x.length >= 6)) {
    for (let i = 0; i + 1 < st.length; i++) {
      if (st[i] === st[i + 1]) continue;
      const sw = st.slice(0, i) + st[i + 1] + st[i] + st.slice(i + 2);
      if (en.all.some((v) => contains(v, sw))) return ['strong', `⑧en자리바꿈:${st}`];
    }
  }
  // ⓓ 가운데 글자 하나 빠짐 → strong. [해석] heart-grain 8-2는 '가운데 글자', rules는 '글자 하나' — 기본은 가운데(첫·끝 글자 제외), TYPO_DEL=any 면 아무 자리
  const delAny = process.env.TYPO_DEL === 'any';
  for (const st of C.en.strong.filter((x) => x.length >= 6)) {
    for (let i = delAny ? 0 : 1; i < (delAny ? st.length : st.length - 1); i++) {
      const del = st.slice(0, i) + st.slice(i + 1);
      if (en.all.some((v) => contains(v, del))) return ['strong', `⑧en빠짐:${st}`];
    }
  }
  let ep = enPair('strong', en.all); if (ep) return ['strong', '⑧en구문쌍'];
  const words = raw.toLowerCase().normalize('NFC').split(/[^a-z0-9!@$*]+/).map((w) => [...w].map((c) => LEET[c] ?? c).join('').replace(/[^a-z]/g, ''));
  const boundary = (st) => en.all.some((v) => v.startsWith(st) || v.endsWith(st) || v.startsWith(dedupe(st)) || v.endsWith(dedupe(st))) || words.some((w) => w === st || dedupe(w) === dedupe(st));
  s = C.en.boundaryStrong.find(boundary); if (s) return ['strong', `⑧en경계:${s}`];
  // ⑧ soft
  if (mh === 'soft') return ['soft', '⑦means'];
  s = anyIn(ko.all, C.ko.soft); if (s) return ['soft', `soft ko:${s}`];
  for (const x of [...COMBO.soft, ...COMBO.soft2]) if (sylVars.some((v) => x.syl.test(v)) || ko.pks.some((k) => x.pk.test(k))) return ['soft', `soft combo:${x.p}`];
  pr = koPair('soft', sylVars, ko.pks); if (pr) return ['soft', `soft pair:${pr.name}`];
  s = SOFT_PK.find((k) => ko.pks.some((v) => v.includes(k))); if (s) return ['soft', 'soft pk'];
  // [해석] softExact는 정규화 문자열·기본·결합·음절·반복 접기와 완전 일치
  s = C.ko.softExact.find((st) => [norm, ko.base, ko.composed, ko.syl, collapseRuns(ko.base, 1), collapseRuns(ko.syl, 1)].includes(st)); if (s) return ['soft', `softExact:${s}`];
  s = C.ko.choseongSoft.find((c) => ko.base.includes(c)); if (s) return ['soft', `초성3:${s}`];
  s = C.en.soft.find((st) => en.all.some((v) => contains(v, st) || contains(v, dedupe(st)))); if (s) return ['soft', `en soft:${s}`];
  s = C.en.boundarySoft.find(boundary); if (s) return ['soft', `en경계soft:${s}`];
  ep = enPair('soft', en.all); if (ep) return ['soft', 'en구문쌍soft'];
  // 글자 구성만 같음(anagram) → soft
  const sortStr = (x) => [...x].sort().join('');
  for (const st of C.en.strong.filter((x) => x.length >= 6)) {
    const key = sortStr(st);
    for (const v of en.all) for (let i = 0; i + st.length <= v.length; i++) if (sortStr(v.slice(i, i + st.length)) === key) return ['soft', `en구성:${st}`];
  }
  // ⑩ 음운 거리 1
  // [해석] ⑩ 비교 범위는 문서에 없다. EDIT_MODE: whole(기본, 키 전체 편집 거리) | hamming(같은 길이 창 한 자모 바뀜) | window(창 ±1 편집 거리)
  // 기본값 whole은 개발 세트 v1 공개 수치(놓침 0·낮춤 1·오탐 6)를 그대로 재현하는 유일한 해석이라 정본으로 쓴다.
  const mode = process.env.EDIT_MODE ?? 'whole';
  const ham1 = (a, b) => a.length === b.length && [...a].filter((c, i) => c !== b[i]).length <= 1;
  for (const P of EDIT_PROTOS) for (const k of ko.pks) {
    if (mode === 'whole') { if (lev1(P, k)) return ['soft', '⑩pk거리1']; continue; }
    for (let n = mode === 'window' ? P.length - 1 : P.length; n <= (mode === 'window' ? P.length + 1 : P.length); n++) for (let i = 0; i + n <= k.length; i++) {
      const w = k.slice(i, i + n);
      if (mode === 'window' ? lev1(P, w) : ham1(P, w)) return ['soft', '⑩pk거리1'];
    }
  }
  return ['none', null];
}

export function crisisMatch(raw) {
  // ⓕ normalizationOrder: ① NFC·소문자 ② 가림 * ＊ → 한 글자 자리 ③ leet '!' → i(로마자 사이·끝, 문장부호 제거보다 먼저)
  // ④ 낮춤·예외 ⑤ 문장부호 제거. 다른 leet 문자(1 3 0 4 @ 5 $ 7)는 stripChars에 없어 남아 있다가 en 변형에서 바뀐다.
  // [해석] '끝' = 로마자 바로 뒤에 오는 '!' 묶음의 첫 글자(로마자 뒤 낱말 끝). 'help!'→'helpi'처럼 되지만 위기 대조에만 쓰인다.
  const pre = raw.normalize('NFC').toLowerCase().replace(/＊/g, '*').replace(/(?<=[a-z])!/g, 'i');
  let norm = normalize(pre, true);
  // ① 예외 지우기
  let hadException = false;
  for (const ex of C.exceptions) if (norm.includes(ex)) { norm = norm.split(ex).join(''); hadException = true; }
  // ① 캠페인 낮춤 [해석] 캠페인 말을 뺀 나머지를 먼저 대조(나머지에 위기가 있으면 그 단계), 없으면 soft
  let campaign = false;
  for (const d of C.downgradeToSoft) if (norm.includes(d)) { norm = norm.split(d).join(''); campaign = true; }
  const [level, by] = crisisCore(norm, raw);
  if (level === 'none' && campaign) return { level: 'soft', by: '①campaign', hadException, norm };
  return { level, by, hadException, norm: norm.replaceAll(WILD, '') };
}

// ---------- order 5~13: 사전 경로(기존 평가기와 같은 해석) ----------
const surface = { ko: new Map(), en: new Map() };
for (const lang of ['ko', 'en']) for (const e of LEX[lang].entries) for (const f of [e.lemma, ...e.forms]) surface[lang].set(normalize(f), e);
const crisisOf = (e) => (e?.flags.includes('crisis_strong') ? 'strong' : e?.flags.includes('crisis_soft') ? 'soft' : null);
function lexLookup(lang, w) {
  const R = RULES[lang];
  const tries = [w, collapseRuns(w, 2), collapseRuns(w, 1)];
  const strip = (x) => {
    const out = [];
    for (const p of [...R.intensifierPrefixes, ...R.attenuatorPrefixes]) if (x.startsWith(p) && (lang !== 'ko' || [...x].length - [...p].length >= R.prefixMinRemainder) && !(R.prefixStripExceptions ?? []).some((ex) => x.startsWith(ex))) out.push(x.slice(p.length));
    return out;
  };
  for (const t of [...tries]) tries.push(...strip(t));
  if (lang === 'ko') for (const t of [...tries]) tries.push(t.replace(/[ㅋㅎㅠㅜㄷ]+$/u, ''));
  for (const t of [...tries]) {
    let cur = [t];
    for (let r = 0; r < R.maxSuffixRounds; r++) {
      const nx = [];
      for (const c of cur) for (const sf of [...R.suffixes].sort((a, b) => b.length - a.length)) if (c.endsWith(sf) && [...c].length - [...sf].length >= R.minStemLength) nx.push(c.slice(0, c.length - sf.length));
      tries.push(...nx); cur = nx;
    }
  }
  for (const t of tries) { const e = surface[lang].get(t) ?? surface[lang === 'ko' ? 'en' : 'ko'].get(t); if (e) return e; }
  return null;
}
export function fullPipeline(raw, lang) {
  const c = crisisMatch(raw);
  if (c.level !== 'none') return { ...c, stage: 'crisis' };
  const w = c.norm;
  const e = lexLookup(lang, w);
  if (e) { const lv = crisisOf(e); return { level: lv ?? 'none', by: `lex:${e.lemma}`, stage: lv ? 'lexicon' : 'lexicon-sense', sense: e.sense }; }
  if (lang === 'ko') {
    for (const t of RULES.ko.hyperboleTails) if (w.endsWith(t) && w.length > t.length) { const h = lexLookup(lang, w.slice(0, w.length - t.length)); if (h && !crisisOf(h)) return { level: 'none', by: `hyperbole:${h.lemma}`, stage: 'hyperbole', sense: h.sense }; }
    for (const t of RULES.ko.hyperboleHeads) if (w.startsWith(t) && w.length > t.length) { const h = lexLookup(lang, w.slice(t.length)); if (h && !crisisOf(h)) return { level: 'none', by: `hyperbole:${h.lemma}`, stage: 'hyperbole', sense: h.sense }; }
  }
  if (!c.hadException) {
    const a = [...w];
    for (let i = 1; i < a.length; i++) {
      const L = lexLookup(lang, a.slice(0, i).join('')), Rr = lexLookup(lang, a.slice(i).join(''));
      if (crisisOf(L) || crisisOf(Rr)) return { level: 'soft', by: `split:${(L ?? Rr).lemma}`, stage: 'split' };
    }
  }
  return { level: 'none', by: null, stage: 'none' };
}

// ---------- 8-0 ② 넓은 그물: 곁 대답(soft 이상)을 받는가 ----------
export const NET_SENSES = ['low.in.sad', 'low.in.weary', 'low.out.lonely', 'low.out.longing', 'low.out.hurt'];
export function sideAnswer(r) {
  if (r.level === 'strong') return 'strong';
  if (r.level === 'soft') return 'soft';
  if (r.sense && NET_SENSES.includes(r.sense)) return 'soft-net';
  return null;
}
