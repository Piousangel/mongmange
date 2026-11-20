// C10 이레 영상 MP4 마무리·검사: 두 플랫폼 네이티브 출력 꼴 → 서버 커밋 검사(3-5-3 ③) 통과 꼴, 메타 0, 표시 크기.
// 그럴듯한 오답(OPERATING 8-1): '파일은 재생되는데 청크 위치가 어긋남'(moov를 옮기고 stco를 안 고침) → 표식 바이트로 잡는다.
import { IRE_OUTPUTS, LOOP_DURATION_RANGE_MS } from '@mong/core';
import { LOOP_SECONDS, PAGE_FILES } from '@mong/contract';
import { describe, expect, it } from 'vitest';
import { IRE_MP4_RULES, Mp4Error, checkIreMp4, finalizeIreMp4 } from '../src/share/ireMp4';
import { LOOP_TRACKS, SHARE_TRACKS, box, chunkOffsets, fakeMp4, marker, type FakeMp4 } from './support/mp4Fixture';

const LOOP = { width: 540, height: 676 };
const SHARE = { width: 1080, height: 1920 };
const topTypes = (b: Uint8Array) => {
  const out: string[] = [];
  for (let o = 0; o < b.length; ) {
    const size = ((b[o]! << 24) >>> 0) + (b[o + 1]! << 16) + (b[o + 2]! << 8) + b[o + 3]!;
    out.push(String.fromCharCode(b[o + 4]!, b[o + 5]!, b[o + 6]!, b[o + 7]!) + (size === 1 ? '(64)' : ''));
    o += size === 1 ? Number(new DataView(b.buffer, b.byteOffset + o + 8, 8).getBigUint64(0)) : size;
  }
  return out;
};

describe('규칙 상수 = core·서버 정본', () => {
  it('크기·길이·소리 유무가 core IRE_OUTPUTS·LOOP_DURATION_RANGE_MS와 같다', () => {
    for (const k of ['share', 'webLoop'] as const) {
      expect(IRE_MP4_RULES[k].width).toBe(IRE_OUTPUTS[k].width);
      expect(IRE_MP4_RULES[k].height).toBe(IRE_OUTPUTS[k].height);
      expect(IRE_MP4_RULES[k].audio).toBe(IRE_OUTPUTS[k].audio);
    }
    expect(IRE_MP4_RULES.duration.map((s) => s * 1000)).toEqual([...LOOP_DURATION_RANGE_MS]);
  });
  it('웹 루프 크기·용량·길이가 서버 계약(contract PAGE_FILES.loop·LOOP_SECONDS)과 같다(리뷰 L-8)', () => {
    const w = IRE_MP4_RULES.webLoop;
    expect({ width: w.width, height: w.height, maxBytes: w.maxBytes }).toEqual({
      width: PAGE_FILES.loop.width,
      height: PAGE_FILES.loop.height,
      maxBytes: PAGE_FILES.loop.maxBytes,
    });
    expect(IRE_MP4_RULES.duration).toEqual([LOOP_SECONDS.min, LOOP_SECONDS.max]);
  });
});

describe('finalizeIreMp4', () => {
  for (const layout of ['muxer', 'writer'] as const) {
    it(`${layout} 꼴 웹 루프 → ftyp·moov·mdat(32비트), 서버 검사 통과`, () => {
      const raw = fakeMp4({ layout, tracks: LOOP_TRACKS, meta: true });
      expect(checkIreMp4(raw, 'webLoop').ok).toBe(false);
      const out = finalizeIreMp4(raw, LOOP);
      expect(topTypes(out)).toEqual(['ftyp', 'moov', 'mdat']);
      const r = checkIreMp4(out, 'webLoop');
      expect(r).toMatchObject({ ok: true });
      if (r.ok) {
        expect(r.info.tracks).toEqual([expect.objectContaining({ handler: 'vide', width: 540, height: 676 })]);
        expect(r.info.dated).toEqual([]);
        expect(r.info.metaBoxes).toEqual([]);
      }
    });

    it(`${layout} 꼴: 청크 위치를 옮겨도 각 청크가 같은 바이트를 가리킨다`, () => {
      const out = finalizeIreMp4(fakeMp4({ layout, tracks: SHARE_TRACKS, meta: true }), SHARE);
      const offs = chunkOffsets(out);
      expect(offs.map((t) => t.length)).toEqual([3, 2]);
      offs.forEach((t, ti) => t.forEach((o, k) => expect(out[o]).toBe(marker(ti, k))));
      expect(checkIreMp4(out, 'share')).toMatchObject({ ok: true });
    });
  }

  it('tkhd 표시 크기를 계약 크기로 적는다(부호화 크기가 달라도 — 버전 0·1 모두, 리뷰 M-6)', () => {
    for (const tkhdV1 of [false, true]) {
      const raw = fakeMp4({ layout: 'muxer', tracks: [{ handler: 'vide', width: 542, height: 678, chunks: 2 }], tkhdV1 });
      expect(checkIreMp4(finalizeIreMp4(raw, { width: 542, height: 678 }), 'webLoop')).toMatchObject({ ok: false, reason: 'dimensions' });
      const r = checkIreMp4(finalizeIreMp4(raw, LOOP), 'webLoop');
      expect(r).toMatchObject({ ok: true });
      if (r.ok) expect(r.info.tracks[0]).toMatchObject({ width: 540, height: 676 });
    }
  });

  it('co64 표도 옮긴다', () => {
    const out = finalizeIreMp4(fakeMp4({ layout: 'muxer', tracks: LOOP_TRACKS, wide: true }), LOOP);
    chunkOffsets(out)[0]!.forEach((o, k) => expect(out[o]).toBe(marker(0, k)));
  });

  it('입력을 바꾸지 않는다', () => {
    const raw = fakeMp4({ layout: 'muxer', tracks: LOOP_TRACKS, meta: true });
    const copy = raw.slice();
    finalizeIreMp4(raw, LOOP);
    expect(raw).toEqual(copy);
  });

  it('mdat이 둘이면 거절(지원하지 않는 꼴 → 이미지판)', () => {
    const raw = fakeMp4({ layout: 'writer', tracks: LOOP_TRACKS });
    const two = new Uint8Array([...raw, ...box('mdat', new Uint8Array(4))]);
    expect(() => finalizeIreMp4(two, LOOP)).toThrow(Mp4Error);
  });

  it('잘린 파일(상자가 끝을 넘음)은 거절', () => {
    const raw = fakeMp4({ layout: 'writer', tracks: LOOP_TRACKS });
    expect(() => finalizeIreMp4(raw.subarray(0, raw.length - 3), LOOP)).toThrow(Mp4Error);
  });
});

