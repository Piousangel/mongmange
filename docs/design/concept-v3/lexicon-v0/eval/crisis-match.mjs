// 위기 대조 재구현 (rules-v0.json v0.2를 문서 그대로 옮김) — 검수용, 의존성 없음.
// 앱 코드가 아니다. 규칙 해석이 애매한 곳은 '놓치지 않는 쪽'으로 읽었고 각 자리에 [해석]으로 적었다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const lexDir = path.resolve(here, '..');
const load = (f) => JSON.parse(fs.readFileSync(path.join(lexDir, f), 'utf8'));
export const RULES = load('rules-v0.json');
const LEX = { ko: load('ko-sample.json'), en: load('en-sample.json') };
const C = RULES.crisis;

// ---------- 공통 정규화(order 1) ----------
const STRIP = new Set([...RULES.common.stripChars]);
export function normalize(s) {
  let t = s.normalize('NFC');
  t = t.replace(/[A-Z]/g, (c) => c.toLowerCase());
  return [...t].filter((c) => !STRIP.has(c) && !/\s/.test(c)).join('');
}

// ---------- 한글 자모 ----------
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const isSyl = (c) => c >= '가' && c <= '힣';
const isJamo = (c) => c >= 'ㄱ' && c <= 'ㅣ';
const isVowel = (c) => !!c && JUNG.includes(c);
const isCons = (c) => CHO.includes(c) || JONG.includes(c);

// 자모 결합: 'ㅈㅏ살' → '자살', 'ㅈㅜㄱㄱㅗ' → '죽고'
export function composeJamo(s) {
  const a = [...s];
  let out = '';
  for (let i = 0; i < a.length; i++) {
    const c = a[i];
    if (CHO.includes(c) && isVowel(a[i + 1] ?? '')) {
      const L = CHO.indexOf(c), V = JUNG.indexOf(a[i + 1]);
      let T = 0, used = 2;
      const n2 = a[i + 2], n3 = a[i + 3];
      if (n2 && JONG.includes(n2) && JONG.indexOf(n2) > 0 && !isVowel(n3 ?? '')) { T = JONG.indexOf(n2); used = 3; }
      out += String.fromCharCode(0xac00 + (L * 21 + V) * 28 + T);
      i += used - 1;
    } else out += c;
  }
  return out;
}

function collapseRuns(s, to) {
  // 1글자 단위 3번 이상 → to개, 2글자 단위 2번 이상 → 1번
  let t = s.replace(/(.)\1{2,}/gu, (m, c) => c.repeat(to));
  t = t.replace(/(..)\1+/gu, '$1');
  return t;
}

// ---------- ② 변형 만들기 ----------
export function koVariants(norm) {
  const base = [...norm].filter((c) => isSyl(c) || isJamo(c) || /[a-z0-9]/.test(c)).join('');
  const composed = composeJamo(base);
  const syl = [...composed].filter(isSyl).join('');
  const v = new Set([base, composed, syl, collapseRuns(syl, 1), collapseRuns(syl, 2), collapseRuns(composed, 1)]);
  return { base, composed, syl, all: [...v].filter(Boolean) };
}
const LEET = C.en.leet;
const dedupe = (s) => s.replace(/(.)\1+/g, '$1');
export function enVariants(norm) {
  const lower = norm.toLowerCase();
  const leet = [...lower].map((c) => LEET[c] ?? c).join('');
  const letters = leet.replace(/[^a-z]/g, '');
  const two = lower.replace(/2/g, 'to');
  const twoLetters = [...two].map((c) => LEET[c] ?? c).join('').replace(/[^a-z]/g, '');
  const v = new Set([letters, twoLetters, dedupe(letters), dedupe(twoLetters)]);
  return { letters, all: [...v].filter(Boolean) };
}

