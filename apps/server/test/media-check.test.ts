// commit 검사(3-5-3 ③) — 그럴듯한 오답 판별(OPERATING 8-1): 우회 MP4(moov 뒤쪽·9초·소리 트랙·트랙 둘·크기 0·largesize·64KB 넘는 moov)와
// 모양만 맞춘 JPEG(PNG·해상도 다름)가 모두 떨어져야 하고, 정상 파일은 통과해야 한다(검사가 무엇이든 떨어뜨리는 무력한 검사 방지).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAGE_FILES } from '@mong/contract';
import { checkJpeg, checkMp4, HEAD_BYTES } from '../src/pages/media-check';
import { jpeg, mp4, type Mp4Opts } from './media-fixtures';

const L = PAGE_FILES.loop;
const head = (b: Buffer) => new Uint8Array(b.subarray(0, HEAD_BYTES));
const loop = (o: Mp4Opts = {}) => {
  const b = mp4(o);
  return checkMp4(head(b), b.length, L);
};

describe('MP4', () => {
  it('정상: faststart·8초·540×676·영상 한 트랙(mvhd 판 0·1 모두, mdat이 64KB 밖으로 길어도)', () => {
    expect(loop()).toEqual({ ok: true });
    expect(loop({ mvhdV1: true, timescale: 24_000 })).toEqual({ ok: true });
    expect(loop({ seconds: 7.5 })).toEqual({ ok: true });
    expect(loop({ seconds: 8.5 })).toEqual({ ok: true });
    expect(loop({ mdatBytes: 500_000 })).toEqual({ ok: true });
  });
  it.each<[string, Mp4Opts, string]>([
    ['moov가 mdat 뒤(faststart 아님)', { moovLast: true }, 'not_faststart'],
    ['moov가 64KB 밖에서 끝남', { bigMoov: true }, 'not_faststart'],
    ['9초', { seconds: 9 }, 'duration'],
    ['7초', { seconds: 7 }, 'duration'],
    ['timescale 0', { timescale: 0 }, 'duration'],
    ['소리 트랙', { tracks: ['vide', 'soun'] }, 'audio'],
    ['소리만', { tracks: ['soun'] }, 'audio'],
    ['영상 트랙 둘', { tracks: ['vide', 'vide'] }, 'tracks'],
    ['자막·메타 트랙', { tracks: ['vide', 'text'] }, 'tracks'],
    ['트랙 없음', { tracks: [] }, 'tracks'],
    ['해상도 다름', { width: 1080, height: 1350 }, 'dimensions'],
    ['moov 뒤 mdat 크기 0', { zeroSizeMdat: true, moovLast: true }, 'box'],
    ['largesize mdat이 moov 앞', { largeMdat: true, moovLast: true }, 'box'],
    ['moov 앞 정상 + 뒤 mdat 크기 0', { zeroSizeMdat: true }, 'box'],
    ['moov 앞 정상 + 뒤 mdat largesize', { largeMdat: true }, 'box'],
  ])('%s → %s', (_n, o, reason) => {
    expect(loop(o)).toEqual({ ok: false, reason });
  });
  it('ftyp가 아니면(JPEG를 루프 자리에) signature, 상자가 파일 크기를 넘으면 box', () => {
    const j = jpeg(540, 675);
    expect(checkMp4(head(j), j.length, L)).toEqual({ ok: false, reason: 'signature' });
    const b = mp4();
    expect(checkMp4(head(b), 100, L)).toEqual({ ok: false, reason: 'box' });
  });
  it('변이 실험: 정상 파일의 moov 안 상자 크기를 1바이트 늘리면 box로 떨어진다', () => {
    const b = mp4();
    const moovAt = b.indexOf('moov') - 4;
    const mvhdAt = b.indexOf('mvhd') - 4;
    const m = Buffer.from(b);
    m.writeUInt32BE(m.readUInt32BE(mvhdAt) + 1, mvhdAt);
    expect(checkMp4(head(m), m.length, L)).toEqual({ ok: false, reason: 'box' });
    expect(moovAt).toBeGreaterThan(0);
  });
});

describe('JPEG', () => {
  it('정상 포스터·OG', () => {
    expect(checkJpeg(head(jpeg(1080, 1350)), PAGE_FILES.poster)).toEqual({ ok: true });
    expect(checkJpeg(head(jpeg(1200, 630)), PAGE_FILES.og)).toEqual({ ok: true });
  });
  it('해상도가 다르면 dimensions, PNG·MP4·빈 파일은 signature', () => {
    expect(checkJpeg(head(jpeg(1200, 630)), PAGE_FILES.poster)).toEqual({ ok: false, reason: 'dimensions' });
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
    expect(checkJpeg(head(png), PAGE_FILES.og)).toEqual({ ok: false, reason: 'signature' });
    expect(checkJpeg(head(mp4()), PAGE_FILES.og)).toEqual({ ok: false, reason: 'signature' });
    expect(checkJpeg(new Uint8Array(), PAGE_FILES.og)).toEqual({ ok: false, reason: 'signature' });
  });
  it('SOF가 64KB 밖이면 signature(머리만 본다)', () => {
    const b = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]), Buffer.alloc(0xfffd), jpeg(1200, 630).subarray(2)]);
    expect(checkJpeg(head(b), PAGE_FILES.og).ok).toBe(false);
  });
});

// 실제 인코더(ffmpeg 9.0.2 libx264, test/fixtures/media/*.mp4 — 만든 명령은 fixtures/media/README.md) 산출물로 파서를 확인한다.
// 정본 540×676(PM 11-20 개정): H.264 4:2:0은 홀수 높이를 못 만든다 — 옛 값 540×675는 ffmpeg가 거부했다.
describe('실제 인코더 산출물', () => {
  const real = (n: string) => readFileSync(join(__dirname, 'fixtures/media', n));
  const chk = (n: string, want: { width: number; height: number } = L) => {
    const b = real(n);
    return checkMp4(head(b), b.length, want);
  };
  it('faststart·8초·무음·540×676 → 통과(정본 검사 값 그대로)', () => expect(chk('loop-ok.mp4')).toEqual({ ok: true }));
  it('faststart 없음 → not_faststart, 9초 → duration, AAC 소리 → audio', () => {
    expect(chk('loop-moov-last.mp4')).toEqual({ ok: false, reason: 'not_faststart' });
    expect(chk('loop-9s.mp4')).toEqual({ ok: false, reason: 'duration' });
    expect(chk('loop-audio.mp4')).toEqual({ ok: false, reason: 'audio' });
  });
  it('검사 값이 정본(540×676)이다 — 옛 값 675로 만든 파일은 dimensions', () => {
    expect(L).toMatchObject({ width: 540, height: 676 });
    expect(loop({ height: 675 })).toEqual({ ok: false, reason: 'dimensions' });
  });
  it('ffmpeg JPEG 포스터·OG(1080×1350·1200×630) 통과', () => {
    expect(checkJpeg(head(real('poster.jpg')), PAGE_FILES.poster)).toEqual({ ok: true });
    expect(checkJpeg(head(real('og.jpg')), PAGE_FILES.og)).toEqual({ ok: true });
  });
});
