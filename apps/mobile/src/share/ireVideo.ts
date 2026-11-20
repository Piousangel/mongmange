// 이레 두루마리 공유(C7): 영상이 되면 영상, 아니면 이미지판(빌드 1 두루마리 PNG). 어떤 실패도 던지지 않는다.
// 인코더는 네이티브 모듈(iOS AVAssetWriter / Android MediaCodec + MediaMuxer, D-20·DECISIONS 'C7')이 `registerIreEncoder`로
// 등록한다 — 모듈은 C10 빌드 2 네이티브 묶음에서 만든다. 등록 전·웹에서는 늘 이미지판이다.
import { IRE_OUTPUTS, ireAudioCues, type IreCueSound, type IreLoopSource, type IreShareSource, type IreStrings, type MongLook, type sim } from '@mong/core';
import { isOn } from '../features';
import { t } from '../i18n';
import { prepareIreShare, type IrePrepared } from '../render/ireVideo/prepare';
import type { IreRawFrame } from '../render/ireVideo/rawFrame';
import { renderIreFramePixels } from '../render/ireVideo/renderFrame';
import { SHARE_DIR, shareFile, type ShareResult } from './native';
import { shareIreScroll } from './shareCard';

export type { IreRawFrame } from '../render/ireVideo/rawFrame';

/** 영상 파일에 쓰지 않는 메타데이터(계약): 제목·날짜(creation/modification_time = 0)·위치. 인코더가 바꿀 수 없게 리터럴 false */
export const IRE_VIDEO_METADATA = { title: false, date: false, location: false } as const;

/** 영상 파일 이름(앱이 정함): 영문·숫자·하이픈만, 이름·날짜·밤 번호·인장 코드 없음(C7 리뷰 M-1) */
export const IRE_VIDEO_FILE = { share: 'mongmangi-ire-9x16.mp4', webLoop: 'loop.mp4' } as const;

/** 동시에 그려 둘 수 있는 프레임 수(역압). 네이티브가 미리 당겨 불러도 이 이상은 거절한다(저메모리 Android) */
export const IRE_MAX_IN_FLIGHT = 2;

/**
 * 인코더 계약(C7, C10 네이티브 모듈이 따른다).
 * - 출력: H.264 MP4, `moov`가 `mdat`보다 앞(faststart). 공유는 AAC 트랙 하나 더, 웹 루프는 영상 트랙 하나뿐(architecture 3-5-3).
 * - 파일: 앱 캐시 `{dir}/{fileName}`. dir은 다음 공유 전에 통째로 비우는 공유 폴더라 실패·취소로 남은 부분 파일도 같이 지워진다.
 * - 메타데이터: `metadata`가 false인 것(제목·날짜·위치)은 쓰지 않는다. 날짜 칸은 0.
 */
export interface IreVideoSpec {
  width: number;
  height: number;
  fps: number;
  frames: number;
  /** 빈 배열 = 무음(웹 루프). 소리 파일은 앱 SoundId와 같은 이름 */
  audio: { t: number; sound: IreCueSound }[];
  fileName: string;
  dir: string;
  metadata: typeof IRE_VIDEO_METADATA;
}

/**
 * 네이티브 인코더 자리.
 * - `frame(i)`는 i = 0, 1, 2 … **차례로**만 부른다. 끝나지 않은 요청은 최대 `IRE_MAX_IN_FLIGHT`개 — 넘거나 순서가 어긋나면 거절된다.
 * - 프레임은 원시 RGBA8888(`IreRawFrame`, 비곱셈 알파, stride = width × 4). PNG·base64는 넘기지 않는다(관문 15초, C7 리뷰 H-1).
 *   네이티브는 받은 pixels를 바로 YUV로 바꿔 넣고 참조를 놓는다(240장을 쌓지 않음).
 * - `signal`이 중단되면 남은 프레임을 부르지 않고 부분 파일을 지운 뒤 AbortError로 끝낸다.
 */
export interface IreEncoder {
  encode(spec: IreVideoSpec, frame: (i: number) => Promise<IreRawFrame>, signal: AbortSignal): Promise<{ uri: string }>;
}

let encoder: IreEncoder | null = null;

export function registerIreEncoder(e: IreEncoder | null) {
  encoder = e;
}

export function ireVideoSpec(p: Pick<IrePrepared, 'kind' | 'src'>): IreVideoSpec {
  const o = IRE_OUTPUTS[p.kind];
  return {
    width: o.width,
    height: o.height,
    fps: o.fps,
    frames: o.frames,
    audio: ireAudioCues(p.src, p.kind),
    fileName: IRE_VIDEO_FILE[p.kind],
    dir: SHARE_DIR,
    metadata: IRE_VIDEO_METADATA,
  };
}

