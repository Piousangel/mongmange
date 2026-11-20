// 세 기둥 세이브 필드(C-integrated v1.1 4-1 '세이브 v2', D-13 보강). 빌드 1은 **기능 없이 값만 쌓는다**:
// 기능(먹 고르기·이름·인장·반김…)은 빌드 2에서 앱의 기능 플래그로 켠다. 그래서 여기 규칙은 '기록'까지만 하고,
// 화면에 보이는 해석(정 2·4·7의 몸짓, 좋아하는 것 문장)은 하지 않는다.
// 순수 TS. 시각은 인자로만, 난수는 호출자가 넘긴 값(보안 난수)만 섞는다.
import { AXES, type AxisId, type AxisRecord, type Millis } from './types';

// ── 타고남 ────────────────────────────────────────────────

/** 타고남 값을 씨앗에서 뽑는 규칙의 버전(체형 3·빗 모양 4·번짐 고리 후보). 규칙을 바꾸면 올린다 — 옛 몽망이는 옛 규칙으로 */
export const TRAIT_VERSION = 1;

export interface Birth {
  /** uint32. 첫 탭(x·y·ms) + 설치 시각 + 32비트 보안 난수의 FNV-1a(2-1) */
  seed: number;
  /** 인장 테두리 16칸 이 빠짐·인장 코드의 씨앗(2-2). 타고남 씨앗에서 파생하되 따로 저장해 파생 규칙이 바뀌어도 무늬가 그대로다 */
  sealSeed: number;
  at: Millis;
  traitVersion: number;
  /** tap = 첫 탭에서 정함, migrated = v1 세이브를 올리며 기존 값에서 결정적으로 만듦 */
  source: 'tap' | 'migrated';
}

export interface BirthInput {
  /** 첫 탭 좌표(W 단위, 핵 원점) — 보안 난수가 섞이므로 사실상 서사다(2-1) */
  x: number;
  y: number;
  /** 첫 탭 시각(ms) */
  ms: Millis;
  installAt: Millis;
  /** 32비트 보안 난수(crypto.getRandomValues, 없으면 Math.random) */
  entropy: number;
}

const FNV_PRIME = 0x01000193;

/**
 * FNV-1a 32비트, 32비트 정수 단위(바이트 4개씩). 기본값은 본문 리터럴로 둔다 — 인자 기본값에서 모듈 상수를 읽으면
 * UI 스레드 worklet으로 옮겼을 때 'Property ... doesn't exist'가 난다(11-20 S25 사고, worklet 규칙)
 */
export function fnv1a(values: readonly number[], h0?: number): number {
  let h = (h0 ?? 0x811c9dc5) >>> 0;
  for (const v of values) {
    const n = v >>> 0;
    for (let i = 0; i < 4; i++) {
      h ^= (n >>> (i * 8)) & 0xff;
      h = Math.imul(h, FNV_PRIME) >>> 0;
    }
  }
  return h >>> 0;
}

/** ms 시각을 32비트 둘로(2^53 안이라 손실 없음) */
export function splitMs(t: number): [number, number] {
  return [Math.floor(t / 0x100000000) >>> 0, t >>> 0];
}

export function birthSeedOf(b: BirthInput): number {
  const q = (v: number) => Math.round(v * 4096) | 0; // 세이브 좌표 양자화와 같은 해상도
  return fnv1a([q(b.x), q(b.y), ...splitMs(b.ms), ...splitMs(b.installAt), b.entropy >>> 0]);
}

/**
 * 첫 탭 정보가 없을 때의 결정적 씨앗: v1 세이브 마이그레이션(생일 + 'migr' 꼬리표)·테스트·개발 메뉴.
 * 결정적이라 본이 깨져 백업(v1 원문)으로 복원해도 같은 몽망이가 된다(D-03). 대신 누구나 재현할 수 있으므로 비밀 값으로 쓰지 않는다
 */
export function migratedBirthSeed(createdAt: number): number {
  return fnv1a([...splitMs(createdAt), 0x6d696772]);
}

/** 인장 씨앗 = 타고남 씨앗에서 한 번 더 섞은 값('seal' 꼬리표) */
export function sealSeedOf(seed: number): number {
  return fnv1a([seed, 0x7365616c]);
}

