// 꿈 카드(systems 5절): 모티프(curiosity × closeness 사분면 + 가운데) × 구도 3 × 물결(tempo) × 먹 톤(boldness).
// 모티프 표·고르는 규칙(25개, R1~R5)은 ./dreamMotifs. 이 파일은 밤 하나의 카드를 만드는 입구다.
// - 꿈 콘텐츠 꺼짐(빌드 1): `pickCard` — 빌드 1의 10개, 쓴 장면 피하기(옛 규칙). 난수 소비까지 고정 기대값 시험이 묶는다.
// - 켜짐(C6): `pickNightCard({ dream })` — 25개·점적 해금·2-5 규칙·캡션 원인.
import { moonNightOf, type MoonNight, type MoonNightPhase } from '../moon/phase';
import { isMoonMotifId, moonMotifUsable, resolveMoonMotifId } from '../moon/motifs';
import { chooseScene, DREAM_ART_REV, dreamPool, motifUsable, MOTIFS, pickCause, quadrantOf, type MotifZone } from './dreamMotifs';
import { rngInt, rngNext } from './rng';
import type { AxisRecord, DreamCard, DreamContext, MoonContext } from './types';

/** 빌드 1의 10개(해금 0) — 옛 목록과 같은 상대 순서 */
const BUILD1_MOTIFS = MOTIFS.filter((x) => x.unlockAtCards === 0);

/** 가운데로 보는 폭 */
const CENTER = 0.15;

export function zoneOf(v: AxisRecord): MotifZone {
  if (Math.abs(v.curiosity) < CENTER && Math.abs(v.closeness) < CENTER) return 'center';
  return quadrantOf(v);
}

/** 빌드 1 장면 풀(모티프 표 순 × 구도 순). 보름 창이면 center.moon을 뺀다(dreams-30days 4-1) */
export function scenePool(v: AxisRecord, opts?: { moonWindow?: boolean }): { motifId: string; composition: 0 | 1 | 2 }[] {
  // 가운데 유저도 12장면: 가운데 2 + 부호가 가리키는 가장 가까운 사분면 2(리뷰 1-4)
  const near = quadrantOf(v);
  const pool = BUILD1_MOTIFS.filter((m) => (m.zone === near || m.zone === 'center') && !(opts?.moonWindow && m.id === 'center.moon'));
  const scenes: { motifId: string; composition: 0 | 1 | 2 }[] = [];
  for (const m of pool) for (const c of [0, 1, 2] as const) scenes.push({ motifId: m.id, composition: c });
  return scenes;
}

/** 접근 풀 = 현재 사분면 + 가운데(약 4개 × 구도 3 = 12장면). 이미 나온 장면은 다시 고르지 않는다(바닥나면 가장 오래된 것) */
export function pickCard(
  v: AxisRecord,
  used: readonly { motifId: string; composition: number }[],
  rng: number,
  night: number,
  strokeRef: string | null,
  opts?: { moonWindow?: boolean },
): { card: DreamCard; rng: number } {
  const scenes = scenePool(v, opts);
  const key = (x: { motifId: string; composition: number }) => `${x.motifId}/${x.composition}`;
  const usedKeys = used.map(key);
  let cands = scenes.filter((x) => !usedKeys.includes(key(x)));
  if (cands.length === 0) {
    // 가장 오래전에 나온 장면부터
    const age = (x: (typeof scenes)[number]) => usedKeys.lastIndexOf(key(x));
    const oldest = Math.min(...scenes.map(age));
    cands = scenes.filter((x) => age(x) === oldest);
  }
  const pick = rngInt(rng, cands.length);
  const chosen = cands[pick.value]!;
  return styledCard(v, pick.seed, night, chosen.motifId, chosen.composition, strokeRef);
}

/** 고른 장면에 성향 스타일(먹 톤·물결)과 물결 씨앗을 입힌다 */
function styledCard(
  v: AxisRecord,
  rng: number,
  night: number,
  motifId: string,
  composition: 0 | 1 | 2,
  strokeRef: string | null,
): { card: DreamCard; rng: number } {
  const fs = rngNext(rng);
  return {
    card: {
      night,
      motifId,
      composition,
      inkTone: (Math.max(-0.85, Math.min(0.85, v.boldness)) + 0.85) / 1.7,
      flow: Math.max(-1, Math.min(1, v.tempo / 0.85)),
      flowSeed: Math.floor(fs.value * 2 ** 31),
      strokeRef,
      nightsMerged: 1,
    },
    rng: fs.seed,
  };
}

/** 보름 창이어도 현상한 카드가 이보다 적으면 일반 카드(dreams-30days 4-1 '처음 3장 보호') */
export const MOON_PROTECTED_CARDS = 3;

/**
 * 밤 하나의 카드 고르기 입력. doWake가 **밤마다 한 번** 부르는 모양이다(긴 잠은 `mergeNightCard`로 접는다).
 * 결정성: State 밖 값(플래그·원격 보유·빌드 종류)은 `moon`(MoonContext)·`dream`(DreamContext)으로만 받는다 — doWake는
 * 이벤트가 State `nightCtx`에 기록한 값을 넘긴다(types.ts). 같은 State + 같은 이벤트 열이면 같은 카드다.
 */
