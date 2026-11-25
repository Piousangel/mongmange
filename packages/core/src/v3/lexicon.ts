// V5d 최소판 — 낱말 → 말결(닫힌 사전, 결정적 조회) + 위기 대조 v0.4.
// 정본: docs/design/concept-v3/lexicon-v0/README.md 3~5절, rules-v0.json(rulesVer 0.4.0),
// 평가기 eval/crisis-match-v04.mjs(독립 안전 평가자 v3 + QA-3 R4-0 고침). 이 파일은 그 평가기를 **같은 규칙으로** TS로 옮긴 것이다
// (env 갈래 EDIT_MODE·TYPO_DEL·EDIT_PROTO_SET는 평가기 기본값만: whole·가운데·v0.4 전체). 수단어는 해시로만 대조하고 평문은 없다.
// 같은 입력 = 같은 결과(D-13). 사전 판(`LEX_VER`)은 세이브의 word에 같이 적고, 지난 말은 다시 해석하지 않는다.
import RULES_JSON from './data/rules-v0.json';
import KO_JSON from './data/ko-sample.json';
import EN_JSON from './data/en-sample.json';
import { sha256Hex } from './sha256';

// ── 데이터 타입(쓰는 부분만) ──
interface LexEntry {
  id: string;
  lemma: string;
  forms: string[];
  sense: string;
  intensity: number;
  flags: string[];
}
interface LexFile {
  lexVer: string;
  lang: string;
  entries: LexEntry[];
}
interface ComboGroup {
  cores: string[];
  intents: string[];
}
interface Pair {
  level: 'strong' | 'soft';
  name?: string;
  A: string[];
  B: string[];
}
interface LangRules {
  intensifierPrefixes: string[];
  attenuatorPrefixes: string[];
  suffixes: string[];
  maxSuffixRounds: number;
  minStemLength: number;
  prefixMinRemainder?: number;
  prefixStripExceptions?: string[];
  hyperboleTails?: string[];
  hyperboleHeads?: string[];
}
interface Rules {
  rulesVer: string;
  common: { stripChars: string };
  ko: LangRules & { hyperboleTails: string[]; hyperboleHeads: string[] };
  en: LangRules;
  crisis: {
    exceptions: string[];
    downgradeToSoft: string[];
    hashPepper: string;
    meansHashes: { strong: string[]; soft: string[] };
    ko: {
      strong: string[];
      soft: string[];
      softExact: string[];
      choseongSoft: string[];
      choseongStrong: string[];
      strongPhonetic: string[];
      softPhonetic: string[];
      editDistanceMinJamo: number;
      combo: Record<'strong' | 'soft' | 'strong2' | 'strong3' | 'soft2', ComboGroup>;
      pairs: Pair[];
    };
    en: {
      strong: string[];
      boundaryStrong: string[];
      soft: string[];
      boundarySoft: string[];
      leet: Record<string, string>;
      pairs: Pair[];
      pairGap: string;
    };
  };
}

const RULES = RULES_JSON as unknown as Rules;
const LEX: Record<LexLang, LexFile> = { ko: KO_JSON as unknown as LexFile, en: EN_JSON as unknown as LexFile };
export type LexLang = 'ko' | 'en';

/** 세이브 word에 적는 사전 판: 표제어 판 + 규칙 판(둘 중 하나라도 바뀌면 다른 판) */
export const LEX_VER = `ko${LEX.ko.lexVer}+en${LEX.en.lexVer}+r${RULES.rulesVer}`;
export const RULES_VER = RULES.rulesVer;
/** 한 마디 글자 수 상한(ko 6자 — 그날 먹 양 1~6과 같다) */
export const WORD_MAX_CHARS = 6;

const C = RULES.crisis;
const WILD = '\u0000'; // 가림 * 자리

// ── 정규화(README 3-1~3-3) ──
const STRIP = new Set([...RULES.common.stripChars]);
const isSpace = (c: string) => /\s/u.test(c);
export function normalize(s: string, keepMask = false): string {
  const t = s.normalize('NFC').replace(/[A-Z]/g, (c) => c.toLowerCase());
  return [...t]
    .filter((c) => (keepMask && c === '*') || (!STRIP.has(c) && !isSpace(c)))
    .map((c) => (c === '*' ? WILD : c))
    .join('');
}

