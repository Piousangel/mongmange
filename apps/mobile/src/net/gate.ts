// 통계 동의 게이트(C11 — 처리방침 1·3-1·4, K1·K25). 핑이 나가는 조건 = '서버 주소 있음'(ping.ts) AND 이 모듈의 동의.
// 동의 = **설정 토글이 연결됨 AND 만 14세 확인 통과 기록이 지금 판 AND 사용자가 직접 켠 표시('1')**. 기본 꺼짐(opt-in).
//  - 연령 확인 기록은 맡겨 두기와 같은 것(cloud/ageGate.ts AGE_KEY)을 읽는다 — 한쪽에서 통과하면 다른 쪽에서 다시 묻지 않는다.
//  - B0의 옛 규칙('끈 표시가 없으면 켜짐', opt-out)은 처리방침과 반대라 없앴다(D9 11-25 발견). 옛 끈 표시 키는 읽지 않는다.
//  - METRICS_SETTING_CONNECTED: 토글 화면을 실제 공방 노트에 거는 스위치. **켜기는 PM 결정**(처리방침 게시·K 대조 뒤)이라 지금은 false —
//    이 값이 false인 동안은 무엇을 켜 두어도 핑이 나가지 않는다(test/net-gate.test.ts가 고정).
import type { KV } from '@mong/core';
import { ageStatus } from '../cloud/ageGate';
import { NET_KEYS } from './ping';

export const METRICS_SETTING_CONNECTED = false;

/** 사용자가 '이용 통계 보내기'를 직접 켠 표시. 값은 정확히 '1'만 켬 */
export const METRICS_ON_KEY = 'mong.net.metricsOn';
/** B0의 옛 '끈 표시'(opt-out). 읽지 않는다 — 시험이 이 키가 동의에 영향이 없음을 고정한다 */
export const LEGACY_METRICS_OFF_KEY = 'mong.net.metricsOff';

/**
 * 설정 화면이 그릴 갈래(K25 — 토글은 통과자에게만 보인다).
 * needAge = 연령 확인부터(토글 없음) / under = 오늘 미달로 판정됨(켤 수 없음, 다음 날 다시 물음) / off·on = 토글
 */
export type MetricsSetting = { kind: 'needAge' } | { kind: 'under' } | { kind: 'off' } | { kind: 'on' };

function agePassed(kv: KV): boolean {
  // 통과 판정은 날짜와 무관하다(미달 기록만 날짜를 본다)
  return ageStatus(kv, 0, 0).kind === 'passed';
}

function onMark(kv: KV): boolean {
  return kv.getString(METRICS_ON_KEY) === '1';
}

export function metricsSetting(kv: KV, at: number, tzOffsetMin: number): MetricsSetting {
  const age = ageStatus(kv, at, tzOffsetMin);
  if (age.kind === 'ask') return { kind: 'needAge' };
  if (age.kind === 'wait') return { kind: 'under' };
  try {
    return onMark(kv) ? { kind: 'on' } : { kind: 'off' };
  } catch {
    return { kind: 'off' };
  }
}

export function metricsConsent(kv: KV, connected: boolean = METRICS_SETTING_CONNECTED): boolean {
  if (!connected) return false;
  try {
    return agePassed(kv) && onMark(kv);
  } catch {
    return false;
  }
}

/**
 * 토글. 켜기는 지금 판 연령 확인 통과자만(아니면 false, 아무것도 쓰지 않음).
 * 끄기는 켠 표시와 **기기에 모아 둔 통계**(아웃박스·재시도 대기)를 지운다(처리방침 3-1 '켜고 끄기'). 저장 실패는 false.
 */
export function setMetricsOn(kv: KV, on: boolean): boolean {
  try {
    if (on) {
      if (!agePassed(kv)) return false;
      kv.set(METRICS_ON_KEY, '1');
      return true;
    }
    kv.remove(METRICS_ON_KEY);
    kv.remove(NET_KEYS.outbox);
    kv.remove(NET_KEYS.retry);
    return true;
  } catch {
    return false;
  }
}
