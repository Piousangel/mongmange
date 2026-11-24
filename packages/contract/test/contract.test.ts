// 계약 시험 — OPERATING 8-1 '그럴듯한 오답 판별 검사' 포함:
// 핑에 식별 가능한 값(기기 id·세이브 씨앗·정밀 시각·IP 등)이 섞이면 **통과하면 안 된다**. 한 칸이라도 받아 주면 실패.
import { describe, expect, it } from 'vitest';
import {
  addDays,
  contentManifestSchema,
  daysBetween,
  localDate,
  METRIC_CELL_KEYS,
  METRIC_EVENTS,
  motifFileSchema,
  ONCE_EVENTS,
  PING_EVENTS,
  pingDateOk,
  pingSchema,
  pingToCells,
  REMOTE_FLAG_KEYS,
  remoteConfigSchema,
  remoteConfigStrictSchema,
  creatureInfoSchema,
  REPORT_REASONS,
  reportRequestSchema,
} from '../src/index';

const okPing = {
  cohortDay: '2026-12-22',
  dayN: 3,
  platform: 'android',
  appVer: '1.0',
  lang: 'ko',
  dims: { nt: 'A', wg: '-', moon: '0' },
  events: [
    { e: 'open', dayN: 3 },
    { e: 'name_set', dayN: 2 },
  ],
};

