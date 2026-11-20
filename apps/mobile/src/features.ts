// 기능 플래그(C-integrated 4-1 빌드 계획). 세 기둥 기능은 빌드 2(12-10)에서 켠다 — 미완 기능은 플래그를 끈 채 그대로 낸다.
// 값(세이브 v2 필드)은 플래그와 상관없이 빌드 1부터 core sim이 쌓는다. 플래그는 **화면·몸짓을 보일지**만 정한다.
// 네이티브 모듈이 필요한 기능(공유·평점)은 플래그가 켜져 있어도 모듈이 없는 옛 빌드에서는 각 모듈이 스스로 꺼진다.
import { useSyncExternalStore } from 'react';

export const FEATURE_DEFAULTS = {
  // ── 빌드 1(11-29) ──
  /** 아침 꿈 카드 4:5·9:16 PNG 공유 + 이레 두루마리 이미지 */
  share: true,
  /** 이레 아침 평점 요청 1회 */
  review: true,
  // ── 빌드 2(12-10): M1~M4 ──
  /** M1 타고남(체형·빗 모양) 렌더 */
  birthTraits: false,
  /** M1 먹 고르기(네 자루) */
  inkChoice: false,
  /** M2 이름·인장·이름표 */
  naming: false,
  /** M2 이름 가락(자르는 순서 2번째) */
  nameMelody: false,
  /** M3 결 이름 + 공유 꼬리표 */
  temperamentLabel: false,
  /** M4 정·손 기억·반김 */
  relation: false,
  /** M4 서운 = 머뭇거림(비네트 테스트에 따라 끌 수 있음) */
  hesitation: false,
  // ── 빌드 3(12-19) ──
  /** M5 함께 숨 쉬기 */
  breathe: false,
} as const;

export type FeatureId = keyof typeof FEATURE_DEFAULTS;

let overrides: Partial<Record<FeatureId, boolean>> = fromQuery(typeof window !== 'undefined' && window.location ? window.location.search : '');

/**
 * 웹 확인용 쿼리(`?ff=birthTraits,inkChoice`, `?ff=m1` = M1 둘 다). 기본값은 그대로 두고 켜기만 한다.
 * 네이티브는 window.location이 없어 늘 빈 값 → 개발 메뉴에서 켠다.
 */
export function fromQuery(search: string): Partial<Record<FeatureId, boolean>> {
  // 배포 웹에서 쿼리로 미출시 기능이 켜지지 않게 개발 빌드에서만(테스트 환경은 __DEV__ 없음 → 허용, 리뷰 L4)
  if (typeof __DEV__ !== 'undefined' && !__DEV__) return {};
  const m = /[?&]ff=([^&]*)/.exec(search);
  if (!m) return {};
  let list: string;
  try {
    list = decodeURIComponent(m[1]!);
  } catch {
    return {}; // 잘못된 % 인코딩이 모듈 로드(앱 전체)를 죽이지 않게
  }
  const out: Partial<Record<FeatureId, boolean>> = {};
  for (const raw of list.split(',')) {
    const id = raw.trim();
    if (id === 'm1') {
      out.birthTraits = true;
      out.inkChoice = true;
    } else if (id in FEATURE_DEFAULTS) out[id as FeatureId] = true;
  }
  return out;
}
const subs = new Set<() => void>();

export function isOn(id: FeatureId): boolean {
  return overrides[id] ?? FEATURE_DEFAULTS[id];
}

/** 개발 메뉴·테스트에서만 켜고 끈다(저장하지 않음 — 재시작하면 기본값) */
export function setFeature(id: FeatureId, on: boolean | null) {
  const next = { ...overrides };
  if (on === null) delete next[id];
  else next[id] = on;
  overrides = next;
  subs.forEach((f) => f());
}

function subscribe(f: () => void) {
  subs.add(f);
  return () => subs.delete(f);
}

export function useFeature(id: FeatureId): boolean {
  return useSyncExternalStore(
    subscribe,
    () => isOn(id),
    () => isOn(id),
  );
}
