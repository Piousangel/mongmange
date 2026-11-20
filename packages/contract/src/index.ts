// @mong/contract — 앱·서버·정적 배포 CI가 **같은 코드로** 읽는 원격 계약(architecture.md v2.1 3-6·3-7·3-10, dreams-30days v1.1 5-2).
// - 한 파일로 둔다: 정적 배포 스크립트(apps/web-static/scripts)가 빌드 없이 `node`(타입 지우기)로 바로 import한다.
//   그래서 상대 import·enum·namespace 같은 '지울 수 없는 TS 문법'을 쓰지 않는다(tsconfig erasableSyntaxOnly).
// - Node·RN·DOM API 금지(core와 같은 계약). 의존성은 zod 하나 — **`zod/mini`**(함수형 API, 트리 셰이킹)로 써서 앱 번들 증가를 줄인다
//   (B0 리뷰 m8: 전체 zod는 앱에 gzip 약 95KB). 서버·CI도 같은 스키마 객체를 쓰므로 판정이 같다.
import * as z from 'zod/mini';

const str = (re: RegExp) => z.string().check(z.regex(re));
const int = (min: number, max?: number) => (max === undefined ? z.int().check(z.minimum(min)) : z.int().check(z.minimum(min), z.maximum(max)));
const num = (min: number, max: number) => z.number().check(z.minimum(min), z.maximum(max));

// ───────────────────────── 공통 ─────────────────────────