// ── 한글 ──
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const isSyl = (c: string) => c >= '가' && c <= '힣';
const isJamo = (c: string) => c >= 'ㄱ' && c <= 'ㅣ';
const isVowel = (c: string) => !!c && JUNG.includes(c);
const decomp = (c: string): [string, string, string] => {
  const n = c.charCodeAt(0) - 0xac00;
  return [CHO[Math.floor(n / 588)]!, JUNG[Math.floor((n % 588) / 28)]!, JONG[n % 28]!];
};
const comp = (l: string, v: string, t = '') => String.fromCharCode(0xac00 + (CHO.indexOf(l) * 21 + JUNG.indexOf(v)) * 28 + JONG.indexOf(t));

function composeJamo(s: string): string {
  const a = [...s];
  let out = '';
  for (let i = 0; i < a.length; i++) {
    const c = a[i]!;
    if (CHO.includes(c) && isVowel(a[i + 1] ?? '')) {
      let T = '';
      let used = 2;
      const n2 = a[i + 2];
      const n3 = a[i + 3];
      if (n2 && JONG.indexOf(n2) > 0 && !isVowel(n3 ?? '')) {
        T = n2;
        used = 3;
      }
      out += comp(c, a[i + 1]!, T);
      i += used - 1;
    } else out += c;
  }
  return out;
}
function collapseRuns(s: string, to: number): string {
  const t = s.replace(/(.)\1{2,}/gu, (_m, c: string) => c.repeat(to));
  return t.replace(/(..)\1+/gu, '$1');
}

// ── ⑤ 음운 키 ──
const SPLIT_CLUSTER: Record<string, string> = { ㄳ: 'ㄱㅅ', ㄵ: 'ㄴㅈ', ㄶ: 'ㄴㅎ', ㄺ: 'ㄹㄱ', ㄻ: 'ㄹㅁ', ㄼ: 'ㄹㅂ', ㄽ: 'ㄹㅅ', ㄾ: 'ㄹㅌ', ㄿ: 'ㄹㅍ', ㅀ: 'ㄹㅎ', ㅄ: 'ㅂㅅ' };
const TENSE: Record<string, string> = { ㄲ: 'ㄱ', ㄸ: 'ㄷ', ㅃ: 'ㅂ', ㅆ: 'ㅅ', ㅉ: 'ㅈ' };
const PLAIN: Record<string, string> = { ...TENSE, ㅋ: 'ㄱ', ㅌ: 'ㄷ', ㅍ: 'ㅂ', ㅊ: 'ㅈ' };
const VFOLD: Record<string, string> = { ㅠ: 'ㅜ', ㅗ: 'ㅜ', ㅛ: 'ㅜ', ㅕ: 'ㅓ', ㅝ: 'ㅓ', ㅑ: 'ㅏ', ㅘ: 'ㅏ', ㅐ: 'ㅔ', ㅒ: 'ㅔ', ㅖ: 'ㅔ', ㅙ: 'ㅔ', ㅟ: 'ㅣ', ㅞ: 'ㅣ', ㅚ: 'ㅣ', ㅢ: 'ㅣ' };
export function pk(s: string): string {
  const syl: string[][] = [];
  for (const c of s) {
    if (isSyl(c)) syl.push(decomp(c));
    else if (c === WILD) syl.push([WILD]);
    else if (isJamo(c)) syl.push([c]);
  }
  for (let i = 1; i < syl.length; i++) {
    const p = syl[i - 1]!;
    const c = syl[i]!;
    if (p.length === 3 && p[2] === '' && c.length === 3 && TENSE[c[0]!]) {
      p[2] = TENSE[c[0]!]!;
      c[0] = TENSE[c[0]!]!;
    }
  }
  const out: string[] = [];
  for (const g of syl) {
    if (g.length === 1) {
      out.push(...[...(SPLIT_CLUSTER[g[0]!] ?? g[0]!)]);
      continue;
    }
    let l = g[0]!;
    const v = g[1]!;
    const t = g[2]!;
    if (l === 'ㄷ' && (v === 'ㅠ' || v === 'ㅕ')) l = 'ㅈ';
    out.push(l, v, ...[...(SPLIT_CLUSTER[t] ?? t)]);
  }
  return out
    .map((j) => PLAIN[j] ?? VFOLD[j] ?? j)
    .filter((j) => j && j !== 'ㅎ' && j !== 'ㅇ')
    .join('');
}