export function makeBirth(seed: number, at: Millis, source: Birth['source']): Birth {
  const s = seed >>> 0;
  return { seed: s, sealSeed: sealSeedOf(s), at, traitVersion: TRAIT_VERSION, source };
}

/** 인장 테두리 16칸: 칸마다 0(온전)·1(살짝 빠짐)·2(크게 빠짐) — 3^16 무늬(2-2). 그리기는 빌드 2 */
export function sealNotches(sealSeed: number): number[] {
  const out: number[] = [];
  let h = sealSeed >>> 0;
  for (let i = 0; i < 16; i++) {
    h = fnv1a([h, i]);
    out.push(h % 3);
  }
  return out;
}

const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 I·O·0·1 뺌
/**
 * 인장 **표시용** 글자 무늬(`K7M3-QX9P`, base32 8자) — 이름표 장식처럼 그림에만 쓴다. 카드 공유 이미지에는 넣지 않는다(2-2).
 * **링크 키가 아니다**: 32비트 씨앗에서 나와 열거·추측할 수 있다(옮겨 온 몽망이는 생일만으로 재현됨). 링크 키는 서버가 보안 난수로 발급한다(server-v1 3-5)
 */
export function sealDisplayCode(sealSeed: number): string {
  let a = sealSeed >>> 0;
  let b = fnv1a([a, 0x636f6465]);
  let s = '';
  for (let i = 0; i < 8; i++) {
    const src = i < 4 ? a : b;
    s += B32[src & 31]!;
    if (i < 4) a = a >>> 5;
    else b = b >>> 5;
    if (i === 3) s += '-';
  }
  return s;
}

// ── 먹 고르기 ─────────────────────────────────────────────

/** 송연(청)·유연(갈)·자연(자)·송화(녹) — 2-1 먹빛 토큰 v1.1 */
export const INK_IDS = ['songyeon', 'yuyeon', 'jayeon', 'songhwa'] as const;
export type InkId = (typeof INK_IDS)[number];

export interface InkChoice {
  /** null = 아직(첫 밤 전). 첫 잠에 씨앗이 정해 둔다 → 빌드 2의 먹 고르기는 '바꾸기'로 동작 */
  id: InkId | null;
  chosenAt: Millis | null;
  /** 유저가 고르지 않아 씨앗이 정한 먹 */
  seeded: boolean;
  /**
   * 첫 밤 뒤 '먹 바꾸기'(공방 노트, C-integrated 2-1·D-05): **새 획에만** 쓰는 먹. id(몸의 먹 — 번짐 고리·밤 몸·지난 획)는 그대로다.
   * 획의 먹 = 그 획을 그은 시각(createdAt) 이전의 마지막 바꾸기, 없으면 id. 없으면 바꾼 적 없음(옛 세이브 호환)
   */
  changes?: InkChange[];
}

export interface InkChange {
  id: InkId;
  at: Millis;
}

/** 바꾸기 기록 상한(세이브 크기·조작 방지). 넘으면 오래된 것부터 버리지 않고 마지막 것을 덮는다 */
export const INK_CHANGES_MAX = 32;

/** 한 획의 먹(바꾸기 반영). 몸의 먹이 아직 없으면 null */
export function inkOfStroke(ink: InkChoice, strokeAt: Millis): InkId | null {
  let id = ink.id;
  const ch = ink.changes;
  if (ch) for (const c of ch) if (c.at <= strokeAt) id = c.id;
  return id;
}

/** 지금 새 획에 쓰일 먹(벼루 위에 남은 한 자루) */
export function currentInk(ink: InkChoice): InkId | null {
  const ch = ink.changes;
  return ch && ch.length > 0 ? ch[ch.length - 1]!.id : ink.id;
}

/** 씨앗이 고르는 먹(빌드 2: 첫 밤까지 고르지 않으면) */
export function seededInk(birthSeed: number): InkId {
  return INK_IDS[fnv1a([birthSeed, 0x696e6b]) % INK_IDS.length]!;
}

// ── 이름 ──────────────────────────────────────────────────

