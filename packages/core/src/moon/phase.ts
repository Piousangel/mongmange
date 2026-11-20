// 보름밤 창(기획 v2.3 2-6, 시스템 v1.4 4.1, dreams-30days v1.1 4-1). 순수 함수 — 시계·시간대는 인자로만 받는다.
//
// 알고리즘: Jean Meeus, "Astronomical Algorithms" 2판(1998) 49장 '달의 위상' — 평균 위상(49.1) + 보름 주기 보정 25항
//            + 모든 위상 공통 행성 보정 A1~A14. 결과는 역학시(JDE, TT)라 델타 T(TT−UT)를 빼서 UT로 바꾼다.
// 오차: Meeus는 이 식의 오차를 1분 안쪽으로 든다. 이 저장소에서 미 해군 천문대(USNO) 2026~2028 보름 38개와 맞춰 본
//       최대 차이는 test/moon-phase.test.ts가 고정한다(±1분 — USNO 값이 분 단위로 반올림돼 있어 그 이하는 판정 불가).
//       델타 T는 2026년 관측값 근처의 상수 69초로 둔다(2000~2100에서 수십 초~1분대 차이 — 날짜 판정에는 보름이 현지 자정 1~2분 안일 때만 영향).
// 날짜 규칙: '보름 당일' = 보름 순간(UT)을 **기기 현지 시간대**로 바꾼 달력 날짜. 창 = 그 전날·당일·다음 날의 '밤'.
//            '밤의 날짜'(팀 결정 11-20, D-25 개정) = 그 밤이 시작된 저녁의 현지 날짜. 재우기 시각이 현지 04:00
//            (`NIGHT_DAY_BOUNDARY_MIN`)보다 이르면 전날로 센다 — `nightDateOf`. 시스템 3.2의 하루 경계는 '잠 한 번'이라
//            시계 값이 없어서 팀 기본값 04:00을 쓴다(아침 시각은 유저마다 달라 야간 근무자 등에서 날짜가 흔들린다).
//            UTC 날짜를 쓰지 않는다 — 2027-02-20 23:23 UTC 보름은 서울·시드니·오클랜드에서 02-21이다.
// 지원 범위: 1900~2100년. 델타 T를 상수로 둔 근거가 이 범위다(양 끝에서 1~2분 오차로 커진다). 그 밖도 값은 내지만 보증하지 않는다.
// 알려진 한계(서머타임): 한 오프셋으로 보름 순간과 밤 날짜를 함께 바꾼다. 사흘 창 안에 서머타임 전환이 있고 보름이 현지 자정
//            1시간 안이면 하루 어긋날 수 있다(2026~2028 미·EU·호주·NZ 전환일에는 해당 없음 — C4 리뷰 m1).
// 부동소수: 기기 간 Math.sin 차이는 ulp 수준(JDE 약 50µs)이라 보름이 현지 자정 ±수 ms일 때만 갈린다. 2026~2028 실제 최근접은
//            2027-05-20 통가(+13) 자정 1분 전(C4 리뷰 m3) — 예외 표 없이 둔다.
// 화면에 숫자를 내지 않는다(기획 2-6): 이 모듈의 값은 판정·구도·월 귀속에만 쓴다.

const DAY_MS = 86_400_000;
/** 율리우스일 2440587.5 = 1970-01-01T00:00Z */
const JD_UNIX_EPOCH = 2440587.5;
/** 델타 T = TT − UT(초). 2026년 IERS 관측 약 69초 */
const DELTA_T_SEC = 69;
const SYNODIC = 29.530588861;
const RAD = Math.PI / 180;
/** 실제 시간대 오프셋 범위(분): UTC−12 ~ UTC+14 */
export const TZ_OFFSET_MIN_RANGE = [-720, 840] as const;
/** 밤의 날짜 경계(현지 분). 이보다 이른 재우기는 전날 밤 */
export const NIGHT_DAY_BOUNDARY_MIN = 240;

/**
 * 오프셋 정규화: 범위 밖은 **가까운 끝으로 자른다(clamp)**. 던지지 않는 까닭 — 이 함수는 reduce(아침 카드)의 경로라
 * 예외는 아침 현상 자체를 멈춘다(P1). 실제 기기는 범위 밖 오프셋을 내지 않으므로 clamp는 손상 입력에서만 일하고,
 * 그때도 결정적인 가장 가까운 답을 낸다. 숫자가 아니면(NaN·Infinity) null — 판정하지 않는다.
 */
export function normalizeTzOffset(tzOffsetMin: number): number | null {
  if (!Number.isFinite(tzOffsetMin)) return null;
  return Math.min(TZ_OFFSET_MIN_RANGE[1], Math.max(TZ_OFFSET_MIN_RANGE[0], Math.round(tzOffsetMin)));
}

