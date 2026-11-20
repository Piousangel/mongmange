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

// ───────────────────────── 맡겨 두기·계정·삭제(B2 — architecture.md v2.2 3-2·3-3·3-4·3-4-1·3-8) ─────────────────────────
// 요청은 서버가 이 스키마로 읽고(strict — 모르는 키는 400), 응답은 앱이 이 스키마로 읽는다(C11·C12).
// 개인정보 최소(5-2): 요청에 기기 값·이름·이메일·태어난 해·달이 들어갈 칸이 없다 — 계약 시험이 고정한다.

/** 연령 확인 판(3-3 ③ '중립형 — 태어난 해·달, 기기에서 판정'). 서버는 판 번호와 통과만 받는다 */
export const AGE_GATE_VERSION = 2;
/** `{v, ok:true}` — 미달(ok:false)은 기기 밖으로 나가지 않으므로 받을 칸 자체가 없다(서버에 under14가 존재할 수 없음) */
export const ageGateSchema = z.strictObject({ v: int(1, 999), ok: z.literal(true) });
export type AgeGate = z.infer<typeof ageGateSchema>;

/** 인장 코드(= 링크 키) 8자, Crockford base32(서버 난수 40비트) */
export const CREATURE_CODE_RE = /^[0-9A-HJKMNP-TV-Z]{8}$/;
/** 사람이 옮겨 적은 인장 코드 → 정규 8자(글귀와 같은 Crockford 읽기: 대소문자·공백·하이픈 무시, I·L → 1, O → 0). 틀리면 null */
export function normalizeCreatureCode(raw: string): string | null {
  if (raw.length > 16) return null;
  const s = raw.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
  return CREATURE_CODE_RE.test(s) ? s : null;
}

export const bootstrapRequestSchema = z.strictObject({ ageGate: ageGateSchema });
export type BootstrapRequest = z.infer<typeof bootstrapRequestSchema>;
export const bootstrapResponseSchema = z.object({ userId: z.string(), creature: z.object({ code: str(CREATURE_CODE_RE) }) });
export type BootstrapResponse = z.infer<typeof bootstrapResponseSchema>;

/** 세이브 본문 상한(3-4-1 '남용 상한'): 압축 전 UTF-8 512KB, gzip 뒤 256KB → 넘으면 413 */
export const SAVE_MAX_BYTES = 512 * 1024;
export const SAVE_MAX_GZIP_BYTES = 256 * 1024;
/** 몽망이당 하루(UTC) 새로 쓰는 본문 바이트(압축 뒤) → 넘으면 429 save_quota */
export const SAVE_DAILY_GZIP_BYTES = 4 * 1024 * 1024;
/** 이력 칸별 개수 상한(3-4-1, weekly 4 = '주 1벌 최대 4주'). 기간 상한 28일·30일은 PUT 안 + pg_cron 두 겹 */
export const SAVE_VERSION_KEEP = { overwritten: 3, weekly: 4, conflict: 3, pre_restore: 3 } as const;
/** 이력 기간 상한(일) — 처리방침 6절 '최대 4주'·'충돌·복원 전 본 30일' */
export const SAVE_VERSION_MAX_DAYS = { overwritten: 28, weekly: 28, conflict: 30, pre_restore: 30 } as const;
export const SAVE_VERSION_REASONS = ['overwritten', 'weekly', 'conflict', 'pre_restore'] as const;
export type SaveVersionReason = (typeof SAVE_VERSION_REASONS)[number];

/** ISO 8601 시각(UTC `Z` 또는 오프셋). 표시용 — 서버는 판단에 쓰지 않는다(3-4 '시계') */
export const isoDateTime = str(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/).check(
  z.refine((s) => {
    const t = Date.parse(s);
    return Number.isFinite(t) && t >= Date.UTC(2025, 0, 1) && t < Date.UTC(2100, 0, 1);
  }, '시각 범위 밖'),
);

/**
 * `PUT /saves/main`(헤더 `If-Match: <rev>` 또는 처음은 `If-None-Match: *`).
 * body = core `serializeState` 문자열 그대로. 크기는 스키마가 아니라 서버가 바이트로 재서 413을 낸다.
 * resolve `keep_mine` = 409 뒤 '이 기기 몽망이'를 골랐을 때 — 덮이는 서버 본은 conflict 칸(30일)으로 간다.
 */
export const saveUploadSchema = z.strictObject({
  body: z.string().check(z.minLength(2)),
  clientSavedAt: isoDateTime,
  resolve: z.optional(z.literal('keep_mine')),
});
export type SaveUpload = z.infer<typeof saveUploadSchema>;
/** `POST /saves/main/conflicts` — 서버 본을 골랐을 때 이 기기의 진 본을 30일 맡긴다 */
export const conflictUploadSchema = z.strictObject({ body: z.string().check(z.minLength(2)), clientSavedAt: isoDateTime });
export type ConflictUpload = z.infer<typeof conflictUploadSchema>;