// ── ② 변형 ──
interface KoVariants {
  base: string;
  composed: string;
  syl: string;
  all: string[];
  pks: string[];
}
function koVariants(norm: string): KoVariants {
  const base = [...norm].filter((c) => isSyl(c) || isJamo(c) || /[a-z0-9]/.test(c) || c === WILD).join('');
  const composed = composeJamo(base);
  const syl = [...composed].filter((c) => isSyl(c) || c === WILD).join('');
  const all = [...new Set([base, composed, syl, collapseRuns(syl, 1), collapseRuns(syl, 2), collapseRuns(composed, 1)])].filter(Boolean);
  return { base, composed, syl, all, pks: [...new Set(all.map(pk))].filter(Boolean) };
}
const LEET = C.en.leet;
const dedupe = (s: string) => s.replace(/(.)\1+/g, '$1');
const NON_EN = new RegExp(`[^a-z${WILD}]`, 'g');
function enVariants(norm: string): { letters: string; all: string[] } {
  const lower = norm.toLowerCase();
  const conv = (x: string) =>
    [...x]
      .map((c) => (c === WILD ? WILD : (LEET[c] ?? c)))
      .join('')
      .replace(NON_EN, '');
  const letters = conv(lower);
  const twoLetters = conv(lower.replace(/2/g, 'to'));
  return { letters, all: [...new Set([letters, twoLetters, dedupe(letters), dedupe(twoLetters)])].filter(Boolean) };
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function contains(v: string, stem: string): boolean {
  if (!v.includes(WILD)) return v.includes(stem);
  const a = [...v];
  const b = [...stem];
  for (let i = 0; i + b.length <= a.length; i++) if (b.every((ch, j) => a[i + j] === WILD || a[i + j] === ch)) return true;
  return false;
}

// ── ④ 조합 규칙(음절·음운 키 두 공간) ──
function attachIntent(core: string, intent: string): string[] {
  const out = [core + intent];
  const last = core.at(-1);
  if (last && isSyl(last)) {
    const [l, v, t] = decomp(last);
    if (t === '') {
      const head = core.slice(0, -1);
      if (intent.startsWith('어')) {
        const fused = v === 'ㅣ' ? comp(l, 'ㅕ') : ['ㅐ', 'ㅔ', 'ㅏ', 'ㅓ'].includes(v) ? last : v === 'ㅜ' ? comp(l, 'ㅝ') : v === 'ㅗ' ? comp(l, 'ㅘ') : null;
        if (fused) out.push(head + fused + intent.slice(1));
      }
      if (intent.startsWith('을')) out.push(head + comp(l, v, 'ㄹ') + intent.slice(1));
      if (intent.startsWith('으')) out.push(core + intent.slice(1));
    }
  }
  return out;
}
const toSylRe = (p: string) => new RegExp([...p].map((c) => (c === '~' ? '.?' : c === '≈' ? '.{0,2}' : esc(c))).join(''));
const toPkRe = (p: string) =>
  new RegExp(
    p
      .split(/([~≈])/)
      .map((seg) => (seg === '~' ? '.{0,3}' : seg === '≈' ? '.{0,6}' : esc(pk(seg))))
      .join(''),
  );
interface Combo {
  p: string;
  syl: RegExp;
  pk: RegExp;
}
type ComboLevel = 'strong' | 'soft' | 'strong2' | 'strong3' | 'soft2';
let compiled: {
  combo: Record<ComboLevel, Combo[]>;
  koPairs: { level: string; name: string; res: { syl: RegExp; pk: RegExp }[] }[];
  enPairs: { level: string; re: RegExp }[];
  strongPk: string[];
  softPk: string[];
  editProtos: string[];
  meansStrong: Set<string>;
  meansSoft: Set<string>;
} | null = null;

/** 정규식은 처음 쓸 때 한 번만 만든다(앱 시작 비용을 미룬다) */
function rules() {
  if (compiled) return compiled;
  const combo = {} as Record<ComboLevel, Combo[]>;
  for (const lv of ['strong', 'soft', 'strong2', 'strong3', 'soft2'] as const) {
    const g = C.ko.combo[lv];
    const protos: string[] = [];
    for (const c of g.cores) for (const it of g.intents) protos.push(...attachIntent(c, it));
    combo[lv] = protos.map((p) => ({ p, syl: toSylRe(p), pk: toPkRe(p) }));
  }
  const koPairs = C.ko.pairs.map((pr) => ({
    level: pr.level,
    name: pr.name ?? '',
    res: pr.A.flatMap((a) => pr.B.map((b) => ({ syl: new RegExp(esc(a) + '.?' + esc(b)), pk: new RegExp(esc(pk(a)) + '.{0,3}' + esc(pk(b))) }))),
  }));
  const gap = C.en.pairGap.split(' ')[0]!.replace('[a-z]', `[a-z${WILD}]`);
  const wildEsc = (s: string) => [...s].map((c) => `[${esc(c)}${WILD}]`).join('');
  const enPairs = C.en.pairs.map((pr) => ({ level: pr.level, re: new RegExp(`(?:${pr.A.map(wildEsc).join('|')})${gap}(?:${pr.B.map(wildEsc).join('|')})`) }));
  const groups: ComboLevel[] = ['strong', 'strong2', 'soft', 'strong3', 'soft2'];
  const editProtos = [...new Set(groups.flatMap((g) => combo[g]).map((x) => pk(x.p.replace(/[~≈]/g, ''))))].filter((k) => k.length >= C.ko.editDistanceMinJamo);
  compiled = {
    combo,
    koPairs,
    enPairs,
    strongPk: C.ko.strongPhonetic.map(pk),
    softPk: C.ko.softPhonetic.map(pk),
    editProtos,
    meansStrong: new Set(C.meansHashes.strong),
    meansSoft: new Set(C.meansHashes.soft),
  };
  return compiled;
}

function lev1(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let e = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++e > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return e + (a.length - i) + (b.length - j) <= 1;
}

// ── ⑦ 수단어 해시(평문 없음) ──
/** 수단어 해시 표. 기본 = rules-v0 `meansHashes`. 시험은 시험 전용 고추가루·해시를 넣어 이 경로를 직접 친다(평문 없이) */
export interface MeansTable {
  pepper: string;
  strong: readonly string[];
  soft: readonly string[];
}
/** 해시 한 칸: SHA-256(고추가루 + 낱말) 앞 16자 */
export const meansHash = (pepper: string, s: string) => sha256Hex(pepper + s).slice(0, 16);
function meansHit(vars: string[], table?: MeansTable): 'strong' | 'soft' | null {
  const R = rules();
  const pepper = table?.pepper ?? C.hashPepper;
  const S = table ? new Set(table.strong) : R.meansStrong;
  const W = table ? new Set(table.soft) : R.meansSoft;
  let soft = false;
  for (const v of vars) {
    const a = [...v];
    for (let i = 0; i < a.length; i++)
      for (let n = 2; n <= 8 && i + n <= a.length; n++) {
        const h = meansHash(pepper, a.slice(i, i + n).join(''));
        if (S.has(h)) return 'strong';
        if (W.has(h)) soft = true;
      }
  }
  return soft ? 'soft' : null;
}

export type CrisisLevel = 'strong' | 'soft' | 'none';

function crisisCore(norm: string, raw: string, means?: MeansTable): CrisisLevel {
  if (!norm) return 'none'; // 빈 입력은 어떤 위기 규칙에도 맞지 않는다(QA-3 R4-0)
  const R = rules();
  const ko = koVariants(norm);
  const en = enVariants(norm);
  const anyIn = (vars: string[], stems: string[]) => stems.find((s) => vars.some((v) => contains(v, s)));
  const sylVars = ko.all.filter((v) => [...v].some(isSyl));
  const comboHit = (x: Combo) => sylVars.some((v) => x.syl.test(v)) || ko.pks.some((k) => x.pk.test(k));
  const koPair = (level: string) => R.koPairs.find((pr) => pr.level === level && pr.res.some((r) => sylVars.some((v) => r.syl.test(v)) || ko.pks.some((k) => r.pk.test(k))));
  const enPair = (level: string) => R.enPairs.find((pr) => pr.level === level && en.all.some((v) => pr.re.test(v) || pr.re.test(dedupe(v))));
  // ③ ko 표준 줄기
  if (anyIn(ko.all, C.ko.strong)) return 'strong';
  // ④ 조합 + 음운 줄기
  for (const g of ['strong', 'strong2', 'strong3'] as const) for (const x of R.combo[g]) if (comboHit(x)) return 'strong';
  if (koPair('strong')) return 'strong';
  if (R.strongPk.some((k) => ko.pks.some((v) => v.includes(k)))) return 'strong';
  // ⑥ 초성 4자 이상
  if (C.ko.choseongStrong.some((c) => ko.base.includes(c))) return 'strong';
  // ⑦ 수단어 해시(strong 먼저)
  const mh = meansHit([...ko.all, ...en.all], means);
  if (mh === 'strong') return 'strong';
  // ⑧ en strong: 줄기·자리바꿈·가운데 글자 빠짐·구문쌍·경계
  if (C.en.strong.some((st) => en.all.some((v) => contains(v, st) || contains(v, dedupe(st))))) return 'strong';
  const long = C.en.strong.filter((x) => x.length >= 6);
  for (const st of long)
    for (let i = 0; i + 1 < st.length; i++) {
      if (st[i] === st[i + 1]) continue;
      const sw = st.slice(0, i) + st[i + 1] + st[i] + st.slice(i + 2);
      if (en.all.some((v) => contains(v, sw))) return 'strong';
    }
  for (const st of long)
    for (let i = 1; i < st.length - 1; i++) {
      const del = st.slice(0, i) + st.slice(i + 1);
      if (en.all.some((v) => contains(v, del))) return 'strong';
    }
  if (enPair('strong')) return 'strong';
  const words = raw
    .toLowerCase()
    .normalize('NFC')
    .split(/[^a-z0-9!@$*]+/)
    .map((w) =>
      [...w]
        .map((c) => LEET[c] ?? c)
        .join('')
        .replace(/[^a-z]/g, ''),
    );
  const boundary = (st: string) =>
    en.all.some((v) => v.startsWith(st) || v.endsWith(st) || v.startsWith(dedupe(st)) || v.endsWith(dedupe(st))) || words.some((w) => w === st || dedupe(w) === dedupe(st));
  if (C.en.boundaryStrong.some(boundary)) return 'strong';
  // ⑧ soft
  if (mh === 'soft') return 'soft';
  if (anyIn(ko.all, C.ko.soft)) return 'soft';
  for (const x of [...R.combo.soft, ...R.combo.soft2]) if (comboHit(x)) return 'soft';
  if (koPair('soft')) return 'soft';
  if (R.softPk.some((k) => ko.pks.some((v) => v.includes(k)))) return 'soft';
  const exact = [norm, ko.base, ko.composed, ko.syl, collapseRuns(ko.base, 1), collapseRuns(ko.syl, 1)];
  if (C.ko.softExact.some((st) => exact.includes(st))) return 'soft';
  if (C.ko.choseongSoft.some((c) => ko.base.includes(c))) return 'soft';
  if (C.en.soft.some((st) => en.all.some((v) => contains(v, st) || contains(v, dedupe(st))))) return 'soft';
  if (C.en.boundarySoft.some(boundary)) return 'soft';
  if (enPair('soft')) return 'soft';
  const sortStr = (x: string) => [...x].sort().join('');
  for (const st of long) {
    const key = sortStr(st);
    for (const v of en.all) for (let i = 0; i + st.length <= v.length; i++) if (sortStr(v.slice(i, i + st.length)) === key) return 'soft';
  }
  // ⑩ 음운 거리 1(키 전체 편집 거리 — 평가기 기본 'whole')
  for (const P of R.editProtos) for (const k of ko.pks) if (lev1(P, k)) return 'soft';
  return 'none';
}

/** 'help!' → 'helpi': 로마자 바로 뒤의 '!'만 i로(평가기의 (?<=[a-z])! — 뒤돌아보기 없이 같은 뜻) */
function leetBang(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    const prev = i > 0 ? s[i - 1]! : '';
    out += c === '!' && prev >= 'a' && prev <= 'z' ? 'i' : c;
  }
  return out;
}

