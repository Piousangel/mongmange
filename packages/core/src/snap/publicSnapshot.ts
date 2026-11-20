// 공개 스냅숏 `snap:1` 읽기·정규화(architecture.md v2.2 3-5-1 — 이 파일과 test/public-snapshot.test.ts가 형식의 정본).
// 쓰는 곳: 서버 `PUT /creature/page`(검증 → 정규화 → snap.json 직접 쓰기), 웹 뷰어 live.js(읽기), 1.0 직후 밤물·동기.
// 만드는 함수(toPublicSnapshot, 세이브 → snap)는 로드맵 'core 함수'(착수 조건 5개) 몫이라 여기 없다 — 앱이 만들고 서버는 검증만 한다(B3).
// 원칙: 빼는 것은 형식으로 막는다 — 모르는 키는 어느 층에서든 거부(`unknown_key`), 점에는 θ·d만(시간·필압 칸이 없다), 깸 수 나이 없음.
// 의존성 0, Node·DOM 전역 없음(base64도 직접 푼다).
import { INK_IDS, type InkId } from '../sim/pillars';

export const SNAP_VERSION = 1;
/** 결 이름 id(시스템 결 8개 = 축 × 부호). 앱 문구 키 `temper.name`과 같은 이름 */
export const TEXTURE_IDS = [
  'tempoNeg',
  'tempoPos',
  'boldnessNeg',
  'boldnessPos',
  'closenessNeg',
  'closenessPos',
  'curiosityNeg',
  'curiosityPos',
] as const;
export type TextureId = (typeof TEXTURE_IDS)[number];

export const SNAP_LIMITS = {
  /** 정규화한 JSON 바이트 상한(서버 413) */
  bytes: 32 * 1024,
  strokes: 24,
  fixed: 3,
  strokePts: { min: 2, max: 64 },
  soak: 39,
  soakPts: { min: 2, max: 16 },
  dayAtPublish: 4000,
  coreScale: { min: 1000, max: 1600 },
  combGrowth: 4000,
  traitV: 99,
  /** 이름 문자열 상한(내용 검사는 서버의 normalizeName — 여기선 형태만) */
  nameChars: 24,
} as const;

export interface SnapStroke {
  st: 0 | 1 | 2 | 3;
  fixed: 0 | 1;
  base: 0 | 1;
  lv: 1 | 2 | 3;
  tp: 0 | 1;
  anc: number;
  n: number;
  pts: string;
}
export interface SnapSoak {
  n: number;
  pts: string;
}
export interface PublicSnapshot {
  snap: 1;
  traitV: number;
  born: { date: string; shape: 0 | 1 | 2; comb: 0 | 1 | 2 | 3 };
  ink: InkId;
  texture?: TextureId;
  dayAtPublish: number;
  lang: 'ko' | 'en';
  name?: string;
  coreScale: number;
  combGrowth: { protrude: number; thick: number };
  strokes: SnapStroke[];
  soak: SnapSoak[];
}

export type SnapRejectReason = 'not_object' | 'unknown_key' | 'missing' | 'version' | 'type' | 'range' | 'count' | 'pts';
export type SnapParseResult = { ok: true; snap: PublicSnapshot } | { ok: false; reason: SnapRejectReason; path: string };

class Reject {
  constructor(
    readonly reason: SnapRejectReason,
    readonly path: string,
  ) {}
}

