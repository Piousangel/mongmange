// 이레 영상 MP4 마무리·검사(C10). 네이티브 인코더(AVAssetWriter·MediaMuxer)가 쓴 파일을 한 가지 꼴로 맞추고, 서버 커밋 검사
// (architecture 3-5-3 ③)와 같은 규칙으로 본다. 의존성 없음 — `scripts/check-ire-mp4.mjs`가 Node(타입 지우기)로 이 파일을 그대로 불러 쓴다.
//
// 마무리(finalizeIreMp4)가 플랫폼 차이를 없앤다:
//  - 순서 ftyp → moov → mdat(faststart). MediaMuxer는 moov를 뒤에 쓰기도 하고(추정 공간이 모자라면), mdat 머리를 64비트 largesize로 쓴다
//    → 서버 검사(크기 1 = 실패)에 걸린다. 그래서 mdat을 32비트 머리로 다시 쓰고 청크 위치(stco·co64)를 옮긴다.
//  - 메타데이터 0(C7 계약 IRE_VIDEO_METADATA): udta·meta 상자(위치 ©xyz, com.android.version 등)를 지우고
//    mvhd·tkhd·mdhd의 만든·고친 시각을 0으로. 최상위 free·wide·uuid도 버린다.
//  - tkhd 표시 크기 = 계약 크기(서버 검사는 tkhd를 본다). 계약 크기는 짝수다(웹 루프 540×676, PM 11-20 — H.264 4:2:0은 홀수 높이 불가).
//    네이티브는 홀수가 들어와도 짝수로 올려 부호화하지만, 그 경우 표시 크기와 부호화 크기가 달라지므로 계약은 짝수로 둔다.

/**
 * 서버 검사(3-5-3)·공유 규격. core IRE_OUTPUTS, contract PAGE_FILES.loop·LOOP_SECONDS와 같아야 한다(시험이 대조).
 * 공유판 상한 8MB = 12-05 관문 기준(인스타·카카오 여유, docs/app/c7/device-gate.md). 느린 Android에서 비트 예산이 벽시계를 따라
 * 파일이 커지는 경우(리뷰 M-5)를 여기서 떨어뜨린다 — 넘으면 이미지판.
 */
export const IRE_MP4_RULES = {
  share: { width: 1080, height: 1920, audio: true, maxBytes: 8 * 1024 * 1024 },
  webLoop: { width: 540, height: 676, audio: false, maxBytes: 600 * 1024 },
  /** 길이(초) 허용 범위 */
  duration: [7.5, 8.5],
  /** 서버는 파일 앞 64KB만 읽는다 — moov가 이 안에서 끝나야 한다 */
  headBytes: 64 * 1024,
} as const;

export type IreMp4Kind = 'share' | 'webLoop';

/** 서버 `CommitRejectReason`의 MP4 쪽 + 앱 쪽 추가(metadata·size) */
export type IreMp4Reason = 'signature' | 'not_faststart' | 'box' | 'duration' | 'audio' | 'tracks' | 'dimensions' | 'metadata' | 'size';

// 매개변수 속성(readonly reason)은 쓰지 않는다 — Node 타입 지우기(검사 스크립트)가 지원하지 않는다
export class Mp4Error extends Error {
  readonly reason: IreMp4Reason;
  constructor(reason: IreMp4Reason, detail: string) {
    super(`${reason}: ${detail}`);
    this.name = 'Mp4Error';
    this.reason = reason;
  }
}

interface Box {
  type: string;
  start: number;
  /** 머리 길이(8 또는 largesize 16) */
  header: number;
  end: number;
}

const u32 = (b: Uint8Array, o: number) => ((b[o]! << 24) >>> 0) + (b[o + 1]! << 16) + (b[o + 2]! << 8) + b[o + 3]!;
const u64 = (b: Uint8Array, o: number) => u32(b, o) * 2 ** 32 + u32(b, o + 4);
const type4 = (b: Uint8Array, o: number) => String.fromCharCode(b[o]!, b[o + 1]!, b[o + 2]!, b[o + 3]!);
function put32(b: Uint8Array, o: number, v: number) {
  b[o] = (v >>> 24) & 0xff;
  b[o + 1] = (v >>> 16) & 0xff;
  b[o + 2] = (v >>> 8) & 0xff;
  b[o + 3] = v & 0xff;
}
function put64(b: Uint8Array, o: number, v: number) {
  put32(b, o, Math.floor(v / 2 ** 32));
  put32(b, o + 4, v >>> 0);
}

