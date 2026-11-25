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
  PING_USER_AGENT,
  RETRY_BASE_MS,
  RETRY_MAX_MS,
  releaseVersion,
  type PingContext,
} from '../src/net/ping';

function memKV() {
  const m = new Map<string, string>();
  return { getString: (k: string) => m.get(k), set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k), m };
}

type Reply = number | 'network' | 'hang';
type Sent = { url: string; body: unknown; method?: string; headers?: Record<string, string> };
function fakeFetch(replies: Reply[] = []) {
  const sent: Sent[] = [];
  const f: FetchLike = async (url, init) => {
    const r = replies.length ? replies.shift()! : 204;
    if (r === 'network') throw new TypeError('Network request failed'); // 안 닿음 — 서버는 못 봤다
    sent.push({ url, body: JSON.parse(init!.body!), method: init!.method, headers: init!.headers }); // 서버에 닿음
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
let clock = Date.UTC(2026, 11, 24, 3);
beforeEach(() => {
  kv = memKV();
  clock = Date.UTC(2026, 11, 24, 3);
});

function client(fetchFn: FetchLike, extra: Partial<Parameters<typeof createPingClient>[0]> = {}) {
  return createPingClient({ kv, fetch: fetchFn, apiBase: 'http://api.test', consent: () => true, nameTiming: () => 'A', now: () => clock, ...extra });
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
    clock += 86_400_000; // 다음 날(재시도 대기는 이미 지났다)
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
    clock += 8 * 86_400_000;
    await c.flush(ctx(9)); // 1 + 7 < 9
    expect(JSON.parse(kv.getString(NET_KEYS.outbox)!)).toHaveLength(0);
    expect(sent).toHaveLength(0);
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

describe('오프라인 재시도 백오프(C11)', () => {
  it('연결 실패 뒤에는 대기 시간 안에 다시 보내지 않고, 대기는 두 배씩 늘어 1시간에서 멈춘다. 닿으면 대기를 지운다', async () => {
    expect(RETRY_BASE_MS).toBe(30_000);
    expect(RETRY_MAX_MS).toBe(3_600_000);
    let tries = 0;
    let down = true;
    const f: FetchLike = async (_u, init) => {
      tries++;
      if (down) throw new TypeError('Network request failed');
      void init;
      return { ok: true, status: 204, text: async () => '' };
    };
    const c = client(f);
    c.recordOpen(ctx(2));
    const waits: number[] = [];
    for (let i = 0; i < 10; i++) {
      const before = tries;
      await c.flush(ctx(2));
      expect(tries, `시도 ${i}`).toBe(before + 1);
      const { at } = JSON.parse(kv.getString(NET_KEYS.retry)!) as { at: number };
      waits.push(at - clock);
      clock = at - 1; // 대기 끝 1ms 전: 보내지 않는다
      await c.flush(ctx(2));
      expect(tries).toBe(before + 1);
      clock = at;
    }
    expect(waits.slice(0, 4)).toEqual([30_000, 60_000, 120_000, 240_000]);
    expect(Math.max(...waits)).toBe(RETRY_MAX_MS);
    down = false;
    await c.flush(ctx(2));
    expect(kv.getString(NET_KEYS.retry)).toBeUndefined();
    expect(kv.getString(NET_KEYS.outbox)).toBe('[]');
  });
  it('시계가 되돌아가 대기 시각이 1시간보다 먼 미래면 대기를 버리고 보낸다(영원히 멈추지 않게)', async () => {
    const { f, sent } = fakeFetch();
    const c = client(f);
    c.recordOpen(ctx(2));
    kv.set(NET_KEYS.retry, JSON.stringify({ at: clock + RETRY_MAX_MS + 60_000, n: 3 }));
    await c.flush(ctx(2));
    expect(sent).toHaveLength(1);
  });
  it('응답을 받으면(오류여도) 대기가 생기지 않는다', async () => {
    const { f } = fakeFetch([503]);
    const c = client(f);
    c.recordOpen(ctx(2));
    await c.flush(ctx(2));
    expect(kv.getString(NET_KEYS.retry)).toBeUndefined();
  });
});

// C11 리뷰 M1: 처리방침 3-1 '끄면 그때부터 보내지 않고, 모아 둔 통계도 지웁니다' — 보내는 도중 꺼도 남은 덩어리·재시도는 0
describe('보내는 도중 끄기', () => {
  async function midway(firstReply: 'ok' | 'network') {
    let on = true;
    const sent: string[] = [];
    let release!: () => void;
    const f: FetchLike = async (url) => {
      sent.push(url);
      if (sent.length === 1) await new Promise<void>((r) => (release = r));
      if (firstReply === 'network' && sent.length === 1) throw new TypeError('Network request failed');
      return { ok: true, status: 204, text: async () => '' };
    };
    const c = client(f, { consent: () => on });
    for (let i = 0; i < 40; i++) c.track('share_link', ctx(8)); // 핑 2건(32 + 8)
    const p = c.flush(ctx(8));
    await new Promise((r) => setTimeout(r, 0));
    expect(sent).toHaveLength(1); // 첫 요청이 나가는 중
    on = false; // 사용자가 끔 = setMetricsOn(false)가 아웃박스·대기를 지움
    kv.remove(NET_KEYS.outbox);
    kv.remove(NET_KEYS.retry);
    release();
    await p;
    return sent;
  }
  it('첫 요청 중 끔 → 두 번째 덩어리는 나가지 않고, 아웃박스는 빈 채로 남는다', async () => {
    expect(await midway('ok')).toHaveLength(1);
    expect(kv.getString(NET_KEYS.outbox)).toBeUndefined();
    expect(kv.getString(NET_KEYS.retry)).toBeUndefined();
  });
  it('첫 요청이 끈 뒤 연결 실패로 끝나도 재시도 대기를 다시 쓰지 않는다', async () => {
    expect(await midway('network')).toHaveLength(1);
    expect(kv.getString(NET_KEYS.retry)).toBeUndefined();
    expect(kv.getString(NET_KEYS.outbox)).toBeUndefined();
  });
});

// 요청 본문 스냅숏(C11 원칙): 핑 요청에는 IP(통신 자체) 말고 사람·기기를 가리키는 값이 0이다.
// 주소·방법·머리글·본문 전체를 그대로 고정한다 — 무엇이 하나라도 더해지면(기기 id·빌드 번호·시각·User-Agent 기본값) 이 시험이 실패한다.
describe('요청 스냅숏 — 식별자 0', () => {
  it('핑 요청 한 건의 전부', async () => {
    const { f, sent } = fakeFetch();
    const c = client(f, { nameTiming: () => 'B', widgetCount: () => 1 });
    c.recordOpen(ctx(8));
    c.track('share_image', ctx(8));
    await c.flush(ctx(8));
    expect(PING_USER_AGENT).toBe('Mongmangi');
    expect(sent).toEqual([
      {
        url: 'http://api.test/api/v1/ping',
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': 'Mongmangi' },
        body: {
          cohortDay: '2026-12-22',
          dayN: 8,
          platform: 'android',
          appVer: '1.0',
          lang: 'ko',
          dims: { nt: 'B', wg: '1', moon: '0' },
          events: [
            { e: 'open', dayN: 8 },
            { e: 'share_image', dayN: 8 },
          ],
        },
      },
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
