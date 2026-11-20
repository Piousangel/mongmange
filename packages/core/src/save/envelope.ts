// D-13 세이브 봉투: 정본 = 원본 점열(int16 양자화), 메시는 저장하지 않는다.
// 직렬화 v2: raw를 [x, y, t(, p)] int16 리틀엔디언 → base64. v1(구형, 숫자 배열 JSON)은 migrate로 올린다.
import type { Attach, RawPoint, SaveEnvelope, StrokeRecord } from '../geometry/types';
import { capRaw } from '../geometry/simplify';
import { CURRENT_MESH_VERSION } from '../geometry/simplify';

export const SCHEMA_VERSION = 2;

/**
 * 이 앱보다 새 버전이 쓴 세이브(옛 빌드로 내려간 경우). 손상과 구별해야 한다:
 * 앱은 이때 아무것도 덮어쓰지 않고 '업데이트해 주세요'만 보인다(리뷰 M-5).
 */
export class FutureSaveError extends Error {
  readonly futureVersion = true;
  constructor(what: string, version: number) {
    super(`알 수 없는 ${what} 버전 ${version}(이 앱보다 새 버전)`);
    this.name = 'FutureSaveError';
  }
}

export function isFutureSaveError(e: unknown): e is FutureSaveError {
  return !!e && typeof e === 'object' && (e as { futureVersion?: unknown }).futureVersion === true;
}
/** 좌표 양자화: 1W = 4096 → ±8W, 해상도 0.00024W */
const XY_Q = 4096;
const P_Q = 32767;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: readonly number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!;
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63]! : '=';
    out += i + 2 < bytes.length ? B64[n & 63]! : '=';
  }
  return out;
}

export function base64ToBytes(s: string): number[] {
  const out: number[] = [];
  const clean = s.replace(/=+$/, '');
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (B64.indexOf(clean[i]!) << 18) |
      (B64.indexOf(clean[i + 1] ?? 'A') << 12) |
      ((i + 2 < clean.length ? B64.indexOf(clean[i + 2]!) : 0) << 6) |
      (i + 3 < clean.length ? B64.indexOf(clean[i + 3]!) : 0);
    out.push((n >> 16) & 255);
    if (i + 2 < clean.length) out.push((n >> 8) & 255);
    if (i + 3 < clean.length) out.push(n & 255);
  }
  return out;
}

function clamp16(v: number): number {
  return Math.max(-32768, Math.min(32767, Math.round(v)));
}

/** 정본 점열 → int16 바이트 → base64 */
export function encodeRaw(raw: readonly RawPoint[]): { data: string; hasP: boolean } {
  const hasP = raw.some((p) => p.p !== undefined);
  const stride = hasP ? 4 : 3;
  const bytes: number[] = [];
  const push16 = (v: number) => {
    const u = clamp16(v) & 0xffff;
    bytes.push(u & 255, u >> 8);
  };
  for (const p of raw) {
    push16(p.x * XY_Q);
    push16(p.y * XY_Q);
    push16(p.t);
    if (stride === 4) push16((p.p ?? 0.5) * P_Q);
  }
  return { data: bytesToBase64(bytes), hasP };
}

export function decodeRaw(data: string, hasP: boolean): RawPoint[] {
  const bytes = base64ToBytes(data);
  const vals: number[] = [];
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const u = bytes[i]! | (bytes[i + 1]! << 8);
    vals.push(u >= 0x8000 ? u - 0x10000 : u);
  }
  const stride = hasP ? 4 : 3;
  const out: RawPoint[] = [];
  for (let i = 0; i + stride - 1 < vals.length; i += stride) {
    const p: RawPoint = { x: vals[i]! / XY_Q, y: vals[i + 1]! / XY_Q, t: vals[i + 2]! };
    if (hasP) p.p = vals[i + 3]! / P_Q;
    out.push(p);
  }
  return out;
}

/** 저장 전에 정본을 양자화된 값으로 맞춘다(저장 → 로드 결과가 메모리 값과 같아야 결정성이 산다) */
export function quantizeRaw(raw: readonly RawPoint[]): RawPoint[] {
  const { data, hasP } = encodeRaw(capRaw(raw));
  return decodeRaw(data, hasP);
}

interface SerializedStrokeV2 {
  raw: string;
  hasP: boolean;
  attach: Attach;
  drawnAtCoreScale: number;
  meshVersion: number;
}

/** 구형 v1: raw는 숫자 배열 [[x,y,t],...], attach에 taper 없음 */
interface SerializedStrokeV1 {
  raw: number[][];
  attach: Omit<Attach, 'taper'>;
  drawnAtCoreScale: number;
  meshVersion: number;
}

export function serializeSave(env: SaveEnvelope): string {
  const strokes: SerializedStrokeV2[] = env.strokes.map((s) => {
    const { data, hasP } = encodeRaw(capRaw(s.raw));
    return { raw: data, hasP, attach: s.attach, drawnAtCoreScale: s.drawnAtCoreScale, meshVersion: s.meshVersion };
  });
  return JSON.stringify({ schemaVersion: SCHEMA_VERSION, strokes });
}

/** 봉투를 현재 schemaVersion으로 올린다(체인). 알 수 없는 미래 버전은 거부 */
export function migrate(obj: { schemaVersion: number; strokes: unknown[] }): { schemaVersion: number; strokes: SerializedStrokeV2[] } {
  let cur = obj;
  if (cur.schemaVersion === 1) {
    const strokes = (cur.strokes as SerializedStrokeV1[]).map((s) => {
      const raw: RawPoint[] = s.raw.map((a) => {
        const p: RawPoint = { x: a[0]!, y: a[1]!, t: a[2]! };
        if (a.length > 3) p.p = a[3]!;
        return p;
      });
      const { data, hasP } = encodeRaw(raw);
      return { raw: data, hasP, attach: { ...s.attach, taper: s.attach.level >= 2 ? 1 : 0 }, drawnAtCoreScale: s.drawnAtCoreScale, meshVersion: s.meshVersion };
    });
    cur = { schemaVersion: 2, strokes };
  }
  if (typeof cur.schemaVersion === 'number' && cur.schemaVersion > SCHEMA_VERSION) throw new FutureSaveError('세이브', cur.schemaVersion);
  if (cur.schemaVersion !== SCHEMA_VERSION) throw new Error(`알 수 없는 세이브 버전 ${cur.schemaVersion}`);
  return cur as { schemaVersion: number; strokes: SerializedStrokeV2[] };
}

export interface LoadOptions {
  /** 메시 버전을 현재 버전으로 올린다(파생물이라 정본은 그대로) */
  upgradeMesh?: boolean;
}

export function parseSave(json: string, opts: LoadOptions = {}): SaveEnvelope {
  const env = migrate(JSON.parse(json) as { schemaVersion: number; strokes: unknown[] });
  const strokes: StrokeRecord[] = env.strokes.map((s) => ({
    raw: decodeRaw(s.raw, s.hasP),
    attach: s.attach,
    drawnAtCoreScale: s.drawnAtCoreScale,
    meshVersion: opts.upgradeMesh ? CURRENT_MESH_VERSION : s.meshVersion,
  }));
  return { schemaVersion: SCHEMA_VERSION, strokes };
}