export interface NameRecord {
  text: string;
  at: Millis;
}

export const NAME_LIMITS = { hangul: 6, latin: 12 } as const;

/**
 * 이름 속 숫자 상한(architecture.md 3-5-2 — 전화번호 방지). 구분자(공백·점·하이픈·가운뎃점 등 글자도 숫자도 아닌 것)를 뺀 뒤
 * 이어진 숫자(\p{Nd} — 전각·다른 문자 체계 숫자 포함)가 이만큼을 넘으면 거부. 글자가 끼면 끊긴다(B2 리뷰 m4)
 */
export const NAME_MAX_DIGIT_RUN = 6;
const DIGIT_RUN = new RegExp(`\\p{Nd}{${NAME_MAX_DIGIT_RUN + 1},}`, 'u');

/** 숫자 규칙 판정: 글자(\p{L})·숫자(\p{Nd})만 남기고 나머지(구분자)를 지운 뒤 이어진 숫자를 센다 */
export function hasLongDigitRun(text: string): boolean {
  return DIGIT_RUN.test(text.normalize('NFC').replace(/[^\p{L}\p{Nd}]/gu, ''));
}

export type NameRejectReason = 'empty' | 'chars' | 'length' | 'digits';

/** 모양 검사(문자·길이) — 세이브를 불러올 때 쓰는 기준. 숫자 규칙은 여기 넣지 않는다(이미 저장된 이름이 있는 세이브를 깨지 않게) */
function nameShape(raw: string): { ok: true; text: string } | { ok: false; reason: Exclude<NameRejectReason, 'digits'> } {
  const text = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (text === '') return { ok: false, reason: 'empty' };
  if (!/^[\uAC00-\uD7A3A-Za-z0-9 ·]+$/.test(text)) return { ok: false, reason: 'chars' };
  const n = [...text].length;
  const max = /[\uAC00-\uD7A3]/.test(text) ? NAME_LIMITS.hangul : NAME_LIMITS.latin;
  if (n > max) return { ok: false, reason: 'length' };
  return { ok: true, text };
}

/**
 * 이름 검사(2-2): 한글 완성형·라틴·숫자·공백·가운뎃점만, 한글이 들면 6자, 아니면 12자. 앞뒤 공백·겹공백은 정리한다.
 * 구분자를 뺀 숫자가 7개 이상 이어지면 거부한다(`digits`, 3-5-2 — 앱 이름 입력·서버 공개 검사(B3)가 반드시 이 함수).
 * 맞으면 정리한 이름, 아니면 이유.
 */
export function normalizeName(raw: string): { ok: true; text: string } | { ok: false; reason: NameRejectReason } {
  // 숫자 규칙을 먼저 본다 — 전각 숫자·'010·1234·5678'처럼 문자·길이 검사에 먼저 걸릴 꼴도 이유가 'digits'로 나오게(입력 화면 안내)
  if (hasLongDigitRun(raw)) return { ok: false, reason: 'digits' };
  return nameShape(raw);
}

// ── 결 이름(temperamentLabel) ─────────────────────────────

export interface TemperamentLabel {
  axis: AxisId;
  sign: 1 | -1;
  since: Millis;
}

/** 표준편차 보정(B 시뮬 7일 ±0.2 집단 값, `B-identity-sim.mjs`). 표준편차가 작은 축은 같은 값도 더 두드러진다 */
export const LABEL_SIGMA: AxisRecord = { tempo: 0.31, boldness: 0.22, closeness: 0.18, curiosity: 0.25 };

/** 결 = |v/표준편차| argmax 축과 부호(8개). 동률은 AXES 순서 */
export function labelOf(v: AxisRecord): { axis: AxisId; sign: 1 | -1 } {
  let axis: AxisId = AXES[0]!;
  let best = -1;
  for (const k of AXES) {
    const sc = Math.abs(v[k]) / LABEL_SIGMA[k];
    if (sc > best) {
      best = sc;
      axis = k;
    }
  }
  return { axis, sign: v[axis] >= 0 ? 1 : -1 };
}

// ── 관계: 정·손 기억·감정 상태 ─────────────────────────────

