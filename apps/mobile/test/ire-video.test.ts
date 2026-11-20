// C7 이레 영상 공유 경로(앱): 인코더 계약(규격·파일명·메타·원시 프레임·차례·역압), 공유 분기(플래그·폴백·이름·취소·시트 중복).
// 렌더·네이티브는 부르지 않는다 — 가짜 렌더·가짜 인코더를 실제로 등록해 분기를 돈다(C7 리뷰 H-2).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/render/ireVideo/prepare', () => ({ prepareIreShare: vi.fn() }));
vi.mock('../src/render/ireVideo/renderFrame', () => ({ renderIreFramePixels: vi.fn() }));
vi.mock('../src/share/native', () => ({ SHARE_DIR: 'mong-share', shareFile: vi.fn(), sharePng: vi.fn(), shareSupported: () => true }));
vi.mock('../src/share/shareCard', () => ({ shareIreScroll: vi.fn() }));

import { IRE_OUTPUTS, LOOP_DURATION_RANGE_MS, type IreShareSource } from '@mong/core';
import { FEATURE_DEFAULTS, setFeature } from '../src/features';
import { setLanguagePref } from '../src/i18n';
import { SOUND_FILES } from '../src/audio/soundMap';
import { prepareIreShare, type IrePrepared } from '../src/render/ireVideo/prepare';
import { renderIreFramePixels } from '../src/render/ireVideo/renderFrame';
import { shareFile } from '../src/share/native';
import { shareIreScroll } from '../src/share/shareCard';
import {
  IRE_MAX_IN_FLIGHT,
  IRE_VIDEO_METADATA,
  encodeIreVideo,
  framePump,
  ireStrings,
  ireVideoSpec,
  registerIreEncoder,
  shareIre,
  type IreEncoder,
  type IreRawFrame,
  type IreVideoSpec,
} from '../src/share/ireVideo';

const src: IreShareSource = {
  slots: Array.from({ length: 7 }, (_, k) => ({ index: k, strokeIndex: k, strokeId: `s${k}`, day: k, cardIndex: k, longSleep: false, moon: false })),
  ink: 'songyeon',
  label: { axis: 'tempo', sign: -1 },
  name: '달무리',
};
const input = (kind: 'share' | 'webLoop') => ({ kind, width: 10, records: [], cardImages: [] });
const shareP: IrePrepared = { kind: 'share', src, strings: { app: 'x' }, input: input('share') };
const loopP: IrePrepared = { kind: 'webLoop', src: { slots: src.slots, ink: null, label: null }, strings: { app: '' }, input: input('webLoop') };
const raw = (): IreRawFrame => ({ width: 1, height: 1, pixels: new Uint8Array(4) });
const STATE = {} as never;

/** 0..frames-1을 차례로 받아 가는 가짜 인코더(받은 spec·프레임 수 기록) */
function fakeEncoder(o: { fail?: boolean; onFrame?: (i: number) => void } = {}) {
  const got: { spec?: IreVideoSpec; frames: number } = { frames: 0 };
  const enc: IreEncoder = {
    encode: vi.fn(async (spec: IreVideoSpec, frame: (i: number) => Promise<IreRawFrame>, signal: AbortSignal) => {
      got.spec = spec;
      for (let i = 0; i < spec.frames; i++) {
        if (signal.aborted) throw new Error('aborted');
        await frame(i);
        got.frames++;
        o.onFrame?.(i);
      }
      if (o.fail) throw new Error('encoder failed');
      return { uri: `file:///cache/${spec.dir}/${spec.fileName}` };
    }),
  };
  return { enc, got };
}

beforeEach(() => {
  vi.mocked(prepareIreShare).mockImplementation(async (o) => ({ ...shareP, src: o.nameVisible ? src : { slots: src.slots, ink: src.ink, label: src.label } }));
  vi.mocked(renderIreFramePixels).mockImplementation(async () => raw());
  vi.mocked(shareFile).mockResolvedValue('shared');
  vi.mocked(shareIreScroll).mockResolvedValue('saved');
});
afterEach(() => {
  registerIreEncoder(null);
  for (const f of ['ireVideo', 'naming'] as const) setFeature(f, null);
  vi.clearAllMocks();
});

