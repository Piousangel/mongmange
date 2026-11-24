// 식별자 없는 집계 핑 클라이언트(architecture.md v2.1 3-6·4-1, 처리방침 3-1).
// 보내는 것: 설치일(현지 날짜)·n일째·플랫폼·출시 판(`1.0`)·언어·차원 3개(nt·wg·moon)·앱을 연 날·정해진 사건과 그 날. **그 밖의 값은 없다.**
//  - 기기·계정 id 없음. nt는 설치 순간 game/abGroup.ts가 정한 값을 읽기만 한다(birth.seed와 무관, 통계를 꺼도 군은 있음).
//  - 정밀 시각 없음: 이벤트에는 '일어난 날의 dayN'만 붙는다. 평생 한 번 사건의 날은 **세이브에 기록된 사건 시각**에서 계산한다(B0 리뷰 I3).
//  - 오프라인 아웃박스(`mong.net.outbox`, 최대 128개)에 쌓았다가 다음 핑에 몰아 보낸다. 7일 지난 항목은 버린다.
//  - 중복보다 유실(리뷰 I4): 다시 보내는 것은 **연결 실패**일 때뿐이다. 응답을 받았거나(성공·오류 무관) 10초 제한을 넘기면 '보냄'으로 보고 지운다.
//  - 켜짐 = 서버 주소 있음 AND 사용자 동의(gate.ts — 설정 토글 연결 전에는 늘 거짓). 꺼지면 쌓지도 보내지도 않는다.
//  - 실패는 던지지 않는다. 게임 경로는 이 모듈을 기다리지 않는다.
// 페이로드 모양은 @mong/contract의 pingSchema가 정본이고, 보내기 전에 같은 스키마로 한 번 더 거른다(서버와 같은 판정).
import type { KV } from '@mong/core';
import {
  addDays,
  daysBetween,
  EVENT_MAX_AGE_DAYS,
  localDate,
  ONCE_EVENTS,
  OPEN_EVENT,
  PING_MAX_EVENTS,
  pingSchema,
  type MetricEvent,
  type Ping,
  type PingDims,
  type PingEvent,
} from '@mong/contract';
import { METRICS_OFF_KEY } from './gate';
import { request, type FetchLike } from './http';

export const NET_KEYS = {
  outbox: 'mong.net.outbox',
  /** 마지막으로 '열기'를 기록한 dayN */
  opened: 'mong.net.opened',
  /** 이미 기록한(보낸) 평생 한 번 사건 — 영구 저장 */
  once: 'mong.net.once',
  wg: 'mong.net.wg',
} as const;

/** 아웃박스 상한(넘으면 오래된 것부터 버림) */
export const OUTBOX_MAX = 128;
/** 핑 제한 시간. 게임 경로 밖이라 넉넉히 — 서버는 2초 안에 답한다(요청 안 flush 상한) */
export const PING_TIMEOUT_MS = 10_000;

/** 보내는 날의 맥락 — 세이브에서 계산(contextFromState) */
export interface PingContext {
  cohortDay: string;
  dayN: number;
  /** 세이브의 현지 오프셋(사건 시각 → 날짜 계산용, 서버로 가지 않는다) */
  tzOffsetMin: number;
  platform: Ping['platform'];
  appVer: string;
  lang: Ping['lang'];
}

interface OutboxItem {
  e: MetricEvent;
  dayN: number;
  dims: PingDims;
}

export interface PingClientDeps {
  kv: KV;
  fetch: FetchLike;
  /** 비면 핑 꺼짐 */
  apiBase: string;
  /** 사용자 동의(gate.ts metricsConsent). 거짓이면 핑 꺼짐 */
  consent: () => boolean;
  /** 설치 때 정해 둔 이름 시점 군(game/abGroup.ts). 없으면 보내지 않는다 */
  nameTiming: () => 'A' | 'B' | null;
  /** 그 현지 날짜가 보름 창인가(core 달 위상 함수 — 로드맵 'core 함수' 단계에서 연결, 없으면 늘 false) */
  isMoonWindow?: (localDate: string) => boolean;
  /** 홈 화면에 올라간 위젯 수. 잴 수 없으면 null(위젯 모듈이 없는 바이너리) */
  widgetCount?: () => number | null;
  /** 시험용(기본 PING_TIMEOUT_MS) */
  timeoutMs?: number;
}

