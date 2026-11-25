// 원격 층에 거는 바이너리 조건(C11 리뷰 H1). 원격 config의 하한은 문서 전체(minAppBuild)와 JS 판(minBundle)뿐이라 '키마다 바이너리 하한'이 없다.
// 그래서 네이티브 조건이 필요한 키는 여기서 막는다:
//  - cloud(맡겨 두기): 세션 저장소가 OS 백업에서 빠진 바이너리(nativeFlags.SESSION_BACKUP_EXCLUDED)에서만 원격 값을 받는다.
//    아니면 원격이 무엇을 말해도 **false**(번들 꺼짐 강제 — 번들 기본값이 OTA로 true가 되어도 꺼짐). 백업 복원으로 두 기기가 한 익명 세션을
//    나눠 쓰는 일(갱신 토큰 회전 → 둘 다 끊김, 백업 유출 = 계정 탈취)과 처리방침 10절 '세션은 백업에서 뺍니다'가 거짓이 되는 일을 막는다.
//  개발 메뉴 덮어쓰기는 이 층보다 위라 그대로 된다(개발 빌드 확인용).
import type { RemoteFlagKey } from '@mong/contract';

export interface BinaryCaps {
  sessionBackupExcluded: boolean;
}

export function gateRemoteFlag(key: RemoteFlagKey, remote: boolean | undefined, caps: BinaryCaps): boolean | undefined {
  if (key === 'cloud' && !caps.sessionBackupExcluded) return false;
  return remote;
}