describe('인코더 계약 — 규격', () => {
  it('웹 루프 규격 = 서버 커밋 검사(540×675, 무음, 7.5~8.5초), 파일 loop.mp4', () => {
    const s = ireVideoSpec(loopP);
    expect([s.width, s.height, s.audio.length, s.fileName]).toEqual([540, 675, 0, 'loop.mp4']);
    const ms = (s.frames / s.fps) * 1000;
    expect(ms).toBeGreaterThanOrEqual(LOOP_DURATION_RANGE_MS[0]);
    expect(ms).toBeLessThanOrEqual(LOOP_DURATION_RANGE_MS[1]);
  });

  it('공유 규격 = 1080×1920, 240프레임, 소리 자리는 앱 소리 파일 이름과 같다', () => {
    const s = ireVideoSpec(shareP);
    expect([s.width, s.height, s.frames, s.fps]).toEqual([1080, 1920, 240, 30]);
    expect(s.audio.length).toBe(9);
    for (const c of s.audio) expect(Object.keys(SOUND_FILES)).toContain(c.sound);
  });

  it('파일명은 앱이 정한 영문 고정값(이름 있는 재료여도 이름·날짜·번호 없음), 제목·날짜·위치 메타는 쓰지 않음, 공유 폴더', () => {
    for (const p of [shareP, loopP]) {
      const s = ireVideoSpec(p);
      expect(s.fileName).toMatch(/^[a-z0-9-]+\.mp4$/);
      expect(s.fileName).not.toMatch(/\d{4}|달무리/);
      expect(s.metadata).toEqual({ title: false, date: false, location: false });
      expect(s.dir).toBe('mong-share');
    }
    expect(IRE_VIDEO_METADATA).toEqual({ title: false, date: false, location: false });
  });
});

describe('인코더 계약 — 프레임 펌프', () => {
  it('원시 RGBA 프레임을 0..239 차례로 넘긴다', async () => {
    const { enc, got } = fakeEncoder();
    const asked: number[] = [];
    const render = vi.fn(async (_p: IrePrepared, i: number) => (asked.push(i), raw()));
    await expect(encodeIreVideo(shareP, enc, new AbortController().signal, render)).resolves.toEqual({ uri: 'file:///cache/mong-share/mongmangi-ire-9x16.mp4' });
    expect(asked).toEqual(Array.from({ length: IRE_OUTPUTS.share.frames }, (_, i) => i));
    expect(got.frames).toBe(240);
  });

  it('범위 밖·순서 어긋남·건너뜀은 거절', async () => {
    const pump = framePump(shareP, 240, async () => raw(), new AbortController().signal);
    await expect(pump(-1)).rejects.toThrow(/range/);
    await expect(pump(240)).rejects.toThrow(/range/);
    await expect(pump(1)).rejects.toThrow(/order/);
    await pump(0);
    await expect(pump(0)).rejects.toThrow(/order/);
    await expect(pump(1.5)).rejects.toThrow(/range/);
  });

  it(`역압: 끝나지 않은 요청은 최대 ${IRE_MAX_IN_FLIGHT}개, 그리기는 한 번에 하나`, async () => {
    let running = 0;
    let peak = 0;
    const gates: (() => void)[] = [];
    const render = () =>
      new Promise<IreRawFrame>((res) => {
        running++;
        peak = Math.max(peak, running);
        gates.push(() => {
          running--;
          res(raw());
        });
      });
    const pump = framePump(shareP, 240, render, new AbortController().signal);
    const a = pump(0);
    const b = pump(1);
    await expect(pump(2)).rejects.toThrow(/in flight/);
    await vi.waitFor(() => expect(gates.length).toBe(1));
    gates.shift()!();
    await a;
    await vi.waitFor(() => expect(gates.length).toBe(1));
    gates.shift()!();
    await b;
    const c = pump(2);
    await vi.waitFor(() => expect(gates.length).toBe(1));
    gates.shift()!();
    await expect(c).resolves.toBeDefined();
    expect(peak).toBe(1);
  });

  it('중단되면 다음 프레임 요청을 거절한다', async () => {
    const ac = new AbortController();
    const pump = framePump(shareP, 240, async () => raw(), ac.signal);
    await pump(0);
    ac.abort();
    await expect(pump(1)).rejects.toThrow(/aborted/);
  });
});

describe('꼬리표 글', () => {
  it('결·먹은 그 기능 플래그가 켜졌을 때만, 앱 이름 줄은 늘', () => {
    setLanguagePref('ko');
    expect(ireStrings(src, { label: false, ink: false })).toEqual({ label: undefined, ink: undefined, app: expect.any(String) });
    const on = ireStrings(src, { label: true, ink: true });
    expect(on.label).toBe('느긋결');
    expect(on.ink).toBe('송연먹');
    setLanguagePref('en');
    expect(ireStrings({ ...src, label: { axis: 'curiosity', sign: 1 } }, { label: true, ink: false }).label).toBe('Far-gazer');
    setLanguagePref('ko');
  });
});

