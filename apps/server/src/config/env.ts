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
  })
  .superRefine((e, ctx) => {
    if (e.DB_CONNECT_TIMEOUT_MS >= e.READY_TIMEOUT_MS) {
      ctx.addIssue({ code: 'custom', path: ['DB_CONNECT_TIMEOUT_MS'], message: 'READY_TIMEOUT_MS보다 짧아야 합니다' });
    }
    if (e.NODE_ENV !== 'production') return;
    for (const k of ['TRUSTED_PROXY_HOPS_API', 'TRUSTED_PROXY_HOPS_WEB'] as const) {
      if (!e[k]) ctx.addIssue({ code: 'custom', path: [k], message: '운영에서는 1 이상이어야 합니다(0이면 전원이 한 키)' });
    }
    if (!e.READY_TOKEN) ctx.addIssue({ code: 'custom', path: ['READY_TOKEN'], message: '운영에서는 필수입니다(/readyz 비공개)' });
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