export interface CrisisResult {
  level: CrisisLevel;
  hadException: boolean;
  /** 위기 대조에 쓴 정규화 문자열(가림 자리는 지움) — 사전 경로가 이어서 쓴다 */
  norm: string;
}

/** 위기 대조 ①~⑩(README 5절 · normalizationOrder) */
export function crisisMatch(raw: string, means?: MeansTable): CrisisResult {
  const pre = leetBang(raw.normalize('NFC').toLowerCase().replace(/＊/g, '*'));
  let norm = normalize(pre, true);
  let hadException = false;
  for (const ex of C.exceptions)
    if (norm.includes(ex)) {
      norm = norm.split(ex).join('');
      hadException = true;
    }
  let campaign = false;
  for (const d of C.downgradeToSoft)
    if (norm.includes(d)) {
      norm = norm.split(d).join('');
      campaign = true;
    }
  const level = crisisCore(norm, raw, means);
  const clean = norm.split(WILD).join('');
  if (level === 'none' && campaign) return { level: 'soft', hadException, norm: clean };
  return { level, hadException, norm: clean };
}

// ── order 5~13: 사전 경로 ──
interface Surface {
  ko: Map<string, LexEntry>;
  en: Map<string, LexEntry>;
  emoticon: Map<string, LexEntry>;
}
let surfaces: Surface | null = null;
const tight = (s: string) => s.normalize('NFC').replace(/\s/gu, '');
function surface(): Surface {
  if (surfaces) return surfaces;
  const out: Surface = { ko: new Map(), en: new Map(), emoticon: new Map() };
  for (const lang of ['ko', 'en'] as const)
    for (const e of LEX[lang].entries)
      for (const f of [e.lemma, ...e.forms]) {
        const k = normalize(f);
        // 빈 키는 표면 사전에 넣지 않는다(QA-3 R4-0) — 문장부호만인 이모티콘은 입력 전체 일치로만
        // 같은 키는 나중 항목이 이긴다(평가기와 같음)
        if (k) out[lang].set(k, e);
        else if (tight(f)) out.emoticon.set(tight(f), e);
      }
  surfaces = out;
  return out;
}
const crisisOf = (e: LexEntry | null | undefined): 'strong' | 'soft' | null =>
  e?.flags.includes('crisis_strong') ? 'strong' : e?.flags.includes('crisis_soft') ? 'soft' : null;