export interface NightCardInput {
  v: AxisRecord;
  /** 빌드 1 규칙의 '쓴 장면'(현상한 카드 + 긴 잠 중인 카드) */
  used: readonly { motifId: string; composition: number }[];
  rng: number;
  night: number;
  strokeRef: string | null;
  /** 밤의 날짜(`nightDateOf(sleepAt, tz)`) — 그 밤이 시작된 저녁의 현지 날짜. null이면 보름 판정 안 함 */
  nightDate: string | null;
  tzOffsetMin: number;
  /** 이미 현상한 카드 수(앨범 `cards.length`) */
  developedCards: number;
  /** 없으면 보름 끔(옛 이벤트·세이브와 같은 동작) */
  moon?: MoonContext;
  /** 없거나 꺼짐이면 빌드 1 `pickCard` */
  dream?: DreamContext;
  /** 2-5 규칙의 기록 = 현상한 카드(오래된 것 → 최근). '최근 N장'은 세이브의 `cards`에서 센다. 없으면 `used` */
  history?: readonly DreamCard[];
}

/**
 * 밤 하나의 카드 = 보름 판정 → 보름 카드 또는 일반 카드.
 * - 보름 카드: 그달 모티프(번들·원격·`월 mod 3` 대체) × 밤으로 고정된 구도(전날 a·당일 b·다음 날 c). 2-5 반복 규칙 밖.
 * - 창 안이지만 처음 3장 보호, 또는 고른 보름 모티프가 이 빌드에서 쓸 수 없으면(자리표시·초안, 제품 빌드) 일반 카드이되
 *   `center.moon`은 뺀다.
 * - 일반 카드: 꿈 콘텐츠 켜짐이면 25개 풀 + 2-5 규칙(`chooseScene`) + 캡션 원인, 꺼짐이면 빌드 1 `pickCard`.
 * - 반환 `moon`은 보름 카드일 때만(캡션 원인 키 `caption.moon.cause.{phase}`). 핑 차원은 `isMoonWindow`로 따로 정한다.
 */
export function pickNightCard(input: NightCardInput): { card: DreamCard; rng: number; moon: MoonNight | null } {
  const ctx = input.moon;
  const moon = ctx?.enabled && input.nightDate !== null ? moonNightOf(input.nightDate, input.tzOffsetMin) : null;
  if (moon && input.developedCards >= MOON_PROTECTED_CARDS) {
    const id = resolveMoonMotifId(moon.month, ctx?.remoteMoon ?? []);
    if (moonMotifUsable(id, ctx?.dev === true)) {
      const r = styledCard(input.v, input.rng, input.night, id, moon.composition, input.strokeRef);
      return { ...r, moon };
    }
  }
  const dream = input.dream;
  if (dream?.enabled) {
    const history = input.history ?? input.used;
    const pool = dreamPool(quadrantOf(input.v), input.developedCards, {
      moonWindow: moon !== null,
      unlock: dream.unlock,
      usable: (id) => motifUsable(id, dream.dev === true),
      seen: history.map((h) => h.motifId), // V9b: 본 꿈은 닫히지 않는다(켜짐에서만 — 꺼짐은 아래 빌드 1 pickCard 그대로)
    });
    const u = rngNext(input.rng);
    const got = chooseScene(pool, history, u.value);
    if (got) {
      const r = styledCard(input.v, u.seed, input.night, got.scene.motifId, got.scene.composition, input.strokeRef);
      const prev = input.history && input.history.length > 0 ? input.history[input.history.length - 1]! : null;
      const cause = pickCause(input.v, zoneOf(input.v), prev, r.card.flowSeed);
      return { card: { ...r.card, cause, artRev: DREAM_ART_REV }, rng: r.rng, moon: null };
    }
  }
  const r = pickCard(input.v, input.used, input.rng, input.night, input.strokeRef, { moonWindow: moon !== null });
  return { ...r, moon: null };
}

const PHASE_OF_COMPOSITION: readonly MoonNightPhase[] = ['before', 'full', 'after'];

/** 보름 카드의 밤 위상(구도에서 되읽는다 — 세이브에 새 필드 없이 캡션 원인을 다시 계산). 보름 카드가 아니면 null */
export function moonPhaseOfCard(card: Pick<DreamCard, 'motifId' | 'composition'>): MoonNightPhase | null {
  return isMoonMotifId(card.motifId) ? (PHASE_OF_COMPOSITION[card.composition] ?? null) : null;
}

/**
 * 긴 잠 접기(doWake가 밤마다 pendingCard를 덮어쓰는 구조에 맞춘 증분 규칙, dreams-30days 3-5).
 * - 앞 카드가 없으면 이번 카드.
 * - 이번 밤이 보름 카드면 이번 카드(더 늦은 보름 밤이 이긴다).
 * - 앞 카드가 보름 카드이고 이번 밤이 일반 카드면 **보름 모티프·구도를 지킨다**(먹 톤·물결·획은 최신 밤 것).
 * - 둘 다 일반이면 지금 doWake와 같다(이번 카드).
 * - 보름을 지킬 때 일반 밤의 `cause`(원인 말씨)는 지운다.
 * 결과 = '합친 밤 중 가장 늦은 보름 밤'(latestMoonNight)과 같다 — 테스트가 고정한다.
 */
export function mergeNightCard(pending: DreamCard | null, next: DreamCard): DreamCard {
  if (!pending) return next;
  const merged = pending.nightsMerged + 1;
  if (!isMoonMotifId(next.motifId) && isMoonMotifId(pending.motifId)) {
    // 보름을 지키면 일반 밤의 원인 말씨는 버린다(보름 캡션 원인은 구도에서 읽음 — 다음 밤 '직전 말씨' 판정이 왜곡되지 않게, 리뷰 m1)
    const { cause: _drop, ...rest } = next;
    return { ...rest, motifId: pending.motifId, composition: pending.composition, nightsMerged: merged };
  }
  return { ...next, nightsMerged: merged };
}