/** sha = 본문(UTF-8) SHA-256 소문자 16진. 앱은 자기 본의 sha와 비교해 빨리 감기·반쯤 성공을 판단한다(3-4) */
export const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
export const saveMetaSchema = z.object({
  rev: int(1),
  sha: str(SHA256_HEX_RE),
  clientSavedAt: z.string(),
  /** 미래 판 본(validated=false)은 서버가 못 읽어 null */
  dayIndex: z.nullable(int(0)),
  strokesTotal: z.nullable(int(0)),
  envelopeVer: int(0),
  simVer: int(0),
  validated: z.boolean(),
});
export type SaveMeta = z.infer<typeof saveMetaSchema>;
export const saveWithBodySchema = z.extend(saveMetaSchema, { body: z.string() });
export type SaveWithBody = z.infer<typeof saveWithBodySchema>;
export const saveWriteResponseSchema = z.object({ rev: int(1), sha: str(SHA256_HEX_RE) });
export type SaveWriteResponse = z.infer<typeof saveWriteResponseSchema>;
/** 409의 `error.details` — 서버 사본을 잃었으면(백업 복원 등) server = null → 앱은 If-None-Match: *로 다시 */
export const saveConflictDetailsSchema = z.object({ server: z.nullable(saveMetaSchema) });
export type SaveConflictDetails = z.infer<typeof saveConflictDetailsSchema>;

/** 이력 한 행. id = 행의 uuid(public_id) — 순번은 내보내지 않는다(3-4-1) */
export const saveVersionSchema = z.object({
  id: z.string(),
  reason: z.enum(SAVE_VERSION_REASONS),
  rev: int(1),
  clientSavedAt: z.string(),
  dayIndex: z.nullable(int(0)),
  strokesTotal: z.nullable(int(0)),
  validated: z.boolean(),
  createdAt: z.string(),
});
export type SaveVersion = z.infer<typeof saveVersionSchema>;
export const saveVersionWithBodySchema = z.extend(saveVersionSchema, { body: z.string() });
export type SaveVersionWithBody = z.infer<typeof saveVersionWithBodySchema>;

/**
 * 되찾기 글귀(3-3 ⑤): 80비트 보안 난수 = Crockford base32 16자, `XXXX-XXXX-XXXX-XXXX`로 보여 준다.
 * 사람이 옮겨 적으므로 읽을 때는 대소문자·하이픈·공백을 무시하고 I·L → 1, O → 0으로 읽는다(Crockford 규칙).
 */
export const RECOVERY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const RECOVERY_CODE_RE = /^[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){3}$/;
/** 사람이 넣은 글귀 → 정규 16자(틀린 글자·길이면 null). 서버 해시·앱 입력 칸이 같은 함수를 쓴다 */
export function normalizeRecoveryCode(raw: string): string | null {
  if (raw.length > 64) return null;
  const s = raw.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
  return /^[0-9A-HJKMNP-TV-Z]{16}$/.test(s) ? s : null;
}
/** 정규 16자 → 보여 줄 꼴 */
export function formatRecoveryCode(code16: string): string {
  return code16.match(/.{4}/g)!.join('-');
}
export const recoveryCodeResponseSchema = z.object({ code: str(RECOVERY_CODE_RE) });
export type RecoveryCodeResponse = z.infer<typeof recoveryCodeResponseSchema>;
/** `POST /recover` — 새 기기는 bootstrap 없이 이것만 부른다(3-3 ⑤). 연령 확인은 새 기기에서 다시 한다 */
export const recoverRequestSchema = z.strictObject({ code: z.string().check(z.maxLength(64)), ageGate: ageGateSchema });
export type RecoverRequest = z.infer<typeof recoverRequestSchema>;
export const recoverResponseSchema = z.object({
  creature: z.object({ code: str(CREATURE_CODE_RE) }),
  save: z.nullable(saveMetaSchema),
  newCode: str(RECOVERY_CODE_RE),
});
export type RecoverResponse = z.infer<typeof recoverResponseSchema>;

/** 삭제 영수증(3-8): 128비트 난수 base64url 22자. 서버는 해시만, 24시간 */
export const DELETION_RECEIPT_RE = /^[A-Za-z0-9_-]{22}$/;
export const DELETION_RECEIPT_TTL_HOURS = 24;
export const deleteMeResponseSchema = z.object({ receipt: str(DELETION_RECEIPT_RE) });
export type DeleteMeResponse = z.infer<typeof deleteMeResponseSchema>;
export const deletionStatusSchema = z.object({ state: z.enum(['pending', 'done']) });
export type DeletionStatus = z.infer<typeof deletionStatusSchema>;
/**
 * 웹 `/delete`(3-8 ② — 앱 없이 지우기): 인장 코드와 되찾기 글귀가 **둘 다** 같은 몽망이를 가리킬 때만 처리한다.
 * 코드는 링크 주소에 공개된 값이라 그것만으로는 본인 확인이 안 된다(A4 리뷰 I5).
 */