interface Hit {
  entry: LexEntry;
  /** 강조 +1 / 약화 −1 / 5번 이상 반복 +1 */
  boost: number;
}
function lexLookup(lang: LexLang, w: string): Hit | null {
  const R = RULES[lang];
  const S = surface();
  const boosted = /(.)\1{4,}/u.test(w) ? 1 : 0;
  const tries: { s: string; b: number }[] = [w, collapseRuns(w, 2), collapseRuns(w, 1)].map((s, i) => ({ s, b: i === 0 ? 0 : boosted }));
  const strip = (x: { s: string; b: number }) => {
    const out: { s: string; b: number }[] = [];
    const pref = (list: string[], b: number) => {
      for (const p of list)
        if (
          x.s.startsWith(p) &&
          (lang !== 'ko' || [...x.s].length - [...p].length >= (R.prefixMinRemainder ?? 0)) &&
          !(R.prefixStripExceptions ?? []).some((ex) => x.s.startsWith(ex))
        )
          out.push({ s: x.s.slice(p.length), b: x.b + b });
    };
    pref(R.intensifierPrefixes, 1);
    pref(R.attenuatorPrefixes, -1);
    return out;
  };
  for (const t of [...tries]) tries.push(...strip(t));
  if (lang === 'ko') for (const t of [...tries]) tries.push({ s: t.s.replace(/[ㅋㅎㅠㅜㄷ]+$/u, ''), b: t.b });
  const sfx = [...R.suffixes].sort((a, b) => b.length - a.length);
  for (const t of [...tries]) {
    let cur = [t];
    for (let r = 0; r < R.maxSuffixRounds; r++) {
      const nx: { s: string; b: number }[] = [];
      for (const c of cur) for (const sf of sfx) if (c.s.endsWith(sf) && [...c.s].length - [...sf].length >= R.minStemLength) nx.push({ s: c.s.slice(0, c.s.length - sf.length), b: c.b });
      tries.push(...nx);
      cur = nx;
    }
  }
  const other: LexLang = lang === 'ko' ? 'en' : 'ko';
  for (const t of tries) {
    if (!t.s) continue;
    const e = S[lang].get(t.s) ?? S[other].get(t.s);
    if (e) return { entry: e, boost: t.b };
  }
  return null;
}

