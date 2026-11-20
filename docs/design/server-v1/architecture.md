# 서버 아키텍처 v1 — 몽망이 키우기

- 상태: **초안 v1(2026-11-20)**. 독립 리뷰 후 D-21에 확정한다(D-21 '구조는 설계 후 확정'). 이 문서는 코드·DECISIONS를 고치지 않는다.
- 범위: **인프라 층**(스택·Docker·호스팅·인증·세이브 동기화·공유 링크·지표·기능 플래그·개인정보·배포). 소셜 기능(방문·선물·도감·비교)은 확장 자리만 남긴다. 기획 v2(`docs/design/plan-v2/plan-v2.md` 끝 '서버 요구사항 명세')가 나오면 2차 반영한다.
- 전제(오너 11-20 지정): **NestJS + Prisma + Supabase(Postgres·Auth·Storage) + Docker**. 후보 스택 비교는 하지 않고, 이 조합 안에서 호스팅·역할 분담·운영 방식을 고른다.
- 근거: D-06·D-13·D-15·D-17·D-18·D-19·D-20·D-21, `docs/design/pillars-v1/C-integrated.md` v1.1(2-2 인장 코드·2-3 이름표·2-5 랜딩·4-1 빌드), `docs/strategy/number-one.md`(측정·랜딩), `docs/release/privacy-policy.ko.md`, `store-listing.md` 7절, `packages/core/src/save/*`·`sim/save.ts`, `apps/mobile/src/game/storage.ts`·`features.ts`.
- 표기: 출처가 있는 사실은 링크(끝 '출처'), 팀 판단은 **[팀 추정]**, 공식 문서로 끝까지 못 본 것은 **[확인 필요]**.

---

## 0. 한 장 요약

| 항목 | 결정(제안) |
|---|---|
| 원칙 | **앱이 정본, 서버는 사본·창구.** 서버가 죽어도 게임은 한 프레임도 멈추지 않는다(D-21 원칙). 모든 서버 호출은 비차단·재시도·포기 가능 |
| DB·인증·파일 | Supabase **서울(ap-northeast-2)** 한 프로젝트(운영) + 무료 프로젝트 1개(스테이징) |
| API 서버 | NestJS(Fastify 어댑터) → Docker 이미지 → **Google Cloud Run 서울(asia-northeast3)**, 최소 인스턴스 0(빌드 2)→1(출시 주) |
| 도메인 앞단 | **Firebase Hosting**(같은 GCP 프로젝트): 정적(랜딩·`.well-known`·플래그 JSON·삭제 안내) + `/m/**`·`/api/**`를 Cloud Run 서울로 rewrite. Cloud Run 자체 도메인 매핑은 서울 미지원·미리보기라 쓰지 않는다 |
| Edge Functions | **쓰지 않는다**(빌드 2~1.0). 정리 작업은 Postgres `pg_cron`. HTML 응답은 커스텀 도메인 애드온 없이는 막혀 있어 웹 뷰어에도 못 쓴다 |
| 인증 | 계정은 **필요한 순간에만** 만든다(첫 링크 공유·'맡겨 두기' 켤 때). Supabase 익명 로그인 → 기기 변경은 **복원 코드**(빌드 3) → Apple/Google 연결은 1.0.x(새 네이티브 모듈 필요) |
| 세이브 동기화 | 통째 스냅샷 + 리비전(If-Match). **병합하지 않는다.** 충돌 시 기기 쪽을 지키고 서버 쪽은 이력으로 남김(잃지 않음). 서버 검증 = `@mong/core` `parseState` 그대로 |
| 공유 링크 | `https://{도메인}/m/{코드8}` — 코드는 **서버가 보안 난수로 발급하는 40비트 Crockford base32**. `sealSeed`에서 파생하지 않는다(추측 가능해짐) |
| 지표 | **식별자 없는 집계 핑**(코호트 날짜 + n일째 + 플랫폼·버전·언어) → D1/D7 계산. 링크 조회·스토어 클릭은 서버 카운터. 설치 귀속은 스토어 콘솔 캠페인 링크 |
| 플래그 | 정적 `config/v1.json`(Git으로 배포) → 앱이 받아 MMKV에 캐시. 기본값 < 원격 < 개발 메뉴 |
| 비용 | 빌드 2~소프트런칭: **월 0원 + 도메인**. 출시 후 10만 명 가정: **월 약 35~70달러** [팀 추정] |
| 빌드 2(12-10) 최소 | 바이너리에 도메인 링크 설정(유니버설·앱 링크) + 원격 플래그 + 지표 핑 + 공유 링크·웹 뷰어. 클라우드 보관은 빌드 3, 계정 연결은 1.0.x |
| 오너 할 일(급함) | **도메인 구매 12-03까지**(빌드 2 바이너리에 박힘), GCP·Supabase·Firebase 계정·결제, Apple 팀 ID 확인 |

---

## 1. 서버 역할과 우선순위

| 순위 | 역할 | 기둥 | 첫 출시 빌드 | 없으면 |
|---|---|---|---|---|
| ① | **공유 링크 웹 뷰어** — 남의 몽망이·꿈 카드를 웹에서 보고 스토어로. OG 이미지, 유니버설/앱 링크 | ② 자랑 → 호기심 | 빌드 2 | 링크가 랜딩으로만 감(그래도 링크는 살아 있음) |
| ② | **클라우드 보관** — 익명 계정, 기기 변경 복원, 충돌 해결 | ③ 관계(잃지 않음, D-03) | 빌드 3 | 기기 백업(iCloud·Auto Backup)·내보내기 코드(D-06)만 |
| ③ | **자체 익명 지표** — D1/D7, 공유 → 링크 조회 → 스토어 클릭 | 운영 | 빌드 2 | 콘솔 지표만(D-18 원래 방식) |
| ④ | **원격 기능 플래그** — 빌드 2 세 기둥 기능 켜고 끄기 | 운영 | 빌드 2 | 바이너리 기본값 고정(재빌드 필요) |
| ⑤ | **1.x 방문·도감·비교 기반** | ① 자유도 | 자리만 | — |

①이 1순위인 까닭: D-19 기둥 ②의 전환 지점이 "링크를 누른 사람이 무엇을 보느냐"이고, 바이너리에 도메인을 박는 일은 **빌드 2를 놓치면 빌드 3까지 밀린다**. ③④는 싸고(합쳐 1일 남짓) 소프트런칭(12-29) 판정에 바로 쓰인다. ②는 가치가 크지만 충돌·복원 화면·삭제 절차까지 묶여야 해서 빌드 3에 둔다.

---

## 2. 스택 구성과 역할 분담

### 2-1. 그림

```
[앱 iOS/Android/웹]                                [SNS 크롤러·링크 손님 브라우저]
   │  (모든 호출 비차단, 5초 타임아웃, 아웃박스)            │
   │                                                       ▼
   │                         ┌──── Firebase Hosting (https://{도메인}) ────┐
   │                         │ 정적: / 랜딩, /.well-known/*, /config/v1.json, │
   │                         │       /delete 안내, 루프 영상·정적 자산        │
   │  /api/** ──────────────▶│ rewrite: /api/**, /m/** → Cloud Run 서울      │
   │                         └───────────────────────┬──────────────────────┘
   │                                                 ▼
   │                      ┌─ Cloud Run 서울 (asia-northeast3) ─┐
   │                      │ NestJS(Fastify) Docker 이미지        │
   │                      │  · /api/v1/* JSON API                │
   │                      │  · /m/{code} HTML(OG 메타) 렌더      │
   │                      │  · JWT 검증(Supabase JWKS)           │
   │                      │  · 세이브 검증 = @mong/core          │
   │                      └──────┬───────────────┬───────────────┘
   │                             │Prisma(풀러)    │service role(서명 업로드 URL 발급)
   ▼                             ▼                ▼
 Supabase Auth ◀──익명 로그인──  Supabase Postgres  Supabase Storage(공유 이미지)
 (앱이 supabase-js로 직접)       (서울, schema app)  ◀── 앱이 서명 URL로 직접 PUT
```

### 2-2. 누가 무엇을 하나

| 구성 요소 | 맡는 일 | 맡지 않는 일 |
|---|---|---|
| **Supabase Auth** | 익명 로그인, JWT 발급·갱신, (1.0.x) Apple/Google 연결 | 권한 판단(그건 Nest) |
| **Supabase Postgres** | 모든 데이터. `pg_cron`으로 정리 작업(익명 계정 만료, 이력 솎기) | Data API(PostgREST) 노출 — `app` 스키마는 노출하지 않는다 |
| **Supabase Storage** | 공유 카드 PNG/JPEG·OG 이미지(공개 버킷), 서명 업로드 URL | 세이브 본문(Postgres에 둔다, 2-4) |
| **NestJS on Cloud Run** | API 전부, `/m/{code}` HTML, 레이트 리밋, 세이브 검증, 삭제 처리 | 이미지 렌더(앱이 이미 Skia로 그린다), 정적 파일 |
| **Firebase Hosting** | 도메인·TLS·CDN, 정적 파일, Cloud Run rewrite, `/m/**` 응답 CDN 캐시 | 동적 로직 |
| **Edge Functions** | 없음(자리만) | — |

