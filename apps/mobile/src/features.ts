// 기능 플래그(C-integrated 4-1 빌드 계획). 세 기둥 기능은 빌드 2(12-10)에서 켠다 — 미완 기능은 플래그를 끈 채 그대로 낸다.
// 값(세이브 v2 필드)은 플래그와 상관없이 빌드 1부터 core sim이 쌓는다. 플래그는 **화면·몸짓을 보일지**만 정한다.
// 네이티브 모듈이 필요한 기능(공유·평점)은 플래그가 켜져 있어도 모듈이 없는 옛 빌드에서는 각 모듈이 스스로 꺼진다.
import { REMOTE_FLAG_KEYS, type RemoteFlagKey } from '@mong/contract';
import { useSyncExternalStore } from 'react';
import { INTERNAL_TEST, conceptV3Default } from './buildKind';

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
   * V12a 2.5D 몸 빛(D-26 아트): 왼쪽 위 빛 한 방향의 확산광(명도 차 ≤ 8%, 정반사 없음)·바닥 그림자·눈 구멍 두께.
   * 몸 폭 48pt 이하에서는 끔(D-24 LOD와 겹치지 않음). 꺼짐 = 렌더 노드를 넣지 않아 지금과 픽셀 동일. 아트 판정·실기기(V20) 뒤 켠다
   */
  bodyLight: false,
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
  /**
   * C7 이레 두루마리 **영상**(9:16·8초·240프레임). 인코더 네이티브 모듈(C10 묶음, 미구현)이 등록되어야 실제로 영상이 나오고,
   * 없거나 실패하면 같은 버튼이 두루마리 이미지(빌드 1)로 떨어진다. 12-05 관문(중급 Android 8초 + 소리 15초 안) 통과 뒤 켠다
   */
  ireVideo: false,
  /**
   * C12 맡겨 두기 화면(공방 노트 행 + 시트). 원격 플래그 `cloud`와 같은 이름(A4 ③). 켜도 서버 주소(API_BASE)와
   * 로그인 포트(C11 `registerCloudAuth`)가 없으면 행이 보이지 않는다. 소프트런칭 중 OTA·플래그로 켠다(D-23 순서)
   */
  cloud: false,
  /**
   * 새 컨셉 v3 세로 조각(D-26 '먹으로 쓴 한 마디 × 스물여덟 밤' + D-27 밥 한 숟갈, DECISIONS 11-25 '새 컨셉 공통 부분 지금 착수').
   * 켜면 세이브 v3(따로 쓰는 키, 1일차부터)로 돈다: 벼루 = 먹 양 → 붓 = 한 마디(키보드 임시) + 붓 한 획 → 마시고 대답 → 연적 = 밤 세기 → 28밤.
   * **개발 빌드·내부 시험판(eas internal-test, buildKind.ts)에서는 기본 켜짐, 운영·preview 기본은 꺼짐.** 옛 세이브(v2)는 그대로 두고 보관 키에 한 번 복사한다
   */
  conceptV3: conceptV3Default({ dev: typeof __DEV__ !== 'undefined' && __DEV__ === true, internalTest: INTERNAL_TEST }),
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

// ── 원격 층(3-7 우선순위: FEATURE_DEFAULTS < 원격 < 개발 메뉴, C11) ──
// 원격 키(REMOTE_FLAG_KEYS)와 이름이 같은 기능만 덮는다(3-7-1 — 번역 표 없음). 값은 net/remoteConfig.ts(서명 검사·탈출 반영)가 낸다.
type RemoteFeature = FeatureId & RemoteFlagKey;
const isRemoteFeature = (id: FeatureId): id is RemoteFeature => (REMOTE_FLAG_KEYS as readonly string[]).includes(id);
let remoteLayer: ((key: RemoteFeature) => boolean | undefined) | null = null;

/** net 모듈이 원격 층을 건다(null = 뗌). 원격 값이 바뀌면 notifyFeatures로 화면을 다시 그린다 */
export function setRemoteLayer(f: ((key: RemoteFeature) => boolean | undefined) | null): void {
  remoteLayer = f;
  notifyFeatures();
}
export function notifyFeatures(): void {
  subs.forEach((f) => f());
}
/** 크래시 루프 탈출 계산(escapeFlags)에 넘길 번들 값: 원격 키와 이름이 같은 기능의 FEATURE_DEFAULTS */
export function remoteBundled(): Partial<Record<RemoteFlagKey, boolean>> {
  const out: Partial<Record<RemoteFlagKey, boolean>> = {};
  for (const id of Object.keys(FEATURE_DEFAULTS) as FeatureId[]) if (isRemoteFeature(id)) out[id] = FEATURE_DEFAULTS[id];
  return out;
}

/** 층 합치기(3-7): 개발 메뉴 → 원격 → 번들. undefined = 그 층이 말하지 않음 */
export function resolveFeature(dev: boolean | undefined, remote: boolean | undefined, bundled: boolean): boolean {
  return dev ?? remote ?? bundled;
}

export function isOn(id: FeatureId): boolean {
  // 새 컨셉 v3 세로 조각은 맡겨 두기와 아직 잇지 않았다: 둘이 함께 켜지면 옛 v2 본이 올라가므로 v3가 켜져 있으면 맡겨 두기를 끈다(리뷰 M5)
  if (id === 'cloud' && isOn('conceptV3')) return false;
  return resolveFeature(overrides[id], isRemoteFeature(id) ? remoteLayer?.(id) : undefined, FEATURE_DEFAULTS[id]);
}

/** 개발 메뉴·테스트에서만 켜고 끈다(저장하지 않음 — 재시작하면 기본값) */
export function setFeature(id: FeatureId, on: boolean | null) {
  const next = { ...overrides };
  if (on === null) delete next[id];
  else next[id] = on;
  overrides = next;
  notifyFeatures();
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