describe('집계 핑 스키마', () => {
  it('정본 3-6 예시 모양은 통과', () => {
    expect(pingSchema.safeParse(okPing).success).toBe(true);
  });

  // open은 10가지 밖의 별도 칸 — 처리방침 3-1 '앱을 연 날'과 짝. 이벤트를 늘리거나 open을 바꾸면 처리방침 ko·en 3-1을 함께 고친다
  it('화이트리스트는 10개 + open, 평생 한 번 이벤트는 그 부분집합(늘리면 처리방침 3-1을 같이 고쳐야 한다)', () => {
    expect(PING_EVENTS).toHaveLength(10);
    for (const e of ONCE_EVENTS) expect(PING_EVENTS).toContain(e);
    expect(METRIC_EVENTS).toEqual(['open', ...PING_EVENTS]);
  });

  // ── 그럴듯한 오답: 식별 가능한 값이 실려도 '그냥 무시하고 받아 주는' 서버 ──
  const IDENTIFYING: Array<[string, (p: typeof okPing) => unknown]> = [
    ['최상위 deviceId', (p) => ({ ...p, deviceId: '6f1c2a7e-0d7b-4b1e-9b8f-2f0a8c1d9e33' })],
    ['최상위 installId', (p) => ({ ...p, installId: 'abc' })],
    ['세이브 씨앗(birth.seed)', (p) => ({ ...p, seed: 2864434397 })],
    ['인장 씨앗', (p) => ({ ...p, sealSeed: 123456 })],
    ['정밀 시각(ms)', (p) => ({ ...p, ts: 1766400000123 })],
    ['IP', (p) => ({ ...p, ip: '203.0.113.7' })],
    ['dims 안 추가 키', (p) => ({ ...p, dims: { ...p.dims, uid: 'x' } })],
    ['이벤트 안 시각', (p) => ({ ...p, events: [{ e: 'open', dayN: 3, at: 1766400000123 }] })],
    ['이벤트 안 자유 값', (p) => ({ ...p, events: [{ e: 'open', dayN: 3, v: 'K7M3QX9P' }] })],
    ['cohortDay에 시각 포함', (p) => ({ ...p, cohortDay: '2026-12-22T09:13:44.120Z' })],
    ['cohortDay를 ms로', (p) => ({ ...p, cohortDay: 1766400000123 })],
    ['appVer에 기기 모델', (p) => ({ ...p, appVer: '1.0 SM-S931N' })],
    ['appVer에 빌드 번호(칸 쪼개짐, 리뷰 I2)', (p) => ({ ...p, appVer: '1.0.0(14)' })],
    ['appVer 앞에 군더더기(앞 고정)', (p) => ({ ...p, appVer: 'x1.0' })],
    ['appVer 뒤에 줄바꿈 값(뒤 고정)', (p) => ({ ...p, appVer: '1.0\n6f1c2a7e' })],
    ['appVer 세 자리 판', (p) => ({ ...p, appVer: '1.0.3' })],
    ['lang에 지역 태그', (p) => ({ ...p, lang: 'ko-KR' })],
    ['platform에 OS 버전', (p) => ({ ...p, platform: 'android 15' })],
    ['nt에 씨앗 값', (p) => ({ ...p, dims: { ...p.dims, nt: '2864434397' } })],
    ['dayN 소수(시각 단서)', (p) => ({ ...p, dayN: 3.4172 })],
    ['화이트리스트 밖 이벤트', (p) => ({ ...p, events: [{ e: 'device_6f1c2a7e', dayN: 3 }] })],
  ];
  for (const [name, mk] of IDENTIFYING) {
    it(`거부: ${name}`, () => {
      expect(pingSchema.safeParse(mk(okPing)).success).toBe(false);
    });
  }

  it('범위: dayN 0~400, 이벤트는 보내는 날 이전 7일 안, 7일째 전 이벤트에 위젯 값 금지, 이벤트 1~32개', () => {
    expect(pingSchema.safeParse({ ...okPing, dayN: 401 }).success).toBe(false);
    expect(pingSchema.safeParse({ ...okPing, events: [{ e: 'open', dayN: 4 }] }).success).toBe(false);
    expect(pingSchema.safeParse({ ...okPing, dayN: 20, events: [{ e: 'open', dayN: 12 }] }).success).toBe(false);
    expect(pingSchema.safeParse({ ...okPing, dims: { ...okPing.dims, wg: '1' } }).success).toBe(false);
    expect(pingSchema.safeParse({ ...okPing, dayN: 8, dims: { nt: 'B', wg: '1', moon: '1' }, events: [{ e: 'open', dayN: 8 }] }).success).toBe(true);
    expect(pingSchema.safeParse({ ...okPing, events: [] }).success).toBe(false);
    expect(pingSchema.safeParse({ ...okPing, events: Array.from({ length: 33 }, () => ({ e: 'open', dayN: 3 })) }).success).toBe(false);
  });

  it('없는 날짜는 거부', () => {
    expect(pingSchema.safeParse({ ...okPing, cohortDay: '2026-02-30' }).success).toBe(false);
  });

  it('서버 날짜 ±2일', () => {
    const now = Date.parse('2026-12-25T03:00:00Z'); // 보내는 날 = 12-22 + 3 = 12-25
    expect(pingDateOk(okPing as never, now)).toBe(true);
    expect(pingDateOk(okPing as never, Date.parse('2026-12-27T23:00:00Z'))).toBe(true);
    expect(pingDateOk(okPing as never, Date.parse('2026-12-28T01:00:00Z'))).toBe(false);
    expect(pingDateOk(okPing as never, Date.parse('2026-12-22T01:00:00Z'))).toBe(false);
  });

  it('칸: 키는 10개 고정이고 날짜는 일 단위뿐', () => {
    const cells = pingToCells(pingSchema.parse(okPing));
    expect(cells).toHaveLength(2);
    for (const c of cells) expect(Object.keys(c).sort()).toEqual([...METRIC_CELL_KEYS].sort());
    expect(cells[1]).toMatchObject({ day: '2026-12-24', event: 'name_set', dayN: 2 });
  });

  it('날짜 도우미', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3);
    // 서울(+540) 자정 직후 = 현지 다음 날
    expect(localDate(Date.parse('2026-12-21T15:30:00Z'), 540)).toBe('2026-12-22');
    expect(localDate(Date.parse('2026-12-21T15:30:00Z'), -300)).toBe('2026-12-21');
  });
});

const okConfig = {
  v: 1,
  ttlSec: 3600,
  flags: Object.fromEntries(REMOTE_FLAG_KEYS.map((k) => [k, false])),
  rollout: {},
  minBundle: {},
  minAppBuild: { ios: 0, android: 0 },
};