/** 몸 자리 6구역(핵 각도, 위 = 0°, 시계 방향 60°씩): 정수리 앞·앞 옆·앞 아래·뒤 아래·뒤 옆·정수리 뒤. '앞' = 화면 오른쪽(+x) 가정(빌드 2에서 아트 확정) */
export const SPOTS = ['crownFront', 'sideFront', 'lowFront', 'lowBack', 'sideBack', 'crownBack'] as const;
export const RELATION = {
  /** 좋아하는 자리: 하루 알파(A 1-5) */
  spotAlpha: 0.25,
  /** 익숙한 시각: 하루 알파(A 1-5) */
  hourAlpha: 0.2,
  /** 짧은 탭의 접촉 시간으로 치는 값(ms) */
  tapContactMs: 150,
} as const;

export interface Relation {
  /** 정 = 몸을 한 번이라도 만진 깸의 수. 줄지 않는다(2-4) */
  jeongDays: number;
  /** 정을 마지막으로 센 dayIndex(같은 깸에 두 번 세지 않게). -1 = 아직 */
  jeongDay: number;
  /** 좋아하는 자리 6구역 지수 평균(하루 몫 비율, 합 ≤ 1) */
  spot: number[];
  /** 익숙한 시각 24칸 지수 평균(그날 그 시각에 왔으면 1). 개인정보: 이용 시간대 습관 — 서버 전송 대상(맡겨 두기 업로드, 처리방침 명시) */
  hour: number[];
  /** 오늘(이번 깸) 모으는 중: 자리별 접촉 ms, 시각별 방문 여부. 깰 때 위 평균에 접는다 */
  todaySpotMs: number[];
  /** 개인정보: 오늘 방문 시각 — 서버 전송 대상 */
  todayHour: number[];
  /** 마지막으로 유저가 앞에 있던 시각. 개인정보: 이용 패턴 — 서버 전송 대상 */
  lastSeenAt: Millis;
  /** 감정 상태 입력: 직전 부재 길이(ms) — 반김 4단계·머뭇거림(72h)이 읽는다. 0 = 아직 비운 적 없음. 개인정보: 부재 기간 — 서버 전송 대상 */
  lastAbsenceMs: number;
  /** 지금까지 가장 길게 비운 시간(ms). 개인정보: 부재 기간 — 서버 전송 대상 */
  longestAbsenceMs: number;
}

const zeros = (n: number) => Array.from({ length: n }, () => 0);

export function initRelation(at: Millis): Relation {
  return { jeongDays: 0, jeongDay: -1, spot: zeros(6), hour: zeros(24), todaySpotMs: zeros(6), todayHour: zeros(24), lastSeenAt: at, lastAbsenceMs: 0, longestAbsenceMs: 0 };
}

/** 몸 탭 좌표(W, 핵 원점, y 아래 +) → 자리 0..5 */
export function spotOf(x: number, y: number): number {
  const deg = ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360;
  return Math.min(5, Math.floor(deg / 60));
}

/** 현지 시(0..23) */
export function localHour(at: Millis, tzOffsetMin: number): number {
  const m = Math.floor((at + tzOffsetMin * 60_000) / 60_000);
  return (((Math.floor(m / 60) % 24) + 24) % 24);
}

/** 몸을 만짐(깨어 있을 때만 부른다): 정(그 깸에 한 번) + 자리 접촉 시간 */
export function touchRelation(r: Relation, dayIndex: number, x: number, y: number, holdMs: number): Relation {
  const i = spotOf(x, y);
  const todaySpotMs = r.todaySpotMs.slice();
  todaySpotMs[i] = todaySpotMs[i]! + Math.max(holdMs, RELATION.tapContactMs);
  const first = r.jeongDay !== dayIndex;
  return { ...r, todaySpotMs, jeongDays: r.jeongDays + (first ? 1 : 0), jeongDay: dayIndex };
}

/** 앱을 엶(설치 포함): 그 시각 칸에 방문 표시 */
export function visitRelation(r: Relation, at: Millis, tzOffsetMin: number): Relation {
  const h = localHour(at, tzOffsetMin);
  if (r.todayHour[h] === 1) return r;
  const todayHour = r.todayHour.slice();
  todayHour[h] = 1;
  return { ...r, todayHour };
}

