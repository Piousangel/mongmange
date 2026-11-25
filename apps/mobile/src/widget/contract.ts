// 위젯 계약(C10 자리, 화면은 C3). 같은 문자열이 네이티브 세 곳에 있다 — test/c10-native.test.ts가 일치를 고정한다:
//  app.json ios.entitlements·ios.infoPlist.MongAppGroup / targets/widget/MongWidget.swift / modules/widget-bridge/ios/WidgetBridgeModule.swift
//  / app.json react-native-android-widget widgets[0].name
export const WIDGET_APP_GROUP = 'group.com.piousangel.mongmange';
/** 위젯이 읽는 값 하나의 키(iOS App Group UserDefaults · Android MMKV `mong.widget`) */
export const WIDGET_VALUE_KEY = 'mong.widget.v1';
export const ANDROID_WIDGET_NAME = 'Mong';
/** Android 위젯 값 저장소(MMKV id) — 게임 세이브(`mong`)와 따로 둔다 */
export const ANDROID_WIDGET_STORE_ID = 'mong.widget';
