// 로그인 세션 백업 제외 — 로컬 Expo 모듈(C10b, iOS만). 일은 네이티브 AppDelegate 구독자가 실행 때마다 한다(JS가 부를 것 없음).
// 이 JS 면은 리허설·개발 빌드에서 결과를 확인하는 창일 뿐이다. Android는 백업 규칙 XML(plugins/withSessionBackupExclusion.js)이 맡아 모듈이 없다.
import { requireOptionalNativeModule } from 'expo';

export interface SessionBackupNative {
  /** 세션 MMKV 파일별 '백업 제외' 표시 여부. 다시 걸고 나서 읽은 값(파일이 아직 없으면 false) */
  status(): Record<string, boolean>;
}

export default requireOptionalNativeModule<SessionBackupNative>('SessionBackup');
