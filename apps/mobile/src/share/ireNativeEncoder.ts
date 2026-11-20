// C7 인코더 계약(`IreEncoder`)을 로컬 네이티브 모듈(modules/ire-encoder)에 잇는 어댑터(C10).
// 네이티브는 '받은 차례대로 부호화해 파일에 쓴다'만 하고, 차례·역압·중단·파일 정리·MP4 마무리(faststart·메타 0·표시 크기)는
// 여기서 한다 — 두 플랫폼이 같은 규칙을 따르고, 기기 없이 시험할 수 있다(OPERATING 7-1).
import { IRE_OUTPUTS } from '@mong/core';
import type { IreEncoderNative } from '../../modules/ire-encoder';
import { optionalModule } from '../lib/optionalModule';
import { IRE_MP4_RULES, checkIreMp4, finalizeIreMp4 } from './ireMp4';
import type { IreEncoder, IreRawFrame, IreVideoSpec } from './ireVideo';

/** 네이티브 쪽 대기열 상한: 복사됐지만 아직 하드웨어 인코더에 넘기지 않은 프레임(Android Bitmap 풀 크기와 같다) */
export const IRE_NATIVE_QUEUE = 2;

/** 비트레이트(bps). 웹 루프는 서버 상한 600KB(3-5-3) 아래로: 8초 × 400kbps = 약 400KB(하드웨어 VBR 넘침 여유). 공유는 8초 약 4MB */
export const IRE_BITRATE = { share: 4_000_000, webLoop: 400_000 } as const;

/** 파일 다루기(시험에서 가짜). 실제는 expo-file-system */
export interface IreEncoderFiles {
  /** 공유 폴더를 비우고 다시 만든다(계약: 다음 공유 전에 통째로 비움) */
  resetDir(dir: string): void;
  uri(dir: string, name: string): string;
  read(uri: string): Promise<Uint8Array>;
  write(uri: string, bytes: Uint8Array): Promise<void>;
  remove(uri: string): void;
}

function abortError(): Error {
  const e = new Error('aborted');
  e.name = 'AbortError';
  return e;
}

/**
 * 네이티브 대기 시간 상한(ms, 리뷰 M-2). 넘으면 멈춘 것으로 보고 cancel한 뒤 이미지판으로 넘어간다.
 * - frame 5초: 한 장 그리기(Skia 15~35ms 추정)·하드웨어 부호화 한 장(수십 ms)의 100배 이상 — 정상 기기는 닿지 않고 멈춤만 잡는다.
 * - finish 20초: 남은 프레임 2장 + AAC + 파일 맺기(iOS finishWriting, Android EOS 드레인·muxer.stop)는 1초 안팎이 예상이다.
 *   20초는 그 자체로 15초 관문을 넘는 값이라, 넘었다면 어차피 영상판은 불합격이다.
 * - begin 5초: 코덱 생성 + Android는 8초 모노 AAC 미리 부호화(1초 미만 예상).
 */
export const IRE_WAIT_MS = { begin: 5_000, frame: 5_000, finish: 20_000 } as const;

export class IreTimeoutError extends Error {
  constructor(what: string, ms: number) {
    super(`ire encoder: ${what} took longer than ${ms}ms`);
    this.name = 'IreTimeoutError';
  }
}

