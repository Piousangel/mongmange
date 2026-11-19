// 웹: 소리·햅틱 no-op(웹 캡처는 질감·흐름 확인용, D-04). 엔진 규칙(스로틀 등)은 그대로 돈다.
import type { Backend } from './engine';

export const backend: Backend = {
  create: () => null,
  haptic: () => {},
};
