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
  /**
   * D-24 썸네일 LOD(몸 폭 48pt 이하에서 획 틈·폭·먹 채도·눈·빗 키움). 블라인드(12-05) 판정 뒤 켠다.
   * 켜기 전 관문: S25 실기기 22·36pt 캡처, 꿈 카드 화면 ↔ 공유 PNG LOD 일치 확인(아트 1-5).
   * 블러 하한(눈 소실 수정)은 플래그와 무관하고 장치 px 기준이라 1x·1.5x에서는 48pt 초과에도 걸린다(의도)
   */
  thumbLod: false,
  /**
   * C6 꿈 콘텐츠(dreams-30days v1.1): 모티프 25·점적 해금·반복 방지 규칙·카드 캡션·'처음 꾼 꿈'. 꺼짐 = 빌드 1(모티프 10, 캡션 없음).
   * 값은 재우기·포그라운드 이벤트의 선택 필드로 sim에 들어간다(`game/store.ts` `nightFields`). 새 15개는 형상(C14) 전이라
   * 제품 빌드에서는 켜도 고르지 않는다(개발 빌드만 임시 형상).
   */
  dreamContent: false,
  /**
   * 보름밤 사흘(C4·C6, 원격 플래그와 같은 이름 — A4 ③). 꺼짐 = 보름 판정 안 함. 번들 보름 3은 형상·en 장면이 미완이라
   * 제품 빌드에서는 켜도 고르지 않는다(`moonMotifBlockers`). 원격 rollout·받아 둔 원격 보름 id는 B4 로더가 넘길 자리
   */
  moonNight: false,
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