/** 넓은 그물(heart-grain 8-0 ②): 가라앉음 5결은 강도와 상관없이 '곁으로 와서 붙어 앉기'로 돌아온다. 저장은 그 결 그대로 */
export const NET_SENSES: readonly string[] = ['low.in.sad', 'low.in.weary', 'low.out.lonely', 'low.out.longing', 'low.out.hurt'];

/** 기본 이름 표(heart-grain 7절 x.call). 유저가 지은 이름은 names로 더한다 */
export const DEFAULT_CALL_NAMES: readonly string[] = ['몽망이', '몽망', '망이', 'mongmangi', 'mongmang', 'mong'];

export type Intensity = 1 | 2 | 3;

/**
 * 해석 결과(런타임). `stay`(곁 대답)는 **런타임 전용**이다 — 세이브에는 `storedWordOf`가 고요(warm.in.still, 강도 1)로 바꿔 적는다(heart-grain 9-2 R1).
 * 쓴 글자는 결과에 담지 않는다(R8: 문자열은 판정 직후 버린다).
 */
export type Interpretation =
  | { kind: 'sense'; sense: string; intensity: Intensity; net: boolean }
  | { kind: 'stay'; level: 'strong' | 'soft' }
  | { kind: 'call' }
  | { kind: 'unknown' };

