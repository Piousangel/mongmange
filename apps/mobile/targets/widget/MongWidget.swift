// 몽망이 위젯 자리(C10). 화면은 C3 몫 — 지금은 한지색 빈 칸 + App Group 값 하나를 읽어 작게 보여 준다(리허설 12-12 확인용).
// 계약: App Group·키는 apps/mobile/src/widget/contract.ts와 같은 문자열(test/c10-native.test.ts가 고정).
// 재촉 신호 금지(D-03 보강 ④): 글자·숫자·스트릭을 위젯에 새로 넣는 일은 C3에서 문구 검수와 함께.
import SwiftUI
import WidgetKit

private let appGroup = "group.com.piousangel.mongmange"
private let valueKey = "mong.widget.v1"

struct MongEntry: TimelineEntry {
  let date: Date
  let value: String?
}

struct MongProvider: TimelineProvider {
  func placeholder(in context: Context) -> MongEntry {
    MongEntry(date: Date(), value: nil)
  }

  func getSnapshot(in context: Context, completion: @escaping (MongEntry) -> Void) {
    completion(read())
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<MongEntry>) -> Void) {
    // 앱이 값을 쓰면 WidgetBridge가 다시 그리게 한다 — 스스로 새로 고치지 않는다
    completion(Timeline(entries: [read()], policy: .never))
  }

  private func read() -> MongEntry {
    MongEntry(date: Date(), value: UserDefaults(suiteName: appGroup)?.string(forKey: valueKey))
  }
}

struct MongWidgetView: View {
  let entry: MongEntry

  var body: some View {
    let content = Text(entry.value ?? "")
      .font(.caption2)
      .foregroundColor(Color("$accent"))
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    if #available(iOSApplicationExtension 17.0, *) {
      content.containerBackground(for: .widget) { Color("$widgetBackground") }
    } else {
      content.background(Color("$widgetBackground"))
    }
  }
}

struct MongWidget: Widget {
  let kind = "MongWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: MongProvider()) { entry in
      MongWidgetView(entry: entry)
    }
    .configurationDisplayName("mongmangE")
    .supportedFamilies([.systemSmall])
  }
}

@main
struct MongWidgets: WidgetBundle {
  var body: some Widget {
    MongWidget()
  }
}