describe('config/v1.json', () => {
  it('정본 3-7 예시 모양', () => {
    const c = remoteConfigStrictSchema.parse({ ...okConfig, flags: { ...okConfig.flags, nameTiming: true }, rollout: { cloud: 0.2 }, minBundle: { cloud: 3, link: 4 } });
    expect(c.dreamUnlock).toEqual({});
  });
  it('CI(strict): 플래그 오타·빠짐·모르는 최상위 키·TTL 1시간 초과를 막는다', () => {
    expect(remoteConfigStrictSchema.safeParse({ ...okConfig, flags: { ...okConfig.flags, clod: true } }).success).toBe(false);
    const { cloud: _c, ...missing } = okConfig.flags;
    expect(remoteConfigStrictSchema.safeParse({ ...okConfig, flags: missing }).success).toBe(false); // 서버 스위치는 명시
    const { nameTiming: _n, ...noGameFlag } = okConfig.flags;
    expect(remoteConfigStrictSchema.safeParse({ ...okConfig, flags: noGameFlag }).success).toBe(true); // 게임 플래그는 빼면 번들 기본값
    expect(remoteConfigStrictSchema.safeParse({ ...okConfig, extra: 1 }).success).toBe(false);
    expect(remoteConfigStrictSchema.safeParse({ ...okConfig, ttlSec: 21600 }).success).toBe(false);
    expect(remoteConfigStrictSchema.safeParse({ ...okConfig, rollout: { cloud: 1.5 } }).success).toBe(false);
  });
  it('앱(lenient): 새 플래그·새 키가 생겨도 옛 앱은 설정 전체를 버리지 않는다', () => {
    const r = remoteConfigSchema.safeParse({ ...okConfig, flags: { ...okConfig.flags, futureThing: true }, newTopKey: { a: 1 } });
    expect(r.success).toBe(true);
    expect(r.data && 'newTopKey' in r.data).toBe(false);
  });
  it('dreamUnlock은 모티프 id → 카드 수', () => {
    expect(remoteConfigStrictSchema.safeParse({ ...okConfig, dreamUnlock: { kite: 3 } }).success).toBe(true);
    expect(remoteConfigStrictSchema.safeParse({ ...okConfig, dreamUnlock: { 'Bad Id': 3 } }).success).toBe(false);
    expect(remoteConfigStrictSchema.safeParse({ ...okConfig, dreamUnlock: { kite: -1 } }).success).toBe(false);
  });
});

const crane = {
  schema: 1,
  id: 'w2027-06-crane',
  zone: 'far-alone',
  family: 'crane',
  paths: [{ d: 'M12 40 C 20 10, 40 10, 50 40', w: 1.4, layer: 'ink' }],
  shader: { bleed: 0.35, grain: 0.2, tone: 'night' },
  text: {
    ko: { title: '학 한 마리', line: '간밤 꿈에 학 한 마리가 물가에 섰어요', scene: '먼 물가에 가는 다리의 학 한 마리가 서 있어요' },
    en: { title: 'a single crane', line: 'A lone crane stood at the far shore', scene: 'A single long-legged crane stands at the far shore' },
  },
  tags: ['water'],
};

describe('모티프 파일 스키마 1(dreams-30days v1.1 5-2)', () => {
  it('정본 주간 예시는 통과', () => {
    expect(motifFileSchema.safeParse(crane).success).toBe(true);
  });
  it('zone·family 필수, zone 열거, scene 필수', () => {
    const { zone: _z, ...noZone } = crane;
    expect(motifFileSchema.safeParse(noZone).success).toBe(false);
    const { family: _f, ...noFamily } = crane;
    expect(motifFileSchema.safeParse(noFamily).success).toBe(false);
    expect(motifFileSchema.safeParse({ ...crane, zone: 'far' }).success).toBe(false);
    expect(motifFileSchema.safeParse({ ...crane, text: { ko: { title: '학', line: '학이 섰어요' } } }).success).toBe(false);
  });
  it('line 상한 ko 22·en 45(코드 포인트)', () => {
    const ko22 = '가'.repeat(22);
    expect(motifFileSchema.safeParse({ ...crane, text: { ko: { ...crane.text.ko, line: ko22 } } }).success).toBe(true);
    expect(motifFileSchema.safeParse({ ...crane, text: { ko: { ...crane.text.ko, line: ko22 + '가' } } }).success).toBe(false);
    expect(motifFileSchema.safeParse({ ...crane, text: { en: { ...crane.text.en, line: 'a'.repeat(46) } } }).success).toBe(false);
  });
  it('금지어(느낌표·말줄임표·숫자·외로움·FOMO·발 동사)', () => {
    for (const line of ['학이 섰어요!', '학이 섰어요…', '학 2마리', '외로워 보였어요', '놓치지 마세요', '물가로 걸었어요']) {
      expect(motifFileSchema.safeParse({ ...crane, text: { ko: { ...crane.text.ko, line } } }).success, line).toBe(false);
    }
  });
  it('경로에 실행 코드·URL 금지, 보름은 zone moon', () => {
    expect(motifFileSchema.safeParse({ ...crane, paths: [{ d: 'javascript:alert(1)', w: 1, layer: 'ink' }] }).success).toBe(false);
    expect(motifFileSchema.safeParse({ ...crane, id: 'moon-03' }).success).toBe(false);
    expect(motifFileSchema.safeParse({ ...crane, id: 'moon-03', zone: 'moon', family: 'moon' }).success).toBe(true);
  });
});

