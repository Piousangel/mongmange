// C10 네이티브 인코더 어댑터: C7 계약(차례·역압·중단·파일·메타)을 네이티브 함수 호출 순서로 지키는가.
// 네이티브는 가짜 — 실제 framePump를 거쳐(차례·동시 2 위반이면 pump가 거절) 호출을 기록하고, finish에서 'MediaMuxer 꼴' 원시 MP4를 쓴다.
// 가짜도 세션 id를 흉내 낸다(현재 세션이 아닌 id: append·wait·finish 거절, cancel 무시 — 네이티브 두 플랫폼과 같은 규칙, 리뷰 M-3).
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/render/ireVideo/prepare', () => ({ prepareIreShare: vi.fn() }));
vi.mock('../src/render/ireVideo/renderFrame', () => ({ renderIreFramePixels: vi.fn() }));
vi.mock('../src/share/native', () => ({ SHARE_DIR: 'mong-share', shareFile: vi.fn(), sharePng: vi.fn(), shareSupported: () => true }));
vi.mock('../src/share/shareCard', () => ({ shareIreScroll: vi.fn() }));

import type { IreEncoderNative, IreNativeBegin } from '../modules/ire-encoder';
import { FEATURE_DEFAULTS, setFeature } from '../src/features';
import { prepareIreShare, type IrePrepared } from '../src/render/ireVideo/prepare';
import { renderIreFramePixels } from '../src/render/ireVideo/renderFrame';
import { checkIreMp4 } from '../src/share/ireMp4';
import { IRE_BITRATE, IRE_NATIVE_QUEUE, IRE_WAIT_MS, IreTimeoutError, createNativeIreEncoder, type IreEncoderFiles } from '../src/share/ireNativeEncoder';
import { shareFile } from '../src/share/native';
import { shareIreScroll } from '../src/share/shareCard';
import { IRE_VIDEO_FILE, framePump, registerIreEncoder, shareIre, type IreRawFrame, type IreVideoSpec } from '../src/share/ireVideo';
import { LOOP_TRACKS, SHARE_TRACKS, fakeMp4 } from './support/mp4Fixture';

const LOOP_SPEC: IreVideoSpec = {
  width: 540,
  height: 676,
  fps: 24,
  frames: 5,
  audio: [],
  fileName: IRE_VIDEO_FILE.webLoop,
  dir: 'mong-share',
  metadata: { title: false, date: false, location: false },
};
const SHARE_SPEC: IreVideoSpec = { ...LOOP_SPEC, width: 1080, height: 1920, fps: 30, frames: 3, audio: [{ t: 0, sound: 'ink_drop' }], fileName: IRE_VIDEO_FILE.share };
const P = {} as IrePrepared;

afterEach(() => {
  vi.useRealTimers();
  registerIreEncoder(null);
  setFeature('ireVideo', null);
  vi.clearAllMocks();
});

function memFiles() {
  const store = new Map<string, Uint8Array>();
  const resets: string[] = [];
  const files: IreEncoderFiles = {
    resetDir: (dir) => {
      resets.push(dir);
      for (const k of [...store.keys()]) if (k.startsWith(`file:///cache/${dir}/`)) store.delete(k);
    },
    uri: (dir, name) => `file:///cache/${dir}/${name}`,
    read: async (uri) => {
      const b = store.get(uri);
      if (!b) throw new Error(`no file ${uri}`);
      return b;
    },
    write: async (uri, bytes) => void store.set(uri, bytes),
    remove: (uri) => void store.delete(uri),
  };
  return { files, store, resets };
}

const never = () => new Promise<never>(() => undefined);

interface FakeOpts {
  failFinish?: boolean;
  raw?: Uint8Array;
  onAppend?: (i: number) => void;
  /** waitForCapacity가 끝나지 않는다(네이티브 멈춤) */
  stallWait?: boolean;
  stallFinish?: boolean;
}

