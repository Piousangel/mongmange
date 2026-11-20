// commit 검사(architecture.md v2.2 3-5 'commit 검사'·3-5-3 ③). 각 파일 앞 64KB만 읽어 본다 — 픽셀·프레임 내용은 보지 않는다
// (조작된 앱의 내용 위험은 신고 → 격리로 감수, 10절 #23). 새 의존성 없이 상자·마커만 직접 읽는다.
//  JPEG: FF D8 FF 시그니처 + SOF 마커의 해상도.
//  MP4: 첫 상자 ftyp, moov가 mdat보다 앞(faststart)이고 64KB 안에서 끝남, mvhd 길이 7.5~8.5초, 트랙은 영상 하나(hdlr 'vide'),
//       tkhd 540×676(PM 11-20 개정, 정본 3-5 표). 상자 크기 0(파일 끝까지)·1(64비트 largesize)·8 미만·부모 밖으로 넘침·트랙 둘 이상은 모두 실패(S11).
import { LOOP_SECONDS, type CommitRejectReason } from '@mong/contract';

export const HEAD_BYTES = 64 * 1024;

export type CheckResult = { ok: true } | { ok: false; reason: CommitRejectReason };
const fail = (reason: CommitRejectReason): CheckResult => ({ ok: false, reason });

const u16 = (b: Uint8Array, o: number) => (b[o]! << 8) | b[o + 1]!;
const u32 = (b: Uint8Array, o: number) => ((b[o]! << 24) >>> 0) + (b[o + 1]! << 16) + (b[o + 2]! << 8) + b[o + 3]!;
const type4 = (b: Uint8Array, o: number) => String.fromCharCode(b[o]!, b[o + 1]!, b[o + 2]!, b[o + 3]!);

/** JPEG 해상도: SOI 다음 마커를 따라가 SOF(C0~CF, C4·C8·CC 제외)에서 높이·너비 */
export function checkJpeg(head: Uint8Array, want: { width: number; height: number }): CheckResult {
  if (head.length < 4 || head[0] !== 0xff || head[1] !== 0xd8 || head[2] !== 0xff) return fail('signature');
  let o = 2;
  while (o + 4 <= head.length) {
    if (head[o] !== 0xff) return fail('signature');
    const m = head[o + 1]!;
    if (m === 0xff) {
      o++; // 채움 바이트
      continue;
    }
    if (m === 0xd9 || m === 0xda) break; // EOI·SOS 전에 SOF가 있어야 한다
    if (m >= 0xd0 && m <= 0xd7) {
      o += 2;
      continue;
    }
    const len = u16(head, o + 2);
    if (len < 2) return fail('signature');
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      if (o + 9 > head.length) break;
      const h = u16(head, o + 5);
      const w = u16(head, o + 7);
      return w === want.width && h === want.height ? { ok: true } : fail('dimensions');
    }
    o += 2 + len;
  }
  return fail('signature');
}

interface Box {
  type: string;
  start: number;
  /** 내용 시작(머리 8바이트 뒤) */
  body: number;
  end: number;
}

class BoxError extends Error {
  constructor(readonly reason: CommitRejectReason) {
    super(reason);
  }
}

/** [from, to) 안의 상자들. 크기 0·1·8 미만·범위 밖이면 BoxError('box') */
function boxes(b: Uint8Array, from: number, to: number): Box[] {
  const out: Box[] = [];
  let o = from;
  while (o < to) {
    if (o + 8 > to) throw new BoxError('box');
    const size = u32(b, o);
    if (size === 0 || size === 1 || size < 8) throw new BoxError('box');
    if (o + size > to) throw new BoxError('box');
    out.push({ type: type4(b, o + 4), start: o, body: o + 8, end: o + size });
    o += size;
  }
  return out;
}
const child = (b: Uint8Array, parent: Box, type: string): Box | undefined => boxes(b, parent.body, parent.end).find((x) => x.type === type);

/**
 * MP4 검사. head = 앞 64KB(더 짧은 파일이면 전부), fileSize = 저장소가 아는 실제 크기.
 * 최상위 상자는 head 안에서 moov까지 읽고, mdat은 머리만 본다(내용은 64KB 밖이어도 된다)
 */
export function checkMp4(head: Uint8Array, fileSize: number, want: { width: number; height: number }): CheckResult {
  try {
    if (head.length < 16 || type4(head, 4) !== 'ftyp') return fail('signature');
    let o = 0;
    let moov: Box | undefined;
    while (!moov) {
      if (o + 8 > head.length) return fail('not_faststart');
      const size = u32(head, o);
      const type = type4(head, o + 4);
      if (size === 0 || size === 1 || size < 8 || o + size > fileSize) return fail('box');
      if (type === 'mdat') return fail('not_faststart');
      if (type === 'moov') {
        if (o + size > head.length) return fail('not_faststart'); // 64KB 안에서 끝나야
        moov = { type, start: o, body: o + 8, end: o + size };
        break;
      }
      o += size;
    }
    // moov 뒤 최상위 상자 머리도 head 안에 있으면 본다(크기 0·largesize mdat은 길이 검사를 피하는 꼴 — S11)
    for (let p = moov.end; p + 8 <= head.length && p < fileSize; ) {
      const size = u32(head, p);
      if (size === 0 || size === 1 || size < 8 || p + size > fileSize) return fail('box');
      p += size;
    }
    const kids = boxes(head, moov.body, moov.end);
    const mvhd = kids.find((k) => k.type === 'mvhd');
    if (!mvhd) return fail('box');
    const v = head[mvhd.body]!;
    const timescale = v === 1 ? u32(head, mvhd.body + 20) : u32(head, mvhd.body + 12);
    const duration = v === 1 ? u32(head, mvhd.body + 24) * 2 ** 32 + u32(head, mvhd.body + 28) : u32(head, mvhd.body + 16);
    if (!timescale) return fail('duration');
    const sec = duration / timescale;
    if (!(sec >= LOOP_SECONDS.min && sec <= LOOP_SECONDS.max)) return fail('duration');
    const traks = kids.filter((k) => k.type === 'trak');
    // 트랙 종류부터 본다 — 소리 트랙이 끼어 있으면 이유를 'audio'로
    const handlers = traks.map((t) => {
      const mdia = child(head, t, 'mdia');
      const hdlr = mdia && child(head, mdia, 'hdlr');
      return hdlr ? type4(head, hdlr.body + 8) : '?';
    });
    
    if (handlers.includes('soun')) return fail('audio');
    if (traks.length !== 1 || handlers[0] !== 'vide') return fail('tracks');
    const tkhd = child(head, traks[0]!, 'tkhd');
    if (!tkhd) return fail('box');
    const tv = head[tkhd.body]!;
    const wOff = tkhd.body + (tv === 1 ? 88 : 76);
    if (wOff + 8 > tkhd.end) return fail('box');
    const w = u32(head, wOff) / 65536;
    const h = u32(head, wOff + 4) / 65536;
    if (w !== want.width || h !== want.height) return fail('dimensions');
    return { ok: true };
  } catch (e) {
    if (e instanceof BoxError) return fail(e.reason);
    throw e;
  }
}
