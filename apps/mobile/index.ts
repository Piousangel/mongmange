import { registerRootComponent } from 'expo';
import { AccessibilityInfo, Platform } from 'react-native';
import { PARAMS } from './src/render/clock';
import { skiaReady } from './src/skiaReady';

// Skia(웹은 CanvasKit) 로드가 끝난 뒤에 App을 불러온다.
// 모션 줄이기(D-08): 화면 모듈이 PARAMS.rm을 읽기 전에 OS 설정을 반영한다(웹은 ?rm=1).
const reduceMotion = Platform.OS === 'web' ? Promise.resolve(false) : AccessibilityInfo.isReduceMotionEnabled().catch(() => false);
Promise.all([skiaReady(), reduceMotion]).then(([, rm]) => {
  if (rm) PARAMS.rm = true;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const App = require('./App').default;
  registerRootComponent(App);
});