/** 관대한 읽기(마무리 입력용): 크기 0(파일 끝까지)·1(largesize)을 받아들인다. 범위를 넘으면 Mp4Error('box') */
function readBoxes(b: Uint8Array, from: number, to: number): Box[] {
  const out: Box[] = [];
  let o = from;
  while (o < to) {
    if (o + 8 > to) throw new Mp4Error('box', `truncated box header at ${o}`);
    let size = u32(b, o);
    let header = 8;
    if (size === 1) {
      if (o + 16 > to) throw new Mp4Error('box', `truncated largesize at ${o}`);
      size = u64(b, o + 8);
      header = 16;
    } else if (size === 0) {
      size = to - o;
    }
    if (size < header || o + size > to) throw new Mp4Error('box', `box ${type4(b, o + 4)} at ${o} overflows (${size})`);
    out.push({ type: type4(b, o + 4), start: o, header, end: o + size });
    o += size;
  }
  return out;
}

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf']);
/** 메타데이터·빈 칸 상자(어느 깊이든 버린다) */
const DROP = new Set(['udta', 'meta', 'free', 'skip', 'wide', 'uuid']);

function handlerOf(b: Uint8Array, trak: Box): string {
  const mdia = readBoxes(b, trak.start + trak.header, trak.end).find((x) => x.type === 'mdia');
  if (!mdia) return '?';
  const hdlr = readBoxes(b, mdia.start + mdia.header, mdia.end).find((x) => x.type === 'hdlr');
  return hdlr ? type4(b, hdlr.start + hdlr.header + 8) : '?';
}

/** 만든·고친 시각을 0으로(mvhd·tkhd·mdhd 공통 배치: 버전 1이면 8바이트씩) */
function zeroTimes(out: Uint8Array, body: number) {
  const n = out[body] === 1 ? 16 : 8;
  out.fill(0, body + 4, body + 4 + n);
}

/**
 * 네이티브 출력 → 계약 꼴(faststart·메타 0·32비트 머리·표시 크기). 입력은 바꾸지 않는다.
 * 지원하지 않는 꼴(mdat 둘 이상, 청크 위치가 mdat 밖, 영상 트랙 없음)은 Mp4Error — 호출부는 이미지판으로 떨어진다.
 */
export function finalizeIreMp4(input: Uint8Array, display: { width: number; height: number }): Uint8Array {
  const top = readBoxes(input, 0, input.length);
  if (top[0]?.type !== 'ftyp') throw new Mp4Error('signature', 'first box is not ftyp');
  const moovs = top.filter((x) => x.type === 'moov');
  const mdats = top.filter((x) => x.type === 'mdat');
  if (moovs.length !== 1) throw new Mp4Error('box', `expected one moov, got ${moovs.length}`);
  if (mdats.length !== 1) throw new Mp4Error('box', `expected one mdat, got ${mdats.length}`);
  const ftyp = top[0];
  const moov = moovs[0]!;
  const mdat = mdats[0]!;
  const oldPayload = mdat.start + mdat.header;
  const payloadLen = mdat.end - oldPayload;

  // moov 다시 쓰기: 버릴 상자를 빼고 32비트 머리로. 청크 표 위치는 나중에 옮기려고 모아 둔다.
  const parts: Uint8Array[] = [];
  let len = 0;
  const chunkTables: { at: number; wide: boolean }[] = [];
  const timeBoxes: number[] = [];
  const videoTkhd: number[] = [];
  let videoTracks = 0;
  const emit = (bytes: Uint8Array) => {
    parts.push(bytes);
    len += bytes.length;
  };
  const writeBox = (box: Box, trackHandler: string | null): void => {
    if (DROP.has(box.type)) return;
    const body = box.start + box.header;
    if (CONTAINERS.has(box.type)) {
      const handler = box.type === 'trak' ? handlerOf(input, box) : trackHandler;
      if (box.type === 'trak' && handler === 'vide') videoTracks++;
      const head = new Uint8Array(8);
      const at = len;
      emit(head);
      for (const c of readBoxes(input, body, box.end)) writeBox(c, handler);
      const size = len - at;
      put32(head, 0, size);
      head.set([box.type.charCodeAt(0), box.type.charCodeAt(1), box.type.charCodeAt(2), box.type.charCodeAt(3)], 4);
      return;
    }
    const bodyLen = box.end - body;
    const copy = new Uint8Array(8 + bodyLen);
    put32(copy, 0, 8 + bodyLen);
    copy.set(input.subarray(box.start + 4, box.start + 8), 4);
    copy.set(input.subarray(body, box.end), 8);
    const at = len;
    if (box.type === 'mvhd' || box.type === 'mdhd') timeBoxes.push(at + 8);
    if (box.type === 'tkhd') {
      timeBoxes.push(at + 8);
      if (trackHandler === 'vide') videoTkhd.push(at + 8);
    }
    if (box.type === 'stco') chunkTables.push({ at: at + 8, wide: false });
    if (box.type === 'co64') chunkTables.push({ at: at + 8, wide: true });
    emit(copy);
  };
  writeBox(moov, null);
  if (videoTracks === 0) throw new Mp4Error('tracks', 'no video track');

  const ftypLen = 8 + (ftyp.end - ftyp.start - ftyp.header);
  const moovStart = ftypLen;
  const newPayload = moovStart + len + 8;
  if (payloadLen + 8 > 0xffffffff) throw new Mp4Error('box', 'mdat too large for 32-bit header');
  const out = new Uint8Array(newPayload + payloadLen);
  put32(out, 0, ftypLen);
  out.set(input.subarray(ftyp.start + 4, ftyp.start + 8), 4);
  out.set(input.subarray(ftyp.start + ftyp.header, ftyp.end), 8);
  let o = moovStart;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  put32(out, o, payloadLen + 8);
  out.set([0x6d, 0x64, 0x61, 0x74], o + 4); // 'mdat'
  out.set(input.subarray(oldPayload, mdat.end), newPayload);

  for (const body of timeBoxes) zeroTimes(out, moovStart + body);
  for (const body of videoTkhd) {
    const at = moovStart + body;
    const wOff = at + (out[at] === 1 ? 88 : 76);
    put32(out, wOff, display.width * 65536);
    put32(out, wOff + 4, display.height * 65536);
  }
  const delta = newPayload - oldPayload;
  for (const t of chunkTables) {
    const at = moovStart + t.at;
    const n = u32(out, at + 4);
    for (let k = 0; k < n; k++) {
      const p = at + 8 + k * (t.wide ? 8 : 4);
      const old = t.wide ? u64(out, p) : u32(out, p);
      if (old < oldPayload || old > mdat.end) throw new Mp4Error('box', `chunk offset ${old} outside mdat`);
      const v = old + delta;
      if (t.wide) put64(out, p, v);
      else if (v > 0xffffffff) throw new Mp4Error('box', 'chunk offset overflow');
      else put32(out, p, v);
    }
  }
  return out;
}