export const webDeletionRequestSchema = z.strictObject({ code: z.string().check(z.maxLength(16)), phrase: z.string().check(z.maxLength(64)) });
export type WebDeletionRequest = z.infer<typeof webDeletionRequestSchema>;

// ───────────────────────── 공유 링크·웹 뷰어(B3 — architecture.md v2.2 3-2 링크 행·3-5·3-5-1~3-5-3·3-9) ─────────────────────────

/**
 * 공개 파일 셋(3-5 표): 포스터·OG·루프는 앱이 만들어 **비공개 page-staging**에 서명 URL로 올리고, snap.json은 서버가 쓴다.
 * 콘텐츠 유형은 파일마다 하나로 고정(버킷 allowed_mime_types와 같음). 해상도·길이는 commit 검사 값.
 */
export const PAGE_FILES = {
  poster: { name: 'poster.jpg', contentType: 'image/jpeg', maxBytes: 250 * 1024, width: 1080, height: 1350 },
  og: { name: 'og.jpg', contentType: 'image/jpeg', maxBytes: 150 * 1024, width: 1200, height: 630 },
  loop: { name: 'loop.mp4', contentType: 'video/mp4', maxBytes: 600 * 1024, width: 540, height: 676 },
} as const;
export type PageFileKind = keyof typeof PAGE_FILES;
/** 루프 540×676(PM 11-20 개정: 540×675 → 676 — H.264 4:2:0은 홀수 높이를 못 만든다). 길이 허용 범위(초) — 3-5-3 ③ */
export const LOOP_SECONDS = { min: 7.5, max: 8.5 } as const;
/** 서명 업로드 URL 수명(초) — 3-8 '서명 URL 1회·5분' */
export const UPLOAD_URL_TTL_SEC = 300;
/** 사용자당 하루 PUT page 상한(3-8) */
export const PAGE_PUT_PER_DAY = 20;
/** 공개 스냅숏 본문 상한(3-5-1 ①, 넘으면 413). core SNAP_LIMITS.bytes와 같은 값 */
export const SNAP_MAX_BYTES = 32 * 1024;

const fileDecl = <K extends PageFileKind>(k: K) =>
  z.strictObject({ contentType: z.literal(PAGE_FILES[k].contentType), bytes: int(1, PAGE_FILES[k].maxBytes) });

/**
 * `PUT /creature/page` — 링크 켜기·다시 만들기. snapshot은 여기서 모양만(객체) 보고, 내용은 서버가 core parsePublicSnapshot으로 본다
 * (core가 정본, contract에 형식을 두 벌 두지 않는다). name은 nameVisible일 때만 보낸다(3-5-2)
 */
export const pagePutRequestSchema = z.strictObject({
  snapshot: z.record(z.string(), z.unknown()),
  nameVisible: z.boolean(),
  name: z.optional(z.string().check(z.maxLength(64))),
  lang: z.enum(['ko', 'en']),
  files: z.strictObject({ poster: fileDecl('poster'), og: fileDecl('og'), loop: z.optional(fileDecl('loop')) }),
});
export type PagePutRequest = z.infer<typeof pagePutRequestSchema>;
export const uploadSlotSchema = z.object({ signedUrl: z.string(), token: z.string(), contentType: z.string(), maxBytes: z.number() });
export type UploadSlot = z.infer<typeof uploadSlotSchema>;
export const pagePutResponseSchema = z.object({
  ver: int(1),
  nameAllowed: z.boolean(),
  url: z.string(),
  upload: z.object({ poster: uploadSlotSchema, og: uploadSlotSchema, loop: z.optional(uploadSlotSchema) }),
});
export type PagePutResponse = z.infer<typeof pagePutResponseSchema>;

export const PAGE_STATES = ['live', 'off', 'quarantined', 'removed'] as const;
export type PageState = (typeof PAGE_STATES)[number];
/** `GET /creature`·`PATCH /creature` 응답 — 앱 안 표시는 이 값(즉시, no-store) */
export const creatureInfoSchema = z.object({
  code: str(CREATURE_CODE_RE),
  linkEnabled: z.boolean(),
  nameVisible: z.boolean(),
  page: z.nullable(z.object({ ver: int(0), state: z.enum(PAGE_STATES) })),
});
export type CreatureInfo = z.infer<typeof creatureInfoSchema>;
export const creaturePatchSchema = z.strictObject({ nameVisible: z.boolean() });
export type CreaturePatch = z.infer<typeof creaturePatchSchema>;
/** commit 실패 `422 {file, reason}`의 이유 */
export const COMMIT_REJECT_REASONS = [
  'missing',
  'too_big',
  'signature',
  'dimensions',
  'not_faststart',
  'duration',
  'tracks',
  'audio',
  'box',
] as const;
export type CommitRejectReason = (typeof COMMIT_REJECT_REASONS)[number];
