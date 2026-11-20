// 시험용 MP4 만들기: 네이티브 인코더가 실제로 내는 두 꼴을 흉내 낸다(상자 구조만, 영상 내용은 청크마다 표식 바이트).
//  - 'muxer'(Android MediaMuxer): ftyp → mdat(64비트 largesize 머리) → moov(뒤), udta·meta·만든 시각 있음
//  - 'writer'(iOS AVAssetWriter, shouldOptimizeForNetworkUse): ftyp → wide → moov → free → mdat(32비트)

const be32 = (v: number) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
const be64 = (v: number) => [...be32(Math.floor(v / 2 ** 32)), ...be32(v >>> 0)];
const bytes = (...xs: (number | number[] | Uint8Array)[]) => {
  const out: number[] = [];
  for (const x of xs) {
    if (typeof x === 'number') out.push(x);
    else for (const v of x) out.push(v);
  }
  return new Uint8Array(out);
};
const zeros = (n: number) => new Array<number>(n).fill(0);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

export function box(type: string, ...parts: Uint8Array[]): Uint8Array {
  const n = parts.reduce((s, p) => s + p.length, 8);
  return bytes(be32(n), ascii(type), ...parts);
}

const MATRIX = [...be32(0x10000), ...zeros(12), ...be32(0x10000), ...zeros(12), ...be32(0x40000000)];

function mvhd(timescale: number, duration: number, time: number) {
  return box('mvhd', bytes(0, 0, 0, 0, be32(time), be32(time), be32(timescale), be32(duration), be32(0x10000), 1, 0, zeros(10), MATRIX, zeros(24), be32(3)));
}
function tkhd(id: number, w: number, h: number, duration: number, time: number, v1 = false) {
  if (v1) {
    return box('tkhd', bytes(1, 0, 0, 3, be64(time), be64(time), be32(id), zeros(4), be64(duration), zeros(8), zeros(8), MATRIX, be32(w * 65536), be32(h * 65536)));
  }
  return box('tkhd', bytes(0, 0, 0, 3, be32(time), be32(time), be32(id), zeros(4), be32(duration), zeros(8), 0, 0, 0, 0, 0, 0, 0, 0, MATRIX, be32(w * 65536), be32(h * 65536)));
}
function mdhd(timescale: number, duration: number, time: number) {
  return box('mdhd', bytes(0, 0, 0, 0, be32(time), be32(time), be32(timescale), be32(duration), 0x55, 0xc4, 0, 0));
}
const hdlr = (h: string) => box('hdlr', bytes(zeros(4), zeros(4), ascii(h), zeros(12), 0));
const stco = (offs: number[]) => box('stco', bytes(zeros(4), be32(offs.length), ...offs.map(be32)));
const co64 = (offs: number[]) => box('co64', bytes(zeros(4), be32(offs.length), ...offs.map(be64)));
const metaBox = () => box('meta', bytes(zeros(4)), box('keys', bytes(zeros(8))));
const udta = () => box('udta', box('©xyz', bytes(0, 12, 0x15, 0xc7, ascii('+37.5+127.0/'))));

export interface FakeTrack {
  handler: 'vide' | 'soun';
  width: number;
  height: number;
  chunks: number;
}
export interface FakeMp4 {
  layout: 'muxer' | 'writer';
  tracks: FakeTrack[];
  durationSec?: number;
  wide?: boolean;
  meta?: boolean;
  /** 0이 아닌 만든 시각 */
  time?: number;
  /** mdat 끝에 덧붙일 바이트(크기 상한 시험) */
  pad?: number;
  /** tkhd 버전 1(64비트 시각) */
  tkhdV1?: boolean;
}

const CHUNK = 16;
/** 트랙 t 청크 k의 표식 바이트 */
export const marker = (t: number, k: number) => 1 + t * 50 + k;

export function fakeMp4(o: FakeMp4): Uint8Array {
  const ts = 1000;
  const dur = Math.round((o.durationSec ?? 8) * ts);
  const time = o.time ?? 3_800_000_000;
  const payload = bytes(...o.tracks.flatMap((t, ti) => Array.from({ length: t.chunks }, (_, k) => new Array<number>(CHUNK).fill(marker(ti, k)))), zeros(o.pad ?? 0));
  const moovFor = (payloadStart: number) => {
    let at = payloadStart;
    const traks = o.tracks.map((t, ti) => {
      const offs = Array.from({ length: t.chunks }, () => {
        const v = at;
        at += CHUNK;
        return v;
      });
      const table = o.wide ? co64(offs) : stco(offs);
      const parts = [tkhd(ti + 1, t.width, t.height, dur, time, o.tkhdV1), box('mdia', mdhd(ts, dur, time), hdlr(t.handler), box('minf', box('stbl', table)))];
      if (o.meta) parts.push(metaBox());
      return box('trak', ...parts);
    });
    const kids = [mvhd(ts, dur, time), ...traks];
    if (o.meta) kids.push(udta());
    return box('moov', ...kids);
  };
  const ftyp = box('ftyp', bytes(ascii('isom'), be32(512), ascii('isommp42')));
  if (o.layout === 'muxer') {
    const mdatHead = bytes(be32(1), ascii('mdat'), be64(16 + payload.length));
    const payloadStart = ftyp.length + mdatHead.length;
    return bytes(ftyp, mdatHead, payload, moovFor(payloadStart));
  }
  const wide = box('wide');
  const free = box('free', bytes(zeros(32)));
  const moovLen = moovFor(0).length;
  const payloadStart = ftyp.length + wide.length + moovLen + free.length + 8;
  return bytes(ftyp, wide, moovFor(payloadStart), free, box('mdat', payload));
}

/** 마무리된 파일(32비트 상자만)에서 트랙별 청크 위치 */
export function chunkOffsets(b: Uint8Array): number[][] {
  const u32 = (o: number) => ((b[o]! << 24) >>> 0) + (b[o + 1]! << 16) + (b[o + 2]! << 8) + b[o + 3]!;
  const type = (o: number) => String.fromCharCode(b[o + 4]!, b[o + 5]!, b[o + 6]!, b[o + 7]!);
  const out: number[][] = [];
  const walk = (from: number, to: number) => {
    for (let o = from; o < to; o += u32(o)) {
      const t = type(o);
      if (['moov', 'trak', 'mdia', 'minf', 'stbl'].includes(t)) walk(o + 8, o + u32(o));
      if (t === 'stco') out.push(Array.from({ length: u32(o + 12) }, (_, k) => u32(o + 16 + k * 4)));
      if (t === 'co64') out.push(Array.from({ length: u32(o + 12) }, (_, k) => u32(o + 16 + k * 8) * 2 ** 32 + u32(o + 20 + k * 8)));
    }
  };
  walk(0, b.length);
  return out;
}

export const LOOP_TRACKS: FakeTrack[] = [{ handler: 'vide', width: 540, height: 676, chunks: 4 }];
export const SHARE_TRACKS: FakeTrack[] = [
  { handler: 'vide', width: 1080, height: 1920, chunks: 3 },
  { handler: 'soun', width: 0, height: 0, chunks: 2 },
];
