// 위젯 값 하나 쓰기·읽기(C10 자리). 값 모양·쓰는 때는 C3 몫 — 지금은 리허설에서 '앱이 쓴 값을 위젯이 읽는다'를 확인하는 통로만.
// iOS: 로컬 모듈 WidgetBridge(App Group). Android: MMKV `mong.widget` + react-native-android-widget 다시 그리기 요청.
// 모듈이 없거나 웹이면 아무 일도 하지 않는다(위젯은 부가 기능 — 앱을 죽이지 않는다).
import { Platform } from 'react-native';
import { optionalModule } from '../lib/optionalModule';
import { ANDROID_WIDGET_NAME, ANDROID_WIDGET_STORE_ID, WIDGET_VALUE_KEY } from './contract';

function androidStore() {
  return optionalModule(() => (require('react-native-mmkv') as typeof import('react-native-mmkv')).createMMKV({ id: ANDROID_WIDGET_STORE_ID }));
}

/** 위젯이 읽을 값을 쓴다. 썼으면 true */
export function writeWidgetValue(value: string): boolean {
  if (Platform.OS === 'ios') {
    const bridge = optionalModule(() => (require('../../modules/widget-bridge') as typeof import('../../modules/widget-bridge')).default);
    return bridge?.setValue(value) ?? false;
  }
  if (Platform.OS === 'android') {
    const store = androidStore();
    if (!store) return false;
    store.set(WIDGET_VALUE_KEY, value);
    const widget = optionalModule(() => require('react-native-android-widget') as typeof import('react-native-android-widget'));
    void widget?.requestWidgetUpdate({ widgetName: ANDROID_WIDGET_NAME, renderWidget: () => require('./androidTask').renderMongWidget(value) }).catch(() => undefined);
    return true;
  }
  return false;
}

/** Android 위젯 작업 핸들러가 읽는 값 */
export function readAndroidWidgetValue(): string | undefined {
  return androidStore()?.getString(WIDGET_VALUE_KEY);
}
