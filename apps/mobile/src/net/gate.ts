// 핑을 켜는 두 번째 조건(B0 리뷰 m1): '서버 주소 있음' AND '사용자 동의 설정 켜짐'.
// 처리방침 3-1이 약속한 설정 토글('이용 통계 보내기')이 아직 화면에 없으므로 **지금은 늘 false**다 —
// EAS 환경 변수나 개발자 셸에 API 주소가 들어가도 토글 없이 핑이 나가지 않는다.
// 토글을 연결하는 작업(C 항목)이 METRICS_SETTING_CONNECTED를 true로 바꾸고, 토글 값(NET_KEYS.off)을 읽게 한다.
// test/net-gate.test.ts가 이 상수가 false인 동안 어떤 경로로도 핑이 나가지 않음을 고정한다.
import type { KV } from '@mong/core';

export const METRICS_SETTING_CONNECTED = false;

/** '이용 통계 보내기'를 끈 표시(설정 토글이 쓴다) */
export const METRICS_OFF_KEY = 'mong.net.metricsOff';

export function metricsConsent(kv: KV, connected: boolean = METRICS_SETTING_CONNECTED): boolean {
  if (!connected) return false;
  try {
    return kv.getString(METRICS_OFF_KEY) !== '1';
  } catch {
    return false;
  }
}