export type MoonNightPhase = 'before' | 'full' | 'after';

export interface MoonNight {
  /** 전날(차오름)·당일(가득)·다음 날(기욺) — 캡션 원인 키 `caption.moon.cause.{phase}` */
  phase: MoonNightPhase;
  /** 보름 카드 구도: 전날 a=0, 당일 b=1, 다음 날 c=2 (4-1 '밤으로 고정') */
  composition: 0 | 1 | 2;
  /** 보름 당일의 현지 날짜 YYYY-MM-DD */
  fullDate: string;
  /** 월 귀속 = 당일 밤의 현지 월 1..12. 사흘이 월 경계에 걸쳐도 셋이 같다 */
  month: number;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** YYYY-MM-DD가 실제 있는 날짜인가 */
export function isLocalDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
}

/** ms 시각 + 현지 오프셋(분, 동쪽 +, 서울 540) → 현지 날짜 YYYY-MM-DD */
export function localDateOf(ms: number, tzOffsetMin: number): string {
  return new Date(ms + tzOffsetMin * 60_000).toISOString().slice(0, 10);
}

/**
 * 밤의 날짜: 재우기 시각(ms) + 현지 오프셋 → 그 밤이 시작된 저녁의 현지 날짜. 현지 04:00 전이면 전날.
 * 예: 01-22 23:59 → 01-22, 01-23 00:30·03:59 → 01-22, 01-23 04:00 → 01-23.
 */
export function nightDateOf(sleepAtMs: number, tzOffsetMin: number): string | null {
  const off = normalizeTzOffset(tzOffsetMin);
  if (off === null || !Number.isFinite(sleepAtMs)) return null;
  return localDateOf(sleepAtMs - NIGHT_DAY_BOUNDARY_MIN * 60_000, off);
}

/** 날짜 산술(UTC 달력 — 시간대와 무관) */
export function addLocalDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

function sin(deg: number): number {
  return Math.sin(deg * RAD);
}

/**
 * k번째 보름의 역학시 JDE(Meeus 49장). k = 정수 + 0.5(보름), k = 0.5는 2000-01-21 무렵.
 */
export function fullMoonJde(k: number): number {
  const T = k / 1236.85;
  const T2 = T * T;
  const T3 = T2 * T;
  const T4 = T3 * T;
  const jde = 2451550.09766 + SYNODIC * k + 0.00015437 * T2 - 0.00000015 * T3 + 0.00000000073 * T4;
  const E = 1 - 0.002516 * T - 0.0000074 * T2;
  const M = 2.5534 + 29.1053567 * k - 0.0000014 * T2 - 0.00000011 * T3;
  const Mp = 201.5643 + 385.81693528 * k + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T4;
  const F = 160.7108 + 390.67050284 * k - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T4;
  const O = 124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3;

  // 보름 보정(Meeus 49장 표, Full Moon 열)
  const corr =
    -0.40614 * sin(Mp) +
    0.17302 * E * sin(M) +
    0.01614 * sin(2 * Mp) +
    0.01043 * sin(2 * F) +
    0.00734 * E * sin(Mp - M) -
    0.00515 * E * sin(Mp + M) +
    0.00209 * E * E * sin(2 * M) -
    0.00111 * sin(Mp - 2 * F) -
    0.00057 * sin(Mp + 2 * F) +
    0.00056 * E * sin(2 * Mp + M) -
    0.00042 * sin(3 * Mp) +
    0.00042 * E * sin(M + 2 * F) +
    0.00038 * E * sin(M - 2 * F) -
    0.00024 * E * sin(2 * Mp - M) -
    0.00017 * sin(O) -
    0.00007 * sin(Mp + 2 * M) +
    0.00004 * sin(2 * Mp - 2 * F) +
    0.00004 * sin(3 * M) +
    0.00003 * sin(Mp + M - 2 * F) +
    0.00003 * sin(2 * Mp + 2 * F) -
    0.00003 * sin(Mp + M + 2 * F) +
    0.00003 * sin(Mp - M + 2 * F) -
    0.00002 * sin(Mp - M - 2 * F) -
    0.00002 * sin(3 * Mp + M) +
    0.00002 * sin(4 * Mp);

  // 모든 위상 공통 보정 A1~A14
  const planetary =
    0.000325 * sin(299.77 + 0.107408 * k - 0.009173 * T2) +
    0.000165 * sin(251.88 + 0.016321 * k) +
    0.000164 * sin(251.83 + 26.651886 * k) +
    0.000126 * sin(349.42 + 36.412478 * k) +
    0.00011 * sin(84.66 + 18.206239 * k) +
    0.000062 * sin(141.74 + 53.303771 * k) +
    0.00006 * sin(207.14 + 2.453732 * k) +
    0.000056 * sin(154.84 + 7.30686 * k) +
    0.000047 * sin(34.52 + 27.261239 * k) +
    0.000042 * sin(207.19 + 0.121824 * k) +
    0.00004 * sin(291.34 + 1.844379 * k) +
    0.000037 * sin(161.72 + 24.198154 * k) +
    0.000035 * sin(239.56 + 25.513099 * k) +
    0.000023 * sin(331.55 + 3.592518 * k);

  return jde + corr + planetary;
}