/** 가짜 네이티브: 세션 id, 대기열(append마다 +1, wait 때 비움), finish에서 원시 MP4 쓰기 */
function fakeNative(store: Map<string, Uint8Array>, o: FakeOpts = {}) {
  const log: string[] = [];
  let queued = 0;
  let current = 0;
  let lastId = 0;
  const begins = new Map<number, IreNativeBegin>();
  const live = (id: number) => {
    if (id !== current) throw new Error(`stale session ${id}`);
  };
  const native: IreEncoderNative = {
    setAudioPcm: vi.fn(),
    begin: vi.fn(async (b: IreNativeBegin) => {
      const id = ++lastId;
      if (current) log.push(`supersede${current}`);
      current = id;
      queued = 0;
      begins.set(id, b);
      log.push(`begin${id}`);
      return id;
    }),
    appendFrame: vi.fn((id: number, i: number, px: Uint8Array) => {
      live(id);
      if (queued >= IRE_NATIVE_QUEUE) throw new Error('queue full');
      queued++;
      log.push(`append${i}:${px.length}`);
      o.onAppend?.(i);
    }),
    waitForCapacity: vi.fn(async (id: number, n: number) => {
      live(id);
      log.push(`wait${n}`);
      if (o.stallWait) return never();
      await Promise.resolve();
      queued = Math.min(queued, n); // 인코더가 앞 프레임을 가져감
    }),
    finish: vi.fn(async (id: number) => {
      live(id);
      log.push(`finish${id}`);
      if (o.stallFinish) return never();
      if (o.failFinish) throw new Error('encoder wrote 4/5 frames');
      const b = begins.get(id)!;
      store.set(b.uri, o.raw ?? fakeMp4({ layout: 'muxer', tracks: b.audio ? SHARE_TRACKS : LOOP_TRACKS, meta: true }));
      current = 0;
    }),
    cancel: vi.fn(async (id: number) => {
      if (id !== current) {
        log.push(`cancel${id}:ignored`);
        return;
      }
      log.push(`cancel${id}`);
      current = 0;
    }),
  };
  return { native, log, begun: (id = lastId) => begins.get(id) };
}

const frameOf = (s: IreVideoSpec): IreRawFrame => ({ width: s.width, height: s.height, pixels: new Uint8Array(s.width * s.height * 4) });
const encodeWith = (native: IreEncoderNative, files: IreEncoderFiles, spec: IreVideoSpec, ac = new AbortController(), render = async () => frameOf(spec)) =>
  createNativeIreEncoder(native, files).encode(spec, framePump(P, spec.frames, render, ac.signal), ac.signal);
const rawKeys = (store: Map<string, Uint8Array>) => [...store.keys()].filter((k) => k.includes('/raw-'));