describe('공유 분기(가짜 인코더 등록)', () => {
  it('ireVideo 기본 꺼짐: 인코더를 등록해도 인코더 0회, 이미지판 1회', async () => {
    expect(FEATURE_DEFAULTS.ireVideo).toBe(false);
    const { enc } = fakeEncoder();
    registerIreEncoder(enc);
    expect(await shareIre(STATE)).toBe('saved');
    expect(enc.encode).not.toHaveBeenCalled();
    expect(shareIreScroll).toHaveBeenCalledTimes(1);
  });

  it('켜짐 + 인코더 없음: 이미지판 1회', async () => {
    setFeature('ireVideo', true);
    expect(await shareIre(STATE)).toBe('saved');
    expect(shareIreScroll).toHaveBeenCalledTimes(1);
  });

  it('켜짐 + 성공: 영상 시트 1회(spec 파일명 그대로), 이미지판 0회', async () => {
    setFeature('ireVideo', true);
    registerIreEncoder(fakeEncoder().enc);
    expect(await shareIre(STATE)).toBe('shared');
    expect(shareFile).toHaveBeenCalledTimes(1);
    expect(vi.mocked(shareFile).mock.calls[0]![0]).toBe('file:///cache/mong-share/mongmangi-ire-9x16.mp4');
    expect(vi.mocked(shareFile).mock.calls[0]![1]).toBe('video/mp4');
    expect(shareIreScroll).not.toHaveBeenCalled();
  });

  it('시트를 열기 전 실패(인코딩 실패·공유 불가) → 이미지판 1회', async () => {
    setFeature('ireVideo', true);
    registerIreEncoder(fakeEncoder({ fail: true }).enc);
    expect(await shareIre(STATE)).toBe('saved');
    expect(shareFile).not.toHaveBeenCalled();
    expect(shareIreScroll).toHaveBeenCalledTimes(1);
    vi.mocked(shareIreScroll).mockClear();
    registerIreEncoder(fakeEncoder().enc);
    vi.mocked(shareFile).mockResolvedValueOnce('unavailable');
    expect(await shareIre(STATE)).toBe('saved');
    expect(shareIreScroll).toHaveBeenCalledTimes(1);
  });

  it('시트를 연 뒤 실패(shareFile failed) → 이미지판으로 넘기지 않는다(시트 두 번 금지)', async () => {
    setFeature('ireVideo', true);
    registerIreEncoder(fakeEncoder().enc);
    vi.mocked(shareFile).mockResolvedValueOnce('failed');
    expect(await shareIre(STATE)).toBe('failed');
    expect(shareIreScroll).not.toHaveBeenCalled();
  });

  it('화면을 떠나 인코딩 중 중단 → 펌프가 멈추고 시트·이미지판 모두 0회, cancelled', async () => {
    setFeature('ireVideo', true);
    const ac = new AbortController();
    const { enc, got } = fakeEncoder({ onFrame: (i) => i === 9 && ac.abort() });
    registerIreEncoder(enc);
    expect(await shareIre(STATE, undefined, { signal: ac.signal })).toBe('cancelled');
    expect(got.frames).toBe(10);
    expect(shareFile).not.toHaveBeenCalled();
    expect(shareIreScroll).not.toHaveBeenCalled();
  });

  it('인코딩이 끝난 직후 중단돼도 시트를 열지 않는다', async () => {
    setFeature('ireVideo', true);
    const ac = new AbortController();
    registerIreEncoder(fakeEncoder({ onFrame: (i) => i === 239 && ac.abort() }).enc);
    expect(await shareIre(STATE, undefined, { signal: ac.signal })).toBe('cancelled');
    expect(shareFile).not.toHaveBeenCalled();
    expect(shareIreScroll).not.toHaveBeenCalled();
  });

  it('이름: naming 꺼짐이거나 nameVisible을 안 넘기면 prepare에 nameVisible=false, 둘 다 켜졌을 때만 true', async () => {
    setFeature('ireVideo', true);
    registerIreEncoder(fakeEncoder().enc);
    await shareIre(STATE, undefined, { nameVisible: true });
    setFeature('naming', true);
    await shareIre(STATE);
    await shareIre(STATE, undefined, { nameVisible: true });
    expect(vi.mocked(prepareIreShare).mock.calls.map((c) => c[0].nameVisible)).toEqual([false, false, true]);
  });
});
