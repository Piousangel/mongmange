// 환경 변수 검증(zod). 잘못된 값이면 시작하지 않는다 — Cloud Run 리비전이 뜨지 않아 이전 리비전이 그대로 남는다.
// 비밀값의 실제 값은 Secret Manager·GitHub Secrets에만 둔다(.env.example에는 이름과 로컬 기본값만).
// 운영(NODE_ENV=production)에서만 필수인 값은 아래 superRefine이 막는다 — 설정 한 줄 빠뜨려 조용히 뜨는 일을 없앤다(B1 리뷰 I1·I2).
import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const pgUrl = z.url({ protocol: /^postgres(ql)?$/ });
/** 믿을 프록시 수(= X-Forwarded-For 오른쪽에서 몇 번째가 클라이언트인가). client-ip.ts */
const hops = z.coerce.number().int().min(0).max(5);

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(8080),
    /** 런타임 접속(Supabase 트랜잭션 풀러 6543). 어댑터는 이름 있는 prepared statement를 쓰지 않음 [확인 필요: B6] */
    DATABASE_URL: pgUrl,
    /** 인스턴스당 DB 풀 크기(2-5: 5 × 최대 3 인스턴스 = 15) */
    DB_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
    /** 풀에서 연결을 얻는 제한 시간. READY_TIMEOUT_MS보다 짧아야 한다(프로브가 풀 자리를 오래 잡지 않게) */
    DB_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(100).max(10_000).default(1500),
    /** 쿼리 하나의 서버 쪽 제한 시간(Postgres statement_timeout) */
    DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(5000),
    /** /readyz의 DB 확인 제한 시간 */
    READY_TIMEOUT_MS: z.coerce.number().int().min(100).max(10_000).default(2000),
    /** /readyz 결과 캐시(같은 인스턴스에서 이 시간 안의 프로브는 DB를 다시 치지 않는다) */
    READY_CACHE_MS: z.coerce.number().int().min(0).max(60_000).default(2000),
    /**
     * /readyz 내부 토큰. 설정되면 `x-ready-token` 헤더가 같아야 하고, 아니면 404(경로가 있는지도 알리지 않음).
     * 운영 필수 — 배포 스모크·운영자만 안다(Secret Manager). 개발·테스트에서 비우면 열려 있다.
     */
    READY_TOKEN: z.string().min(16).optional(),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    LOG_PRETTY: bool.default(false),
    /** /api/docs Swagger UI. 운영에서는 끈다(문서는 CI가 openapi.json으로 뽑는다) */
    OPENAPI_UI: bool.default(false),
    /**
     * 경로 그룹별 믿을 프록시 수(architecture.md 3-8 `clientIp(req, routeGroup)`).
     *  - API: 앱 → Google 프런트엔드 → Cloud Run. `/m/**`(WEB): 브라우저 → Firebase Hosting → Cloud Run.
     *  - 0 = XFF를 믿지 않고 소켓 주소(로컬). 운영에서는 둘 다 1 이상 필수 — 0이면 모든 사용자가 프록시 주소 한 키로 묶인다.
     *  - 실제 값은 B6 첫날 측정해 e2e 고정물로 박는다 [확인 필요].
     */
    TRUSTED_PROXY_HOPS_API: hops.optional(),
    TRUSTED_PROXY_HOPS_WEB: hops.optional(),
    /** 전역 레이트 리밋(IP 접두당 하나의 카운터, 60초 창). 경로별 더 낮은 한도는 각 B 항목에서 @Throttle로 */
    RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).max(10_000).default(120),
    /**
     * 집계 핑이 받는 출시 판 목록(쉼표, 예 `1.0,1.1`). 밖의 appVer는 조용히 버린다(B0 리뷰 I5: 칸 수 폭주 방지).
     * 새 판을 낼 때 이 값을 먼저 늘린다(배포 체크리스트).
     */
    METRIC_APP_VERSIONS: z
      .string()
      .default('1.0')
      .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean))
      .pipe(z.array(z.string().regex(/^\d{1,2}\.\d{1,2}$/)).min(1)),
    /** 인스턴스당 하루(UTC) 새 집계 칸 상한. 넘는 새 칸은 버리고 개수만 로그(I5) */
    METRIC_NEW_CELLS_PER_DAY: z.coerce.number().int().min(1).max(1_000_000).default(20_000),
    /** /healthz의 ver. CI가 이미지 빌드 때 git sha를 넣는다 */
    APP_VERSION: z.string().min(1).default('dev'),
    /**
     * Supabase 프로젝트 주소(B2). JWT 검사의 iss(`{URL}/auth/v1`)·JWKS(`{URL}/auth/v1/.well-known/jwks.json`)·Auth Admin이 여기서 나온다.
     * 운영 필수(https). 없으면 모든 JWT를 401로 거절한다(로컬·compose — 인증 경로가 '열리는' 일은 없다).
     */
    SUPABASE_URL: z.url({ protocol: /^https?$/ }).optional(),
    /** Auth Admin(사용자 존재 확인·삭제)용 서비스 키. Secret Manager. 운영 필수 */
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
    /** 되찾기 글귀 해시의 pepper(3-3 ⑤, Secret Manager + 오프라인 사본). 운영 필수 32자+. 잃으면 글귀가 전부 무효 */
    RECOVERY_PEPPER: z.string().min(32).optional(),
    /** 지금 pepper의 판 번호(creatures.recovery_pepper_v). 회전할 때 올린다 */
    RECOVERY_PEPPER_V: z.coerce.number().int().min(1).max(32_767).default(1),
    /**
     * 회전 중 옛 pepper들 `판:값,판:값`(Secret Manager). 그 판으로 저장된 글귀를 계속 찾는다.
     * 옛 판 행이 0이 될 때까지(architecture 3-3 ⑤ 'pepper 회전') 지우지 않는다
     */
    RECOVERY_PEPPERS_PREVIOUS: z
      .string()
      .optional()
      .transform((v, ctx) => {
        if (!v) return [];
        const out: Array<{ v: number; value: string }> = [];
        for (const part of v.split(',')) {
          const i = part.indexOf(':');
          const ver = Number(part.slice(0, i));
          const value = part.slice(i + 1);
          if (i < 1 || !Number.isInteger(ver) || ver < 1 || value.length < 32) {
            ctx.addIssue({ code: 'custom', message: '`판:값` 꼴, 값 32자 이상' });
            return z.NEVER;
          }
          out.push({ v: ver, value });
        }
        return out;
      }),
    /** 서비스 전체 하루(UTC) 새 기기 로그인(계정 생성·되찾기) 상한(3-4-1). 넘으면 503 + 운영 알림 로그 */
    ACCOUNT_NEW_PER_DAY: z.coerce.number().int().min(1).max(1_000_000).default(5000),
    /**
     * `/internal/cron/*`(Cloud Scheduler) OIDC 검사(2-4): aud = 이 값과 **정확히 같은 문자열**, email = 전용 Scheduler 서비스 계정.
     * 값 = 서비스 URL 전체(경로 없음, 예 `https://mong-api-xxxx-du.a.run.app`). Scheduler 잡의 OIDC audience를 **이 값으로 명시**한다
     * (비워 두면 Google은 대상 URL 전체 `…/internal/cron/storage-gc`를 aud로 넣어 늘 404가 된다). 운영 필수(B2 리뷰 I2) —
     * 없으면 삭제 뒤처리·옛 기기 30일 정리가 조용히 멈춘다. 개발에서 없으면 경로가 404.
     */
    CRON_AUDIENCE: z.url({ protocol: /^https?$/ }).optional(),
    CRON_SA_EMAIL: z.email().optional(),
    /** 웹 `/delete` 페이지 출처(CORS 허용 하나, 3-8 ②) */
    WEB_ORIGIN: z.url({ protocol: /^https?$/ }).default('https://mongmang.ink'),
    /**
     * B3 파일 저장소. `none` = 설정 안 됨(링크 API 503, 삭제 대기열은 다음 시도로 — 운영 기본, 실제 Supabase Storage는 B6),
     * `local` = 파일 시스템(개발·시험 전용 — 운영에서는 부팅 거부: Cloud Run 디스크는 인스턴스와 함께 사라진다)
     */
    STORAGE_DRIVER: z.enum(['none', 'local']).default('none'),
    /** local 드라이버 루트 폴더 */
    STORAGE_LOCAL_DIR: z.string().min(1).default('.storage-local'),
    /** local 드라이버의 바깥 주소(서명 업로드·공개 파일 주소의 앞). 비우면 http://localhost:{PORT} */
    STORAGE_LOCAL_BASE_URL: z.url({ protocol: /^https?$/ }).optional(),
    /** 사이트 출처(/m 페이지의 live.js·config 경로, 링크 주소). 경로 없이 */
    SITE_ORIGIN: z.url({ protocol: /^https?$/ }).default('https://mongmang.ink'),
    /** App Store 앱 id(숫자) — /m 스토어 버튼. 없으면 App Store 첫 화면으로 */
    APP_STORE_ID: z.string().regex(/^\d{6,12}$/).optional(),
    /**
     * 신고 자동 숨김(B5, 3-8 ③). 끄면 문턱을 넘어도 숨기지 않고 운영자 대기 목록에만 올린다(held 'disabled').
     * 비우면 운영(production) 꺼짐·그 밖 켜짐 — **B6에서 XFF 위치(TRUSTED_PROXY_HOPS_WEB)를 실측한 뒤에만 운영에서 켠다**:
     * hops가 실제보다 크면 맨 왼쪽 XFF로 신고자 키를 마음대로 만들어 한 사람이 요청 3번으로 아무 페이지나 숨긴다(B5 리뷰 H2)
     */
    REPORT_AUTO_HIDE: bool.optional(),
    /** 서비스 전체 자동 숨김 차단기 — 최근 1시간 이만큼 숨겼으면 그다음은 대기 목록에만(비우면 contract REPORT_AUTO_HIDE_PER_HOUR = 5) */
    REPORT_AUTO_HIDE_PER_HOUR: z.coerce.number().int().min(1).max(1000).optional(),
    ANDROID_PACKAGE: z.string().regex(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/).default('com.piousangel.mongmange'),
  })
  .superRefine((e, ctx) => {
    if (e.RECOVERY_PEPPERS_PREVIOUS.some((p) => p.v >= e.RECOVERY_PEPPER_V)) {
      ctx.addIssue({ code: 'custom', path: ['RECOVERY_PEPPERS_PREVIOUS'], message: '옛 판 번호는 RECOVERY_PEPPER_V보다 작아야 합니다' });
    }
    if (new Set(e.RECOVERY_PEPPERS_PREVIOUS.map((p) => p.v)).size !== e.RECOVERY_PEPPERS_PREVIOUS.length) {
      ctx.addIssue({ code: 'custom', path: ['RECOVERY_PEPPERS_PREVIOUS'], message: '같은 판 번호가 두 번 있습니다' });
    }
    if (e.DB_CONNECT_TIMEOUT_MS >= e.READY_TIMEOUT_MS) {
      ctx.addIssue({ code: 'custom', path: ['DB_CONNECT_TIMEOUT_MS'], message: 'READY_TIMEOUT_MS보다 짧아야 합니다' });
    }
    if (e.NODE_ENV !== 'production') return;
    for (const k of ['TRUSTED_PROXY_HOPS_API', 'TRUSTED_PROXY_HOPS_WEB'] as const) {
      if (!e[k]) ctx.addIssue({ code: 'custom', path: [k], message: '운영에서는 1 이상이어야 합니다(0이면 전원이 한 키)' });
    }
    if (!e.READY_TOKEN) ctx.addIssue({ code: 'custom', path: ['READY_TOKEN'], message: '운영에서는 필수입니다(/readyz 비공개)' });
    // B2: 운영에서 인증·되찾기 설정이 빠지면 조용히 뜨지 않는다(로그인 전부 401·글귀가 개발용 pepper로 해시되는 사고 방지)
    if (!e.SUPABASE_URL?.startsWith('https://')) ctx.addIssue({ code: 'custom', path: ['SUPABASE_URL'], message: '운영에서는 https 주소가 필수입니다' });
    if (!e.SUPABASE_SERVICE_ROLE_KEY) ctx.addIssue({ code: 'custom', path: ['SUPABASE_SERVICE_ROLE_KEY'], message: '운영에서는 필수입니다(Auth Admin)' });
    if (!e.RECOVERY_PEPPER) ctx.addIssue({ code: 'custom', path: ['RECOVERY_PEPPER'], message: '운영에서는 필수입니다(32자 이상)' });
    if (!e.CRON_AUDIENCE?.startsWith('https://')) ctx.addIssue({ code: 'custom', path: ['CRON_AUDIENCE'], message: '운영에서는 서비스 URL(https, 경로 없음)이 필수입니다' });
    if (e.STORAGE_DRIVER === 'local') ctx.addIssue({ code: 'custom', path: ['STORAGE_DRIVER'], message: '운영에서는 local 저장소를 쓸 수 없습니다(B6 전까지 none)' });
    if (!e.CRON_SA_EMAIL) ctx.addIssue({ code: 'custom', path: ['CRON_SA_EMAIL'], message: '운영에서는 Scheduler 서비스 계정 이메일이 필수입니다' });
  })
  .transform((e) => ({ ...e, TRUSTED_PROXY_HOPS_API: e.TRUSTED_PROXY_HOPS_API ?? 0, TRUSTED_PROXY_HOPS_WEB: e.TRUSTED_PROXY_HOPS_WEB ?? 0 }));

export type Env = z.infer<typeof envSchema>;

/** ConfigModule.validate용. 실패하면 어떤 키가 왜 틀렸는지만 말한다(값은 찍지 않는다 — 비밀값 유출 방지) */
export function validateEnv(raw: Record<string, unknown>): Env {
  const r = envSchema.safeParse(raw);
  if (!r.success) {
    const keys = r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`환경 변수 오류 — ${keys}`);
  }
  return r.data;
}

/** 예시·개발 전용 엔드포인트를 붙일지(운영 이미지에서는 모듈 자체가 없다) */
export function devEndpointsEnabled(env: NodeJS.ProcessEnv): boolean {
  return (env.NODE_ENV ?? 'development') !== 'production';
}
