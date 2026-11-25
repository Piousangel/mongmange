// 위젯 값 다리 — iOS(C10 자리). 앱이 App Group UserDefaults에 값 하나를 쓰고 위젯을 다시 그리게 한다. 화면·값 모양은 C3 몫.
// App Group 이름은 Info.plist `MongAppGroup`(app.json ios.infoPlist)에서 읽는다 — entitlements와 같은 값(test/c10-native.test.ts 고정).
// 키는 src/widget/contract.ts WIDGET_VALUE_KEY와 같다.
import ExpoModulesCore
import WidgetKit

private let valueKey = "mong.widget.v1"

public class WidgetBridgeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WidgetBridge")

    // 값을 쓰고 위젯을 다시 그리게 한다. App Group을 못 열면 false(던지지 않는다 — 위젯은 부가 기능)
    Function("setValue") { (value: String) -> Bool in
      guard let group = Bundle.main.object(forInfoDictionaryKey: "MongAppGroup") as? String,
            let defaults = UserDefaults(suiteName: group) else {
        return false
      }
      defaults.set(value, forKey: valueKey)
      WidgetCenter.shared.reloadAllTimelines()
      return true
    }
  }
}
