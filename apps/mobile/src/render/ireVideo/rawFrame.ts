// 인코더로 넘기는 원시 프레임(C7 인코더 계약, DECISIONS 'C7'). 네이티브 모듈은 pixels를 복사 없이 읽어 YUV로 바꾼다.

/** RGBA8888, 비곱셈 알파, 행 우선, stride = width × 4. 길이 = width × height × 4 */
export interface IreRawFrame {
  width: number;
  height: number;
  pixels: Uint8Array;
}