/** 세이브 상태 → 맥락. 설치일 = birth.at의 현지 날짜, n일째 = 오늘 − 설치일(같은 현지 오프셋) */
export function contextFromState(
  s: { birth: { at: number }; clock: { tzOffsetMin: number } },
  nowMs: number,
  base: Pick<PingContext, 'platform' | 'appVer' | 'lang'>,
): PingContext | null {
  const tz = s.clock.tzOffsetMin;
  const cohortDay = localDate(s.birth.at, tz);
  const dayN = daysBetween(cohortDay, localDate(nowMs, tz));
  if (!(dayN >= 0 && dayN <= 400)) return null; // 시계가 설치 전으로 돌아갔거나 400일 넘음 → 보내지 않는다
  return { cohortDay, dayN, tzOffsetMin: tz, ...base };
}

/** app.json의 `1.0.0` → 핑의 출시 판 `1.0`(빌드·패치 번호 없음, 리뷰 I2) */
export function releaseVersion(version: string): string {
  const m = /^(\d{1,2})\.(\d{1,2})/.exec(version);
  return m ? `${m[1]}.${m[2]}` : '0.0';
}

function readJson<T>(kv: KV, key: string, fallback: T): T {
  try {
    const raw = kv.getString(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(kv: KV, key: string, v: unknown) {
  try {
    kv.set(key, JSON.stringify(v));
  } catch {
    /* 저장소 실패 — 통계 한 칸을 잃을 뿐이다 */
  }
}

/** 평생 한 번 사건을 뽑는 데 쓰는 세이브 조각 */
export interface OnceSource {
  birth: { at: number; source: string };
  phase: string;
  sleepAt: number | null;
  dayIndex: number;
  bedtimeLocalMin: number;
  ire7LineShown: boolean;
  temperamentLabel: { since: number } | null;
  name: { at: number; firstAt?: number } | null;
  ink: { id: string | null; seeded: boolean; chosenAt: number | null };
  clock: { tzOffsetMin: number };
}

/**
 * 세이브 **상태**에서 이미 일어난 평생 한 번 사건과 그 시각을 뽑는다(리뷰 I3 — 실행 중 전이 관찰 대신).
 * 앱을 닫은 채 첫 밤을 지나 다음 날 boot에서 정산돼도, 세이브 상태만 보면 빠짐없이 나온다.
 *  - first_tap: 첫 탭으로 태어난 개체(birth.source 'tap')의 birth.at. 빌드 1 이관 개체(migrated)는 첫 탭 기록이 없어 내지 않는다
 *  - first_night: 지금 첫 밤이면 sleepAt, 이미 지났으면(dayIndex > 0) 설치 시각 이후 첫 잠 시각(bedtime).
 *    세이브에 '첫 밤 시각' 필드가 없어 sim의 자동 잠 규칙(잠 시각)으로 계산한다 — 잠 시각보다 일찍 재운 밤도 날짜는 대개 같다
 *  - ire7: 결 이름이 정해진 시각(temperamentLabel.since)  - name_set: **처음** 이름을 지은 시각(name.firstAt ?? name.at — 바꿔도 그대로, M2 리뷰 L-3)  - ink_chosen: 유저가 고른 먹의 chosenAt
 */
export function onceEventsFromState(s: OnceSource): Array<{ e: PingEvent; at: number }> {
  const out: Array<{ e: PingEvent; at: number }> = [];
  if (s.birth.source === 'tap') out.push({ e: 'first_tap', at: s.birth.at });
  if (s.dayIndex === 0 && s.phase === 'asleep' && s.sleepAt !== null) out.push({ e: 'first_night', at: s.sleepAt });
  else if (s.dayIndex > 0) out.push({ e: 'first_night', at: firstBedtimeAfter(s.birth.at, s.bedtimeLocalMin, s.clock.tzOffsetMin) });
  if (s.ire7LineShown && s.temperamentLabel) out.push({ e: 'ire7', at: s.temperamentLabel.since });
  if (s.name) out.push({ e: 'name_set', at: s.name.firstAt ?? s.name.at });
  if (s.ink.id !== null && !s.ink.seeded && s.ink.chosenAt !== null) out.push({ e: 'ink_chosen', at: s.ink.chosenAt });
  return out;
}

/** 설치 시각 이후 첫 잠 시각(현지 분 bedtimeLocalMin). 오늘 잠 시각이 이미 지났으면 설치 시각(그 밤 안에 설치) */
function firstBedtimeAfter(at: number, bedtimeLocalMin: number, tz: number): number {
  const local = at + tz * 60_000;
  const dayStart = local - (((local % 86_400_000) + 86_400_000) % 86_400_000);
  const bedLocal = dayStart + bedtimeLocalMin * 60_000;
  return bedLocal >= local ? bedLocal - tz * 60_000 : at;
}

export function createPingClient(deps: PingClientDeps) {
  const { kv } = deps;
  let inflight: Promise<void> | null = null;

  const enabled = () => deps.apiBase !== '' && deps.consent() && deps.nameTiming() !== null;

  /** dayN 7 이후 첫 기록 때 한 번 재서 고정. 7일째 전 칸은 '-'. 잴 수 없는 기기는 '-'로 고정 */
  function wg(dayN: number): PingDims['wg'] {
    if (dayN < 7) return '-';
    const v = kv.getString(NET_KEYS.wg);
    if (v === '0' || v === '1' || v === '-') return v;
    const n = deps.widgetCount?.() ?? null;
    const fixed = n === null ? '-' : n > 0 ? '1' : '0';
    kv.set(NET_KEYS.wg, fixed);
    return fixed;
  }

  function dimsFor(ctx: PingContext, dayN: number): PingDims {
    return { nt: deps.nameTiming()!, wg: wg(dayN), moon: deps.isMoonWindow?.(addDays(ctx.cohortDay, dayN)) ? '1' : '0' };
  }

  function enqueue(item: OutboxItem) {
    const box = readJson<OutboxItem[]>(kv, NET_KEYS.outbox, []);
    box.push(item);
    writeJson(kv, NET_KEYS.outbox, box.slice(-OUTBOX_MAX));
  }

  return {
    enabled,

    /** 설정 '이용 통계 보내기'(토글 연결은 C 항목). 끄면 쌓인 것도 버린다(끈 뒤에 나가는 핑이 없게) */
    setEnabled(on: boolean) {
      if (on) kv.remove(METRICS_OFF_KEY);
      else {
        kv.set(METRICS_OFF_KEY, '1');
        kv.remove(NET_KEYS.outbox);
      }
    },

    /** 하루 첫 실행: 같은 dayN은 기기에서 한 번만 */
    recordOpen(ctx: PingContext): boolean {
      if (!enabled()) return false;
      const last = Number(kv.getString(NET_KEYS.opened) ?? '-1');
      if (Number.isFinite(last) && last >= ctx.dayN) return false;
      kv.set(NET_KEYS.opened, String(ctx.dayN));
      enqueue({ e: OPEN_EVENT, dayN: ctx.dayN, dims: dimsFor(ctx, ctx.dayN) });
      return true;
    },

    /**
     * 세이브 상태의 평생 한 번 사건을 아웃박스에 넣는다(이미 넣은 것은 영구 표시로 건너뜀). 날짜는 사건 시각의 현지 날짜.
     * 7일보다 오래된 사건(예: 핑이 든 빌드 전에 일어난 일)은 보내지 않고 '보냄'으로만 표시한다 — 서버도 받지 않는 범위다.
     * @returns 새로 넣은 개수
     */
    syncOnce(s: OnceSource, ctx: PingContext): number {
      if (!enabled()) return 0;
      const sent = new Set(readJson<string[]>(kv, NET_KEYS.once, []));
      let added = 0;
      for (const { e, at } of onceEventsFromState(s)) {
        if (sent.has(e)) continue;
        sent.add(e);
        const dayN = daysBetween(ctx.cohortDay, localDate(at, ctx.tzOffsetMin));
        if (dayN < 0 || dayN > ctx.dayN || dayN < ctx.dayN - EVENT_MAX_AGE_DAYS) continue;
        enqueue({ e, dayN, dims: dimsFor(ctx, dayN) });
        added++;
      }
      writeJson(kv, NET_KEYS.once, [...sent]);
      return added;
    },

    /** 반복 사건(share_*·restore_ok). 평생 한 번 사건은 syncOnce로만 */
    track(e: PingEvent, ctx: PingContext) {
      if (!enabled() || ONCE_EVENTS.includes(e)) return;
      enqueue({ e, dayN: ctx.dayN, dims: dimsFor(ctx, ctx.dayN) });
    },

    /** 아웃박스를 보낸다. 동시에 두 번 돌지 않는다 */
    flush(ctx: PingContext): Promise<void> {
      if (!enabled()) return Promise.resolve();
      inflight ??= sendAll(ctx).finally(() => {
        inflight = null;
      });
      return inflight;
    },
  };

  async function sendAll(ctx: PingContext) {
    // 7일 지난 것·시계가 되돌아가 '미래'가 된 것은 버린다
    const box = readJson<OutboxItem[]>(kv, NET_KEYS.outbox, []).filter((i) => i.dayN <= ctx.dayN && i.dayN >= ctx.dayN - EVENT_MAX_AGE_DAYS);
    writeJson(kv, NET_KEYS.outbox, box);
    const done: OutboxItem[] = [];
    for (const ping of buildPings(ctx, box)) {
      const parsed = pingSchema.safeParse(ping.body);
      if (!parsed.success) {
        done.push(...ping.items); // 우리 버그로 생긴 모양 — 보내지 않고 버린다
        continue;
      }
      const r = await request(
        deps.fetch,
        `${deps.apiBase}/api/v1/ping`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(parsed.data) },
        deps.timeoutMs ?? PING_TIMEOUT_MS,
      );
      if (r.kind === 'network') break; // 안 닿았다 → 남은 것은 다음 기회에
      done.push(...ping.items); // 응답을 받았거나 시간 초과 → 서버가 셌을 수 있으므로 다시 보내지 않는다
    }
    if (!done.length) return;
    // 보내는 사이 새로 쌓인 항목은 남기고, 처리한 항목만 하나씩 지운다(같은 모양이 여럿이어도 개수만큼만)
    const rest = readJson<OutboxItem[]>(kv, NET_KEYS.outbox, []);
    for (const d of done) {
      const at = rest.findIndex((i) => same(i, d));
      if (at >= 0) rest.splice(at, 1);
    }
    writeJson(kv, NET_KEYS.outbox, rest);
  }
}

function same(a: OutboxItem, b: OutboxItem) {
  return a.e === b.e && a.dayN === b.dayN && a.dims.nt === b.dims.nt && a.dims.wg === b.dims.wg && a.dims.moon === b.dims.moon;
}

/** 아웃박스 → 핑 목록. 같은 차원끼리 묶고 핑 하나에 이벤트 최대 32개 */
export function buildPings(ctx: PingContext, box: readonly OutboxItem[]): Array<{ body: Ping; items: OutboxItem[] }> {
  const groups = new Map<string, OutboxItem[]>();
  for (const i of box) {
    const k = `${i.dims.nt}${i.dims.wg}${i.dims.moon}`;
    groups.set(k, [...(groups.get(k) ?? []), i]);
  }
  const out: Array<{ body: Ping; items: OutboxItem[] }> = [];
  for (const items of groups.values()) {
    for (let s = 0; s < items.length; s += PING_MAX_EVENTS) {
      const chunk = items.slice(s, s + PING_MAX_EVENTS);
      out.push({
        items: chunk,
        body: {
          cohortDay: ctx.cohortDay,
          dayN: ctx.dayN,
          platform: ctx.platform,
          appVer: ctx.appVer,
          lang: ctx.lang,
          dims: chunk[0]!.dims,
          events: chunk.map((i) => ({ e: i.e, dayN: i.dayN })),
        },
      });
    }
  }
  return out;
}