type Obj = Record<string, unknown>;
function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
/** 키 집합 검사: 모르는 키 하나라도 있으면 거부, 필수가 빠지면 거부 */
function keys(o: Obj, path: string, required: readonly string[], optional: readonly string[] = []): void {
  for (const k of Object.keys(o)) if (!required.includes(k) && !optional.includes(k)) throw new Reject('unknown_key', path ? `${path}.${k}` : k);
  for (const k of required) if (!(k in o)) throw new Reject('missing', path ? `${path}.${k}` : k);
}
function int(v: unknown, path: string, lo: number, hi: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Reject('type', path);
  if (v < lo || v > hi) throw new Reject('range', path);
  return v;
}
function oneOf<T extends string>(v: unknown, path: string, list: readonly T[]): T {
  if (typeof v !== 'string') throw new Reject('type', path);
  if (!(list as readonly string[]).includes(v)) throw new Reject('range', path);
  return v as T;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
function realDate(v: unknown, path: string): string {
  if (typeof v !== 'string') throw new Reject('type', path);
  const m = DATE_RE.exec(v);
  if (!m) throw new Reject('type', path);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const days = [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (y < 2020 || y > 2200 || mo < 1 || mo > 12 || d < 1 || d > days[mo - 1]!) throw new Reject('range', path);
  return v;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** 표준 base64(패딩 필수) → 바이트. 형식이 틀리면 null */
export function decodeBase64(s: string): Uint8Array | null {
  if (!B64_RE.test(s)) return null;
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((s.length / 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const a = B64.indexOf(s[i]!);
    const b = B64.indexOf(s[i + 1]!);
    const c = s[i + 2] === '=' ? 0 : B64.indexOf(s[i + 2]!);
    const d = s[i + 3] === '=' ? 0 : B64.indexOf(s[i + 3]!);
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

/** 바이트 → 표준 base64(패딩 포함). 시험·고정물 생성용 */
export function encodeBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    s += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!;
    s += i + 1 < bytes.length ? B64[(n >> 6) & 63]! : '=';
    s += i + 2 < bytes.length ? B64[n & 63]! : '=';
  }
  return s;
}

/** 점 n개 = int16 LE [θ, d] × n → base64 길이는 정확히 n × 4 바이트여야 한다 */
function pts(v: unknown, n: number, path: string): string {
  if (typeof v !== 'string') throw new Reject('type', path);
  const b = decodeBase64(v);
  if (!b || b.length !== n * 4) throw new Reject('pts', path);
  return v;
}

/** 극좌표 점 풀기: θ(rad, 0~2π) · d(W 단위). 웹 뷰어가 쓴다 */
export function decodeSnapPoints(b64: string): Array<{ theta: number; d: number }> {
  const b = decodeBase64(b64);
  if (!b || b.length % 4) return [];
  const out: Array<{ theta: number; d: number }> = [];
  for (let i = 0; i < b.length; i += 4) {
    const ti = ((b[i]! | (b[i + 1]! << 8)) << 16) >> 16;
    const di = ((b[i + 2]! | (b[i + 3]! << 8)) << 16) >> 16;
    out.push({ theta: ((ti + 32768) / 65536) * 2 * Math.PI, d: di / 4096 });
  }
  return out;
}

/** 극좌표 점 싸기(3-5-1 양자화: θ는 먼저 mod — 2π 근처가 넘치지 않게, d는 범위 밖이면 null — 자르지 않는다) */
export function encodeSnapPoints(points: ReadonlyArray<{ theta: number; d: number }>): string | null {
  const b = new Uint8Array(points.length * 4);
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const tau = 2 * Math.PI;
    const w = ((p.theta % tau) + tau) % tau;
    const tq = (Math.round((w / tau) * 65536) % 65536) - 32768;
    const dq = Math.round(p.d * 4096);
    if (!Number.isFinite(dq) || dq < -32768 || dq > 32767) return null;
    b[i * 4] = tq & 255;
    b[i * 4 + 1] = (tq >> 8) & 255;
    b[i * 4 + 2] = dq & 255;
    b[i * 4 + 3] = (dq >> 8) & 255;
  }
  return encodeBase64(b);
}

function stroke(v: unknown, path: string): SnapStroke {
  if (!isObj(v)) throw new Reject('type', path);
  keys(v, path, ['st', 'fixed', 'base', 'lv', 'tp', 'anc', 'n', 'pts']);
  const n = int(v.n, `${path}.n`, SNAP_LIMITS.strokePts.min, SNAP_LIMITS.strokePts.max);
  return {
    st: int(v.st, `${path}.st`, 0, 3) as SnapStroke['st'],
    fixed: int(v.fixed, `${path}.fixed`, 0, 1) as 0 | 1,
    base: int(v.base, `${path}.base`, 0, 1) as 0 | 1,
    lv: int(v.lv, `${path}.lv`, 1, 3) as 1 | 2 | 3,
    tp: int(v.tp, `${path}.tp`, 0, 1) as 0 | 1,
    anc: int(v.anc, `${path}.anc`, 0, n - 1),
    n,
    pts: pts(v.pts, n, `${path}.pts`),
  };
}

function soak(v: unknown, path: string): SnapSoak {
  if (!isObj(v)) throw new Reject('type', path);
  keys(v, path, ['n', 'pts']);
  const n = int(v.n, `${path}.n`, SNAP_LIMITS.soakPts.min, SNAP_LIMITS.soakPts.max);
  return { n, pts: pts(v.pts, n, `${path}.pts`) };
}

function list<T>(v: unknown, path: string, max: number, each: (x: unknown, p: string) => T): T[] {
  if (!Array.isArray(v)) throw new Reject('type', path);
  if (v.length > max) throw new Reject('count', path);
  return v.map((x, i) => each(x, `${path}.${i}`));
}

/**
 * 공개 스냅숏 검사. 이미 JSON.parse한 값을 받는다(크기 413은 부르는 쪽 — 정규화 바이트로 SNAP_LIMITS.bytes).
 * 통과하면 **키 순서가 고정된 새 객체**(입력의 여분 속성·프로토타입을 끌고 오지 않는다).
 * `name`은 형태(문자열·길이)만 본다 — 공개 여부·normalizeName·금칙어는 서버(3-5-2)가 판정하고 결과로 덮어쓴다.
 */
export function parsePublicSnapshot(json: unknown): SnapParseResult {
  try {
    if (!isObj(json)) throw new Reject('not_object', '');
    keys(json, '', ['snap', 'traitV', 'born', 'ink', 'dayAtPublish', 'lang', 'coreScale', 'combGrowth', 'strokes', 'soak'], ['texture', 'name']);
    if (json.snap !== SNAP_VERSION) throw new Reject('version', 'snap');
    const born = json.born;
    if (!isObj(born)) throw new Reject('type', 'born');
    keys(born, 'born', ['date', 'shape', 'comb']);
    const cg = json.combGrowth;
    if (!isObj(cg)) throw new Reject('type', 'combGrowth');
    keys(cg, 'combGrowth', ['protrude', 'thick']);
    const strokes = list(json.strokes, 'strokes', SNAP_LIMITS.strokes, stroke);
    if (strokes.filter((s) => s.fixed === 1).length > SNAP_LIMITS.fixed) throw new Reject('count', 'strokes.fixed');
    let name: string | undefined;
    if ('name' in json) {
      if (typeof json.name !== 'string') throw new Reject('type', 'name');
      if (json.name.length === 0 || [...json.name].length > SNAP_LIMITS.nameChars) throw new Reject('range', 'name');
      name = json.name;
    }
    const snap: PublicSnapshot = {
      snap: 1,
      traitV: int(json.traitV, 'traitV', 1, SNAP_LIMITS.traitV),
      born: {
        date: realDate(born.date, 'born.date'),
        shape: int(born.shape, 'born.shape', 0, 2) as 0 | 1 | 2,
        comb: int(born.comb, 'born.comb', 0, 3) as 0 | 1 | 2 | 3,
      },
      ink: oneOf(json.ink, 'ink', INK_IDS),
      ...('texture' in json ? { texture: oneOf(json.texture, 'texture', TEXTURE_IDS) } : {}),
      dayAtPublish: int(json.dayAtPublish, 'dayAtPublish', 0, SNAP_LIMITS.dayAtPublish),
      lang: oneOf(json.lang, 'lang', ['ko', 'en'] as const),
      ...(name !== undefined ? { name } : {}),
      coreScale: int(json.coreScale, 'coreScale', SNAP_LIMITS.coreScale.min, SNAP_LIMITS.coreScale.max),
      combGrowth: {
        protrude: int(cg.protrude, 'combGrowth.protrude', 0, SNAP_LIMITS.combGrowth),
        thick: int(cg.thick, 'combGrowth.thick', 0, SNAP_LIMITS.combGrowth),
      },
      strokes,
      soak: list(json.soak, 'soak', SNAP_LIMITS.soak, soak),
    };
    return { ok: true, snap };
  } catch (e) {
    if (e instanceof Reject) return { ok: false, reason: e.reason, path: e.path };
    throw e;
  }
}

/**
 * 정규화 직렬화: 키 순서 고정(parse가 만든 객체 순서)·공백 없음. 서버가 snap.json으로 쓰는 바이트가 이것이다.
 * `name`은 인자로 따로 받는다 — 있으면 넣고, 없으면 입력에 있던 이름도 뺀다(앱이 보낸 이름은 늘 무시, 3-5-1 ④)
 */
export function serializePublicSnapshot(snap: PublicSnapshot, name: string | null): string {
  const { name: _ignored, ...rest } = snap;
  const out: PublicSnapshot = name === null ? rest : { ...rest, name };
  // 키 순서를 정본 순서로 다시 세운다(name은 lang 뒤)
  const ordered = {
    snap: out.snap,
    traitV: out.traitV,
    born: out.born,
    ink: out.ink,
    ...(out.texture !== undefined ? { texture: out.texture } : {}),
    dayAtPublish: out.dayAtPublish,
    lang: out.lang,
    ...(out.name !== undefined ? { name: out.name } : {}),
    coreScale: out.coreScale,
    combGrowth: out.combGrowth,
    strokes: out.strokes,
    soak: out.soak,
  };
  return JSON.stringify(ordered);
}