describe('content/v1.json 매니페스트', () => {
  const entry = {
    id: 'w2027-06-crane',
    kind: 'weekly',
    from: '2027-02-08',
    schema: 1,
    minAppBuild: 14,
    url: '/content/motifs/w2027-06-crane.3f9a1c7e.json',
    sha256: 'a'.repeat(64),
    bytes: 9123,
  };
  it('빈 목록·정상 항목', () => {
    expect(contentManifestSchema.safeParse({ v: 1, seq: 0, motifs: [], revoked: [] }).success).toBe(true);
    expect(contentManifestSchema.safeParse({ v: 1, seq: 3, motifs: [entry], revoked: [] }).success).toBe(true);
  });
  it('정본 예시의 sha256 "…"(자리표시)는 배포될 수 없다', () => {
    expect(contentManifestSchema.safeParse({ v: 1, seq: 3, motifs: [{ ...entry, sha256: '…' }], revoked: [] }).success).toBe(false);
  });
  it('id 중복·url이 다른 id·보름 id와 month 불일치를 막는다', () => {
    expect(contentManifestSchema.safeParse({ v: 1, seq: 3, motifs: [entry, entry], revoked: [] }).success).toBe(false);
    expect(contentManifestSchema.safeParse({ v: 1, seq: 3, motifs: [{ ...entry, url: '/content/motifs/kite.3f9a1c7e.json' }], revoked: [] }).success).toBe(false);
    const moon = { ...entry, id: 'moon-03', kind: 'moon', month: 4, url: '/content/motifs/moon-03.a1b2c3d4.json' };
    delete (moon as Record<string, unknown>).from;
    expect(contentManifestSchema.safeParse({ v: 1, seq: 3, motifs: [moon], revoked: [] }).success).toBe(false);
    expect(contentManifestSchema.safeParse({ v: 1, seq: 3, motifs: [{ ...moon, month: 3 }], revoked: [] }).success).toBe(true);
  });
});

describe('신고 계약(B5) — 사유 코드 하나뿐, 자유 글·신고자 값은 받지 않는다', () => {
  it('사유 넷 중 하나만 통과', () => {
    for (const reason of REPORT_REASONS) expect(reportRequestSchema.safeParse({ reason }).success).toBe(true);
    expect(reportRequestSchema.safeParse({ reason: 'spam' }).success).toBe(false);
    expect(reportRequestSchema.safeParse({}).success).toBe(false);
  });
  it.each([['text', '자유 글'], ['email', 'a@b.c'], ['deviceId', 'x'], ['ip', '1.2.3.4']])('%s 칸이 섞이면 거부(strict)', (k, v) => {
    expect(reportRequestSchema.safeParse({ reason: 'other', [k]: v }).success).toBe(false);
  });
  it('GET /creature에 nameBlocked(운영자 이름 가리기)가 반드시 있다', () => {
    const base = { code: '7K2M9QXA', linkEnabled: false, nameVisible: false, page: null, deletionPendingUntil: null };
    expect(creatureInfoSchema.safeParse(base).success).toBe(false);
    expect(creatureInfoSchema.safeParse({ ...base, nameBlocked: true }).success).toBe(true);
    // 삭제 대기 알림 칸도 반드시 있다(B5 리뷰 H1)
    const { deletionPendingUntil: _d, ...noPending } = { ...base, nameBlocked: false };
    expect(creatureInfoSchema.safeParse(noPending).success).toBe(false);
  });
});