describe('checkIreMp4 — 서버와 같은 이유로 떨어뜨린다', () => {
  const ok = (o: Partial<FakeMp4> = {}) => finalizeIreMp4(fakeMp4({ layout: 'writer', tracks: LOOP_TRACKS, ...o }), LOOP);
  const reason = (b: Uint8Array, kind: 'share' | 'webLoop' = 'webLoop') => {
    const r = checkIreMp4(b, kind);
    return r.ok ? 'ok' : r.reason;
  };

  it('기준: 통과', () => expect(reason(ok())).toBe('ok'));
  it('moov가 mdat 뒤(마무리 전 MediaMuxer 꼴) → not_faststart 또는 box', () => {
    const raw = fakeMp4({ layout: 'muxer', tracks: LOOP_TRACKS });
    expect(['not_faststart', 'box']).toContain(reason(raw));
  });
  it('64비트 largesize 상자 → box(S11)', () => {
    const b = ok();
    const withLarge = new Uint8Array([...b.subarray(0, b.length), 0, 0, 0, 1, ...[...'free'].map((c) => c.charCodeAt(0)), 0, 0, 0, 0, 0, 0, 0, 16]);
    expect(reason(withLarge)).toBe('box');
  });
  it('크기 0 상자 → box', () => {
    const b = ok();
    expect(reason(new Uint8Array([...b, 0, 0, 0, 0, 0x66, 0x72, 0x65, 0x65]))).toBe('box');
  });
  it('길이 9초 → duration, 7.5·8.5초 경계는 통과', () => {
    expect(reason(ok({ durationSec: 9 }))).toBe('duration');
    expect(reason(ok({ durationSec: 7.5 }))).toBe('ok');
    expect(reason(ok({ durationSec: 8.5 }))).toBe('ok');
  });
  it('웹 루프에 소리 트랙 → audio', () => {
    const b = finalizeIreMp4(fakeMp4({ layout: 'writer', tracks: [LOOP_TRACKS[0]!, { handler: 'soun', width: 0, height: 0, chunks: 1 }] }), LOOP);
    expect(reason(b)).toBe('audio');
  });
  it('공유판에 소리 트랙이 없으면 → tracks', () => {
    const b = finalizeIreMp4(fakeMp4({ layout: 'writer', tracks: [SHARE_TRACKS[0]!] }), SHARE);
    expect(reason(b, 'share')).toBe('tracks');
  });
  it('표시 크기가 다르면 → dimensions(옛 규격 540×675 포함)', () => {
    const old = fakeMp4({ layout: 'writer', tracks: [{ handler: 'vide', width: 540, height: 675, chunks: 1 }], time: 0 });
    expect(reason(old)).toBe('dimensions');
  });
  it('메타·만든 시각이 남으면 → metadata', () => {
    const raw = fakeMp4({ layout: 'writer', tracks: [{ handler: 'vide', width: 540, height: 676, chunks: 1 }], meta: true });
    expect(reason(raw)).toBe('metadata');
    const dated = fakeMp4({ layout: 'writer', tracks: [{ handler: 'vide', width: 540, height: 676, chunks: 1 }] });
    expect(reason(dated)).toBe('metadata');
    expect(reason(fakeMp4({ layout: 'writer', tracks: [{ handler: 'vide', width: 540, height: 676, chunks: 1 }], time: 0 }))).toBe('ok');
  });
  it('웹 루프 600KB 초과 → size', () => {
    expect(reason(ok({ pad: 600 * 1024 }))).toBe('size');
  });
  it('공유판 8MB 초과 → size(느린 기기 비트 예산 넘침, 리뷰 M-5)', () => {
    const big = finalizeIreMp4(fakeMp4({ layout: 'writer', tracks: SHARE_TRACKS, pad: 8 * 1024 * 1024 }), SHARE);
    expect(reason(big, 'share')).toBe('size');
  });
  it('moov가 앞 64KB 밖에서 끝나면 → not_faststart', () => {
    const many = [{ handler: 'vide' as const, width: 540, height: 676, chunks: 17_000 }];
    expect(reason(finalizeIreMp4(fakeMp4({ layout: 'writer', tracks: many }), LOOP))).toBe('not_faststart');
  });
  it('ftyp가 없으면 → signature', () => {
    expect(reason(new Uint8Array(32))).toBe('signature');
  });
});
