// iOS 홈 화면 위젯 타깃 자리(C10 빌드 2 네이티브 묶음). 화면 완성은 C3(스토어 업데이트 01-26 전후) 몫 —
// 지금은 '빈 위젯이 빌드되고 App Group에서 값 하나(mong.widget.v1)를 읽는다'까지만.
// App Group은 app.json ios.entitlements 값을 그대로 넘긴다(한 곳). apple-targets 5.0.0은 `entitlements`를 적지 않으면 타깃에
// entitlements 파일을 아예 만들지 않는다(11-25 prebuild 실측 — README의 '자동 미러'는 entitlements 객체가 있을 때만).
// 최소 iOS는 앱과 같은 16.4(ExpoModulesCore). 기본값 18.0을 두면 16·17 기기에 위젯이 안 보인다.
const APP_GROUPS = 'com.apple.security.application-groups';

/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'widget',
  displayName: 'mongmangE',
  bundleIdentifier: '.widget',
  deploymentTarget: '16.4',
  frameworks: ['SwiftUI', 'WidgetKit'],
  colors: {
    $widgetBackground: '#EFE8DA',
    $accent: '#2B2A28',
  },
  entitlements: { [APP_GROUPS]: config.ios?.entitlements?.[APP_GROUPS] ?? [] },
});