/** 돌아옴: 직전 부재 길이 기록(감정 상태 입력) */
export function returnRelation(r: Relation, awaySince: Millis, at: Millis): Relation {
  const gap = Math.max(0, at - awaySince);
  return { ...r, lastAbsenceMs: gap, longestAbsenceMs: Math.max(r.longestAbsenceMs, gap) };
}

/** 깸: 오늘 모은 값을 지수 평균에 접고 비운다. 만지지 않은 날의 자리는 평균을 움직이지 않는다(최근 쪽으로만 기움) */
export function foldRelationDay(r: Relation): Relation {
  const total = r.todaySpotMs.reduce((a, b) => a + b, 0);
  const a = RELATION.spotAlpha;
  const spot = total > 0 ? r.spot.map((v, i) => v * (1 - a) + a * (r.todaySpotMs[i]! / total)) : r.spot;
  const b = RELATION.hourAlpha;
  const hour = r.hour.map((v, i) => v * (1 - b) + b * r.todayHour[i]!);
  return { ...r, spot, hour, todaySpotMs: zeros(6), todayHour: zeros(24) };
}

// ── 검증 ──────────────────────────────────────────────────

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isU32 = (v: unknown): v is number => isNum(v) && v === v >>> 0;
/** 불러온 이름도 다시 검사한다(조작·손상된 세이브가 길이·문자 제한을 넘지 않게) */
const nameIsClean = (text: string) => {
  // 불러오기는 모양 검사만(숫자 규칙 전에 지은 이름이 있는 세이브도 그대로 열린다). 새 이름은 setName이 normalizeName으로 막는다
  const n = nameShape(text);
  return n.ok && n.text === text;
};
const isNumArr = (v: unknown, n: number) => Array.isArray(v) && v.length === n && v.every(isNum);

/** 세 기둥 필드 검증. 문제가 있으면 필드 이름, 없으면 null */
export function invalidPillarField(s: Record<string, unknown>): string | null {
  const b = s.birth as Record<string, unknown> | undefined;
  if (!b || !isU32(b.seed) || !isU32(b.sealSeed) || !isNum(b.at) || !isNum(b.traitVersion) || (b.source !== 'tap' && b.source !== 'migrated')) return 'birth';
  const ink = s.ink as Record<string, unknown> | undefined;
  if (!ink || (ink.id !== null && !(INK_IDS as readonly unknown[]).includes(ink.id)) || (ink.chosenAt !== null && !isNum(ink.chosenAt)) || typeof ink.seeded !== 'boolean') return 'ink';
  if (
    ink.changes !== undefined &&
    (!Array.isArray(ink.changes) ||
      ink.changes.length > INK_CHANGES_MAX ||
      !ink.changes.every((c) => c && (INK_IDS as readonly unknown[]).includes((c as InkChange).id) && isNum((c as InkChange).at)))
  )
    return 'ink';
  const nm = s.name as Record<string, unknown> | null | undefined;
  if (nm === undefined || (nm !== null && (typeof nm.text !== 'string' || !isNum(nm.at) || !nameIsClean(nm.text)))) return 'name';
  const tl = s.temperamentLabel as Record<string, unknown> | null | undefined;
  if (tl === undefined || (tl !== null && (!(AXES as readonly unknown[]).includes(tl.axis) || (tl.sign !== 1 && tl.sign !== -1) || !isNum(tl.since)))) return 'temperamentLabel';
  const r = s.relation as Record<string, unknown> | undefined;
  if (
    !r ||
    !isNum(r.jeongDays) ||
    !isNum(r.jeongDay) ||
    !isNumArr(r.spot, 6) ||
    !isNumArr(r.hour, 24) ||
    !isNumArr(r.todaySpotMs, 6) ||
    !isNumArr(r.todayHour, 24) ||
    !isNum(r.lastSeenAt) ||
    !isNum(r.lastAbsenceMs) ||
    !isNum(r.longestAbsenceMs)
  )
    return 'relation';
  return null;
}