describe('createNativeIreEncoder', () => {
  it('웹 루프: 폴더 비우기 → begin(무음·400kbps·600KB 상한) → 0..n-1 차례로 → finish → 마무리 파일이 서버 검사 통과', async () => {
    const { files, store, resets } = memFiles();
    store.set('file:///cache/mong-share/old.png', new Uint8Array(1));
    const { native, log, begun } = fakeNative(store);
    const r = await encodeWith(native, files, LOOP_SPEC);

    expect(resets).toEqual(['mong-share']);
    expect(store.has('file:///cache/mong-share/old.png')).toBe(false);
    expect(begun()).toMatchObject({ width: 540, height: 676, fps: 24, frames: 5, bitrate: IRE_BITRATE.webLoop, audio: false, maxBytes: 600 * 1024 });
    expect(begun()!.uri).toMatch(/^file:\/\/\/cache\/mong-share\/raw-\d+-loop\.mp4$/);
    const appends = log.filter((l) => l.startsWith('append'));
    expect(appends).toEqual([0, 1, 2, 3, 4].map((i) => `append${i}:${540 * 676 * 4}`));
    // 매 append 앞에 역압 대기
    log.forEach((l, k) => l.startsWith('append') && expect(log[k - 1]).toBe(`wait${IRE_NATIVE_QUEUE - 1}`));
    expect(log.at(-1)).toBe('finish1');
    expect(native.cancel).not.toHaveBeenCalled();
    expect(native.setAudioPcm).not.toHaveBeenCalled();

    expect(r.uri).toBe('file:///cache/mong-share/loop.mp4');
    expect(rawKeys(store)).toEqual([]);
    expect(checkIreMp4(store.get(r.uri)!, 'webLoop')).toMatchObject({ ok: true });
  });

  it('공유판: AAC 트랙(audio true)·4Mbps·8MB 상한, 결과는 영상+소리 두 트랙·메타 0', async () => {
    const { files, store } = memFiles();
    const { native, begun } = fakeNative(store);
    const r = await encodeWith(native, files, SHARE_SPEC);
    expect(begun()).toMatchObject({ audio: true, bitrate: IRE_BITRATE.share, width: 1080, height: 1920, fps: 30, maxBytes: 8 * 1024 * 1024 });
    const c = checkIreMp4(store.get(r.uri)!, 'share');
    expect(c).toMatchObject({ ok: true });
    if (c.ok) expect(c.info.tracks.map((t) => t.handler)).toEqual(['vide', 'soun']);
  });

  it('다음 프레임을 미리 그리되 동시 요청은 계약 상한(2) 안', async () => {
    const { files, store } = memFiles();
    const { native } = fakeNative(store);
    let inFlight = 0;
    let peak = 0;
    const render = async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setImmediate(r));
      inFlight--;
      return frameOf(LOOP_SPEC);
    };
    await encodeWith(native, files, LOOP_SPEC, new AbortController(), render);
    expect(peak).toBeLessThanOrEqual(2);
  });

  for (const at of [0, 1, 4]) {
    it(`중단(프레임 ${at}을 넘긴 직후): 남은 프레임을 넘기지 않고 cancel, 부분 파일 지움, AbortError`, async () => {
      const { files, store } = memFiles();
      const ac = new AbortController();
      const { native, log } = fakeNative(store, { onAppend: (i) => i === at && ac.abort() });
      await expect(encodeWith(native, files, LOOP_SPEC, ac)).rejects.toMatchObject({ name: 'AbortError' });
      expect(log.filter((l) => l.startsWith('append'))).toHaveLength(at + 1);
      expect(native.cancel).toHaveBeenCalledWith(1);
      expect(native.finish).not.toHaveBeenCalled();
      expect([...store.keys()]).toEqual([]);
    });
  }

  it('중단은 네이티브 대기와 경쟁한다 — 멈춘 대기 중에도 곧바로 AbortError + cancel(리뷰 M-2)', async () => {
    const { files, store } = memFiles();
    const { native } = fakeNative(store, { stallWait: true });
    const ac = new AbortController();
    const p = encodeWith(native, files, LOOP_SPEC, ac);
    await vi.waitFor(() => expect(native.waitForCapacity).toHaveBeenCalled());
    ac.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    expect(native.cancel).toHaveBeenCalledWith(1);
    expect(rawKeys(store)).toEqual([]);
  });

  it(`네이티브 대기가 ${IRE_WAIT_MS.frame}ms를 넘으면 시간 초과 → cancel, 파일 없음(리뷰 M-2)`, async () => {
    vi.useFakeTimers();
    const { files, store } = memFiles();
    const { native } = fakeNative(store, { stallWait: true });
    const caught = encodeWith(native, files, LOOP_SPEC).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(IRE_WAIT_MS.frame - 1);
    expect(native.cancel).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(await caught).toBeInstanceOf(IreTimeoutError);
    expect(native.cancel).toHaveBeenCalledWith(1);
    expect(rawKeys(store)).toEqual([]);
  });

  it(`finish가 ${IRE_WAIT_MS.finish}ms를 넘으면 시간 초과 → cancel(리뷰 M-2)`, async () => {
    vi.useFakeTimers();
    const { files, store } = memFiles();
    const { native } = fakeNative(store, { stallFinish: true });
    const caught = encodeWith(native, files, LOOP_SPEC).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(0);
    expect(native.finish).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(IRE_WAIT_MS.finish + 1);
    expect(await caught).toBeInstanceOf(IreTimeoutError);
    expect(native.cancel).toHaveBeenCalledWith(1);
  });

  it('시간 초과면 공유는 이미지판으로 넘어간다(시트를 열지 않음)', async () => {
    vi.useFakeTimers();
    const { files, store } = memFiles();
    const { native } = fakeNative(store, { stallWait: true });
    vi.mocked(prepareIreShare).mockResolvedValue({ kind: 'share', src: { slots: [], ink: null, label: null }, strings: { app: '' }, input: {} as never });
    vi.mocked(renderIreFramePixels).mockImplementation(async () => frameOf(SHARE_SPEC));
    vi.mocked(shareIreScroll).mockResolvedValue('saved');
    expect(FEATURE_DEFAULTS.ireVideo).toBe(false);
    setFeature('ireVideo', true);
    registerIreEncoder(createNativeIreEncoder(native, files));
    const r = shareIre({} as never);
    await vi.advanceTimersByTimeAsync(IRE_WAIT_MS.begin + IRE_WAIT_MS.frame + 10);
    expect(await r).toBe('saved');
    expect(shareFile).not.toHaveBeenCalled();
    expect(native.cancel).toHaveBeenCalledWith(1);
  });

  it('앞 인코딩의 늦은 cancel이 새 인코딩을 죽이지 않는다(세션 id, 리뷰 M-3)', async () => {
    const { files, store } = memFiles();
    const { native, log } = fakeNative(store);
    // A: 첫 프레임 그리기에서 멈춰 있다
    const acA = new AbortController();
    let releaseA!: () => void;
    const renderA = () => new Promise<IreRawFrame>((res) => (releaseA = () => res(frameOf(LOOP_SPEC))));
    const pA = encodeWith(native, files, LOOP_SPEC, acA, renderA);
    const doneA = pA.catch((e: unknown) => e);
    await vi.waitFor(() => expect(native.begin).toHaveBeenCalledTimes(1));
    // B: 새 인코딩이 begin2로 시작된 뒤, B의 첫 프레임을 그리는 동안 A가 중단되어 cancel(1)을 부른다
    let aborted = false;
    const renderB = async () => {
      if (!aborted) {
        aborted = true;
        acA.abort();
        releaseA();
        await doneA;
      }
      return frameOf(LOOP_SPEC);
    };
    const rB = await encodeWith(native, files, LOOP_SPEC, new AbortController(), renderB);
    expect(await doneA).toMatchObject({ name: 'AbortError' });
    expect(log).toContain('cancel1:ignored');
    expect(log).not.toContain('cancel2');
    expect(checkIreMp4(store.get(rB.uri)!, 'webLoop')).toMatchObject({ ok: true });
  });

  it('이미 중단된 신호면 네이티브를 부르지 않는다', async () => {
    const { files, store } = memFiles();
    const { native } = fakeNative(store);
    const ac = new AbortController();
    ac.abort();
    await expect(createNativeIreEncoder(native, files).encode(LOOP_SPEC, async () => frameOf(LOOP_SPEC), ac.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(native.begin).not.toHaveBeenCalled();
  });

  it('프레임 크기가 규격과 다르면 거절하고 cancel', async () => {
    const { files, store } = memFiles();
    const { native } = fakeNative(store);
    const bad = async (): Promise<IreRawFrame> => ({ width: 540, height: 675, pixels: new Uint8Array(540 * 675 * 4) });
    await expect(encodeWith(native, files, LOOP_SPEC, new AbortController(), bad)).rejects.toThrow(/does not match/);
    expect(native.appendFrame).not.toHaveBeenCalled();
    expect(native.cancel).toHaveBeenCalledTimes(1);
  });

  it('네이티브 finish 실패(프레임 버림 등) → 거절, 파일 없음 → 호출부는 이미지판', async () => {
    const { files, store } = memFiles();
    const { native } = fakeNative(store, { failFinish: true });
    await expect(encodeWith(native, files, LOOP_SPEC)).rejects.toThrow(/4\/5/);
    expect([...store.keys()]).toEqual([]);
  });

  it('원시 파일을 마무리할 수 없으면(깨진 MP4) 거절하고 파일을 모두 지운다', async () => {
    const { files, store } = memFiles();
    const { native } = fakeNative(store, { raw: new Uint8Array([0, 0, 0, 8, 0x66, 0x72, 0x65, 0x65]) });
    await expect(encodeWith(native, files, LOOP_SPEC)).rejects.toThrow();
    expect([...store.keys()]).toEqual([]);
  });

  for (const [what, raw] of [
    ['길이 9초', fakeMp4({ layout: 'muxer', tracks: LOOP_TRACKS, durationSec: 9 })],
    ['600KB 초과', fakeMp4({ layout: 'muxer', tracks: LOOP_TRACKS, pad: 600 * 1024 })],
    ['소리 트랙이 낀 루프', fakeMp4({ layout: 'muxer', tracks: [...LOOP_TRACKS, { handler: 'soun', width: 0, height: 0, chunks: 1 }] })],
  ] as const) {
    it(`마무리는 되지만 자체 검사에 떨어지는 파일(${what}) → 시트에 올리지 않고 거절, 파일 없음(리뷰 M-6)`, async () => {
      const { files, store } = memFiles();
      const { native } = fakeNative(store, { raw });
      await expect(encodeWith(native, files, LOOP_SPEC)).rejects.toThrow(/self-check failed/);
      expect([...store.keys()]).toEqual([]);
    });
  }

  it('begin 실패(코덱 없음·크기 미지원) → 프레임을 그리지 않고 거절', async () => {
    const { files, store } = memFiles();
    const { native } = fakeNative(store);
    vi.mocked(native.begin).mockRejectedValueOnce(new Error('size 540x676 not supported'));
    const render = vi.fn(async () => frameOf(LOOP_SPEC));
    await expect(encodeWith(native, files, LOOP_SPEC, new AbortController(), render)).rejects.toThrow(/not supported/);
    expect(render).not.toHaveBeenCalled();
    expect(native.cancel).not.toHaveBeenCalled();
  });
});