// ---------- 위기 대조 ①~⑤ ----------
export function crisisMatch(raw) {
  let norm = normalize(raw);
  // ① 예외 지우기
  let hadException = false;
  for (const ex of C.exceptions) if (norm.includes(ex)) { norm = norm.split(ex).join(''); hadException = true; }
  const ko = koVariants(norm);
  const en = enVariants(norm);
  const hit = (variants, stems, mode) => {
    for (const st of stems) {
      const cmp = mode === 'en' ? [st, dedupe(st)] : [st];
      for (const v of variants) for (const s of cmp) if (v.includes(s)) return st;
    }
    return null;
  };
  // ③ strong 부분 일치
  let s = hit(ko.all, C.ko.strong, 'ko') || hit(en.all, C.en.strong, 'en');
  if (s) return { level: 'strong', by: `strong:${s}`, hadException };
  // ④ en 경계 줄기: 글자열 처음·끝, 또는 원문 낱말 단위
  const words = raw.toLowerCase().normalize('NFC').split(/[^a-z0-9!@$]+/).map((w) => [...w].map((c) => LEET[c] ?? c).join('').replace(/[^a-z]/g, ''));
  const boundary = (stem) => en.all.some((v) => v.startsWith(stem) || v.endsWith(stem) || v.startsWith(dedupe(stem)) || v.endsWith(dedupe(stem))) || words.some((w) => w === stem || dedupe(w) === dedupe(stem));
  for (const st of C.en.boundaryStrong) if (boundary(st)) return { level: 'strong', by: `boundaryStrong:${st}`, hadException };
  // ⑤ soft
  s = hit(ko.all, C.ko.soft, 'ko') || hit(en.all, C.en.soft, 'en');
  if (s) return { level: 'soft', by: `soft:${s}`, hadException };
  for (const st of C.en.boundarySoft) if (boundary(st)) return { level: 'soft', by: `boundarySoft:${st}`, hadException };
  // [해석] softExact는 정규화 문자열·음절만 변형·반복 접기 변형과 완전 일치
  for (const st of C.ko.softExact) if ([norm, ko.base, ko.composed, ko.syl, collapseRuns(ko.base, 1)].includes(st)) return { level: 'soft', by: `softExact:${st}`, hadException };
  for (const st of C.ko.choseongSoft) if (ko.base.includes(st)) return { level: 'soft', by: `choseong:${st}`, hadException };
  return { level: 'none', by: null, hadException, norm };
}

// ---------- order 5~9, 13: 사전 경로로 곁 대답이 나는지 ----------
const surface = { ko: new Map(), en: new Map() };
for (const lang of ['ko', 'en']) for (const e of LEX[lang].entries) for (const f of [e.lemma, ...e.forms]) surface[lang].set(normalize(f), e);
const crisisOf = (e) => (e?.flags.includes('crisis_strong') ? 'strong' : e?.flags.includes('crisis_soft') ? 'soft' : null);

function lexLookup(lang, w) {
  const R = RULES[lang];
  const tries = [w];
  tries.push(collapseRuns(w, 2), collapseRuns(w, 1)); // 6
  const strip = (x) => {
    const out = [];
    for (const p of [...R.intensifierPrefixes, ...R.attenuatorPrefixes]) if (x.startsWith(p) && (lang !== 'ko' || [...x].length - [...p].length >= R.prefixMinRemainder) && !(R.prefixStripExceptions ?? []).some((ex) => x.startsWith(ex))) out.push(x.slice(p.length));
    return out;
  };
  for (const t of [...tries]) tries.push(...strip(t)); // 7
  if (lang === 'ko') for (const t of [...tries]) tries.push(t.replace(/[ㅋㅎㅠㅜㄷ]+$/u, '')); // 8
  for (const t of [...tries]) { // 9 어미 최대 2번
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
  if (lang === 'ko') { // 12 과장: (상태어)+죽겠- 또는 죽겠-+(상태어)
    for (const t of RULES.ko.hyperboleTails) if (w.endsWith(t) && w.length > t.length) { const h = lexLookup(lang, w.slice(0, w.length - t.length)); if (h && !crisisOf(h)) return { level: 'none', by: `hyperbole:${h.lemma}`, stage: 'hyperbole' }; }
    for (const t of RULES.ko.hyperboleHeads) if (w.startsWith(t) && w.length > t.length) { const h = lexLookup(lang, w.slice(t.length)); if (h && !crisisOf(h)) return { level: 'none', by: `hyperbole:${h.lemma}`, stage: 'hyperbole' }; }
  }
  if (!c.hadException) { // 13 합성 분할
    const a = [...w];
    for (let i = 1; i < a.length; i++) {
      const L = lexLookup(lang, a.slice(0, i).join('')), Rr = lexLookup(lang, a.slice(i).join(''));
      if (crisisOf(L) || crisisOf(Rr)) return { level: 'soft', by: `split:${(L ?? Rr).lemma}`, stage: 'split' };
    }
  }
  return { level: 'none', by: null, stage: 'none' };
}

export function hasWeakMarker(raw) {
  const n = normalize(raw);
  const ko = koVariants(n).all, en = enVariants(n).all;
  return C.weakMarkers.ko.some((m) => ko.some((v) => v.includes(m))) || C.weakMarkers.en.some((m) => en.some((v) => v.includes(m)));
}