export interface IreMp4Track {
  handler: string;
  width: number;
  height: number;
  timescale: number;
  durationSec: number;
}
export interface IreMp4Info {
  fileSize: number;
  top: string[];
  durationSec: number;
  tracks: IreMp4Track[];
  /** 0이 아닌 만든·고친 시각을 가진 상자 */
  dated: string[];
  /** 남아 있는 메타 상자 경로(udta·meta) */
  metaBoxes: string[];
  moovEnd: number;
}

/** 검사 결과. 이유 이름은 서버 `checkMp4`와 같다(서버 실패를 기기 쪽에서 미리 본다) */
export type IreMp4Check = { ok: true; info: IreMp4Info } | { ok: false; reason: IreMp4Reason; detail: string; info?: IreMp4Info };

/** 엄격 읽기(검사용, 서버 S11 규칙): 크기 0·1·8 미만·범위 넘침은 실패 */
function strictBoxes(b: Uint8Array, from: number, to: number): Box[] {
  const out: Box[] = [];
  let o = from;
  while (o < to) {
    if (o + 8 > to) throw new Mp4Error('box', `truncated header at ${o}`);
    const size = u32(b, o);
    if (size === 0 || size === 1 || size < 8 || o + size > to) throw new Mp4Error('box', `bad box size ${size} at ${o}`);
    out.push({ type: type4(b, o + 4), start: o, header: 8, end: o + size });
    o += size;
  }
  return out;
}
const kid = (b: Uint8Array, p: Box, t: string) => strictBoxes(b, p.start + 8, p.end).find((x) => x.type === t);

/**
 * 서버 커밋 검사(3-5-3 ③)와 같은 규칙 + 앱 계약(메타 0·공유판 소리 트랙·크기 상한).
 * bytes = 파일 전체(기기 산출물 검사 스크립트·시험). 서버처럼 앞 64KB 안에서 moov가 끝나야 한다.
 */