/** k번째 보름의 UT 시각(ms, epoch) */
export function fullMoonUtcMs(k: number): number {
  return (fullMoonJde(k) - JD_UNIX_EPOCH) * DAY_MS - DELTA_T_SEC * 1000;
}

/** 시각 ms에 가장 가까운 보름의 k(정수 + 0.5) */
function nearestFullMoonK(ms: number): number {
  const jd = ms / DAY_MS + JD_UNIX_EPOCH;
  return Math.round((jd - 2451550.09766) / SYNODIC - 0.5) + 0.5;
}

/** 현지 날짜 date(오프셋 tzOffsetMin)를 '보름 당일'로 갖는 보름이 있으면 그 UT 시각 */
function fullMoonOnLocalDate(date: string, tzOffsetMin: number): number | null {
  // 그 날 현지 정오 = 기준 시각. 가장 가까운 보름과 그 양옆만 보면 된다(삭망월 29.5일)
  const noon = Date.parse(`${date}T12:00:00Z`) - tzOffsetMin * 60_000;
  const k0 = nearestFullMoonK(noon);
  for (const k of [k0 - 1, k0, k0 + 1]) {
    const ms = fullMoonUtcMs(k);
    if (localDateOf(ms, tzOffsetMin) === date) return ms;
  }
  return null;
}

/**
 * 그 밤(밤이 시작된 저녁의 현지 날짜)이 보름 창이면 위상·구도·월 귀속을, 아니면 null.
 * @param nightDate 밤의 날짜 YYYY-MM-DD(`nightDateOf`로 구한다)
 * @param tzOffsetMin 기기 현지 오프셋(분, 동쪽 +). 범위 밖은 clamp(`normalizeTzOffset`). 서머타임은 위 '알려진 한계'
 */
export function moonNightOf(nightDate: string, tzOffsetMinIn: number): MoonNight | null {
  const tzOffsetMin = normalizeTzOffset(tzOffsetMinIn);
  if (!isLocalDate(nightDate) || tzOffsetMin === null) return null;
  const steps: readonly [MoonNightPhase, 0 | 1 | 2, number][] = [
    ['full', 1, 0],
    ['before', 0, 1],
    ['after', 2, -1],
  ];
  for (const [phase, composition, shift] of steps) {
    const fullDate = addLocalDays(nightDate, shift);
    if (fullMoonOnLocalDate(fullDate, tzOffsetMin) !== null) {
      return { phase, composition, fullDate, month: Number(fullDate.slice(5, 7)) };
    }
  }
  return null;
}

/** 보름 창(전날·당일·다음 날)인가 — 집계 핑 차원 `moon`도 이 함수로 정한다(시스템 4.1) */
export function isMoonWindow(nightDate: string, tzOffsetMin: number): boolean {
  return moonNightOf(nightDate, tzOffsetMin) !== null;
}

/**
 * 긴 잠으로 여러 밤이 한 장에 합쳐졌을 때: 합친 밤 중 **가장 늦은 보름 밤**(dreams-30days 3-5).
 * 날짜 순서와 무관하게 가장 늦은 날짜를 고른다.
 */
export function latestMoonNight(nightDates: readonly string[], tzOffsetMin: number): MoonNight | null {
  let best: { date: string; night: MoonNight } | null = null;
  for (const d of nightDates) {
    const n = moonNightOf(d, tzOffsetMin);
    if (n && (best === null || d > best.date)) best = { date: d, night: n };
  }
  return best?.night ?? null;
}

/** 현지 연도 year의 보름 당일 날짜 목록(오름차순). 기획·아트 일정 확인과 테스트용 */
export function fullMoonDatesOfYear(year: number, tzOffsetMinIn: number): string[] {
  const tzOffsetMin = normalizeTzOffset(tzOffsetMinIn);
  if (tzOffsetMin === null || !Number.isInteger(year) || year < 1 || year > 9999) return [];
  const start = Date.parse(`${String(year).padStart(4, '0')}-01-01T00:00:00Z`) - tzOffsetMin * 60_000;
  const out: string[] = [];
  for (let k = nearestFullMoonK(start) - 1; ; k++) {
    const d = localDateOf(fullMoonUtcMs(k), tzOffsetMin);
    const y = Number(d.slice(0, 4));
    if (y > year) break;
    if (y === year) out.push(d);
  }
  return out;
}