/** 현지 날짜 `YYYY-MM-DD`. 시각은 받지 않는다(정밀 시각은 식별 단서가 된다, 5-2) */
export const isoDate = str(/^\d{4}-\d{2}-\d{2}$/).check(
  z.superRefine((s, ctx) => {
    const d = new Date(`${s}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) ctx.addIssue({ code: 'custom', message: '없는 날짜' });
  }),
);

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` + n일 → `YYYY-MM-DD`(UTC 달력 산술 — 시간대와 무관한 날짜 계산) */
export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** 두 날짜의 차(b − a, 일) */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/** ms 시각 + 현지 오프셋(분, 동쪽 +) → 현지 날짜. 앱은 이 값만 보낸다 */
export function localDate(ms: number, tzOffsetMin: number): string {
  return new Date(ms + tzOffsetMin * 60_000).toISOString().slice(0, 10);
}

// ───────────────────────── 집계 핑(3-6) ─────────────────────────

/**
 * 이벤트 화이트리스트 10개(architecture v1 3-6에서 정하고 v2.1이 '늘리지 않는다'로 고정).
 * 늘리면 처리방침 3-1('정해진 게임 사건 10가지')과 스토어 라벨을 함께 고쳐야 한다 — contract 테스트가 개수를 고정한다.
 */
export const PING_EVENTS = [
  'first_tap',
  'first_night',
  'ire7',
  'share_open',
  'share_link',
  'share_image',
  'name_set',
  'ink_chosen',
  'cloud_on',
  'restore_ok',
] as const;
export type PingEvent = (typeof PING_EVENTS)[number];

/** 기기에서 평생 한 번만 보내는 이벤트(개수 비율 = 사람 비율이 되게) */
export const ONCE_EVENTS: readonly PingEvent[] = ['first_tap', 'first_night', 'ire7', 'name_set', 'ink_chosen', 'cloud_on'];

/** '열기' 칸. 하루 첫 실행 때 그날 dayN으로 한 번 — 이벤트 목록 안의 특별 항목으로 실어 보낸다(오프라인이면 아웃박스) */
export const OPEN_EVENT = 'open';
export const METRIC_EVENTS = [OPEN_EVENT, ...PING_EVENTS] as const;
export type MetricEvent = (typeof METRIC_EVENTS)[number];

export const DAY_N_MAX = 400;
/** 아웃박스에서 이만큼(일) 지난 항목은 앱이 버리고, 서버도 받지 않는다 */
export const EVENT_MAX_AGE_DAYS = 7;
/** 핑 하나의 이벤트 수 상한 */
export const PING_MAX_EVENTS = 32;
/** 서버 날짜와 `cohortDay + dayN`의 허용 차(일). 시간대 ±14h + 기기 시계 오차 */
export const PING_DATE_SLACK_DAYS = 2;

const dayN = int(0, DAY_N_MAX);

/**
 * 앱 버전 = **출시 판**(`1.0`). 바이너리 빌드 번호는 싣지 않는다(B0 리뷰 I2: 칸이 잘게 갈라져 한 사람 칸이 생긴다).
 * 서버는 이 형식에 더해 설정의 '알려진 출시 판' 목록에 있는 값만 받는다(I5: 칸 수 폭주 방지).
 */
export const APP_VER_RE = /^\d{1,2}\.\d{1,2}$/;

export const pingDimsSchema = z.strictObject({
  /** 이름 시점 군 — 설치 첫 실행 때 별도 로컬 난수로 정해 늘 보낸다 */
  nt: z.enum(['A', 'B']),
  /** 위젯 — dayN 7 첫 실행 때 한 번 재서 고정. 그 전(또는 잴 수 없는 기기)은 '-' */
  wg: z.enum(['0', '1', '-']),
  /** 그 이벤트가 일어난 현지 날짜가 보름 창인가 */
  moon: z.enum(['0', '1']),
});
export type PingDims = z.infer<typeof pingDimsSchema>;

/**
 * 핑 하나. **모든 객체가 strict** — 모르는 키(기기 id·세이브 씨앗·시각 등)가 하나라도 있으면 통째로 실패한다.
 * 값도 닫혀 있다: 날짜는 일 단위, 차원은 열거, 문자열은 정규식. 자유 문자열 칸이 없다.
 */
export const pingSchema = z
  .strictObject({
    /** 설치일(기기 현지 날짜) */
    cohortDay: isoDate,
    /** 보내는 날의 n일째(= 오늘 − 설치일) */
    dayN,
    platform: z.enum(['ios', 'android']),
    /** 출시 판 `1.0`(빌드 번호 없음) */
    appVer: str(APP_VER_RE),
    lang: z.enum(['ko', 'en']),
    dims: pingDimsSchema,
    events: z.array(z.strictObject({ e: z.enum(METRIC_EVENTS), dayN })).check(z.minLength(1), z.maxLength(PING_MAX_EVENTS)),
  })
  .check(z.superRefine((p, ctx) => {
    for (const [i, ev] of p.events.entries()) {
      if (ev.dayN > p.dayN || ev.dayN < p.dayN - EVENT_MAX_AGE_DAYS) {
        ctx.addIssue({ code: 'custom', path: ['events', i, 'dayN'], message: '보내는 날보다 늦거나 너무 오래됨' });
      }
      // 7일째 전에는 위젯 값이 정해질 수 없다(정해진 뒤 값으로 옛 칸을 더럽히지 않게)
      if (ev.dayN < 7 && p.dims.wg !== '-') {
        ctx.addIssue({ code: 'custom', path: ['dims', 'wg'], message: '7일째 전 이벤트에 위젯 값' });
      }
    }
  }));
export type Ping = z.infer<typeof pingSchema>;

/** 서버 날짜 검사: 보내는 날(`cohortDay + dayN`)이 서버 UTC 날짜 ±2일 안인가 */
export function pingDateOk(p: Pick<Ping, 'cohortDay' | 'dayN'>, serverNowMs: number): boolean {
  const sent = addDays(p.cohortDay, p.dayN);
  const today = new Date(serverNowMs).toISOString().slice(0, 10);
  return Math.abs(daysBetween(today, sent)) <= PING_DATE_SLACK_DAYS;
}

/** 집계 칸 하나 = `metric_daily`의 기본 키. 사람·기기·시각을 가리키는 값이 없다 */
export interface MetricCell {
  /** 그 이벤트가 일어난 현지 날짜(= cohortDay + dayN) */
  day: string;
  event: MetricEvent;
  cohortDay: string;
  dayN: number;
  platform: Ping['platform'];
  appVer: string;
  lang: Ping['lang'];
  nt: PingDims['nt'];
  wg: PingDims['wg'];
  moon: PingDims['moon'];
}
export const METRIC_CELL_KEYS = ['day', 'event', 'cohortDay', 'dayN', 'platform', 'appVer', 'lang', 'nt', 'wg', 'moon'] as const;

/** 검증된 핑 → 칸 목록(이벤트마다 하나, 같은 칸은 여러 번 나올 수 있다) */
export function pingToCells(p: Ping): MetricCell[] {
  return p.events.map((ev) => ({
    day: addDays(p.cohortDay, ev.dayN),
    event: ev.e,
    cohortDay: p.cohortDay,
    dayN: ev.dayN,
    platform: p.platform,
    appVer: p.appVer,
    lang: p.lang,
    nt: p.dims.nt,
    wg: p.dims.wg,
    moon: p.dims.moon,
  }));
}

// ───────────────────────── 원격 플래그 config/v1.json(3-7) ─────────────────────────

/** 기획 6-2의 5개 + 서버 기능 3개 + 기존 hesitation(3-7). 웹 뷰어만 webLive를 읽는다 */
export const REMOTE_FLAG_KEYS = [
  'cloud',
  'link',
  'remoteMotifs',
  'webLive',
  'nameTiming',
  'jeongCaptions',
  'moonNight',
  'widget',
  'hesitation',
] as const;
export type RemoteFlagKey = (typeof REMOTE_FLAG_KEYS)[number];

/** TTL 상한 1시간(3-7: 6시간 → 1시간). 하한은 CDN 부하 보호 */
export const CONFIG_TTL_MAX_SEC = 3600;

export const motifIdSchema = str(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).check(z.maxLength(40));

const flagKey = z.enum(REMOTE_FLAG_KEYS);
const buildNo = int(0, 1_000_000);

const configFields = {
  v: int(1),
  ttlSec: int(60, CONFIG_TTL_MAX_SEC),
  /** 꿈 모티프 해금 앞당기기(dreams-30days 2-1): { 모티프 id: 카드 수 } — 앱은 min(번들, 이 값)만 쓴다 */
  dreamUnlock: z._default(z.record(motifIdSchema, int(0, 1000)), {}),
};

/**
 * 앱이 읽는 모양(lenient): 새 플래그 키가 생겨도 옛 앱이 설정 전체를 버리지 않게 모르는 키는 지운다.
 * - flags: 켬/끔. rollout: 기기 로컬 난수 < 값이면 켬(서버로 안 감). minBundle: 앱 JS의 BUNDLE_SEQ가 이보다 작으면 끈 것으로 본다.
 * - minAppBuild: 바이너리 빌드 번호가 이보다 작으면 원격 값을 통째로 무시하고 번들 기본값을 쓴다.
 */
export const remoteConfigSchema = z.object({
  ...configFields,
  flags: z.record(z.string(), z.boolean()),
  rollout: z._default(z.record(z.string(), num(0, 1)), {}),
  minBundle: z._default(z.record(z.string(), int(0)), {}),
  minAppBuild: z.object({ ios: buildNo, android: buildNo }),
});
export type RemoteConfig = z.infer<typeof remoteConfigSchema>;

/**
 * CI가 배포 전에 거는 모양(strict): 모르는 키·플래그 오타 = 실패.
 * 플래그를 **빼는 것**은 허용한다 — 빠진 키는 '원격이 말하지 않음'이라 앱이 번들 기본값(FEATURE_DEFAULTS)을 쓴다.
 * 서버 기능 스위치(cloud·link·remoteMotifs·webLive)만은 늘 명시해야 한다(끄는 손잡이가 파일에 보이게).
 */
export const SERVER_FLAG_KEYS: readonly RemoteFlagKey[] = ['cloud', 'link', 'remoteMotifs', 'webLive'];
export const remoteConfigStrictSchema = z
  .strictObject({
    ...configFields,
    flags: z.partialRecord(flagKey, z.boolean()),
    rollout: z._default(z.partialRecord(flagKey, num(0, 1)), {}),
    minBundle: z._default(z.partialRecord(flagKey, int(0)), {}),
    minAppBuild: z.strictObject({ ios: buildNo, android: buildNo }),
  })
  .check(
    z.superRefine((c, ctx) => {
      for (const k of SERVER_FLAG_KEYS) if (!(k in c.flags)) ctx.addIssue({ code: 'custom', path: ['flags', k], message: '서버 기능 스위치는 명시해야 한다' });
    }),
  );

// ───────────────────────── 원격 꿈 모티프(3-10 + dreams-30days v1.1 5-2 스키마 1) ─────────────────────────

const sha256Hex = str(/^[0-9a-f]{64}$/);
const motifFileUrl = str(/^\/content\/motifs\/[a-z0-9]+(?:-[a-z0-9]+)*\.[0-9a-f]{8}\.json$/);
const entryCommon = {
  schema: z.literal(1),
  minAppBuild: buildNo,
  url: motifFileUrl,
  sha256: sha256Hex,
  bytes: int(1, 64 * 1024),
};

export const contentManifestSchema = z
  .strictObject({
    v: z.literal(1),
    /** 바뀌었을 때만 앱이 새 파일을 받는다 */
    seq: int(0),
    motifs: z.array(
      z.discriminatedUnion('kind', [
        z.strictObject({ id: motifIdSchema, kind: z.literal('weekly'), from: isoDate, ...entryCommon }),
        z.strictObject({
          id: str(/^moon-(0[1-9]|1[0-2])$/),
          kind: z.literal('moon'),
          month: int(1, 12),
          ...entryCommon,
        }),
      ]),
    ),
    /** 새 카드에서만 뽑지 않는다(이미 현상한 카드는 그대로) */
    revoked: z.array(motifIdSchema),
  })
  .check(z.superRefine((m, ctx) => {
    const seen = new Set<string>();
    for (const [i, e] of m.motifs.entries()) {
      if (seen.has(e.id)) ctx.addIssue({ code: 'custom', path: ['motifs', i, 'id'], message: '같은 id 두 번' });
      seen.add(e.id);
      if (e.kind === 'moon' && e.id !== `moon-${String(e.month).padStart(2, '0')}`) {
        ctx.addIssue({ code: 'custom', path: ['motifs', i, 'month'], message: 'id와 month가 다르다' });
      }
      // 파일 이름의 id 부분이 항목 id와 같아야 한다(다른 모티프 파일을 가리키는 실수)
      if (!e.url.startsWith(`/content/motifs/${e.id}.`)) ctx.addIssue({ code: 'custom', path: ['motifs', i, 'url'], message: 'url이 id와 다르다' });
    }
  }));
export type ContentManifest = z.infer<typeof contentManifestSchema>;

export const MOTIF_ZONES = ['near-alone', 'near-with', 'far-alone', 'far-with', 'center', 'moon'] as const;

/** 언어별 글자 수 상한(dreams-30days 5-2·3-6 산식). 글자 = 코드 포인트 */
export const MOTIF_TEXT_LIMITS = {
  ko: { title: 12, line: 22, scene: 45 },
  en: { title: 32, line: 45, scene: 100 },
} as const;

/**
 * 문구 금지어(dreams-30days 3-7 작가 점검표 → CI). 느낌표·말줄임표·숫자·광고체·외로움·FOMO·발 동사.
 * 영어는 같은 뜻의 대표 낱말만 막는다(원어민 검수가 따로 있다).
 */
export const MOTIF_FORBIDDEN: readonly RegExp[] = [
  /[!！]/,
  /…|\.\.\./,
  /[0-9０-９]/,
  /\bNEW\b/i,
  /외로|쓸쓸히|혼자 남아/,
  /기다렸어요|보고 싶었어요|돌아보더니|찾더니/,
  /좋아하더니|싶어 하더니/,
  /놓치지|이번 달만|한정/,
  /새로운|드디어|특별한/,
  /걸었어요|뛰었어요|따라갔어요/,
  /\b(lonely|alone again|missed you|waited for you|don't miss|limited|special|finally|walked|ran)\b/i,
];

const motifText = (lim: { title: number; line: number; scene: number }) =>
  z.strictObject({
    title: z.string().check(z.minLength(1)),
    line: z.string().check(z.minLength(1)),
    scene: z.string().check(z.minLength(1)),
  }).check(
    z.superRefine((t, ctx) => {
      for (const k of ['title', 'line', 'scene'] as const) {
        if ([...t[k]].length > lim[k]) ctx.addIssue({ code: 'custom', path: [k], message: `${lim[k]}자 초과` });
        for (const re of MOTIF_FORBIDDEN) if (re.test(t[k])) ctx.addIssue({ code: 'custom', path: [k], message: `금지 표현 ${re}` });
      }
    }),
  );

/** SVG 경로 데이터: 명령 글자·숫자·구분자만(실행 코드 0 — 3-10) */
const pathData = str(/^[MLHVCSQTAZmlhvcsqtaz0-9eE.,\s-]+$/).check(z.maxLength(4000));

/** 모티프 파일 스키마 1(dreams-30days v1.1 5-2). zone·family 정식, scene 필수, line ko 22·en 45 */
export const motifFileSchema = z
  .strictObject({
    schema: z.literal(1),
    id: motifIdSchema,
    zone: z.enum(MOTIF_ZONES),
    family: str(/^[a-z]+(?:-[a-z]+)*$/).check(z.maxLength(16)),
    paths: z.array(z.strictObject({ d: pathData, w: num(0.1, 8), layer: z.enum(['ink', 'gold', 'wash']) })).check(z.minLength(1), z.maxLength(64)),
    /** 앱에 있는 셰이더의 파라미터만(새 셰이더 소스 금지) */
    shader: z.strictObject({ bleed: num(0, 1), grain: num(0, 1), tone: z.enum(['day', 'night']) }),
    /** 언어가 없으면 그 언어에서 풀 제외(기계 번역 금지, D-17) — 최소 한 언어 */
    text: z.strictObject({ ko: z.optional(motifText(MOTIF_TEXT_LIMITS.ko)), en: z.optional(motifText(MOTIF_TEXT_LIMITS.en)) }).check(
      z.superRefine((t, ctx) => {
        if (!t.ko && !t.en) ctx.addIssue({ code: 'custom', message: '언어가 하나도 없다' });
      }),
    ),
    tags: z.optional(z.array(z.string().check(z.maxLength(24))).check(z.maxLength(8))),
  })
  .check(
    z.superRefine((m, ctx) => {
      const isMoon = m.id.startsWith('moon-');
      if (isMoon !== (m.zone === 'moon')) ctx.addIssue({ code: 'custom', path: ['zone'], message: '보름 모티프만 zone moon' });
    }),
  );
export type MotifFile = z.infer<typeof motifFileSchema>;
