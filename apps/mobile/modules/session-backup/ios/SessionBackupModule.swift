// 로그인 세션 저장소를 OS 백업(iCloud·Finder)에서 빼는 일(C10b, DECISIONS 'C10b'). 세이브(MMKV `mong`)는 백업에 그대로 둔다.
// 계약(plugins/withSessionBackupExclusion.js SESSION_FILES·test/c10b-backup.test.ts가 고정):
//   세션 = react-native-mmkv `createMMKV({ id: 'mong.session' })`, path 없음, Info.plist `AppGroupIdentifier` 없음
//   → 파일은 <Documents>/mmkv/mong.session 과 mong.session.crc (react-native-mmkv 4 HybridMMKVPlatformContext 기본 위치)
// 같은 폴더에 세이브 `mong`이 있어 폴더째 빼지 않고 두 파일에만 NSURLIsExcludedFromBackupKey를 건다.
// MMKV는 파일을 바꿔치지 않고 제자리(mmap·ftruncate)에 쓰므로 표시가 남는다. Apple 문서가 '일부 파일 작업이 표시를 지운다'고 하므로
// 실행 때마다 다시 건다. 이 표시는 '빼도 된다'는 안내일 뿐 보장이 아니다(Apple 'Optimizing your app's data for iCloud Backup')
// → 복원된 옛 로그인은 앱 쪽 sub 대조(DECISIONS B2b '앱이 맞출 것' 1·3·4)가 마지막 방어선이다.
import ExpoModulesCore
import os

enum SessionBackupExclusion {
  static let fileNames = ["mong.session", "mong.session.crc"]
  private static let log = Logger(subsystem: "com.piousangel.mongmange", category: "SessionBackup")

  static func directory() -> URL? {
    FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first?.appendingPathComponent("mmkv", isDirectory: true)
  }

  /// 두 파일에 백업 제외를 건다. 첫 실행처럼 **둘 다 없을 때만** 빈 파일을 먼저 만들어 표시를 걸어 둔다
  /// (MMKV도 빈 파일을 만들어 키우는 같은 길로 연다). 하나만 있으면 만들지 않는다 — 빈 .crc가 있는 데이터를 깨진 것으로 보이게 하지 않으려고.
  @discardableResult
  static func apply(createMissing: Bool) -> [String: Bool] {
    var result: [String: Bool] = [:]
    guard let dir = directory() else { return result }
    let fm = FileManager.default
    let urls = fileNames.map { dir.appendingPathComponent($0, isDirectory: false) }
    let noneExists = urls.allSatisfy { !fm.fileExists(atPath: $0.path) }
    if createMissing && noneExists {
      do {
        try fm.createDirectory(at: dir, withIntermediateDirectories: true)
        for url in urls { _ = fm.createFile(atPath: url.path, contents: nil) }
      } catch {
        log.error("session backup: mkdir failed \(error.localizedDescription, privacy: .public)")
      }
    }
    for (name, original) in zip(fileNames, urls) {
      var url = original
      guard fm.fileExists(atPath: url.path) else {
        result[name] = false
        continue
      }
      do {
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try url.setResourceValues(values)
        url.removeAllCachedResourceValues()
        result[name] = (try url.resourceValues(forKeys: [.isExcludedFromBackupKey])).isExcludedFromBackup ?? false
      } catch {
        result[name] = false
      }
    }
    // 리허설 확인용(Console.app에서 SessionBackup 범주) — 값은 파일 이름과 참·거짓뿐
    log.info("session backup excluded: \(result.description, privacy: .public)")
    return result
  }
}

/// 실행마다 JS(세션을 여는 C11 sessionStore)보다 먼저 건다. 앱은 scene 생애주기라 RN은 SceneDelegate에서 시작한다(AppDelegate 뒤).
public class SessionBackupAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    SessionBackupExclusion.apply(createMissing: true)
    return true
  }
}

public class SessionBackupModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SessionBackup")

    // 확인 창(리허설·개발 빌드): 다시 걸고 결과를 돌려준다. 파일을 새로 만들지는 않는다
    Function("status") { () -> [String: Bool] in
      SessionBackupExclusion.apply(createMissing: false)
    }
  }
}
