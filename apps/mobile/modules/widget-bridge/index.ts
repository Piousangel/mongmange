// 위젯 값 다리 — 로컬 Expo 모듈(C10 자리, iOS만). Android는 react-native-android-widget가 JS 작업 핸들러로 그리므로 이 모듈이 없다.
// 모듈이 없는 빌드·웹·Android에서는 null → src/widget/value.ts가 아무 일도 하지 않는다.
import { requireOptionalNativeModule } from 'expo';

export interface WidgetBridgeNative {
  /** App Group에 값을 쓰고 위젯을 다시 그리게 한다. App Group을 못 열면 false */
  setValue(value: string): boolean;
}

export default requireOptionalNativeModule<WidgetBridgeNative>('WidgetBridge');
