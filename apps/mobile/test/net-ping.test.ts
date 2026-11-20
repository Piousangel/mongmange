// 집계 핑 클라이언트(B0) — 오프라인 큐·배치·재전송 규칙·끄기·평생 한 번 사건, 그리고 그럴듯한 오답 판별(OPERATING 8-1):
// 실제 세이브(서로 다른 씨앗·시각)에서 만든 핑에 세이브 씨앗·인장 씨앗·ms 시각이 **한 글자도** 섞이면 실패한다.
import { sim } from '@mong/core';
import { pingSchema } from '@mong/contract';
import { beforeEach, describe, expect, it } from 'vitest';
import type { FetchLike } from '../src/net/http';
import {
  buildPings,
  contextFromState,
  createPingClient,
  NET_KEYS,
  onceEventsFromState,
  OUTBOX_MAX,
  PING_TIMEOUT_MS,
  releaseVersion,
  type PingContext,
} from '../src/net/ping';

function memKV() {
  const m = new Map<string, string>();
  return { getString: (k: string) => m.get(k), set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k), m };
}

type Reply = number | 'network' | 'hang';
type Sent = { url: string; body: unknown };
function fakeFetch(replies: Reply[] = []) {
  const sent: Sent[] = [];
  const f: FetchLike = async (url, init) => {
    const r = replies.length ? replies.shift()! : 204;
    if (r === 'network') throw new TypeError('Network request failed'); // 안 닿음 — 서버는 못 봤다
    sent.push({ url, body: JSON.parse(init!.body!) }); // 서버에 닿음
    if (r === 'hang') {
      // 서버가 받았지만 응답이 늦음 → 클라이언트 제한 시간이 끊는다
      return new Promise((_, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('aborted'))));
    }
    return { ok: r >= 200 && r < 300, status: r, text: async () => '' };
  };
  return { f, sent };
}

const base = { platform: 'android', appVer: '1.0', lang: 'ko' } as const;
const ctx = (dayN: number): PingContext => ({ cohortDay: '2026-12-22', dayN, tzOffsetMin: 540, ...base });

let kv: ReturnType<typeof memKV>;
beforeEach(() => {
  kv = memKV();
});

function client(fetchFn: FetchLike, extra: Partial<Parameters<typeof createPingClient>[0]> = {}) {
  return createPingClient({ kv, fetch: fetchFn, apiBase: 'http://api.test', consent: () => true, nameTiming: () => 'A', ...extra });
}

describe('핑 켜짐 조건', () => {
  it('API 주소가 비면 아무것도 쌓지도 보내지도 않는다', async () => {
    const { f, sent } = fakeFetch();
    const c = client(f, { apiBase: '' });
    c.recordOpen(ctx(0));
    c.track('share_link', ctx(0));
    await c.flush(ctx(0));
    expect(sent).toHaveLength(0);
    expect(kv.m.size).toBe(0);
  });
  it('주소가 있어도 동의가 거짓이면 아무것도 하지 않는다', async () => {
    const { f, sent } = fakeFetch();
    const c = client(f, { consent: () => false });
    c.recordOpen(ctx(0));
    expect(c.syncOnce(sim.createInitial(Date.UTC(2026, 11, 22, 3), 540, 1), ctx(0))).toBe(0);
    await c.flush(ctx(0));
    expect(sent).toHaveLength(0);
    expect(kv.m.size).toBe(0);
  });
  it('이름 A/B 군이 없으면(설치 전) 보내지 않는다 — 핑 클라이언트는 군을 만들지 않는다', () => {
    const { f } = fakeFetch();
    expect(client(f, { nameTiming: () => null }).recordOpen(ctx(0))).toBe(false);
  });
});