/** 약속을 시간 상한·중단 신호와 경쟁시킨다. 중단이면 곧바로 AbortError(네이티브가 늦게 끝나도 기다리지 않는다) */
function guard<T>(p: Promise<T>, ms: number, signal: AbortSignal, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new IreTimeoutError(what, ms));
    }, ms);
    function cleanup() {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    }
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    void p.then(
      (v) => {
        cleanup();
        resolve(v);
      },
      (e: unknown) => {
        cleanup();
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

/** 인코딩마다 다른 원시 파일 이름(마무리 전). 앞 인코딩의 늦은 정리가 새 인코딩의 파일을 지우지 않게(M-3). 공유 폴더라 다음 공유 때 같이 지워진다 */
export const rawName = (fileName: string, run: number) => `raw-${run}-${fileName}`;

let runs = 0;

export function createNativeIreEncoder(native: IreEncoderNative, files: IreEncoderFiles): IreEncoder {
  return {
    async encode(spec: IreVideoSpec, frame: (i: number) => Promise<IreRawFrame>, signal: AbortSignal) {
      if (signal.aborted) throw abortError();
      const run = ++runs;
      files.resetDir(spec.dir);
      const rawUri = files.uri(spec.dir, rawName(spec.fileName, run));
      const outUri = files.uri(spec.dir, spec.fileName);
      const loop = IRE_OUTPUTS.webLoop;
      const kind = spec.width === loop.width && spec.height === loop.height && spec.fps === loop.fps ? 'webLoop' : 'share';
      // 네이티브 세션 id(M-3). null = 아직 없음 또는 이미 맺음(취소할 것 없음)
      let session: number | null = null;
      let beginP: Promise<number> | null = null;
      let writingOut = false;
      const t0 = Date.now();
      let renderWait = 0;
      let encoderWait = 0;
      try {
        // 소리(C7 ireAudioCues)를 PCM으로 섞는 일은 다음 조각이다 — 지금은 소리 칸이 있으면 무음 AAC 트랙(네이티브가 만든다).
        // 섞은 PCM이 생기면 begin 전에 native.setAudioPcm(pcm)만 부르면 된다(네이티브 재빌드 없이 OTA로).
        beginP = native.begin({
          uri: rawUri,
          width: spec.width,
          height: spec.height,
          fps: spec.fps,
          frames: spec.frames,
          bitrate: IRE_BITRATE[kind],
          audio: spec.audio.length > 0,
          maxBytes: IRE_MP4_RULES[kind].maxBytes,
        });
        session = await guard(beginP, IRE_WAIT_MS.begin, signal, 'begin');
        beginP = null;
        // 미리 그려 둔 다음 프레임(그리기와 하드웨어 부호화를 겹친다). 실패로 버려질 때 처리 안 된 거절이 남지 않게 잡아 둔다
        let next = frame(0);
        for (let i = 0; i < spec.frames; i++) {
          let t = Date.now();
          const f = await guard(next, IRE_WAIT_MS.frame, signal, `render ${i}`);
          renderWait += Date.now() - t;
          if (i + 1 < spec.frames) {
            next = frame(i + 1);
            void next.catch(() => undefined);
          }
          if (f.width !== spec.width || f.height !== spec.height || f.pixels.length !== spec.width * spec.height * 4) {
            throw new Error(`frame ${i}: ${f.width}x${f.height}/${f.pixels.length} does not match ${spec.width}x${spec.height}`);
          }
          t = Date.now();
          await guard(native.waitForCapacity(session, IRE_NATIVE_QUEUE - 1), IRE_WAIT_MS.frame, signal, `capacity ${i}`);
          encoderWait += Date.now() - t;
          native.appendFrame(session, i, f.pixels);
        }
        if (signal.aborted) throw abortError();
        await guard(native.finish(session), IRE_WAIT_MS.finish, signal, 'finish');
        session = null;
        const out = finalizeIreMp4(await files.read(rawUri), { width: spec.width, height: spec.height });
        // 서버 커밋 검사와 같은 규칙으로 스스로 본다 — 통과 못 한 파일은 공유 시트에 올리지 않는다(이미지판으로)
        const check = checkIreMp4(out, kind);
        if (!check.ok) throw new Error(`ire mp4 self-check failed: ${check.detail}`);
        // 12-05 기기 관문 측정 줄(logcat·Xcode 콘솔에서 '[ire-video]'로 찾는다)
        console.info(
          `[ire-video] ${kind} ${spec.width}x${spec.height} ${spec.frames}f total ${Date.now() - t0}ms render-wait ${renderWait}ms encoder-wait ${encoderWait}ms bytes ${out.length}`,
        );
        if (signal.aborted) throw abortError();
        writingOut = true;
        await files.write(outUri, out);
        files.remove(rawUri);
        return { uri: outUri };
      } catch (e) {
        if (session !== null) {
          await native.cancel(session).catch(() => undefined);
        } else if (beginP) {
          // begin이 시간 상한·중단에 걸린 뒤 늦게 열린 세션도 닫는다(이미 맺었거나 실패했으면 cancel은 아무 일도 하지 않는다)
          void beginP.then((id) => native.cancel(id)).catch(() => undefined);
        }
        files.remove(rawUri);
        if (writingOut) files.remove(outUri);
        throw signal.aborted ? abortError() : e;
      }
    },
  };
}

type FS = typeof import('expo-file-system');

function expoFiles(fs: FS): IreEncoderFiles {
  return {
    resetDir(dir) {
      const d = new fs.Directory(fs.Paths.cache, dir);
      if (d.exists) d.delete();
      d.create();
    },
    uri: (dir, name) => new fs.File(fs.Paths.cache, dir, name).uri,
    read: (uri) => new fs.File(uri).bytes(),
    async write(uri, bytes) {
      const f = new fs.File(uri);
      if (f.exists) f.delete();
      f.create();
      await f.write(bytes);
    },
    remove(uri) {
      try {
        const f = new fs.File(uri);
        if (f.exists) f.delete();
      } catch {
        // 지우기 실패는 무시한다 — 공유 폴더는 다음 공유 전에 통째로 비운다
      }
    },
  };
}

/** 네이티브 모듈과 파일 시스템이 모두 있으면 인코더, 없으면 null(옛 빌드·웹 → 이미지판). 앱 시작 때 registerIreEncoder로 넘긴다 */
export function nativeIreEncoder(): IreEncoder | null {
  const native = optionalModule(() => (require('../../modules/ire-encoder') as typeof import('../../modules/ire-encoder')).loadIreEncoderNative());
  const fs = optionalModule<FS>(() => require('expo-file-system'));
  return native && fs ? createNativeIreEncoder(native, expoFiles(fs)) : null;
}