const clampI = (n: number): Intensity => (n <= 1 ? 1 : n >= 3 ? 3 : 2) as Intensity;

/** 낱말 하나 → 대답. 순서는 rules-v0 `order`(위기 → 이름 → 사전 → 과장 → 합성 분할 → 모르는 말) */
export function interpretWord(raw: string, lang: LexLang, names: readonly string[] = [], means?: MeansTable): Interpretation {
  const c = crisisMatch(raw, means);
  if (c.level !== 'none') return { kind: 'stay', level: c.level };
  const w = c.norm;
  if (!w) {
    const em = c.hadException ? null : surface().emoticon.get(tight(raw));
    return em ? senseOf(em, 0) : { kind: 'unknown' };
  }
  const callNames = [...DEFAULT_CALL_NAMES, ...names].map((n) => normalize(n)).filter(Boolean);
  if (callNames.includes(w)) return { kind: 'call' };
  const hit = lexLookup(lang, w);
  if (hit) {
    const lv = crisisOf(hit.entry);
    return lv ? { kind: 'stay', level: lv } : senseOf(hit.entry, hit.boost);
  }
  if (lang === 'ko') {
    for (const t of RULES.ko.hyperboleTails)
      if (w.endsWith(t) && w.length > t.length) {
        const h = lexLookup(lang, w.slice(0, w.length - t.length));
        if (h && !crisisOf(h.entry)) return { ...senseOf(h.entry, 0), intensity: 3 } as Interpretation;
      }
    for (const t of RULES.ko.hyperboleHeads)
      if (w.startsWith(t) && w.length > t.length) {
        const h = lexLookup(lang, w.slice(t.length));
        if (h && !crisisOf(h.entry)) return { ...senseOf(h.entry, 0), intensity: 3 } as Interpretation;
      }
  }
  if (!c.hadException) {
    const a = [...w];
    for (let i = 1; i < a.length; i++) {
      const L = lexLookup(lang, a.slice(0, i).join(''));
      const Rr = lexLookup(lang, a.slice(i).join(''));
      if (crisisOf(L?.entry) || crisisOf(Rr?.entry)) return { kind: 'stay', level: 'soft' };
    }
  }
  return { kind: 'unknown' };
}