**왜 Edge Functions를 안 쓰나**: ① 웹 뷰어는 크롤러용 HTML이 필요한데, Supabase는 커스텀 도메인 없이 Edge Function의 HTML 응답을 막고(`text/html` GET을 `text/plain`으로 바꿈) 커스텀 도메인도 "프론트엔드 호스팅 용도가 아니다"라고 적는다([HTTP methods](https://supabase.com/docs/guides/functions/http-methods), [changelog 29633](https://supabase.com/changelog/29633-xhtml-responses-are-only-allowed-with-a-custom-domain-enabled), [custom domains](https://supabase.com/docs/guides/platform/custom-domains)). ② Deno 런타임이라 `@mong/core` 검증을 Nest와 두 군데서 돌리게 된다. ③ 1인 운영에서 배포 경로를 하나로 줄인다. 1.x에 Auth Hook(예: 가입 시 커스텀 클레임)이 필요해지면 그때 Postgres 함수 훅으로 먼저 해결한다.

**왜 이미지를 서버가 안 그리나**: 꿈 카드·이름표 PNG는 이미 앱의 Skia 파이프라인이 화면·웹·네이티브에서 같은 결과로 만든다(C-integrated 2-3 "별도 내보내기 코드 없음"). 서버에서 다시 그리면 렌더 코드가 둘이 되고 글꼴 서브셋·먹 셰이더를 서버에 옮겨야 한다. 앱이 **4:5 카드 + 1200×630 OG 변형**을 함께 그려 올린다(OG 변형은 같은 `cardTextBoxes` 배치에 가로 여백만 다른 틀, 개발 0.5일 [팀 추정]).

### 2-3. NestJS 호스팅 비교(Docker 이미지를 그대로 올리는 곳)

| 기준 | **Cloud Run** | Fly.io | Render | Railway | Koyeb |
|---|---|---|---|---|---|
| 서울 근처 리전 | **서울 asia-northeast3**(+도쿄) | 도쿄 `nrt`·싱가포르 `sin`, 서울 없음 | 싱가포르만 | 싱가포르만 | 도쿄·싱가포르, 서울 없음 |
| DB(서울)까지 왕복 | 같은 도시 수 ms | 도쿄↔서울 약 30ms × 쿼리 수 [팀 추정] | 약 70ms × 쿼리 수 [팀 추정] | 약 70ms × 쿼리 수 [팀 추정] | 30~70ms × 쿼리 수 |
| 무료·저비용 | 월 무료 한도(요청 200만 등, 서울은 Tier 2 단가) + 0으로 축소 | 신규 조직 상시 무료 없음 [확인 필요], 작은 머신 월 수 달러 | 무료 인스턴스는 15분 유휴 시 잠듦 [확인 필요] | 사용량 과금(월 기본료) [확인 필요] | 무료 인스턴스 리전 제한 [확인 필요] |
| 콜드 스타트 | 0 축소 시 있음(Nest 1~3초 [팀 추정]), Startup CPU boost·min 1로 완화 | 머신 자동 정지 시 있음 | 무료는 수십 초 | 상시 켜짐(비용) | 0 축소 시 있음 |
| 커스텀 도메인 | 서울은 도메인 매핑 미지원 → Firebase Hosting 또는 LB | 쉬움(인증서 자동) | 쉬움 | 쉬움 | 쉬움 |
| 국외 이전 고지(5절) | 컴퓨트가 국내 → 고지 부담 작음 | 일본 처리 → 고지 필요 | 싱가포르 → 고지 | 싱가포르 → 고지 | 일본/싱가포르 → 고지 |
| 1인 운영 | gcloud·IAM 학습 필요, 대신 로그·지표·업타임 체크·예산 알림 내장 | flyctl 단순 | 가장 단순 | 단순 | 단순 |
| 잠금 | 표준 컨테이너(Knative 계약) → 어디로든 이동 | 표준 컨테이너 | 표준 컨테이너 | 표준 컨테이너 | 표준 컨테이너 |

**추천: Cloud Run 서울.** 결정 요인은 두 가지다. ① Prisma는 한 요청에 쿼리를 여러 번 보낸다. API 서버를 DB와 같은 도시에 두지 않으면 쿼리마다 30~70ms가 곱해져 '세이브 올리기'가 수백 ms가 된다. Supabase를 서울에 두는 순간 API도 서울이어야 하고, 위 다섯 중 서울 리전은 Cloud Run뿐이다. ② 컴퓨트·DB가 모두 국내라 개인정보 국외 이전 고지가 가장 작다(5-4).
- 차선: **Fly.io 도쿄**(min 1대 상시, 도메인 쉬움) — Cloud Run IAM이 버거우면 바꾼다. Docker 이미지가 같으니 이전 비용은 반나절 [팀 추정].
- 커스텀 도메인: Cloud Run 도메인 매핑은 미리보기이고 서울을 지원하지 않는다. 그래서 **Firebase Hosting rewrite**를 쓴다(저비용, 정적 파일 같이 서빙)([Cloud Run 커스텀 도메인](https://docs.cloud.google.com/run/docs/mapping-custom-domains)). 글로벌 외부 LB는 월 고정비가 있어 출시 후 트래픽이 커지면 다시 본다. Firebase Hosting의 Cloud Run rewrite가 asia-northeast3를 지원하는지는 첫 배포 때 확인한다 **[확인 필요]** — 안 되면 대안은 Cloudflare(오너 경험 있음) Worker 프록시.
- 설정값(빌드 2): `--region=asia-northeast3 --min-instances=0 --max-instances=3 --cpu-boost --concurrency=40 --memory=512Mi --cpu=1`. 출시 주(02-02 전후)에 `--min-instances=1`. **max-instances 3은 비용 상한**이기도 하다(7절 남용).

### 2-4. Supabase 설정

| 항목 | 값 |
|---|---|
| 리전 | **서울 ap-northeast-2**(지원 확인, [Regions](https://supabase.com/docs/guides/platform/regions)) |
| 요금제 | 빌드 2 테스트 = Free(스테이징 겸). **12-26 동결 전 운영 프로젝트를 Pro로**: Free는 1주 비활성 시 일시정지되고 백업이 없다([Pricing](https://supabase.com/pricing)) |
| 프로젝트 | `mong-prod`(Pro, 서울) / `mong-staging`(Free, 서울). Free 활성 프로젝트는 2개까지 |
| 스키마 | 앱 테이블은 **`app` 스키마**. Data API 노출 스키마 목록에 넣지 않는다 → anon/authenticated 키로 PostgREST 직접 접근 불가 |
| RLS | `app`의 모든 테이블에 RLS **켜고 정책 0개**(실수로 노출돼도 아무것도 안 보임). Nest는 테이블 소유자 롤 `prisma`로 접속하므로 RLS를 우회한다 — **권한 판단은 Nest가 JWT의 `sub`로 한다** |
| Storage | 버킷 `share-public`(공개 읽기, 쓰기 정책 없음). 업로드는 Nest가 service role로 `createSignedUploadUrl`을 발급 → 앱이 직접 PUT. 이미지가 Cloud Run을 거치지 않는다 |
| Auth | 익명 로그인 켬, 수동 연결(manual linking) 켬(1.0.x 대비), 익명 가입 IP 한도 기본 30/시간 → **통신사 CGNAT** 때문에 올려야 할 수 있음(7절) |
| JWT 검증 | Nest가 프로젝트 JWKS(`/auth/v1/.well-known/jwks.json`)로 비대칭 서명 검증(`jose`). 신규 프로젝트 기본 서명 방식은 생성 때 확인 **[확인 필요]**. HS256 공유 비밀이면 Secret Manager에 넣는다 |
| 정리 작업 | `pg_cron`: 매일 04:00 KST — 계정만 있고 데이터 없는 익명 사용자 30일 뒤 삭제(공식 문서가 SQL 삭제를 권함, [Anonymous](https://supabase.com/docs/guides/auth/auth-anonymous)), 세이브 이력 솎기, 집계 테이블 90일 이전 행 월 단위로 말기 |

### 2-5. Prisma 운영

- 버전: **Prisma 7**(2025-11 출시). Rust 쿼리 엔진이 빠진 `prisma-client` 생성기가 기본이고 **드라이버 어댑터가 필수**다 → `@prisma/adapter-pg`. `.env`를 자동으로 읽지 않으므로 `prisma.config.ts`에서 직접 읽는다([Prisma 7 changelog](https://www.prisma.io/changelog/2025-11-19), [업그레이드 가이드](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7)). 엔진 바이너리가 없어 Docker 이미지가 작아지고 콜드 스타트가 짧다.
- 연결 문자열(Supabase 권장, [Supabase × Prisma](https://supabase.com/docs/guides/database/prisma)):

| 변수 | 값 | 쓰는 곳 |
|---|---|---|
| `DATABASE_URL` | **트랜잭션 풀러** `...pooler.supabase.com:6543/postgres?pgbouncer=true`, 사용자 `prisma.{ref}` | Cloud Run 런타임(인스턴스가 늘었다 줄었다 하는 서버리스 → 트랜잭션 모드) |
| `DIRECT_URL` | **세션 풀러** `:5432`(직접 연결은 IPv6 전용이라 GitHub Actions에서 못 씀) | `prisma migrate deploy`(CI), 로컬 `prisma migrate dev` |

- 풀 크기: 인스턴스당 `max: 5`, max-instances 3 → 최대 15 연결. 트랜잭션 모드에서는 세션 기능(advisory lock, `SET`, LISTEN)을 쓰지 않는다. 대화형 트랜잭션은 짧게.
- 전용 롤: `postgres` 대신 `prisma` 롤을 만들고 `app` 스키마 소유권을 준다(Supabase 권장). 마이그레이션도 이 롤로.
- 마이그레이션 운영: `prisma migrate dev`(로컬, 로컬 Supabase) → PR에 SQL 포함 → CI `migrate deploy`(스테이징) → 태그 시 `migrate deploy`(운영) → 그다음 이미지 배포. **컨테이너 시작 때 마이그레이션하지 않는다**(인스턴스 여럿이 동시에 돌리는 사고 방지). 마이그레이션은 **확장 → 배포 → 축소** 두 단계로(열 삭제는 다음 릴리스). RLS 켜기·`pg_cron` 등록 같은 Supabase 전용 SQL은 Prisma 마이그레이션 안의 raw SQL로 넣어 한 이력에 둔다.
- 잠금 정도: Prisma + 표준 Postgres라 DB는 언제든 다른 Postgres로 옮길 수 있다. **잠금 지점은 Supabase Auth 하나**이고, Nest에 `AuthVerifier` 인터페이스를 두어 JWT 검증을 바꿔 끼울 수 있게 한다.

---

## 3. 데이터 모델·API·인증·동기화·링크

### 3-1. 테이블(Prisma, 스키마 `app`)

| 테이블 | 키·열 | 인덱스·제약 | 비고 |
|---|---|---|---|
| `users` | `id uuid PK`(= `auth.users.id`), `created_at`, `last_active_day date`, `recovery_hash bytea?`, `recovery_rotated_at?`, `locale char(2)` | — | 이름·이메일 없음. 이메일은 1.0.x 연결 때 `auth.users`에만 생기고 여기 복사하지 않는다 |
| `creatures` | `id uuid PK`, `user_id uuid FK→users ON DELETE CASCADE`, `code char(8) UNIQUE`, `link_enabled bool default true`, `hidden bool`(운영 숨김), `created_at` | `UNIQUE(user_id)`는 1.0까지 앱 규칙으로만(테이블은 여러 마리 허용 → 1.x 회차·혈통) | 몽망이 한 마리 = 한 행. **인장 코드 = 링크 키** |
| `saves` | `creature_id PK FK CASCADE`, `rev int`, `body bytea`(gzip한 세이브 JSON), `body_sha256 bytea`, `envelope_ver smallint`, `sim_ver smallint`, `validated bool`, `client_saved_at timestamptz`, `day_index int`, `strokes_total int`, `device_id uuid`, `updated_at` | — | 지금 한 벌. 본문 상한 512KB(압축 전) |
| `save_versions` | `id bigserial PK`, `creature_id FK CASCADE`, `rev`, `body`, `body_sha256`, `client_saved_at`, `reason enum(overwritten,daily,conflict,pre_restore)`, `created_at` | `(creature_id, created_at desc)` | 최근 덮어쓴 3벌 + 하루 1벌 7일 + 충돌본 전부(30일). `pg_cron`이 솎음 |
| `shares` | `id uuid PK`, `creature_id FK CASCADE`, `kind enum(card,nametag,scroll)`, `card_key text`(예: `day-12`), `image_path`, `og_path`, `public_meta jsonb`, `created_at`, `hidden bool` | `(creature_id, created_at desc)` | `public_meta` = `{name, ink, label, dayIndex, bornDate, lang}`만. 획 원본은 넣지 않는다(1.x '살아 있는 몽망이' 때 별도 결정) |
| `reports` | `id bigserial`, `code char(8)`, `reason enum`, `created_at` | `(code)` | 신고자 정보 없음 |
| `metric_daily` | PK `(day date, event text, cohort_day date, day_n smallint, platform text, app_ver text, lang text)`, `count int` | — | **식별자 없는 집계**(3-6). UPSERT `count = count + 1` |
| `link_daily` | PK `(day, code, event enum(view,store_ios,store_android,open_app))`, `count` | — | 공유 → 조회 → 스토어 클릭 퍼널 |
| `deletion_log` | `id bigserial`, `requested_at`, `completed_at`, `channel enum(app,web,email)`, `items jsonb`(지운 개수) | — | 파기 기록(누구인지는 남기지 않는다, 5-5) |
| (자리) `visits`, `gifts`, `dex_entries`, `friend_links` | `creature_id` FK CASCADE를 공통으로 | — | 기획 v2 뒤 2차 반영. 모든 소셜 테이블은 `creatures`에 매달아 **삭제 한 번에 같이 지워지게** 한다 |

### 3-2. API(버전 접두 `/api/v1`, JSON, 인증 = `Authorization: Bearer <Supabase JWT>`)

| 메서드·경로 | 인증 | 요청 → 응답 | 빌드 |
|---|---|---|---|
| `GET /healthz` | 없음 | `200 {ok, ver}` (DB 안 건드림) / `GET /readyz`는 DB `select 1` | 2 |
| `POST /api/v1/ping` | **없음** | `{cohortDay:'2026-12-14', dayN:3, platform:'android', appVer:'1.0.0(12)', lang:'ko', events?:['share_open']}` → `204` | 2 |
| `POST /api/v1/me/bootstrap` | JWT | `{}` → `{userId, creature:{code}}` (멱등. 사용자·몽망이 행·코드 생성) | 2 |
| `POST /api/v1/shares` | JWT | `{kind, cardKey, meta:{name?, ink?, label?, dayIndex, bornDate, lang}, image:{contentType:'image/jpeg', bytes}, og:{...}}` → `{shareId, url:'https://{도메인}/m/K7M3QX9P', upload:{image:{signedUrl, token}, og:{...}}}` | 2 |
| `POST /api/v1/shares/{id}/commit` | JWT | `{}` → `200`(Storage에 두 파일이 있는지 확인 후 공개) | 2 |
| `DELETE /api/v1/shares/{id}` | JWT | → `204`(행·파일 삭제) | 2 |
| `PATCH /api/v1/creature` | JWT | `{linkEnabled:false}` → `200`(링크 끄기: `/m/{code}`가 '사라진 링크'로) | 2 |
| `GET /api/v1/saves/main/meta` | JWT | → `{rev, sha, clientSavedAt, dayIndex, strokesTotal, envelopeVer, simVer}` / `404` | 3 |
| `GET /api/v1/saves/main` | JWT | → 위 + `body`(세이브 JSON 문자열) | 3 |
| `PUT /api/v1/saves/main` | JWT, `If-Match: <rev>`(처음은 `If-None-Match: *`) | `{body, clientSavedAt, deviceId}` → `200 {rev}` / `409 {server: meta}` / `413` / `422 {reason}` | 3 |
| `GET /api/v1/saves/main/versions` | JWT | → `[{id, reason, clientSavedAt, dayIndex, strokesTotal}]` | 3 |
| `POST /api/v1/saves/main/versions/{id}/restore` | JWT | → `200 {rev}`(현재본은 `pre_restore`로 이력에) | 3 |
| `POST /api/v1/recovery-code` | JWT | `{}` → `{code:'XXXX-XXXX-XXXX-XXXX'}` (한 번만 보여 줌, 재발급 시 옛 코드 무효) | 3 |
| `POST /api/v1/recover` | JWT(새 기기의 익명 사용자) | `{code}` → `200 {creature:{code}, save:meta}`(몽망이를 이 사용자로 옮기고 옛 익명 사용자 삭제) / `404` | 3 |
| `DELETE /api/v1/me` | JWT | → `202 {deletionId}`(3-8 절차) | 3(링크만 쓰는 사용자도 빌드 2부터 앱 안 '링크 지우기' = `DELETE /shares` + 링크 끄기) |
| `GET /m/{code}` | 없음 | HTML(OG·트위터 카드 메타, 카드 이미지, 랜딩 루프, 한 줄 문구, 스토어 버튼). 없는·꺼진 코드는 같은 틀의 '사라진 링크' 페이지(200, noindex) | 2 |
| `GET /m/{code}/get?p=ios\|android` | 없음 | `302` 스토어(캠페인 파라미터 포함, 3-6) + 카운트 | 2 |
| `POST /m/{code}/report` | 없음 | 폼 → `303` 감사 페이지 | 2 |
| 정적(Firebase) | — | `/`, `/.well-known/apple-app-site-association`, `/.well-known/assetlinks.json`, `/config/v1.json`, `/delete`, `/privacy`, `/robots.txt` | 2 |

- OpenAPI: `@nestjs/swagger`로 스펙을 만들고 `openapi-typescript`로 타입을 뽑아 `packages/api-contract`에 커밋한다. 앱은 이 타입으로 `fetch`만 쓴다(추가 라이브러리 없음). 스펙 변화는 CI가 diff로 잡는다(6-3).
- 운영 도구: 관리자 API는 만들지 않는다. 숨김·신고 처리는 Supabase Studio + 저장된 SQL 스니펫(`docs/ops/` 예정).

### 3-3. 인증 — "필요할 때 익명 → 복원 코드 → (선택) Apple/Google"

1. **설치 직후에는 계정을 만들지 않는다.** 지표 핑과 플래그는 인증이 필요 없다. 몽망이를 키우는 동안 서버는 사용자를 모른다.
2. **계정이 생기는 순간 두 가지**: ① 첫 '링크로 공유'(빌드 2) ② 공방 노트 '몽망이 맡겨 두기'를 켤 때(빌드 3). 이때 `supabase.auth.signInAnonymously()` → `POST /me/bootstrap`.
   - 효과: Supabase MAU가 '실제로 서버를 쓴 사람'만 센다(익명 사용자가 MAU에 드는지는 가격표에 없다 **[확인 필요]** — 든다고 보고 계산). 익명 가입 남용 면적도 줄어든다.
   - 세션 저장: supabase-js의 `storage` 어댑터를 기존 MMKV(`kv`)로. 앱을 지우면 세션도 사라지므로 **복원 코드가 유일한 열쇠**다.
3. **복원 코드(빌드 3)** — 새 네이티브 모듈 없이 기기 변경을 푸는 방법. 서버가 80비트 보안 난수로 16자 Crockford base32 코드를 만들고, **해시(SHA-256 + 서버 pepper)만 저장**한다. 앱은 '맡겨 두기'를 켤 때 코드를 한 번 보여 주고 "사진으로 남겨 두세요"라고 안내한다(문구는 작가 몫). 새 기기에서 코드를 넣으면 `POST /recover`가 몽망이를 새 익명 사용자로 옮긴다. 시도 한도 IP당 5회/시간, 코드당 10회/일.
4. **Apple/Google 연결(1.0.x)** — 익명 사용자에 `linkIdentity`로 붙인다(수동 연결 설정 필요). iOS는 `expo-apple-authentication`의 identity token → `signInWithIdToken`, 네이티브 전용이면 Apple 비밀 키 6개월 갱신이 필요 없다([Apple 로그인](https://supabase.com/docs/guides/auth/social-login/auth-apple)). Google은 네이티브 Google 로그인 모듈 또는 웹 OAuth(`expo-web-browser`) — **둘 다 새 네이티브 모듈**이라 빌드 3 동결 뒤로 미룬다. 이미 연결된 계정으로 다시 로그인했는데 익명 쪽에도 몽망이가 있으면 → 3-4의 충돌 규칙을 그대로 쓴다(공식 문서도 "어느 쪽을 남길지는 앱이 정하라"고 한다).
5. 토큰 갱신 실패·세션 소실 = '맡겨 두기 끊김' 상태로 표시만 하고 게임은 계속(D-15 쓰기 실패 원칙과 같음).

### 3-4. 세이브 동기화 규칙 — 통째, 리비전, 병합 없음

**왜 병합하지 않나.** 세이브는 정본 점열(D-13) + 시뮬레이션 상태(`sim` 블록: 시계·성향·정·손 기억·카드 기록)다. 몸은 획이 그어진 **순서·시각·그때의 성향**에서 결정적으로 나온다. 두 기기의 획을 합치면 어느 기기에도 없던 **다른 몽망이**가 생긴다. 그래서 "어느 한 마리를 고른다"가 맞고, 고르지 않은 쪽은 지우지 않고 이력에 남긴다(D-03 처벌 없음·잃지 않음).

| 규칙 | 내용 |
|---|---|
| 정본 | **기기의 MMKV 세이브가 정본.** 서버는 마지막으로 받은 사본 + 이력 |
| 단위 | `serializeState` 결과 문자열 통째(이미 int16 base64 점열 포함). 서버에서 gzip해 `bytea`로 |
| 올리는 때 | 로컬 세이브 해시가 '마지막으로 올린 해시'와 다르고, ① 앱이 백그라운드로 갈 때 ② 깸 직후 `rotateBackup` 때(D-15) ③ 그 밖에는 10분에 한 번 이하. 아웃박스 1칸(최신본만) |
| 버전 확인 | `PUT` + `If-Match: <내가 마지막으로 본 rev>`. 서버 `rev`와 같으면 `rev+1`로 덮고, 덮인 본은 `save_versions(overwritten)` |
| 충돌(409) | 서버 본이 다른 기기에서 올라온 경우뿐. 앱은 **자동으로 고르지 않고** 이 기기 본을 계속 쓴다. 공방 노트에 "다른 기기의 몽망이가 맡겨져 있어요" 표시 → 사용자가 고를 때만 바꾼다. 아무것도 안 고르면 이 기기 본으로 덮고 서버 본은 `conflict` 이력으로 30일 보존 |
| 빨리 감기 | 서버 `sha` == 내가 마지막으로 올린 `sha`면 충돌이 아니다(같은 기기 이어 쓰기) |
| 복원(새 기기) | `GET /saves/main` → **앱이 `parseState`로 검증** → 지금 기기의 세이브(첫날 몽망이 등)가 있으면 `pre_restore` 키로 보존 후 `writeSave(kv, state, now, {rotateBackup:true})`. D-15의 '설치 판정 = 세이브 존재'와 맞물리므로 복원은 **인트로 뒤 공방 노트에서** 하고, 복원 순간 홈 화면을 다시 그린다(화면 흐름은 앱 담당) |
| 서버 검증 | `PUT` 본문을 `@mong/core`의 `parseState`로 읽어 본다. 통과 → `validated=true`, 메타(`day_index` 등) 추출 |
| **미래 버전** | 앱이 서버보다 새 `schemaVersion`/`sim.version`을 올리면 `parseState`가 던진다. 이때 **거부하지 않고** JSON·크기·필수 키만 보고 `validated=false`로 받는다(사용자 데이터를 잃지 않게). 규칙: 세이브 버전을 올리는 앱 릴리스 전에 서버를 먼저 배포한다(CI 검사, 6-3) |
| 시계 | 서버 시각은 쓰지 않는다. 시간·성장 규칙은 기기 시계(D-07)대로. `client_saved_at`은 표시용 |
| 크기 | D-13 목표 24획 64KB. 서버 상한 512KB(초과 413 → 앱은 조용히 '맡겨 두기 보류') |

### 3-5. 공유 링크 — 인장 코드 = 링크 키

- 형식: `https://{도메인}/m/K7M3QX9P`. 표시할 때만 `K7M3-QX9P`(C-integrated 2-2). 대소문자·하이픈 무시, Crockford base32(0/O, 1/I/L 혼동 문자 제외).
- **발급**: 서버가 `crypto.randomBytes(5)` → 40비트 → 8자. 충돌 시 재시도(UNIQUE). 몽망이 한 마리에 하나, 평생 같다(이름표 길게 누르기에 같은 코드).
- **⚠ 정본과의 차이(리뷰 대상)**: `pillars.ts`의 `Birth.sealSeed` 주석은 "인장 코드의 씨앗"이라고 적는다. `sealSeed`는 32비트 FNV 값이라 **코드를 여기서 파생하면 40억 개 안에서 열거할 수 있고, 같은 씨앗 규칙을 아는 사람이 코드를 만들 수 있다.** 인장 **무늬**(이 빠짐 16칸)는 계속 `sealSeed`에서 그리고, 링크 **코드**는 서버 난수로 분리한다. 코드는 세이브에 `cloud.code`로만 저장(세이브 형식 변경 없음, 메타 키) — C-integrated 2-2 표현을 고치는 일은 정본 담당에게 넘긴다.
- **추측 불가성**: 활성 링크 100만 개여도 무작위 추측 한 번이 맞을 확률 약 100만/1.1조 ≈ 1e-6. `/m/*`의 404 응답을 IP당 분당 30회로 묶으면 하루 4.3만 번 시도에 기대 적중 0.04 [팀 추정]. 링크로 보이는 내용은 이미 공유한 카드뿐이라 맞혀도 피해가 작다.
- **웹 뷰어 내용**(C-integrated 2-5): 카드 이미지 + '획 → 몸' 15초 루프(정적 자산) + 한 줄 "송연먹 · 느긋결 몽망이를 보셨군요"(2언어, `Accept-Language`와 `public_meta.lang`) + 스토어 버튼 2개 + 작은 '신고'. 페이지는 템플릿 문자열 HTML(React SSR 없음), 무게 50KB 미만 목표.
- **OG 메타**: `og:image` = OG 변형(1200×630), `twitter:card=summary_large_image`, `og:title` = 이름(없으면 앱 이름). 응답 `Cache-Control: public, max-age=300, s-maxage=3600` → Firebase CDN이 받아 콜드 스타트를 가린다. 링크 끄기·숨김은 `s-maxage` 안에 반영(최대 1시간) — 즉시 지워야 하는 신고는 Firebase 캐시 무효화(배포) 또는 이미지 파일 삭제로.
- **검색 노출**: 기본 `noindex`(남의 몽망이가 검색되지 않게). 랜딩 `/`만 색인.
- **딥링크**: iOS 유니버설 링크(`applinks:{도메인}`, AASA의 `/m/*`) + Android 앱 링크(`intentFilters` `autoVerify`, `assetlinks.json`에 서명 인증서 SHA-256 — **EAS 서명 키와 Play 앱 서명 키 둘 다**). 앱이 깔려 있으면 앱이 열리고, 첫 버전에선 '친구의 몽망이' 화면 없이 **이름표 화면처럼 카드만 보여 주는 시트**(1.x 방문의 자리). 앱이 없으면 웹 뷰어.
- 디퍼드 딥링크(설치 후 그 링크로 이어 열기)는 하지 않는다(설치 귀속 SDK 필요, D-18 원칙).

### 3-6. 지표 — 식별자 없이 D1/D7

- **보존율 핑**: 앱이 **하루 첫 실행 때 한 번** `POST /ping {cohortDay, dayN, platform, appVer, lang}`. `cohortDay` = 설치일(기기 현지 날짜), `dayN` = 오늘 − 설치일. 같은 `dayN`은 기기에서 한 번만 보낸다(MMKV 표시). **기기 ID·계정 ID·IP를 저장하지 않는다.** 서버는 `metric_daily`의 해당 칸을 +1 할 뿐이다.
  - D1 = `count(cohort=c, dayN=1) / count(cohort=c, dayN=0)`, D7·D30도 같다. 소프트런칭 관문(D1 35%·D7 15%)을 콘솔 지표와 나란히 본다.
  - 한계(정직하게): ① 핑이 실패한 날은 빠진다(재시도 아웃박스로 다음 실행 때 보냄, `dayN`은 그날 값 유지) ② 재설치는 새 코호트 ③ 부풀리기 가능 → IP당 분당 20회 + 이상치는 판정에서 뺀다.
- **이벤트**(같은 핑에 이름만): 화이트리스트 10개 이하 — `first_tap`, `first_night`, `ire7`, `share_open`, `share_link`, `share_image`, `name_set`, `ink_chosen`, `cloud_on`, `restore_ok`. 퍼널은 '몇 명 중 몇 명'이 아니라 **같은 코호트 안의 개수 비율**로만 본다.
- **공유 → 설치 퍼널**: `share_link`(앱) → `link_daily.view`(웹, 쿠키 없음) → `store_*` 클릭(302 카운트) → 설치는 **스토어 콘솔**: Play는 스토어 URL의 `utm_source/utm_campaign`을 획득 보고서에 보여 주고, App Store는 캠페인 링크(`pt`·`ct`)를 App Analytics에 보여 준다(둘 다 SDK 없이) **[확인 필요: 콘솔 화면에서 첫 링크로 검증]**. 캠페인 값 = `ct=m_link`(웹 뷰어), `ct=landing`, `ct=creator_{이름}`(number-one 크리에이터 시딩).
- 대시보드: 처음엔 SQL 스니펫 3개(D1/D7 표, 퍼널, 플랫폼별). Supabase Studio에서 돌린다. 1.0 뒤 필요하면 Metabase 등.

### 3-7. 원격 기능 플래그

- 파일: `https://{도메인}/config/v1.json`(Firebase Hosting 정적, Git으로 관리·배포. DB·Nest 불필요).

```json
{ "v": 3, "ttlSec": 21600,
  "flags": { "naming": true, "relation": true, "hesitation": false },
  "rollout": { "nameMelody": 0.5 },
  "minAppBuild": { "ios": 0, "android": 0 } }
```

- 앱 규칙: 실행 때와 6시간마다 받아 MMKV에 저장(실패하면 마지막 값). 우선순위 **`FEATURE_DEFAULTS`(바이너리) < 원격 캐시 < 개발 메뉴 override**. `features.ts`의 `isOn`은 그대로 두고, 원격 값을 넣는 함수 하나만 더한다(빌드 2 작업).
- 비율 배포: 기기에서 한 번 만든 로컬 난수(0~1, 서버로 보내지 않음) < `rollout[x]`면 켬.
- **플래그로 끄는 건 화면·몸짓뿐**(features.ts 원칙과 같음). 세이브 필드는 늘 쌓는다 → 끄고 켜도 세이브는 안 깨진다.
- 안전장치: 원격이 켠 기능이 크래시하면? 앱은 "직전 실행이 플래그 적용 후 10초 안에 죽었으면 원격 값을 한 번 무시"(크래시 루프 탈출, 0.25일).

### 3-8. 남용 방지·백업·삭제

**레이트 리밋**(Nest `@nestjs/throttler`, 인스턴스 메모리 — 인스턴스가 최대 3개라 근사로 충분 [팀 추정]):

| 대상 | 한도 |
|---|---|
| `/ping` | IP당 20/분 |
| `/m/*` 조회 | IP당 60/분, 404는 30/분 |
| `/shares` 생성 | 사용자당 20/일, 이미지 각 1MB 이하·`image/jpeg|png|webp`만 |
| `PUT /saves` | 사용자당 60/시간 |
| `/recover` | IP당 5/시간, 코드당 10/일 |
| `/m/*/report` | IP당 5/시간 |
| Supabase 익명 가입 | 기본 30/시간/IP → 통신사 CGNAT로 막히면 120으로(대시보드). CAPTCHA는 앱 안에서 어려워 '필요할 때만 가입'으로 면적을 줄인다 |

- 비용 상한: Cloud Run max-instances 3, GCP 예산 알림(월 10·30·60달러), Supabase 지출 한도(Spend cap) 켬.
- **이름 공개 문제**: 몽망이 이름은 사용자가 쓴 글이 웹에 공개되는 유일한 곳이다. ① 금칙어 목록(한·영, 서버 검사, 걸리면 웹에서만 이름 대신 '몽망이') ② 웹 신고 → `reports` 3건이면 자동 `hidden` ③ 운영자가 Studio에서 확인.
- **백업**: Supabase Pro 일일 백업(보존 7일). 그 이상(PITR)은 사지 않는다 — 앱이 정본이고 서버는 사본이라 서버 데이터를 잃어도 몽망이는 기기에 있다. 분기마다 스테이징으로 복원 리허설 1회.
- **삭제(파기) 절차**:
  1. 앱 안: 공방 노트 → '서버에 맡긴 것 지우기' → 확인 → `DELETE /me`. 서버는 한 트랜잭션에서 `users` 행 삭제(→ `creatures`·`saves`·`save_versions`·`shares` CASCADE) → Storage 파일 삭제 → Auth Admin API로 `auth.users` 삭제 → `deletion_log` 1행(누구인지 없이 개수만). 기기 세이브는 그대로(로컬 게임은 계속).
  2. 웹: `/delete` 페이지 = Google Play 계정 삭제 정책의 '웹 링크'([정책](https://support.google.com/googleplay/android-developer/answer/13327111)). 앱이 없는 사람은 **인장 코드 + 복원 코드**를 메일로 보내면 운영자가 같은 절차를 SQL 스니펫으로 실행(7일 안). 복원 코드가 없으면 링크 끄기만(본인 확인 불가를 페이지에 적는다).
  3. 백업 속 사본은 7일 뒤 자연 소멸 — 처리방침에 적는다.
  4. 장기 미사용: 마지막 활동 후 **2년** 지난 계정은 30일 전 앱 안 표시(앱을 열 때) 뒤 삭제 [팀 추정 — 오너 결정]. 집계 테이블은 개인을 담지 않아 대상 아님.
- Apple도 계정 생성을 지원하면 앱 안 삭제를 요구한다(가이드라인 5.1.1(v)) — 익명 자동 계정도 보수적으로 같은 대상으로 본다.

---

## 4. 앱 쪽 변경

### 4-1. 서버 없이도 완전히 동작하는 원칙을 지키는 법

| 규칙 | 방법 |
|---|---|
| 서버 호출은 게임 경로에 없다 | 세이브·렌더·시뮬레이션 코드는 네트워크를 모른다. 서버 모듈(`apps/mobile/src/net/`)은 세이브 **결과**를 구독만 한다 |
| 비차단 | 모든 호출 5초 타임아웃, UI는 결과를 기다리지 않는다. 예외: 사용자가 누른 '링크 공유'·'복원'만 진행 표시 |
| 아웃박스 | MMKV 키 `mong.net.outbox`: 핑(최대 30개, 오래된 것부터 버림), 세이브(최신 1개), 공유 커밋. 지수 백오프 1분→6시간 |
| 실패 표시 | 숨긴다. 링크 공유 실패만 "지금은 링크를 만들 수 없어요 — 사진으로 공유할까요?"로 **이미지 공유로 내려간다**(빌드 1 공유가 늘 폴백) |
| 서버 없는 빌드 | 환경 변수 `EXPO_PUBLIC_API_BASE`가 비면 net 모듈 전체가 no-op. 웹 미리보기·테스트 기본값 |
| 시간 | 서버 시각을 게임에 쓰지 않는다(D-07 그대로) |

### 4-2. 새 네이티브 모듈과 빌드 영향

| 필요한 것 | 네이티브? | 언제 |
|---|---|---|
| `fetch`, `@supabase/supabase-js`(+ JS 폴리필 `react-native-url-polyfill`) | 아니오(JS) | 빌드 2 |
| 보안 난수 | Hermes `crypto.getRandomValues` 유무를 빌드 2 실기기에서 확인 **[확인 필요]**. 서버가 코드를 만들므로 앱 쪽은 로컬 롤아웃 난수뿐(없어도 무방) | 빌드 2 |
| 딥링크 수신 | RN `Linking`(코어) | 빌드 2 |
| 유니버설·앱 링크 | **새 모듈 없음, 대신 `app.json` 설정 변경**(`ios.associatedDomains`, `android.intentFilters`) → **네이티브 재빌드 필요** → 빌드 2 바이너리에 꼭 넣는다. iOS는 App ID에 Associated Domains 기능이 켜져 있어야 한다(EAS가 자동 동기화 [확인 필요]) | **빌드 2(12-10)** |
| 사진·공유 | 빌드 1의 `expo-sharing` 그대로 | — |
| Apple 로그인 | `expo-apple-authentication` = **새 네이티브 모듈** | 1.0.x |
| Google 로그인 | 네이티브 모듈 또는 `expo-web-browser`(새 모듈) | 1.0.x |

→ 빌드 2·3은 **새 네이티브 모듈 0개**. D-17의 "네이티브 모듈 추가 금지" 흐름과 맞다. 단 `associatedDomains`는 빌드 2에 못 넣으면 빌드 3, 그것도 놓치면 출시 바이너리부터 링크가 앱을 열지 못한다(웹 뷰어는 동작).

### 4-3. 웹 미리보기·테스트 전략

| 층 | 무엇으로 |
|---|---|
| 앱 단위 | net 모듈은 `fetch` 주입. vitest에서 가짜 fetch로 아웃박스·백오프·409 처리 검사 |
| 공통 계약 | `packages/core/test/fixtures/saves/*.json`(v1 옛 세이브, v2, 깨진 본, 미래 버전 본, 24획 64KB 본) — **core 테스트와 서버 e2e가 같은 파일**을 읽는다 |
| 서버 단위 | Nest 서비스 단위 테스트(vitest, Prisma는 실제 로컬 DB — 목 쓰지 않음) |
| 서버 e2e | 로컬 Supabase(아래 6-2) 위에서 Nest를 띄우고 실제 익명 로그인 JWT로 API 시나리오: bootstrap → share → commit → `/m/{code}` HTML 메타 → PUT/409/복원 → DELETE /me 후 모든 행·파일 0 |
| 계약 | OpenAPI 스냅샷 diff + `packages/api-contract` 타입을 앱 typecheck가 소비 → 서버가 응답 모양을 바꾸면 앱 typecheck가 깨진다 |
| 웹 미리보기 | `pnpm web`이 `EXPO_PUBLIC_API_BASE=http://localhost:3000`으로 로컬 Nest에 붙는다(CORS는 개발 모드만 `localhost:8081` 허용). 웹 뷰어는 `http://localhost:3000/m/{code}`로 바로 확인, OG는 로컬에선 메타 태그 스냅샷 테스트로 |
| 링크 실기기 | 스테이징 도메인(`staging.{도메인}`)을 개발 빌드의 `associatedDomains`에 함께 넣어 TestFlight·내부 테스트에서 확인 |

---

## 5. 개인정보·스토어 영향

### 5-1. '수집 없음'이 무엇으로 바뀌나

| 단계 | 서버로 가는 것 | 처리방침 | Google Data safety | Apple App Privacy |
|---|---|---|---|---|
| 빌드 2: 핑만 보내는 사람(대다수) | 집계 칸 +1(식별자 없음), IP는 레이트 리밋 메모리에서만 | '수집 없음' → **"이용 통계(개인 식별 불가)"** 한 절 | 앱 활동 > 앱 상호작용: 수집, 공유 안 함, 목적 '분석'. 식별자 없음·결합 불가 [확인 필요: 집계만이면 선언 대상인지 — 보수적으로 선언] | Usage Data > Product Interaction, **Not Linked to You**, 추적 아님 |
| 빌드 2: 링크로 공유한 사람 | 익명 계정 ID, 몽망이 이름·먹·결·날짜, 카드 이미지(공개) | "공유 링크" 절, 공개 범위·끄기·지우기 | 사용자 ID(앱 기능), 기타 사용자 생성 콘텐츠(앱 기능), 사진 아님(앱이 그린 이미지) [확인 필요] | Identifiers > User ID, User Content > Other User Content, **Linked to You**, 앱 기능 |
| 빌드 3: 맡겨 두기 켠 사람 | 위 + 세이브 전체(획 좌표·시간, 잠 시각 설정, 정·손 기억) | "클라우드 보관" 절, 보유 기간, 파기 | 위 + 앱 활동(게임 진행), 계정 관리 목적, **삭제 요청 가능** 배지 | 위 + Gameplay Content |
| 1.0.x: Apple/Google 연결 | + 이메일(Apple 비공개 릴레이 가능) | "계정 연결" 절 | 개인 정보 > 이메일 | Contact Info > Email, Linked |

- Data safety의 '수집' = 기기 밖으로 보내는 것([Data safety 도움말](https://support.google.com/googleplay/android-developer/answer/10787469)). 지금 store-listing 7-1의 "아니요"는 **빌드 2 제출 전에** 바꿔야 한다(같은 커밋 원칙, store-listing 7절 전제 문장).
- 크래시 SDK는 여전히 넣지 않는다(이 설계 밖).
- 개인정보처리방침 고칠 곳: 1(요약)·2(수집 항목 표 둘로: 기기 안 / 서버)·3(복원 코드)·5(링크 공유)·6(처리위탁·국외 이전)·7(보유·파기)·8(권리 행사 경로 = 앱 안·웹 `/delete`·메일)·9(아동)·10(쿠키 없음 유지)·11(안전성: 전송 TLS, 저장 암호화, 접근 권한 1인, 복원 코드 해시).

### 5-2. 데이터 최소화 원칙(설계에 박음)

- 이메일·이름·전화·광고 ID·기기 모델을 받지 않는다. 플랫폼·앱 버전·언어 세 가지만.
- IP는 로그에 남기지 않는다(Nest 로그에서 마스킹, Cloud Run 요청 로그의 `remoteIp`는 로그 보존 30일 → **로그 버킷 보존 기간을 7일로 줄이고 처리방침에 적는다** [확인 필요: Cloud Logging 요청 로그에서 IP 제외 가능 여부]).
- 핑에 ID가 없으므로 개인별 행동 추적이 불가능하다 — 의도된 한계.

### 5-3. 아동·연령

- D-06: 전체이용가, 타깃 13세 이상, Kids/Families 불참. 한국 개인정보 보호법은 **만 14세 미만** 개인정보 처리에 법정대리인 동의를 요구한다(제22조의2).
- 설계 대응: ① 핑은 개인정보가 아니게 설계(식별 불가) ② 익명 계정 + 세이브는 **가명 정보에 가깝지만 결합 가능성이 있어 개인정보로 본다** [법률 검토 필요] ③ 그래서 계정이 생기는 두 순간(링크 공유·맡겨 두기)에 **"만 14세 이상인가요?" 한 번 확인**, 아니면 그 기능만 쓰지 않고(이미지 공유·로컬 게임은 그대로) 안내. 법정대리인 동의 절차는 만들지 않는다(1인 운영 부담) [팀 추정 — 오너·법률 검토].
- 공개 웹에 아이 이름이 실명으로 올라가는 위험 → 이름 입력 화면에 "공유 링크에서는 이 이름이 보여요" 한 줄(작가 몫).

### 5-4. 처리위탁·국외 이전

| 수탁자 | 위탁 업무 | 저장 위치 | 국외 이전? |
|---|---|---|---|
| Supabase, Inc.(미국) | DB·인증·파일 보관 | 서울(ap-northeast-2, AWS) | 저장은 국내. 다만 미국 법인의 원격 운영 접근 가능성 → **보수적으로 국외 이전 항목에도 기재** [법률 검토] |
| Google LLC(미국) — Cloud Run·Firebase Hosting·Cloud Logging | API 실행, 웹 전송, 로그 | 서울(Cloud Run), Firebase CDN은 전 세계 엣지(공개 카드·HTML만 캐시) | CDN 캐시는 공개 콘텐츠뿐. 로그 버킷 위치를 서울로 지정 [확인 필요] |

- 처리방침 6절은 "제공·위탁·이전 없음"에서 **위탁 표 + 국외 이전 고지(이전 국가·업체·일시와 방법·항목·목적·보유 기간·거부 방법)**로 바뀐다. 거부 방법 = 링크 공유·맡겨 두기를 쓰지 않으면 이전 없음.
- 호스팅을 Fly 도쿄·Render 싱가포르로 바꾸면 컴퓨트가 해외라 고지가 명확히 필요해진다(2-3 결정 근거).

---

## 6. Docker·모노레포·CI

### 6-1. 모노레포 배치와 `@mong/core` 공유

```
apps/
  mobile/            (지금)
  server/            NestJS — src/{auth,saves,shares,web,metrics,deletion}, prisma/, Dockerfile
  web-static/        Firebase Hosting 공개 폴더(랜딩·.well-known·config/v1.json·delete·privacy)
packages/
  core/              세이브 형식·검증의 정본 — 앱·서버가 같은 코드
  api-contract/      OpenAPI에서 뽑은 타입(앱·서버 공통)
```

- 문제: `@mong/core`는 **빌드 없는 TS 소스**(`main: src/index.ts`, `moduleResolution: Bundler`, 확장자 없는 import)다. Metro는 그대로 먹지만 Node는 못 읽는다.
- 해결(제안): core에 `tsup` 빌드를 더해 `dist/`(ESM + `.d.ts`)를 만들고, `package.json` `exports`를 조건별로 나눈다 — `"react-native"`·`"browser"`·`"types"` → `src/index.ts`(앱은 지금과 같음), `"node"`·`"default"` → `dist/index.js`(서버). 앱 동작은 바뀌지 않는다. (core·앱 코드 수정은 빌드 1 담당 작업이 끝난 뒤 별도 PR)
- 서버가 core에서 쓰는 것: `parseState`(검증), `SCHEMA_VERSION`, `SIM_SCHEMA_VERSION`, `serializeState`(테스트 고정물 생성). **core에 Node·RN·DOM API가 들어오지 않게** core tsconfig의 `lib: ["ES2022"]`, `types: []`를 유지하는 것이 계약이다(지금 그렇다).
- 서버 빌드: `nest build -b swc`(데코레이터 메타데이터 지원). Nest는 CommonJS가 기본이라 ESM core를 `require`하려면 Node 22.12+의 `require(esm)`에 기대거나 서버를 ESM으로 만든다 → **서버도 ESM**(`"type":"module"`)으로 시작한다 [팀 추정 — 첫 스캐폴드 때 확인].

### 6-2. Dockerfile(설계 — 파일은 서버 착수 때 만든다)

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:24-slim AS base            # Node 24 LTS
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS deps                    # 잠금 파일만으로 캐시
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch

FROM deps AS build
COPY packages/core packages/core
COPY packages/api-contract packages/api-contract
COPY apps/server apps/server
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --filter server... \
 && pnpm --filter @mong/core build \
 && pnpm --filter server exec prisma generate \
 && pnpm --filter server build \
 && pnpm --filter server deploy --prod /out   # 워크스페이스 의존(core dist) 포함, dev 의존 제외

FROM node:24-slim AS runtime         # 또는 gcr.io/distroless/nodejs24 (셸 없음)
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
```

- 주의: 레포가 `nodeLinker: hoisted`라 `pnpm deploy`가 워크스페이스 패키지를 제대로 넣는지 첫 빌드에서 확인 **[확인 필요]**. 안 되면 대안은 esbuild로 서버를 한 파일로 번들(core 포함, `node_modules`는 external)하고 런타임에 prod 의존만 설치.
- Prisma 7은 엔진 바이너리가 없어 `-slim`·distroless에서 OS 라이브러리 문제(openssl)가 없다. 목표 이미지 200MB 미만.
- Cloud Run은 Docker `HEALTHCHECK`를 쓰지 않는다 → Cloud Run **startup probe** `/healthz`, liveness `/healthz`를 따로 설정. Docker `HEALTHCHECK`는 로컬 compose용.
- `.dockerignore`: `apps/mobile`, `node_modules`, `docs`, `*.png` 등 — 앱 자산이 빌드 컨텍스트에 들어가지 않게.

### 6-3. 로컬 개발 — Supabase CLI + docker compose

- 이 Mac 확인(11-20): `docker` 29.8.2가 `/usr/local/bin`에 있다. Supabase CLI·gcloud·flyctl은 없다. Docker 데몬이 Docker Desktop인지 OrbStack인지는 모른다 — Supabase는 macOS에서 **OrbStack을 권장**한다([CLI 시작](https://supabase.com/docs/guides/local-development/cli/getting-started)).
- 구성: **로컬 Supabase는 CLI가 띄우고(자체 컨테이너 묶음), compose는 Nest만** 띄운다. 두 묶음을 하나의 compose로 합치지 않는다(Supabase CLI 버전 업이 compose를 깨지 않게).

```
pnpm dlx supabase start          # Postgres 54322, API(Auth·Storage) 54321, Studio 54323
docker compose -f apps/server/compose.yaml up --build
```

```yaml
# apps/server/compose.yaml (설계)
services:
  api:
    build: { context: ../.., dockerfile: apps/server/Dockerfile, target: runtime }
    ports: ["3000:8080"]
    env_file: .env.local                 # 아래 값, 커밋 금지
    environment:
      DATABASE_URL: postgresql://postgres:postgres@host.docker.internal:54322/postgres
      SUPABASE_URL: http://host.docker.internal:54321
      PUBLIC_BASE_URL: http://localhost:3000
    extra_hosts: ["host.docker.internal:host-gateway"]
  api-dev:                               # 소스 마운트 + watch(선택)
    profiles: ["dev"]
    build: { context: ../.., dockerfile: apps/server/Dockerfile, target: build }
    command: pnpm --filter server start:dev
    volumes: ["../..:/repo"]
```

- 빠른 테스트 대안(Auth 없이): `postgres:17` 컨테이너 하나 + 테스트용 JWT 서명기(`AuthVerifier` 교체). CI의 단위·서버 테스트는 이것으로, 인증이 끼는 e2e만 `supabase start`.
- 시드: `apps/server/prisma/seed.ts`가 core 고정물 세이브로 사용자 3명(정상·충돌·미래 버전)을 만든다.

### 6-4. 레지스트리·CI/CD(GitHub Actions)

- 레지스트리: **Google Artifact Registry(서울)**. Cloud Run은 Artifact Registry·Docker Hub 이미지를 받고 GHCR을 직접 받지 않는다 **[확인 필요]** — GHCR을 쓰려면 Artifact Registry 원격 저장소로 프록시해야 해서 한 단계가 는다. 무료 저장 0.5GB 안에서 태그 10개만 보존.
- 인증: **Workload Identity Federation**(키 파일 없이 GitHub OIDC → GCP 서비스 계정, `google-github-actions/auth`).
- 워크플로:

| 워크플로 | 트리거 | 단계 |
|---|---|---|
| `ci.yml` | 모든 PR | pnpm install → `pnpm typecheck` → `pnpm test`(core·mobile·server 단위) → 서버 e2e(`supabase/setup-cli` + `supabase start`) → OpenAPI diff → **세이브 버전 가드**(core의 `SCHEMA_VERSION`·`SIM_SCHEMA_VERSION`이 운영 서버 `/healthz`의 값보다 크면 "서버 먼저 배포" 경고) → `docker build`(푸시 없음) |
| `deploy-staging.yml` | `main` 푸시(서버·core 경로 변경 시) | 이미지 빌드·푸시(`:sha`) → `prisma migrate deploy`(스테이징 `DIRECT_URL`) → `gcloud run deploy mong-api-staging` → 스모크(`/healthz`, `/m/TESTTEST`) |
| `deploy-prod.yml` | 태그 `server-v*` + 수동 승인(environment protection) | 같은 이미지(재빌드 없음)로 migrate → deploy → 스모크 → 실패 시 `gcloud run services update-traffic --to-revisions=이전=100` |
| `deploy-static.yml` | `apps/web-static/**` 변경 | `firebase deploy --only hosting`(플래그 JSON 포함 — 플래그 변경 = 이 PR 하나) |

- 비밀: GitHub Environments(staging/prod)에 `DIRECT_URL`, Cloud Run 런타임 비밀은 **Secret Manager**(`DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RECOVERY_PEPPER`).
- 모니터링: Cloud Monitoring 업타임 체크(`/healthz`, `/m/{고정 코드}`) → 오너 메일. 5xx 비율 알림 1개. 그 이상은 만들지 않는다.

---

## 7. 비용(무료 한도 → 10만 명)

| 항목 | 빌드 2~소프트런칭 | 출시 후 10만 설치, DAU 3만 가정 [팀 추정] |
|---|---|---|
| Supabase | Free(staging) + Free(prod, 12-26 전 Pro) = 0 → Pro 25달러 | Pro 25달러(MAU 10만·DB 8GB·Storage 100GB·egress 250GB 포함). 계정은 '필요할 때만'이라 MAU ≈ 공유·맡겨 두기 사용자(3~4만) |
| DB 크기 | — | 맡겨 두기 4만 × (본 1 + 이력 평균 4) × 약 40KB(gzip 후) ≈ 8GB → 포함 한도 근처, 초과분 GB당 0.125달러 |
| Storage | — | 링크 3만 개 × (카드 JPEG 약 180KB + OG 약 90KB), 몽망이당 최신 카드 5장만 보존 → 약 40GB, 포함 |
| Cloud Run | 무료 한도 안 | 핑 3만/일 + 세이브 + 웹 뷰어 ≈ 월 300만 요청 → 무료 200만 초과분 소액. min 1 인스턴스 유휴 비용 월 수~십수 달러 [확인 필요: 서울 Tier 2 단가] |
| Firebase Hosting | 무료(Spark) → Blaze(Cloud Run rewrite에 결제 계정 필요 [확인 필요]) | 루프 영상(약 2MB) × 링크 조회 수가 대부분. 조회 월 10만이면 약 200GB → GB당 약 0.15달러 = 30달러 → **영상을 600KB 이하로 줄이거나 포스터 이미지 먼저 + 탭하면 재생** |
| 도메인 | 연 15~40달러 | 같음 |
| **합계** | **월 0원(+도메인)** | **월 약 35~70달러** |

---

## 8. 일정·범위·오너 할 일

### 8-1. 빌드별 범위

> 전제 경고: C-integrated 4-1의 가용일은 **41 vs 필요 40.75**로 이미 꽉 차 있다. 서버는 그 밖의 일이다. 아래 일수만큼 **서버 레인을 따로 돌리거나(별도 세션) 자르는 순서를 적용**해야 한다. PM 결정 사항.

| 빌드 | 서버 | 앱 | 개발일 [팀 추정] |
|---|---|---|---|
| **빌드 1(11-29)** | 없음. 단, **도메인이 있으면** 공유 글에 랜딩 주소(`https://{도메인}`) 한 줄 | 문구만 | 0.25 |
| **빌드 2(12-10) 최소** | 스캐폴드·Docker·CI·스테이징/운영 배포(1.5), `/ping`·집계(0.5), `bootstrap`·`shares`·서명 업로드·`/m/{code}` HTML·OG·`/get` 302·신고(2.0), 정적 사이트·AASA·assetlinks·`config/v1.json`(0.5) | `associatedDomains`·`intentFilters`(0.25), 원격 플래그 로더(0.5), 핑+아웃박스(0.5), '링크로 공유'(익명 로그인·업로드·OG 변형 렌더, 1.5), 딥링크 수신 시트(0.5), 14세 확인 한 줄(0.25) | **서버 4.5 + 앱 3.5 = 8.0** |
| 빌드 2를 못 맞추면 | **최소의 최소(2일)**: 정적 `/m/*` → 랜딩 rewrite + `config/v1.json` + 바이너리 링크 설정 + 핑. 링크는 그때부터 유효하고 뷰어 내용만 나중에 채운다 | | 2.0 |
| **빌드 3(12-19)** | 세이브 PUT/GET/이력·복원 코드·recover·`DELETE /me`·`/delete` 페이지·`pg_cron` | '맡겨 두기' 켜기·자동 업로드·충돌 표시·복원 화면·삭제 | 서버 3.0 + 앱 3.0 |
| 동결(12-26) 전 | 운영 Supabase Pro 전환, 처리방침·Data safety·App Privacy 갱신, 업타임 체크 | | 1.0 |
| 1.0.x(출시 후) | Apple/Google 연결, 장기 미사용 정리 | 새 네이티브 모듈 2개 | 3.0 |
| 1.x | 방문·도감·비교(기획 v2 요구사항으로) | | — |

### 8-2. 오너가 해야 할 일

| 언제까지 | 일 | 비고 |
|---|---|---|
| **11-27** | **도메인 구매**(빌드 1 공유 글·빌드 2 바이너리에 박힌다 — 늦어도 **12-03**) | 아래 후보 |
| 11-27 | Google Cloud 계정 + **결제 계정** + 프로젝트 `mongmange` 생성, 예산 알림 | Cloud Run·Artifact Registry·Secret Manager·Firebase(같은 프로젝트) |
| 11-27 | Supabase 계정, 조직 생성, 프로젝트 2개(서울) — 운영 프로젝트는 12-26 전 **Pro(월 25달러) 결제** | 오너 기존 계정 재사용 가능 |
| 11-27 | GitHub 레포 Actions 사용·Environments(staging/prod) 승인자 = 오너 | 레포가 GitHub에 있는지 확인(지금 `.github` 없음) |
| 12-01 | Apple 개발자 Team ID·Associated Domains 기능, Play Console 앱 서명 인증서 SHA-256 전달 | AASA·assetlinks에 필요 |
| 12-01 | Docker 데몬 확인(Docker Desktop 또는 **OrbStack** 권장), `brew install supabase/tap/supabase` 또는 `pnpm dlx supabase` | `docker` 29.8.2는 이미 설치됨 |
| 12-12 | 결정: 맡겨 두기 기본값(제안: 끔, 이레 아침에 한 번 권함), 장기 미사용 삭제 기간(제안 2년), 14세 확인 방식 | 리뷰 뒤 D-21에 |
| 12-20 | 개인정보처리방침 개정판 게시(운영자 실명·이메일 등 빈칸 포함), 법률 검토 1회(국외 이전·아동) | 5절 |
| 운영 | 신고 메일·삭제 요청 메일 확인 주 1회 | 1인 운영 SLA = 7일 |

**도메인 후보**(가용성·가격은 구매 시 확인 **[확인 필요]**). D-06 R5 이름 판정이 아직이라 **이름 판정과 무관하게 살아남는 짧은 도메인**을 1순위로 둔다 — 도메인은 바이너리에 박혀 나중에 바꾸기 비싸다.

| 순위 | 후보 | 링크 예 | 이유 |
|---|---|---|---|
| 1 | `mongmang.ink` | `mongmang.ink/m/K7M3QX9P` | 가장 짧음, '먹'과 맞음, R5 결과와 무관. 프리미엄가일 수 있음 |
| 2 | `mongink.app` | `mongink.app/m/…` | `.app`은 HTTPS 강제(HSTS 프리로드) |
| 3 | `mongmangi.app` | | R5 1순위 이름과 같음(판정에서 떨어지면 어색) |
| 4 | `mongmangi.com` / `mongmange.com` | | 범용, 길다 |
| 보조 | `몽망이.kr`(한글 도메인) | | 국내 홍보용 리다이렉트만 |

구매처는 오너가 이미 쓰는 **Cloudflare Registrar**(원가 판매) 권장, DNS도 Cloudflare(프록시 끔, Firebase Hosting으로 A/TXT 레코드).

---

## 9. 반증 — 서버 도입이 실패하는 시나리오와 대응

| # | 시나리오 | 신호 | 대응 |
|---|---|---|---|
| 1 | **일정 잠식**: 서버 8일이 세 기둥(M1~M4)을 밀어낸다 | 12-03 처리량 점검에서 1.2일/일 미만 | 빌드 2를 '최소의 최소(2일)'로 줄인다. 링크 경로와 바이너리 설정만은 지킨다(나중에 내용만 채움). 클라우드 보관은 1.0.x로 |
| 2 | **세이브 손실·뒤바뀜**: 동기화 버그로 다른 기기 본이 현재 몽망이를 덮음 | 복원 후 '내 몽망이가 아니다' 신고 | 병합 없음 + 기기 정본 + 덮기 전 로컬 `pre_restore` 보존 + 서버 이력 30일. 복원은 사용자가 고를 때만. e2e에 '두 기기 번갈아 쓰기' 시나리오 |
| 3 | **미래 세이브 거부**: 새 앱이 v3를 올렸는데 서버는 v2만 앎 | 422 급증 | 미래 버전은 `validated=false`로 받는다 + CI 버전 가드 + '서버 먼저 배포' 규칙 |
| 4 | **비용 폭주·남용**: 봇이 익명 가입·공유 생성 | 예산 알림, Storage 급증 | max-instances 3, 사용자당 공유 20/일, Supabase spend cap, 필요하면 공유 생성에 App Attest/Play Integrity(1.0.x, 네이티브) |
| 5 | **공개 웹에 부적절한 이름·이미지** | 신고 | 금칙어, 신고 3건 자동 숨김, noindex, 링크 끄기. 이미지는 앱이 그린 것만 올라가지만 위조 업로드 가능 → 서명 URL은 1회·5분·크기 제한 |
| 6 | **스토어 라벨 변화로 전환율 하락·심사 반려** | 심사 메시지(5.1.1(v) 계정 삭제 등) | 삭제 기능을 '맡겨 두기'와 **같은 빌드**에 넣는다. 라벨은 실제보다 넓게(보수적으로) 선언 |
| 7 | **Supabase 장애·일시정지** | 업타임 알림 | 게임 영향 0(원칙). 운영은 Pro라 일시정지 없음. 웹 뷰어는 CDN 캐시로 최대 1시간 버팀 |
| 8 | **콜드 스타트로 SNS 미리보기 실패**(크롤러 타임아웃) | 링크 붙였는데 카드가 안 뜸 | CDN 캐시(`s-maxage`), 공유 직후 앱이 `/m/{code}`를 한 번 미리 불러 데움, 출시 주 min 1 |
| 9 | **지표가 쓸모없음**(표본 작음·부풀림) | 소프트런칭 D7 신뢰구간이 넓음 | 콘솔 지표와 교차 확인(D-18 원래 방식이 기본값), 판정 문서에 표본 크기 명시 |
| 10 | **도메인·링크 형식 고착**: R5 이름 판정 뒤 도메인이 어색 | — | 이름 중립 도메인 1순위(`mongmang.ink`). 바꿔도 옛 도메인은 영구 리다이렉트로 유지(연 갱신비) |
| 11 | **1인 운영 한계**: 출시 날 장애에 아무도 없음 | — | 서버가 죽어도 게임은 산다(설계 원칙이 곧 대응). 롤백 한 줄(`update-traffic`), 업타임 메일 |
| 12 | **법적 리스크**: 14세 미만 개인정보, 국외 이전 고지 누락 | 민원 | 계정이 생기는 두 순간에 연령 확인, 처리방침 법률 검토, 핑은 식별 불가 설계 |
| 13 | **'서버가 있어도 아무도 링크를 안 누름'** — 기둥 ②의 가설 자체가 틀림 | `share_link` 대비 `view` 비율 낮음(예: 링크 1개당 조회 < 0.5) | 웹 뷰어 투자를 멈추고 이미지 공유 중심으로. 서버는 보관·지표·플래그만 남겨도 비용 월 30달러 안팎 |
| 14 | **Cloud Run IAM·Firebase rewrite가 1인에게 너무 무거움** | 첫 배포가 1일을 넘김 | 같은 Docker 이미지를 **Fly.io 도쿄**로(반나절), 국외 이전 고지 추가 |

---

## 10. 리뷰에 묻고 싶은 것

1. 인장 코드를 `sealSeed` 파생에서 **서버 난수**로 분리하는 것(3-5) — 정본(C-integrated 2-2·`pillars.ts` 주석) 수정 필요.
2. 계정을 '필요할 때만' 만드는 것과 '맡겨 두기 기본 끔' — 기기 변경 손실을 막는다는 D-21 ②의 취지와 충돌하지 않는가.
3. 빌드 2의 서버 8일을 어느 레인이 맡는가(PM).
4. 핑 집계를 Data safety에 선언할지 여부(보수적으로 선언 제안).
5. Firebase Hosting rewrite의 서울 지원 — 안 되면 Cloudflare Worker 프록시로 갈지 Fly 도쿄로 갈지.

---

## 출처

- Supabase 리전(서울 ap-northeast-2): https://supabase.com/docs/guides/platform/regions
- Supabase 요금(Free 500MB·5만 MAU·1주 비활성 일시정지, Pro 25달러·10만 MAU·8GB·100GB·250GB): https://supabase.com/pricing
- Supabase 익명 로그인(`is_anonymous`, `linkIdentity`, IP당 30/시간, CAPTCHA 권장, 자동 정리 없음): https://supabase.com/docs/guides/auth/auth-anonymous
- Supabase × Prisma(전용 롤, 6543 트랜잭션 풀러 `pgbouncer=true`, 5432 세션/직접, `prisma.config.ts`): https://supabase.com/docs/guides/database/prisma
- Prisma ORM Supabase 가이드(`PrismaPg` 어댑터, `DIRECT_URL`): https://www.prisma.io/docs/orm/overview/databases/supabase
- Prisma 7(Rust 없는 클라이언트 기본, 드라이버 어댑터 필수, `.env` 자동 로드 없음): https://www.prisma.io/changelog/2025-11-19 , https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7
- Supabase Apple 로그인(네이티브 `signInWithIdToken`, 네이티브 전용은 비밀 키 갱신 불필요): https://supabase.com/docs/guides/auth/social-login/auth-apple
- Supabase Edge Functions HTML 제한: https://supabase.com/docs/guides/functions/http-methods , https://supabase.com/changelog/29633-xhtml-responses-are-only-allowed-with-a-custom-domain-enabled , https://supabase.com/docs/guides/platform/custom-domains
- Supabase 로컬 개발(Docker 필요, macOS는 OrbStack 권장, 포트 54321~54324): https://supabase.com/docs/guides/local-development/cli/getting-started
- Cloud Run 요금(무료 한도, 리전 Tier): https://cloud.google.com/run/pricing
- Cloud Run 커스텀 도메인(매핑은 미리보기·서울 미지원, LB 또는 Firebase Hosting): https://docs.cloud.google.com/run/docs/mapping-custom-domains
- Fly.io 리전(도쿄 nrt·싱가포르 sin, 서울 없음): https://docs.fly.io/reference/regions
- Render 리전(아시아는 싱가포르만): https://render.com/docs/regions
- Railway 리전(아시아는 싱가포르만): https://docs.railway.com/reference/deployment-regions
- Koyeb 리전(도쿄·싱가포르): https://www.koyeb.com/docs/reference/regions
- Google Play Data safety(수집 정의, 계정 데이터, 식별자 범주, 삭제 배지): https://support.google.com/googleplay/android-developer/answer/10787469
- Google Play 계정 삭제 요구(앱 안 + 웹 링크): https://support.google.com/googleplay/android-developer/answer/13327111

변경 이력: 2026-11-20 v1 초안(오너 스택 지정 NestJS + Prisma + Supabase + Docker 반영, 인프라 층 한정 — 기획 v2 뒤 2차 반영 예정).
