// 이레 두루마리 영상 인코더 — 로컬 Expo 모듈(C10, D-20·DECISIONS 'C7'). iOS AVAssetWriter / Android MediaCodec + MediaMuxer.
// 이 파일은 네이티브 함수의 모양만 적는다. 차례·역압·중단·MP4 마무리는 src/share/ireNativeEncoder.ts(시험 대상)가 맡는다.
// 모듈이 없는 빌드·웹에서는 null → 인코더를 등록하지 않아 이미지판으로 떨어진다(optionalModule 규칙).
import { requireOptionalNativeModule } from 'expo';

export interface IreNativeBegin {
  /** 쓸 파일의 file:// URI(앱 캐시 공유 폴더 안). 있으면 지우고 새로 쓴다 */
  uri: string;
  /** 표시 크기(계약). 높이가 홀수면 네이티브는 짝수로 올려 부호화하고 마지막 줄을 복제한다 — 표시 크기는 JS 마무리가 tkhd에 적는다 */
  width: number;
  height: number;
  fps: number;
  frames: number;
  /** H.264 평균 비트레이트(bps) */
  bitrate: number;
  /** true = AAC 트랙(모노 44.1kHz). `setAudioPcm`을 begin 전에 부르지 않았으면 무음 */
  audio: boolean;
  /** 0 = 상한 없음. Android는 부호화된 바이트 합이 넘으면 바로 실패한다(느린 기기에서 파일이 커지는 경우, 리뷰 M-5) */
  maxBytes: number;
}

/**
 * 네이티브 함수. 세션 id(리뷰 M-3): `begin`이 돌려준 id를 나머지 함수에 넘긴다. 현재 세션이 아닌 id는 그 세션에 아무 일도 하지 않는다
 * (append·wait·finish는 거절, cancel은 무시) — 앞 인코딩의 늦은 cancel이 새 인코딩을 죽이지 않는다. 새 begin은 진행 중 세션을 취소한다.
 * - `appendFrame`은 **동기**다: JS 스레드에서 RGBA를 곧바로 인코더 입력(iOS CVPixelBuffer BGRA / Android Bitmap)으로 한 번 복사하고
 *   JS 버퍼 참조를 놓는다(다른 스레드에서 JS 메모리를 읽지 않는다). 순서가 어긋나거나 큐가 차 있으면 던진다.
 * - `waitForCapacity(n)`: 복사됐지만 아직 인코더에 넘기지 않은 프레임이 n개 이하가 되면 풀린다(역압). 인코더 오류면 거절.
 * - `finish()`: 모든 프레임을 넘긴 뒤 파일을 닫는다. 프레임 수가 모자라거나 인코더가 프레임을 버렸으면 거절.
 * - `cancel()`: 언제 불러도 된다. 인코더를 멈추고 부분 파일을 지운다.
 */
export interface IreEncoderNative {
  setAudioPcm(pcm: Uint8Array): void;
  begin(o: IreNativeBegin): Promise<number>;
  appendFrame(session: number, index: number, pixels: Uint8Array): void;
  waitForCapacity(session: number, maxQueued: number): Promise<void>;
  finish(session: number): Promise<void>;
  cancel(session: number): Promise<void>;
}

export function loadIreEncoderNative(): IreEncoderNative | null {
  return requireOptionalNativeModule<IreEncoderNative>('IreEncoder');
}