describe('핑 클라이언트', () => {
  it('appVer = 출시 판(빌드·패치 번호 없음)', () => {
    expect(releaseVersion('1.0.0')).toBe('1.0');
    expect(releaseVersion('1.12.3')).toBe('1.12');
  });

  it('열기는 같은 dayN에 한 번, 반복 사건은 여러 번, 평생 한 번 사건은 track으로 못 넣는다', async () => {
    const { f, sent } = fakeFetch();
    const c = client(f);
    expect(c.recordOpen(ctx(0))).toBe(true);
    expect(c.recordOpen(ctx(0))).toBe(false);
    c.track('share_image', ctx(0));
    c.track('share_image', ctx(0));
    c.track('first_tap', ctx(0)); // syncOnce로만
    await c.flush(ctx(0));
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe('http://api.test/api/v1/ping');
    expect((sent[0]!.body as { events: unknown[] }).events).toEqual([
      { e: 'open', dayN: 0 },
      { e: 'share_image', dayN: 0 },
      { e: 'share_image', dayN: 0 },
    ]);
    expect(kv.getString(NET_KEYS.outbox)).toBe('[]');
  });

  it('오프라인(연결 실패): 아웃박스에 남았다가 다음 날 핑에 그날 dayN 그대로 실린다', async () => {
    const { f, sent } = fakeFetch(['network', 204]);
    const c = client(f);
    c.recordOpen(ctx(2));
    c.track('share_link', ctx(2));
    await c.flush(ctx(2));
    expect(sent).toHaveLength(0);
    c.recordOpen(ctx(3));
    await c.flush(ctx(3));
    expect(sent).toHaveLength(1);
    const body = pingSchema.parse(sent[0]!.body);
    expect(body.dayN).toBe(3);
    expect(body.events).toEqual([
      { e: 'open', dayN: 2 },
      { e: 'share_link', dayN: 2 },
      { e: 'open', dayN: 3 },
    ]);
  });

  // 리뷰 I4: 중복보다 유실 — 서버에 닿았을 수 있는 경우는 다시 보내지 않는다
  it('재전송은 연결 실패뿐: 4xx·5xx·429 응답은 다시 보내지 않는다', async () => {
    for (const status of [400, 500, 503, 429]) {
      kv = memKV();
      const { f, sent } = fakeFetch([status, 204]);
      const c = client(f);
      c.recordOpen(ctx(1));
      await c.flush(ctx(1));
      await c.flush(ctx(1));
      expect(sent, `status ${status}`).toHaveLength(1);
      expect(kv.getString(NET_KEYS.outbox)).toBe('[]');
    }
  });

  it('시간 초과(서버는 받았을 수 있음)는 보낸 것으로 보고 다시 보내지 않는다 — 같은 열기가 두 번 세어지지 않는다', async () => {
    expect(PING_TIMEOUT_MS).toBe(10_000); // 서버 응답 상한(2초)보다 넉넉히
    const { f, sent } = fakeFetch(['hang', 204]);
    const c = client(f, { timeoutMs: 50 });
    c.recordOpen(ctx(1));
    await c.flush(ctx(1));
    await c.flush(ctx(1));
    expect(sent).toHaveLength(1);
    expect(kv.getString(NET_KEYS.outbox)).toBe('[]');
  });

  it('7일 지난 항목은 보내지 않고 버린다', async () => {
    const { f, sent } = fakeFetch(['network']);
    const c = client(f);
    c.track('share_link', ctx(1));
    await c.flush(ctx(1));
    expect(JSON.parse(kv.getString(NET_KEYS.outbox)!)).toHaveLength(1);
    await c.flush(ctx(9)); // 1 + 7 < 9
    expect(JSON.parse(kv.getString(NET_KEYS.outbox)!)).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it('끄기(설정 토글용 setEnabled): 쌓인 것도 지운다', () => {
    const { f } = fakeFetch();
    const c = client(f);
    c.recordOpen(ctx(0));
    c.setEnabled(false);
    expect(kv.getString(NET_KEYS.outbox)).toBeUndefined();
  });

  it('아웃박스 상한·배치: 차원이 다르면 다른 핑, 핑 하나에 이벤트 32개까지', () => {
    type Item = Parameters<typeof buildPings>[1][number];
    const items: Item[] = Array.from({ length: 40 }, () => ({ e: 'share_link', dayN: 8, dims: { nt: 'A', wg: '1', moon: '0' } }));
    items.push({ e: 'share_link', dayN: 8, dims: { nt: 'A', wg: '1', moon: '1' } });
    const pings = buildPings(ctx(8), items);
    expect(pings.map((p) => p.body.events.length)).toEqual([32, 8, 1]);
    for (const p of pings) expect(pingSchema.safeParse(p.body).success).toBe(true);

    const { f } = fakeFetch();
    const c = client(f);
    for (let i = 0; i < OUTBOX_MAX + 10; i++) c.track('share_link', ctx(0));
    expect(JSON.parse(kv.getString(NET_KEYS.outbox)!)).toHaveLength(OUTBOX_MAX);
  });

  it('차원: nt는 설치 때 정한 값 그대로, wg는 7일째 한 번 재서 고정(그 전 "-"), moon은 그날 날짜로', async () => {
    let widgets: number | null = 1;
    const { f, sent } = fakeFetch();
    const moonDays = new Set(['2026-12-29']);
    const c = client(f, { nameTiming: () => 'B', widgetCount: () => widgets, isMoonWindow: (d) => moonDays.has(d) });
    c.recordOpen(ctx(6));
    c.recordOpen(ctx(7)); // 12-29 = 보름 창
    widgets = 0; // 떼도 바뀌지 않는다
    c.recordOpen(ctx(8));
    await c.flush(ctx(8));
    const dims = sent.map((s) => pingSchema.parse(s.body).dims);
    expect(dims).toEqual([
      { nt: 'B', wg: '-', moon: '0' },
      { nt: 'B', wg: '1', moon: '1' },
      { nt: 'B', wg: '1', moon: '0' },
    ]);
  });
});

describe('평생 한 번 사건 — 세이브 상태에서(리뷰 I3)', () => {
  const T0 = Date.UTC(2026, 11, 22, 3, 0); // 서울 12-22 12:00
  const H = 3_600_000;

  it('앱을 닫은 채 첫 밤을 지나 다음 날 boot: first_tap·first_night가 설치일(dayN 0)로 한 번씩', async () => {
    let s = sim.createInitial(T0, 540, 7, { birth: { x: 0.1, y: 0.2, ms: T0, installAt: T0, entropy: 12345 } });
    s = sim.reduce(s, { type: 'appBackground', at: T0 + H }).state; // 낮에 닫음
    s = sim.reduce(s, { type: 'appForeground', at: T0 + 22 * H, tzOffsetMin: 540 }).state; // 다음 날 아침 10시에 엶 → boot 정산
    expect(s.dayIndex).toBeGreaterThan(0); // 정산으로 첫 밤이 지나갔다
    expect(s.sleepAt).toBeNull();

    const { f, sent } = fakeFetch();
    const c = client(f);
    const cx = contextFromState(s, T0 + 22 * H, base)!;
    expect(cx.dayN).toBe(1);
    expect(c.syncOnce(s, cx)).toBe(2);
    expect(c.syncOnce(s, cx)).toBe(0); // 영구 '보냄' 표시
    await c.flush(cx);
    const events = sent.flatMap((x) => pingSchema.parse(x.body).events);
    expect(events).toEqual([
      { e: 'first_tap', dayN: 0 },
      { e: 'first_night', dayN: 0 },
    ]);
    // 새 실행(새 클라이언트, 같은 저장소)에서도 다시 나가지 않는다
    expect(client(f).syncOnce(s, cx)).toBe(0);
  });

  it('지금 첫 밤이면 잠든 시각의 날, 이름·먹·결 이름은 세이브에 기록된 시각의 날', () => {
    const s0 = sim.createInitial(T0, 540, 7, { birth: { x: 0, y: 0, ms: T0, installAt: T0, entropy: 1 } });
    const asleep = { ...s0, phase: 'asleep', sleepAt: T0 + 11 * H } as typeof s0; // 서울 12-22 23:00
    expect(onceEventsFromState(asleep).map((e) => e.e)).toEqual(['first_tap', 'first_night']);
    const later = {
      ...s0,
      dayIndex: 8,
      name: { text: '먹이', at: T0 + 2 * 24 * H },
      ink: { ...s0.ink, id: 'songyeon', seeded: false, chosenAt: T0 + 5 * H },
      ire7LineShown: true,
      temperamentLabel: { axis: 'tempo', sign: 1, since: T0 + 7 * 24 * H },
    } as unknown as typeof s0;
    const cx = contextFromState(later, T0 + 7 * 24 * H + H, base)!; // 7일째 — 0일째 사건도 아직 7일 안
    const { f } = fakeFetch();
    const c = client(f);
    c.syncOnce(later, cx);
    const box = JSON.parse(kv.getString(NET_KEYS.outbox)!) as Array<{ e: string; dayN: number }>;
    expect(Object.fromEntries(box.map((b) => [b.e, b.dayN]))).toEqual({ first_tap: 0, first_night: 0, ire7: 7, name_set: 2, ink_chosen: 0 });
  });

  it('씨앗이 정한 먹·이관 개체의 첫 탭은 사건이 아니고, 7일보다 오래된 사건은 보내지 않고 표시만 한다', () => {
    const s0 = sim.createInitial(T0, 540, 7, { birth: { x: 0, y: 0, ms: T0, installAt: T0, entropy: 1 } });
    const migrated = { ...s0, birth: { ...s0.birth, source: 'migrated' }, ink: { ...s0.ink, id: 'songyeon', seeded: true, chosenAt: T0 } } as typeof s0;
    expect(onceEventsFromState(migrated).map((e) => e.e)).toEqual([]);
    const { f } = fakeFetch();
    const c = client(f);
    expect(c.syncOnce(s0, contextFromState(s0, T0 + 20 * 24 * H, base)!)).toBe(0);
    expect(JSON.parse(kv.getString(NET_KEYS.once)!)).toEqual(['first_tap']);
  });
});

describe('그럴듯한 오답 판별 — 핑에 식별 가능한 값이 섞이지 않는다', () => {
  it('서로 다른 씨앗·설치 시각의 세이브 200개: 보낸 핑 어디에도 씨앗·인장 씨앗·ms 시각이 없고 키는 정본 7개뿐', async () => {
    for (let i = 0; i < 200; i++) {
      kv = memKV();
      const at = Date.UTC(2026, 11, 22) + i * 7_919_311; // 서로 다른 설치 시각(ms)
      const s = sim.createInitial(at, 540, 1000 + i * 7919, { birth: { x: 0.1 * i, y: -0.2, ms: at, installAt: at, entropy: (i * 2654435761) >>> 0 } });
      const now = at + 3 * 86_400_000 + 12_345;
      const c = contextFromState(s, now, base)!;
      const { f, sent } = fakeFetch();
      const pc = client(f, { nameTiming: () => (i % 2 ? 'A' : 'B') });
      pc.recordOpen(c);
      pc.syncOnce(s, c);
      pc.track('share_image', c);
      await pc.flush(c);
      expect(sent.length).toBe(1);
      const body = sent[0]!.body as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual(['appVer', 'cohortDay', 'dayN', 'dims', 'events', 'lang', 'platform']);
      expect(pingSchema.safeParse(body).success).toBe(true);
      const text = JSON.stringify(body);
      for (const secret of [s.birth.seed, s.birth.sealSeed, s.rng, at, now, s.createdAt]) {
        expect(text, `씨앗·시각 ${secret}가 핑에 있음`).not.toContain(String(secret));
      }
      expect(text).not.toMatch(/\d{6,}/); // 6자리 이상 숫자 = 시각·씨앗 단서. 핑의 숫자는 날짜·dayN·판 번호뿐
    }
  });
});