/** 언어별 꼬리표 글. 결·먹은 그 기능 플래그가 켜졌을 때만(꺼진 기능의 이름을 공유물에 먼저 내보이지 않는다) */
export function ireStrings(src: IreShareSource | IreLoopSource, on: { label: boolean; ink: boolean }): IreStrings {
  const l = src.label;
  return {
    label: on.label && l ? t('temper.name', { key: `${l.axis}${l.sign > 0 ? 'Pos' : 'Neg'}` }) : undefined,
    ink: on.ink && src.ink ? t('ink.name', { ink: src.ink }) : undefined,
    app: t('share.footer'),
  };
}

type Render = (p: IrePrepared, i: number) => Promise<IreRawFrame>;

/** 차례·역압·중단을 지키는 프레임 공급자. 그리기는 한 번에 하나씩(앞 프레임이 끝난 뒤 다음) */
export function framePump(p: IrePrepared, frames: number, render: Render, signal: AbortSignal): (i: number) => Promise<IreRawFrame> {
  let next = 0;
  let inFlight = 0;
  let chain: Promise<unknown> = Promise.resolve();
  return (i) => {
    if (signal.aborted) return Promise.reject(new Error('aborted'));
    if (!Number.isInteger(i) || i < 0 || i >= frames) return Promise.reject(new Error(`frame ${i} out of range`));
    if (i !== next) return Promise.reject(new Error(`frame ${i} out of order (next ${next})`));
    if (inFlight >= IRE_MAX_IN_FLIGHT) return Promise.reject(new Error(`frame ${i}: ${inFlight} frames already in flight`));
    next++;
    inFlight++;
    const job = chain.then(() => {
      if (signal.aborted) throw new Error('aborted');
      return render(p, i);
    });
    chain = job.catch(() => undefined);
    return job.finally(() => {
      inFlight--;
    });
  };
}

/** 준비된 재료를 인코더에 넘긴다(프레임 그리기는 주입 가능 — 시험에서 가짜 렌더) */
export function encodeIreVideo(p: IrePrepared, enc: IreEncoder, signal: AbortSignal, render: Render = renderIreFramePixels): Promise<{ uri: string }> {
  const spec = ireVideoSpec(p);
  return enc.encode(spec, framePump(p, spec.frames, render, signal), signal);
}

/** 영상 경로 결과: 공유 결과 + 화면을 떠나 취소됨(시트도 이미지판도 열지 않음) */
export type IreShareResult = ShareResult | 'cancelled';

/**
 * 이레 두루마리 보내기.
 * - 영상 플래그가 켜지고 인코더가 있으면 영상. 시트를 **열기 전** 실패(준비·인코딩 실패, 공유 불가)면 이미지판으로 떨어진다.
 * - 시트를 연 뒤의 실패(`shareFile` 'failed')는 이미지판으로 넘기지 않는다 — 시트를 두 번 보이지 않게(C7 리뷰 M-3).
 * - `signal`이 중단되면(화면을 떠남) 어느 단계든 시트를 열지 않고 'cancelled'.
 * - 이름은 `naming` 플래그와 이름 공개(nameVisible)가 모두 켜졌을 때만 영상에 실린다(PM 11-20: OS 공유 영상도 nameVisibility를 따른다).
 *   앱에 이름 공개 설정이 생기기 전(B2 서버·C11 앱 net)에는 호출부가 넘기지 않아 늘 꺼짐이다.
 */
export async function shareIre(
  state: sim.State,
  look?: MongLook,
  opts: { nameVisible?: boolean; strokeInks?: readonly (sim.InkId | null)[]; signal?: AbortSignal } = {},
): Promise<IreShareResult> {
  const signal = opts.signal ?? new AbortController().signal;
  if (signal.aborted) return 'cancelled';
  const enc = encoder;
  if (isOn('ireVideo') && enc) {
    let uri: string | null = null;
    try {
      const nameVisible = isOn('naming') && opts.nameVisible === true;
      const base = await prepareIreShare({ state, look, strokeInks: opts.strokeInks, nameVisible, strings: { app: '' } });
      const p: IrePrepared = { ...base, strings: ireStrings(base.src, { label: isOn('temperamentLabel'), ink: isOn('inkChoice') }) };
      uri = (await encodeIreVideo(p, enc, signal)).uri;
    } catch (e) {
      if (signal.aborted) return 'cancelled';
      console.warn('[share] 이레 영상 실패 → 이미지판:', e);
    }
    if (signal.aborted) return 'cancelled';
    if (uri !== null) {
      const r = await shareFile(uri, 'video/mp4', 'public.mpeg-4', t('share.dialog'));
      if (r !== 'unavailable') return r;
    }
  }
  if (signal.aborted) return 'cancelled';
  return shareIreScroll(state, look);
}