function senseOf(e: LexEntry, boost: number): Interpretation {
  let i = clampI(e.intensity + boost);
  if (e.flags.includes('profane') && i > 2) i = 2; // 욕설 강도 상한 2
  if (e.sense === 'x.call') return { kind: 'call' };
  if (!SENSE_IDS.includes(e.sense)) return { kind: 'unknown' };
  return { kind: 'sense', sense: e.sense, intensity: i, net: NET_SENSES.includes(e.sense) };
}

// ── 말결 48 + 특수 2(저장 가능) ──
export const FAMILIES = ['bright', 'warm', 'spiky', 'low', 'nature', 'home', 'kin', 'days'] as const;
export type FamilyId = (typeof FAMILIES)[number];
/** senses.json(sensesVer 0.1.0)의 48칸 — 시험이 원본과 같은지 대조한다 */
export const SENSE_IDS: readonly string[] = [
  'bright.in.joy', 'bright.in.flutter', 'bright.in.pride', 'bright.out.glee', 'bright.out.laugh', 'bright.out.welcome',
  'warm.in.still', 'warm.in.languid', 'warm.in.sleepy', 'warm.out.tender', 'warm.out.thanks', 'warm.out.relief',
  'spiky.out.irritated', 'spiky.out.angry', 'spiky.out.wronged', 'spiky.in.worry', 'spiky.in.stuffy', 'spiky.in.scared',
  'low.out.longing', 'low.out.hurt', 'low.out.lonely', 'low.in.sad', 'low.in.weary', 'low.in.bored',
  'nature.in.rain', 'nature.in.snow', 'nature.in.plant', 'nature.out.sea', 'nature.out.sky', 'nature.out.night',
  'home.in.meal', 'home.in.sweet', 'home.in.drink', 'home.out.house', 'home.out.thing', 'home.out.wear',
  'kin.in.family', 'kin.in.friend', 'kin.in.beloved', 'kin.out.furry', 'kin.out.wing', 'kin.out.baby',
  'days.in.study', 'days.in.work', 'days.in.time', 'days.out.play', 'days.out.song', 'days.out.outing',
]; // prettier-ignore
/** 세이브에 적을 수 있는 말결: 48칸 + 부르기·모르는 말. 곁 대답(x.stay)은 런타임 전용이라 없다 */
export const STORED_SENSES: readonly string[] = [...SENSE_IDS, 'x.call', 'x.unknown'];
/** 곁 대답 날의 저장값(heart-grain 9-1) */
export const STILL_SENSE = 'warm.in.still';

export function familyOf(sense: string): FamilyId | null {
  const f = sense.split('.')[0] as FamilyId;
  return (FAMILIES as readonly string[]).includes(f) ? f : null;
}

/** 대답 → 세이브에 적는 말결·강도. 곁 대답은 고요·강도 1(9-1), 부르기·모르는 말은 그 특수 id·강도 1 */
export function storedWordOf(a: Interpretation): { sense: string; intensity: Intensity } {
  switch (a.kind) {
    case 'sense':
      return { sense: a.sense, intensity: a.intensity };
    case 'stay':
      return { sense: STILL_SENSE, intensity: 1 };
    case 'call':
      return { sense: 'x.call', intensity: 1 };
    default:
      return { sense: 'x.unknown', intensity: 1 };
  }
}

/** 글자 수(공백 뺀 NFC 코드 포인트). 먹 양(1~6)과 견준다 */
export function wordChars(raw: string): number {
  return [...raw.normalize('NFC')].filter((c) => !isSpace(c)).length;
}