export function checkIreMp4(bytes: Uint8Array, kind: IreMp4Kind): IreMp4Check {
  const want = IRE_MP4_RULES[kind];
  let info: IreMp4Info | undefined;
  try {
    const head = bytes.subarray(0, Math.min(bytes.length, IRE_MP4_RULES.headBytes));
    if (head.length < 16 || type4(head, 4) !== 'ftyp') throw new Mp4Error('signature', 'no ftyp');
    const top: string[] = [];
    let o = 0;
    let moov: Box | undefined;
    while (!moov) {
      if (o + 8 > head.length) throw new Mp4Error('not_faststart', 'moov not within first 64KB');
      const size = u32(head, o);
      const type = type4(head, o + 4);
      if (size === 0 || size === 1 || size < 8 || o + size > bytes.length) throw new Mp4Error('box', `top box ${type} size ${size}`);
      if (type === 'mdat') throw new Mp4Error('not_faststart', 'mdat before moov');
      top.push(type);
      if (type === 'moov') {
        if (o + size > head.length) throw new Mp4Error('not_faststart', 'moov ends after 64KB');
        moov = { type, start: o, header: 8, end: o + size };
        break;
      }
      o += size;
    }
    for (let p = moov.end; p < bytes.length; ) {
      if (p + 8 > bytes.length) throw new Mp4Error('box', 'trailing bytes');
      const size = u32(bytes, p);
      if (size === 0 || size === 1 || size < 8 || p + size > bytes.length) throw new Mp4Error('box', `top box ${type4(bytes, p + 4)} size ${size}`);
      top.push(type4(bytes, p + 4));
      p += size;
    }
    const kids = strictBoxes(head, moov.start + 8, moov.end);
    const mvhd = kids.find((k) => k.type === 'mvhd');
    if (!mvhd) throw new Mp4Error('box', 'no mvhd');
    const dated: string[] = [];
    const metaBoxes: string[] = [];
    const timeOf = (box: Box, path: string) => {
      const v = head[box.start + 8];
      const n = v === 1 ? 16 : 8;
      for (let k = 0; k < n; k++) if (head[box.start + 12 + k] !== 0) return void dated.push(path);
    };
    const walk = (p: Box, path: string) => {
      for (const c of strictBoxes(head, p.start + 8, p.end)) {
        const cp = `${path}/${c.type}`;
        if (c.type === 'udta' || c.type === 'meta') metaBoxes.push(cp);
        if (c.type === 'mvhd' || c.type === 'tkhd' || c.type === 'mdhd') timeOf(c, cp);
        if (CONTAINERS.has(c.type)) walk(c, cp);
      }
    };
    walk(moov, 'moov');
    const mv = mvhd.start + 8;
    const v = head[mv];
    const timescale = v === 1 ? u32(head, mv + 20) : u32(head, mv + 12);
    const duration = v === 1 ? u64(head, mv + 24) : u32(head, mv + 16);
    const tracks: IreMp4Track[] = kids
      .filter((k) => k.type === 'trak')
      .map((t) => {
        const mdia = kid(head, t, 'mdia');
        const hdlr = mdia && kid(head, mdia, 'hdlr');
        const mdhd = mdia && kid(head, mdia, 'mdhd');
        const tkhd = kid(head, t, 'tkhd');
        let width = 0;
        let height = 0;
        if (tkhd) {
          const tb = tkhd.start + 8;
          const wOff = tb + (head[tb] === 1 ? 88 : 76);
          if (wOff + 8 > tkhd.end) throw new Mp4Error('box', 'short tkhd');
          width = u32(head, wOff) / 65536;
          height = u32(head, wOff + 4) / 65536;
        }
        let ts = 0;
        let dur = 0;
        if (mdhd) {
          const mb = mdhd.start + 8;
          ts = head[mb] === 1 ? u32(head, mb + 20) : u32(head, mb + 12);
          dur = head[mb] === 1 ? u64(head, mb + 24) : u32(head, mb + 16);
        }
        return { handler: hdlr ? type4(head, hdlr.start + 16) : '?', width, height, timescale: ts, durationSec: ts ? dur / ts : 0 };
      });
    info = { fileSize: bytes.length, top, durationSec: timescale ? duration / timescale : 0, tracks, dated, metaBoxes, moovEnd: moov.end };

    if (!timescale) throw new Mp4Error('duration', 'mvhd timescale 0');
    const [lo, hi] = IRE_MP4_RULES.duration;
    if (!(info.durationSec >= lo && info.durationSec <= hi)) throw new Mp4Error('duration', `${info.durationSec.toFixed(3)}s`);
    const handlers = tracks.map((t) => t.handler);
    const video = tracks.filter((t) => t.handler === 'vide');
    const audio = tracks.filter((t) => t.handler === 'soun');
    if (!want.audio && audio.length) throw new Mp4Error('audio', 'loop must be silent (no sound track)');
    const expected = want.audio ? 2 : 1;
    if (video.length !== 1 || (want.audio && audio.length !== 1) || tracks.length !== expected) {
      throw new Mp4Error('tracks', `tracks [${handlers.join(',')}]`);
    }
    if (video[0]!.width !== want.width || video[0]!.height !== want.height) {
      throw new Mp4Error('dimensions', `${video[0]!.width}x${video[0]!.height}`);
    }
    if (metaBoxes.length || dated.length) throw new Mp4Error('metadata', [...metaBoxes, ...dated.map((d) => `${d}(time)`)].join(' '));
    if (want.maxBytes && bytes.length > want.maxBytes) throw new Mp4Error('size', `${bytes.length} > ${want.maxBytes}`);
    return { ok: true, info };
  } catch (e) {
    if (e instanceof Mp4Error) return { ok: false, reason: e.reason, detail: e.message, info };
    throw e;
  }
}
