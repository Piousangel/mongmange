# 서버 아키텍처 v2 — 몽망이 키우기

- 상태: **초안 v2(2026-11-20)** — v1에 기획 v2.2의 서버 요구(6-2 '아키텍처 2차에 더할 것' 열, Q9~Q14, 10-1 판정 규칙)를 2차 반영했다. 독립 리뷰 뒤 D-21에 확정한다(D-21 '구조는 설계 후 확정'). 이 문서는 코드·DECISIONS를 고치지 않는다. 파일 이름은 v1 그대로 둔다(다른 문서가 이 경로를 정본으로 가리킨다).
- 범위: **인프라 층 + 1.0 서버 기능 전부**(스택·Docker·호스팅·인증·세이브 동기화·공유 링크·웹 뷰어·지표·플래그·원격 모티프·OTA·안전·관리 도구·개인정보·부하 시험·비용·일정). 1.0 직후 소셜(밤물·동기·발자국)은 **테이블·API의 자리와 규칙**까지만 정한다(3-13).
- 전제(오너 11-20 지정): **NestJS + Prisma + Supabase(Postgres·Auth·Storage) + Docker**, 도메인 **`mongmang.ink`**(11-20 구매, Cloudflare Registrar, D-21). 후보 스택 비교는 하지 않고 이 조합 안에서 호스팅·역할 분담·운영 방식을 고른다.
- 역할 분담: 기획 v2.2(`docs/design/plan-v2/plan-v2.md`)가 **무엇이 필요한가**를, 이 문서가 **어떻게**를 정한다. 둘이 다르면 이 문서를 따르고, 다르게 정한 곳은 해당 절에 '기획과 다름'으로 적었다.
- 근거: D-06·D-13·D-15·D-17·D-18·D-19·D-20·D-21·D-22·D-23, 기획 v2.2(2-1~2-12, 4-1·4-5·4-6, 6-0~6-7, 10-1·10-2), 리뷰 `docs/team/reviews/2026-11-20-plan-v2-review.md`(C2·I1·I2·I4·I5·I7), 빌드 1 코드 리뷰 `docs/team/reviews/2026-11-20-build1-code-review.md` 5절(#10 개인정보), `docs/design/pillars-v1/C-integrated.md` v1.1, `docs/release/privacy-policy.ko.md`, `store-listing.md` 7절, `packages/core/src/save/*`·`sim/pillars.ts`·`sim/save.ts`, `apps/mobile/src/game/storage.ts`·`features.ts`.
- 표기: 출처가 있는 사실은 링크(끝 '출처'), 팀 판단은 **[팀 추정]**, 공식 문서로 끝까지 못 본 것은 **[확인 필요]**, 법률 판단이 필요한 것은 **[법률 검토]**. v2에서 새로 쓰거나 바꾼 곳은 제목에 **[v2]**.

### 변경 이력

| 판 | 날짜 | 내용 |
|---|---|---|
| v1 | 2026-11-20 | 초안. 오너 스택 지정 반영, 인프라 층 한정 |
| **v2** | 2026-11-20 | 기획 v2.2 2차 반영. 아래 표 |

**v2에서 바뀐 것(v1 → v2)**

| # | 무엇 | v1 | v2 | 절 |
|---|---|---|---|---|
| 1 | 일정 기준 | 빌드 2 최소 + 빌드 3 보관, 소프트런칭 12-29 | **빌드 2(12-10)에 측정 장치·네이티브 묶음, 소프트런칭 12-22 전후, 서버 기능은 OTA·플래그로 켬**. 구현 순서 B0~B8, 레인별 일정 | 9 |
| 2 | 공유 단위 | 카드마다 `shares` 행 | 몽망이마다 **공개 사본 하나(`public_pages`)** — 링크를 켤 때 값으로 고정, '다시 만들기'로만 갱신 | 3-1·3-5 |
| 3 | 링크 기본값 | `link_enabled default true` | **기본 꺼짐**(기획 7절 '링크 기본 켜짐 금지') | 3-1 |
| 4 | 웹 뷰어 | 템플릿 HTML + 카드 이미지 + 15초 루프 | **정적 먼저**(포스터 + 앱이 올린 8초 루프) → WebGL이면 첫 페인트 뒤 **CanvasKit 지연 로드**(플래그 `webLive`). 서버 렌더 0 | 3-5 |
| 5 | 공개 값 | `public_meta` 6개 값 | **공개 스냅숏 v1**(파생 획 ≤64점 + attach + 타고남 요약 + 먹·결 + 켤 때 날 세기) — core가 만들고 서버가 키 화이트리스트로 검증. `nameVisibility` 기본 끔, OG에도 같은 설정 | 3-5 |
| 6 | 링크 조회 수 | `/m` HTML을 그릴 때 셈 | **v1 결함 정정**: CDN 캐시 적중이면 Nest가 못 센다 → 쿠키 없는 **조회 비콘** + 인스턴스 메모리 합산 | 3-6 |
| 7 | 지표 | 화이트리스트 10개 | **집계 칸 차원 3개**(`nt` 이름 시점 군·`wg` 위젯·`moon` 보름 창), 이벤트 핑 시점 정리, 작은 칸 합쳐 보기 | 3-6 |
| 8 | 캐시·숨김(Q12) | `s-maxage` 3600, 즉시는 배포 무효화 | **Q12 표**: 앱·JSON 즉시 / HTML·OG 최대 1시간 / 신고 숨김은 공개 파일을 **비공개 격리 버킷으로 옮겨** 즉시 안 보임 + 운영자 확인 7일 | 3-9 |
| 9 | 신고 | 3건이면 자동 숨김(신고자 정보 없음) | **같은 사람 3번 = 3건**이 되는 구멍을 막는 48시간 일일 소금 해시(기획과 다름 — 리뷰 질문 1) | 3-8 |
| 10 | 원격 모티프 | 없음 | **정적 매니페스트 `/content/v1.json` + 해시 이름 파일**(Firebase Hosting, Git). 실행 코드 0, core 검증기 | 3-10 |
| 11 | OTA | 없음 | **`expo-updates` 채널·러너 버전·플래그와의 관계**(코드는 OTA, 켜기는 플래그, 플래그마다 `minBundle`) | 3-11 |
| 12 | 플래그 | 3개, 6시간 | 키 9개, TTL 1시간 + 포그라운드 갱신, `minBundle` | 3-7 |
| 13 | 관리 도구 | 만들지 않음(Studio + SQL) | **최소판**: 별도 Cloud Run 서비스(비공개, IAM 프록시) — 신고 대기열·격리본 보기·원형 보기(SVG)·복원/확정·삭제 요청 처리 | 3-12 |
| 14 | 이력 보관 | 최근 3 + 하루 1벌 7일 + 충돌본 30일 | **최대 4주**: 최근 3 + 주 1벌 4주 + 충돌·복원 전 본 30일 | 3-4·5-5 |
| 15 | 연령 | 13+ 타깃, 계정 생길 때 확인 | **타깃 14세 이상**(D-23). `bootstrap`이 연령 확인 통과 표시 없으면 거부, `under14`는 서버에 없음 | 3-3·5-3 |
| 16 | 장기 미사용 | 2년(오너 결정) | 2년 확정(D-23), **1.0부터 월 단위 `last_active_month`를 쌓고** 실행은 1.0.x | 5-5 |
| 17 | 개인정보 항목 | 세이브 = 획·잠 시각·정·손 기억 | **이용 시간대 패턴·부재 길이·설치 시각·시간대**를 처리방침·라벨에 명시(빌드 1 리뷰 #10), 서버는 본문을 풀어 보지 않는다 | 5-1 |
| 18 | 1.0 직후 | 자리 테이블 4개 이름만 | 밤물·동기·발자국 테이블·API·짝 고르기 규칙·**세 번째 계정 생성 순간** | 3-13 |
| 19 | 부하 시험 | 없음 | **L1~L6**(링크 하루 10만 조회·핑 폭주·세이브·남용·콜드 스타트·느린 서버) | 7 |
| 20 | 비용 | 10만 명 월 35~70달러 | 재추정: 10만 설치 **월 약 75~110달러 + EAS Update**, 60만 낙관 **월 약 300~550달러** | 8 |
| 21 | 도메인 | 후보 5개 | **`mongmang.ink` 확정**(D-21). 후보 표 삭제 | 0·9 |

---

## 0. 한 장 요약 [v2]

| 항목 | 결정(제안) |
|---|---|
| 원칙 | **앱이 정본, 서버는 사본·창구.** 서버가 죽어도 게임은 한 프레임도 멈추지 않는다(D-21, 기획 P1). 모든 서버 호출은 비차단·재시도·포기 가능 |
| DB·인증·파일 | Supabase **서울(ap-northeast-2)** — 운영 `mong-prod`(**12-18까지 Pro**, 소프트런칭 실데이터 전) + 스테이징 `mong-staging`(Free) |
| API 서버 | NestJS(Fastify) → Docker → **Cloud Run 서울(asia-northeast3)**. 공개 API `mong-api` + 비공개 관리 `mong-admin`(같은 이미지) |
| 도메인 앞단 | `mongmang.ink` → **Firebase Hosting**: 정적(랜딩·`.well-known`·플래그·모티프·웹 뷰어 JS·CanvasKit) + `/m/**`·`/api/**` → Cloud Run rewrite. 스테이징은 `staging.mongmang.ink`(같은 프로젝트의 두 번째 사이트) |
| 인증 | 계정은 **필요한 순간에만**(첫 링크 켜기·맡겨 두기 켜기, 1.0 직후 밤물 열기). 그 직전 **만 14세 이상 확인 1회**. 익명 로그인 → 되찾기 글귀 → Apple/Google 연결은 1.0.x |
| 세이브 | 통째 스냅샷 + 리비전(If-Match), 병합 없음, 충돌은 사용자가 나란히 보고 고름. 이력 **최대 4주** |
| 링크·웹 | `mongmang.ink/m/{코드8}`(서버 난수 40비트). 페이지 = **정적 HTML + 앱이 올린 포스터·8초 루프**, WebGL이면 첫 페인트 뒤 CanvasKit으로 살아 있는 몽망이. 공개 값은 **링크 켤 때 고정**, 이름 공개 기본 끔 |
| Q12 캐시 | 앱·JSON **즉시** / `/m` HTML·OG **최대 1시간** / 신고 자동 숨김은 공개 파일을 **격리 버킷으로 옮겨 즉시** 안 보임(운영자 확인 7일) |
| 지표 | **식별자 없는 집계 핑** + 차원 3개(`nt`·`wg`·`moon`) → D1/D7/D14/D30·이름 A/B·위젯·보름. 링크 조회는 쿠키 없는 비콘. 설치 귀속은 스토어 캠페인 링크 |
| 플래그·모티프 | 정적 `config/v1.json`(TTL 1시간, `minBundle`) / 정적 `content/v1.json` + 해시 이름 모티프 파일. 둘 다 Git → `firebase deploy` |
| OTA | `expo-updates` — 채널 `preview`·`production`, 러너 버전 `fingerprint`. **코드는 OTA로 꺼진 채 들어오고, 켜는 것은 플래그**. 시작을 막지 않음 |
| 관리 | `mong-admin`(공개 안 함, `gcloud run services proxy`로만): 신고 대기열·격리본·원형 보기·삭제 요청. Studio는 비상용 |
| 비용 | 소프트런칭까지 **월 약 25~30달러 + 도메인**. 10만 설치 **월 약 75~110달러 + EAS Update**, 60만 낙관 **월 약 300~550달러** [팀 추정] |
| 일정 | **B1·B6 골격·배포(11-21~11-25) → B0 측정 시계(11-27) → B3 링크·웹(12-03) → B4(12-05) → B2 맡겨 두기(12-11) → B5 안전(12-15) → B7 부하(12-17) → 12-18 Pro·RC**. 서버 레인 약 15.5일 + 웹 6일 + 문서 1일(9-1) |
| 오너 할 일(급함) | **11-23까지 GCP·Firebase·Supabase 계정·결제**(B6이 11-24 시작), 11-26 Apple Team ID, 11-30 Play 앱 서명 SHA-256, 12-05 법률 검토(14세·국외 이전), Expo 요금제 확인 |

---

## 1. 서버 역할과 우선순위 [v2]

| 순위 | 역할 | 기둥 | 서버 준비 | 사용자에게 켜는 때(플래그) | 없으면 |
|---|---|---|---|---|---|
| ① | **측정** — 집계 핑(차원 3) + 링크 퍼널 | 운영 | 11-27(B0) | 빌드 2(12-10)부터 늘 | 콘솔 지표만(D-18 원래 방식). 이름 A/B 판정 불가 |
| ② | **원격 플래그 + OTA 관계** | 운영 | 11-27(B0) | 빌드 2부터 늘 | 서버 기능을 소프트런칭 중 켤 수 없다 → 기획 4-5 일정 붕괴 |
| ③ | **클라우드 보관(맡겨 두기)** | ③ 잃지 않음 | 12-11(B2) | 소프트런칭 중 OTA #1(12-24 전후) | OS 백업·내보내기 코드만 |
| ④ | **공유 링크 웹 뷰어** — 정적 → 살아 있는 몽망이 | ② 자랑 → 호기심 | 12-03(B3) | OTA #2(12-29 전후), `webLive`는 01-05 전후 | 링크가 랜딩으로만 감 |
| ⑤ | **원격 꿈 모티프** | ① 다름 | 12-05(B4) | 01-08 전후 | 번들 모티프 25 + 보름 3만 |
| ⑥ | **안전 바닥 + 관리 도구** | 전제 | 12-15(B5) | ③④와 같이(③④보다 늦게 켜지 않는다) | ③④를 켤 수 없다(스토어 UGC·삭제 정책) |
| ⑦ | **1.0 직후 소셜 자리**(밤물·동기·발자국) | ①②③ | 자리만(3-13) | 1.0 직후 | — |

①②가 1순위인 까닭(v1에서 바뀜): 출시일을 정하는 것은 **측정 시계**다(기획 4-5, 리뷰 C3). 바이너리에 박히는 것(도메인 링크 설정·핑·플래그 로더·`expo-updates`)은 빌드 2 한 번에 들어가야 하고, 그 뒤 서버 기능은 **JS + OTA + 플래그로만** 들어온다. ③~⑥은 소프트런칭 중에 차례로 켜므로 빌드 2 날짜에 묶이지 않는다. 단 ⑥은 ③④보다 늦게 켜지 않는다(신고·삭제 없이 공개 링크를 열지 않는다).

---

## 2. 스택 구성과 역할 분담

### 2-1. 그림 [v2]

```
[앱 iOS/Android/웹]                                   [SNS 크롤러·링크 손님 브라우저]
   │ (모든 호출 비차단, 5초 타임아웃, 아웃박스)               │
   │ OTA 확인(시작을 막지 않음) ──▶ EAS Update(Expo, 미국)    ▼
   │                        ┌──── Firebase Hosting (https://mongmang.ink) ─────┐
   │                        │ 정적: / 랜딩, /.well-known/*, /config/v1.json,    │
   │                        │   /content/v1.json + /content/motifs/*,           │
   │                        │   /w/live.{hash}.js, /w/ck/{ver}/canvaskit.wasm,  │
   │                        │   /delete, /privacy                               │
   │ /api/** ──────────────▶│ rewrite: /api/**, /m/** → Cloud Run mong-api      │
   │                        └──────────────────────────┬───────────────────────┘
   │                                                   ▼
   │                  ┌─ Cloud Run 서울 mong-api (공개) ─┐   ┌─ mong-admin (비공개, IAM) ─┐
   │                  │ /api/v1/* JSON, /m/{code} HTML   │   │ 신고 대기열·격리본·원형 보기 │
   │                  │ JWT 검증(Supabase JWKS)          │   │ 삭제 요청 처리               │
   │                  │ 세이브·스냅숏 검증 = @mong/core   │   │ ← gcloud run services proxy │
   │                  │ 핑·비콘 메모리 합산 → 10초 flush  │   └──────────┬──────────────────┘
   │                  └──────┬──────────────┬─────────┘              │
   │        Cloud Scheduler ─┘(OIDC, 매일)  │ service role            │
   ▼                         ▼ Prisma(풀러)  ▼                         ▼
 Supabase Auth ◀─익명 로그인─ Supabase Postgres   Supabase Storage: public-pages(공개) / quarantine(비공개)
 (앱이 supabase-js로 직접)   (서울, schema app)    ◀── 앱이 서명 URL로 직접 PUT(포스터·OG·루프·스냅숏)
```

### 2-2. 누가 무엇을 하나 [v2]

| 구성 요소 | 맡는 일 | 맡지 않는 일 |
|---|---|---|
| **Supabase Auth** | 익명 로그인, JWT 발급·갱신, (1.0.x) Apple/Google 연결 | 권한 판단(그건 Nest) |
| **Supabase Postgres** | 모든 데이터. `pg_cron`으로 **DB만 건드리는** 정리(이력 솎기, 집계 말기, 신고 해시 비우기) | Data API 노출 — `app` 스키마는 노출하지 않는다 |
| **Supabase Storage** | `public-pages`(공개 읽기): 포스터·OG·8초 루프·공개 스냅숏 / `quarantine`(비공개): 신고로 숨긴 본 30일 | 세이브 본문(Postgres), 모티프(Firebase 정적) |
| **NestJS `mong-api`** | 공개 API 전부, `/m/{code}` HTML, 레이트 리밋, 세이브·스냅숏 검증, 삭제 처리, 핑·비콘 합산, `/internal/cron/*`(Scheduler만) | 이미지·영상 렌더(앱이 한다), 정적 파일 |
| **NestJS `mong-admin`** | 3-12 관리 화면(서버 렌더 HTML, 같은 이미지 `ADMIN_MODE=1`) | 공개 인터넷 노출 |
| **Cloud Scheduler** | Storage를 건드리는 정기 작업 호출(삭제 재시도, 파일 정리, 1.0.x 장기 미사용) — 무료 3개 | — |
| **Firebase Hosting** | 도메인·TLS·CDN, 정적 파일, Cloud Run rewrite, `/m/**` 응답 CDN 캐시 | 동적 로직 |
| **EAS Update** | OTA 번들 배포(3-11) | 플래그(그건 `config/v1.json`) |
| **Edge Functions** | 없음(자리만) | — |

**왜 Edge Functions를 안 쓰나**(v1 그대로): ① 웹 뷰어는 크롤러용 HTML이 필요한데, Supabase는 커스텀 도메인 없이 Edge Function의 HTML 응답을 막는다([HTTP methods](https://supabase.com/docs/guides/functions/http-methods), [changelog 29633](https://supabase.com/changelog/29633-xhtml-responses-are-only-allowed-with-a-custom-domain-enabled), [custom domains](https://supabase.com/docs/guides/platform/custom-domains)). ② Deno 런타임이라 `@mong/core` 검증을 두 군데서 돌리게 된다. ③ 1인 운영에서 배포 경로를 하나로 줄인다.

**왜 이미지·영상을 서버가 안 만드나**(v2 강화, 리뷰 I2): 포스터·OG·8초 루프는 모두 **앱이 렌더·인코드해 올린다**. 앱은 이미 Skia 파이프라인(C-integrated 2-3)과 D-18 자체 영상 인코더(iOS AVAssetWriter / Android MediaCodec)를 갖는다. 서버에서 다시 그리면 렌더 코드가 둘이 되고 Cloud Run 위에 헤드리스 렌더·인코더를 올려야 한다. 인코더가 12-05 관문을 못 넘으면 루프 없이 포스터만 올린다(웹은 포스터만으로 완결).

### 2-3. NestJS 호스팅 비교(Docker 이미지를 그대로 올리는 곳)

v1 그대로. 결론만: **Cloud Run 서울.** ① Prisma는 한 요청에 쿼리를 여러 번 보낸다 — API를 DB와 같은 도시에 둬야 하고, 후보 다섯 중 서울 리전은 Cloud Run뿐이다. ② 컴퓨트·DB가 국내라 국외 이전 고지가 가장 작다(5-4).

| 기준 | **Cloud Run** | Fly.io | Render | Railway | Koyeb |
|---|---|---|---|---|---|
| 서울 근처 리전 | **서울 asia-northeast3** | 도쿄·싱가포르 | 싱가포르 | 싱가포르 | 도쿄·싱가포르 |
| DB(서울)까지 왕복 | 수 ms | 약 30ms × 쿼리 수 [팀 추정] | 약 70ms × 쿼리 수 | 약 70ms × 쿼리 수 | 30~70ms × 쿼리 수 |
| 커스텀 도메인 | 서울은 매핑 미지원 → Firebase Hosting | 쉬움 | 쉬움 | 쉬움 | 쉬움 |
| 국외 이전 고지 | 작음 | 필요 | 필요 | 필요 | 필요 |

- 차선: **Fly.io 도쿄**(Docker 이미지 같음, 이전 반나절 [팀 추정]).
- 커스텀 도메인: Cloud Run 도메인 매핑은 미리보기이고 서울 미지원([Cloud Run 커스텀 도메인](https://docs.cloud.google.com/run/docs/mapping-custom-domains)) → **Firebase Hosting rewrite**. 서울 rewrite 지원은 **B6 첫날(11-24) 확인** **[확인 필요]** — 안 되면 Cloudflare Worker 프록시(DNS가 이미 Cloudflare).
- 설정값: `mong-api` `--region=asia-northeast3 --min-instances=0 --max-instances=3 --cpu-boost --concurrency=40 --memory=512Mi --cpu=1`. **소프트런칭 중 min 0**(트래픽 작음, CDN이 콜드 스타트를 가림), **정식 출시 주 min 1**. `mong-admin` `--no-allow-unauthenticated --min-instances=0 --max-instances=1`.

### 2-4. Supabase 설정 [v2]

| 항목 | 값 |
|---|---|
| 리전 | **서울 ap-northeast-2**([Regions](https://supabase.com/docs/guides/platform/regions)) |
| 요금제 | 스테이징 Free. **운영은 12-18까지 Pro**(v1의 12-26에서 당김 — 소프트런칭 12-22부터 실사용자 세이브가 들어온다. Free는 1주 비활성 일시정지·백업 없음, [Pricing](https://supabase.com/pricing)) |
| 스키마 | `app` 스키마, Data API 노출 목록에 넣지 않음 |
| RLS | `app` 모든 테이블 RLS 켜고 정책 0개. Nest는 `prisma` 롤(소유자)로 접속 — **권한 판단은 Nest가 JWT `sub`로** |
| Storage | 버킷 `public-pages`(공개 읽기, 쓰기 정책 없음) / `quarantine`(비공개). 업로드는 Nest가 service role로 `createSignedUploadUrl` 발급 → 앱이 직접 PUT. 경로 `public-pages/{creatureId}/{pageVer}-{rand}/{poster.jpg,og.jpg,loop.mp4,snap.json}` — **판(ver)마다 새 경로**라 파일은 `immutable` 캐시, 지우기는 경로째 |
| Storage CDN | 공개 파일은 Supabase CDN을 거친다. **Pro의 Smart CDN은 파일 삭제·덮어쓰기 때 캐시를 무효화(전파 최대 약 60초)** **[확인 필요: Smart CDN 동작·요금제 조건]** — Q12 '격리로 즉시'가 여기에 기댄다(3-9) |
| Auth | 익명 로그인 켬, 수동 연결 켬(1.0.x 대비), 익명 가입 IP 한도 기본 30/시간 → CGNAT로 막히면 120 |
| JWT 검증 | JWKS(`/auth/v1/.well-known/jwks.json`) 비대칭 서명 검증(`jose`). 프로젝트 기본 서명 방식은 생성 때 확인 **[확인 필요]** |
| `pg_cron`(DB만) | 매일 04:00 KST: ① 데이터 없는 익명 사용자 30일 뒤 삭제([Anonymous](https://supabase.com/docs/guides/auth/auth-anonymous)) ② 세이브 이력 솎기(3-4) ③ `report_hits.reporter_key` 48시간 지난 값 NULL ④ `daily_salts` 2일 지난 행 삭제 ⑤ `metric_daily` 90일 이전 행 월 단위로 말기 ⑥ `reports` 1년 지난 행 삭제 |
| Cloud Scheduler(Storage 포함) | 매일 04:30 KST `POST /internal/cron/storage-gc`(지난 판 파일 2시간 유예 뒤 삭제, 격리 30일 지난 파일 삭제, 실패한 삭제 작업 재시도) / 1.0.x 매월 1일 `inactive-sweep` |

### 2-5. Prisma 운영

v1 그대로(Prisma 7, `@prisma/adapter-pg`, `prisma.config.ts`, 트랜잭션 풀러 6543 = 런타임 / 세션 풀러 5432 = 마이그레이션, 인스턴스당 풀 5 × 최대 3 = 15 연결, 전용 `prisma` 롤, **컨테이너 시작 때 마이그레이션하지 않음**, 확장 → 배포 → 축소, Supabase 전용 SQL은 마이그레이션 안 raw SQL, 잠금 지점은 Supabase Auth 하나 → `AuthVerifier` 인터페이스)([Prisma 7](https://www.prisma.io/changelog/2025-11-19), [Supabase × Prisma](https://supabase.com/docs/guides/database/prisma)).

- v2 추가: `mong-admin`도 같은 풀러를 쓰되 풀 2. 합계 최대 17 연결 — Supabase Pro Micro의 풀러 한도 안 **[확인 필요: 풀러 클라이언트 한도]**.

---

## 3. 데이터 모델·API·인증·동기화·링크

### 3-1. 테이블(Prisma, 스키마 `app`) [v2]

| 테이블 | 키·열 | 인덱스·제약 | 비고 |
|---|---|---|---|
| `users` | `id uuid PK`(= `auth.users.id`), `created_at`, **`last_active_month date`**(그달 1일, 5-5), `recovery_hash bytea?`, `recovery_rotated_at?`, `locale char(2)`, **`age_gate_v smallint`, `age_confirmed_on date`** | — | 이름·이메일 없음. 연령은 **'14세 이상' 확인 기록만**(3-3). `inactive_notice_at`은 1.0.x에 추가 |
| `creatures` | `id uuid PK`, `user_id FK→users ON DELETE CASCADE`, `code char(8) UNIQUE`, **`link_enabled bool default false`**, **`name_visible bool default false`**, `hidden bool`(운영 확정 숨김), `created_at` | `UNIQUE(user_id)`는 1.0까지 앱 규칙으로만 | **인장 코드 = 링크 키**. v1 `default true`는 기획 7절과 어긋나 고침 |
| `saves` | v1 그대로(`creature_id PK`, `rev`, `body bytea` gzip, `body_sha256`, `envelope_ver`, `sim_ver`, `validated`, `client_saved_at`, `day_index`, `strokes_total`, `device_id`, `updated_at`) | — | 본문 상한 512KB(압축 전). **서버는 `day_index`·`strokes_total`·버전 외에는 본문에서 꺼내 저장하지 않는다**(5-1) |
| `save_versions` | `id bigserial`, `creature_id FK CASCADE`, `rev`, `body`, `body_sha256`, `client_saved_at`, **`reason enum(overwritten, weekly, conflict, pre_restore)`**, `created_at` | `(creature_id, created_at desc)` | **최대 4주**(3-4) |
| **`public_pages`** (v1 `shares` 대체) | `creature_id PK FK CASCADE`, `ver int`, `state enum(live, off, quarantined, removed)`, `meta jsonb`(3-5 표시용 값만), `path_prefix text`, `has_loop bool`, `published_at`, `state_changed_at` | `(state)` | 몽망이마다 **현재 공개 사본 하나**. 판이 바뀌면 `ver+1`, 지난 판 파일은 `storage_gc`로 2시간 뒤 삭제 |
| `storage_gc` | `id bigserial`, `bucket`, `prefix`, `not_before timestamptz`, `attempts smallint` | `(not_before)` | Storage 삭제 대기열(유예·재시도) |
| `reports` | `id bigserial`, **`target_kind enum(link, encounter, cohort, footprint)`**, `target_ref text`(링크는 `code`), `reason enum`, `created_at`, `status enum(open, auto_hidden, restored, confirmed, dismissed)`, `resolved_at?` | `(target_kind, target_ref)`, `(status)` | 신고자 정보 없음. **1년 보관 — 목적: 같은 대상의 재발 판단**(기획 6-5) |
| **`report_hits`** | `id bigserial`, `report_id FK`, `reporter_key bytea?`(48시간 뒤 NULL), `created_at` | `(report_id, reporter_key)` UNIQUE | 같은 사람의 중복 신고를 걸러 '3건'을 3명으로 센다(3-8) |
| **`daily_salts`** | `day date PK`, `salt bytea` | — | `reporter_key = HMAC(salt, ip ‖ ua)`용. 2일 뒤 삭제 → 그 뒤 해시는 되돌릴 수 없다 |
| `metric_daily` | PK `(day, event, cohort_day, day_n, platform, app_ver, lang, `**`nt, wg, moon`**`)`, `count int` | — | **식별자 없는 집계**(3-6). `nt char(1)`('A'·'B'·'-'), `wg char(1)`('0'·'1'·'?'), `moon char(1)`('0'·'1') |
| `link_daily` | PK `(day, code, event enum(view, store_ios, store_android, open_app))`, `count` | — | 퍼널. `view`는 비콘으로만 센다(3-6) |
| `deletion_log` | v1 그대로 + `kind enum(user_request, web_request, inactive, report_confirmed)` | — | 누구인지 없이 개수만 |
| `admin_actions` | `id`, `action`, `target_kind`, `target_ref`, `note`, `at` | — | 관리 도구 감사 기록(운영자 1인이라 사람 칸 없음) |
| (1.0 직후 자리) `night_drops`, `encounters`, `ink_gifts`, `blocks`, `footprint_raw`, `footprint_daily` | 3-13 | — | **모두 `creatures`에 CASCADE** — 삭제 한 번에 함께 지워진다. 테이블은 1.0 직후 마이그레이션에서 만든다(1.0에 미리 만들지 않는다) |

### 3-2. API(접두 `/api/v1`, JSON, 인증 = `Authorization: Bearer <Supabase JWT>`) [v2]

| 메서드·경로 | 인증 | 요청 → 응답 | 준비(B) |
|---|---|---|---|
| `GET /healthz` / `GET /readyz` | 없음 | `200 {ok, ver, saveSchema, simSchema}` / DB `select 1` | B1 |
| `POST /api/v1/ping` | **없음** | `{cohortDay, dayN, platform, appVer, lang, dims:{nt, wg, moon}, events?:[{e, dayN}]}` → `204`(3-6) | B0 |
| `POST /api/v1/me/bootstrap` | JWT | **`{ageGate:{v:1, ok:true}}`** → `{userId, creature:{code}}`. `ageGate` 없으면 `400`(3-3). 멱등 | B3 |
| `POST /api/v1/me/touch` | JWT | `{}` → `204`. 앱이 **달이 바뀐 뒤 첫 실행 때 한 번만**(세션이 있을 때) | B3 |
| **`PUT /api/v1/creature/page`** | JWT | 링크 켜기·다시 만들기. `{snapshot, nameVisible, name?, lang, files:{poster, og, loop?}}`(각 `{contentType, bytes}`) → `{ver, nameAllowed, url:'https://mongmang.ink/m/K7M3QX9P', upload:{poster:{signedUrl, token}, og, loop?, snap}}`. 서버가 스냅숏 검증·금칙어 검사 후 업로드 URL 발급 | B3 |
| **`POST /api/v1/creature/page/{ver}/commit`** | JWT | → `200`(파일 넷 존재·크기 확인 → `state=live`, 지난 판은 `storage_gc`) / `409`(더 새 판 있음) | B3 |
| **`DELETE /api/v1/creature/page`** | JWT | → `204`. 링크 끄기: `state=off`, `link_enabled=false`, **공개 파일 즉시 삭제** | B3 |
| `PATCH /api/v1/creature` | JWT | `{nameVisible}` → `200`. 이름 공개만 바꾸면 **다시 만들기 필요**(OG 이미지에 이름이 그려지므로) — 앱이 바로 `PUT page`를 이어 부른다 | B3 |
| `GET /api/v1/creature` | JWT | → `{code, linkEnabled, nameVisible, page:{ver, state}}` — 앱 안 표시는 이 값(즉시) | B3 |
| `GET /api/v1/saves/main/meta` · `GET /saves/main` · `PUT /saves/main` · `GET /saves/main/versions` · `POST .../versions/{id}/restore` | JWT | v1 그대로(3-4) | B2 |
| `POST /api/v1/recovery-code` · `POST /api/v1/recover` | JWT | v1 그대로(3-3) | B2 |
| `DELETE /api/v1/me` | JWT | → `202 {deletionId}` / `GET /api/v1/me/deletion/{id}` → `{state}`(3-8) | B2 |
| `GET /m/{code}` | 없음 | 정적 HTML(3-5). 없는·꺼진·숨긴 코드는 같은 틀의 '사라진 링크'(200, noindex) | B3 |
| `GET /m/{code}/get?p=ios\|android` | 없음 | `302` 스토어(캠페인 파라미터) + 카운트, `no-store` | B3 |
| **`POST /api/v1/m/{code}/seen`** | 없음 | 비콘(`sendBeacon`, 본문 없음) → `204`, `no-store`(3-6) | B3 |
| `POST /m/{code}/report` | 없음 | 폼(`reason`) → `303` 감사 페이지(3-8) | B5 |
| `POST /internal/cron/{job}` | Scheduler OIDC | 정기 작업 | B2·B5 |
| 정적(Firebase) | — | `/`, `/.well-known/apple-app-site-association`, `/.well-known/assetlinks.json`, `/config/v1.json`, `/content/v1.json`, `/content/motifs/*`, `/w/*`, `/delete`, `/privacy`, `/robots.txt` | B0·B4 |
| (1.0 직후 자리) `/api/v1/night/*`, `/api/v1/cohort`, `/api/v1/footprints`, `/api/v1/blocks`, `POST /m/{code}/pat` | — | 3-13. **경로 이름만 예약**, 1.0 서버에는 없다(404) | — |

- v1에서 빠진 것: `POST /shares`·`/shares/{id}/commit`·`DELETE /shares/{id}`(→ `creature/page`로 합침).
- OpenAPI → `packages/api-contract`(v1 그대로). 앱 typecheck가 응답 모양 변경을 잡는다.
- 관리자 API는 **공개 서비스에 두지 않는다**(3-12).

### 3-3. 인증 — "필요할 때 익명 → 되찾기 글귀 → (선택) Apple/Google" [v2]

1. **설치 직후에는 계정을 만들지 않는다.** 핑·플래그·모티프·OTA는 인증이 필요 없다(기획 P9).
2. **계정이 생기는 순간**: ① 첫 '링크 켜기' ② '맡겨 두기' 켜기 — 1.0. ③ **'밤물 열기'**(1.0 직후, 3-13) — 밤 맡김을 올려야 하므로 계정이 필요하다. 기획 v2.2는 ①②만 적었다 → **리뷰 질문 4**.
3. **연령 확인(타깃 14세 이상, D-23)**: 계정이 생기기 직전에 앱이 "만 14세 이상만 쓸 수 있어요" 한 번. '아니요'는 **기기에만** 기록(같은 날 다시 묻지 않음), 익명 로그인을 하지 않는다 → 서버에 `under14`가 존재할 수 없다. '예'면 `signInAnonymously()` → `bootstrap {ageGate:{v:1, ok:true}}`. 서버는 `age_gate_v`·`age_confirmed_on`(날짜만)을 남긴다 — **확인 절차를 거쳤다는 기록**이고 나이 자체가 아니다. `ageGate` 없는 `bootstrap`은 `400`(앱 버그로 확인을 건너뛰는 것을 서버가 막는다). 문구를 바꾸면 `v`를 올린다.
4. 세션 저장: supabase-js `storage` 어댑터를 MMKV로. 앱을 지우면 세션도 사라지므로 **되찾기 글귀가 유일한 열쇠**다.
5. **되찾기 글귀**: 서버가 80비트 보안 난수 → 16자 Crockford base32, **SHA-256 + 서버 pepper 해시만 저장**(80비트면 느린 해시 불필요, 리뷰 C2 덧붙임). '맡겨 두기'를 켤 때 한 번 보여 줌. `POST /recover`가 몽망이를 새 익명 사용자로 옮긴다. 시도 한도 IP당 5회/시간, 글귀당 10회/일.
6. **Apple/Google 연결(1.0.x)**: v1 그대로(`linkIdentity`, 새 네이티브 모듈 2개라 빌드 2 묶음 밖).
7. 토큰 갱신 실패·세션 소실 = '맡겨 두기 끊김' 표시만, 게임은 계속.

### 3-4. 세이브 동기화 규칙 — 통째, 리비전, 병합 없음 [v2]

v1 규칙 그대로(기기 MMKV가 정본, `serializeState` 통째, 백그라운드·깸 직후·10분에 한 번 이하, `If-Match` 리비전, 409면 자동 선택 없이 **두 몽망이 나란히 고르기**(기획 2-1), 같은 `sha` 빨리 감기, 새 기기 복원은 `parseState` 검증 + `pre_restore` 보존, 서버 검증 = `@mong/core` `parseState`, **미래 버전은 거부하지 않고 `validated=false`**, 서버 시각 미사용, 상한 512KB). v2에서 바뀌거나 더한 것:

| 규칙 | 내용 |
|---|---|
| **이력 보관(최대 4주)** | `overwritten`: 최근 **3벌** / `weekly`: 서버 `created_at` 기준 **ISO 주마다 첫 본 1벌, 4주** / `conflict`·`pre_restore`: **30일**. `pg_cron`이 매일 솎는다. v1의 `daily` 7일은 없앤다 |
| **반쯤 성공한 업로드** | 서버가 커밋했는데 응답이 끊기면, 앱은 같은 본을 같은 `If-Match`로 다시 보낸다 → 서버 `rev`가 이미 올라가 409. 이때 409 응답의 `server.sha` == 내 본 `sha`면 **충돌이 아니라 성공**으로 처리하고 `rev`만 맞춘다(빨리 감기 규칙의 응용). 느린 서버 테스트(7절 L6)의 필수 시나리오 |
| **올림 주기와 부하** | 10분에 한 번 이하 + 해시가 다를 때만 → 사용자당 하루 평균 3~6회 [팀 추정](7절 L4) |
| 서버가 본문에서 꺼내는 것 | `day_index`, `strokes_total`, `envelope_ver`, `sim_ver`뿐. 시간대 패턴·부재 길이 같은 값은 **열로 꺼내지도, 색인하지도, 관리 도구에 보여 주지도 않는다**(5-1) |

### 3-5. 공유 링크와 웹 뷰어 — 정적 먼저, 살아 있는 몽망이는 나중에 [v2]

**링크 코드**(v1 그대로): `https://mongmang.ink/m/K7M3QX9P`, 표시는 `K7M3-QX9P`. 서버가 `crypto.randomBytes(5)`로 40비트 발급, 몽망이 한 마리에 평생 하나. **`sealSeed`에서 파생하지 않는다**(32비트라 열거 가능) — 인장 **무늬**는 `sealSeed`, 링크 **코드**는 서버 난수. 추측 불가성: 활성 링크 100만 개·404 IP당 분당 30회면 하루 기대 적중 약 0.04 [팀 추정].

**공개 사본 — 링크를 켤 때 값으로 고정**(기획 2-2·6-3)

| 넣는다(`snap.json` + `public_pages.meta`) | 빼는다 |
|---|---|
| 파생 획(획마다 ≤64점, θ·d를 int16로) + attach | 원본 점열의 시간 t·필압 p |
| 타고남 요약(체형·빗), 먹, 결 이름(이레 뒤) | `relation.hour`·`todayHour`·`spot`·`lastSeenAt`·부재 길이 |
| 이름(**`nameVisible`이고 금칙어 통과일 때만**) | 성향 원값, 정 일수, 태어난 시진·ms 시각 |
| 태어난 날짜(현지 날짜), **켤 때의** 날 세기, 언어 | 계정 id, 기기 정보, 위치 |

- 스냅숏 형식은 **`@mong/core`의 `toPublicSnapshot(state)` / `parsePublicSnapshot(json)`**(버전 `snap:1`)이 정본이다. 서버는 `parsePublicSnapshot`으로 읽고 **알 수 없는 키가 하나라도 있으면 `422`** — 앱 버그로 `relation.hour` 같은 값이 새는 것을 서버가 막는다. 같은 형식을 웹 뷰어·관리 도구 원형 보기·1.0 직후 밤물·동기가 그대로 쓴다(3-13).
- 갱신은 **'링크 켜기'와 '다시 만들기'(이름 공개를 바꿀 때 포함)** 때만. 매일 바뀌지 않으므로 링크를 아는 사람이 주인의 접속 리듬을 읽을 수 없다.
- **이름 공개 순서**: `PUT page`에서 서버가 금칙어를 먼저 검사해 `nameAllowed`를 돌려준다 → 앱은 그 값에 맞춰 **이름 있는/없는 OG를 그린 뒤** 올린다. 그래서 OG 이미지에 걸린 이름이 그려지는 일이 없다. 8초 루프·포스터에는 **이름을 그리지 않는다**(영상 프레임 검사가 필요 없게).
- `public_pages.meta` = `{snap:1, name?, ink, texture?, bornDate, dayAtPublish, lang}` — HTML의 한 줄·`og:title`에만 쓴다.

**파일(앱이 만들어 올림)**

| 파일 | 규격 | 상한 |
|---|---|---|
| `poster.jpg` | 4:5 1080×1350 첫 프레임(한지 위 그 아이, '획 → 몸'의 마지막 장면) | 250KB |
| `og.jpg` | 1200×630, 같은 `cardTextBoxes` 배치에 가로 여백 틀, 이름은 `nameAllowed`일 때만 | 150KB |
| `loop.mp4` | **8초 '획 → 몸'**, H.264, 540×675, 무음, 24fps — D-18 인코더의 웹 전용 저용량 설정 | **600KB** |
| `snap.json` | 공개 스냅숏 | 32KB |

**페이지 `/m/{code}` — 정적 먼저**(기획 2-2, 리뷰 I2)

1. Nest가 템플릿 문자열로 HTML을 만든다(React SSR 없음). **인라인 CSS 포함 30KB 미만**. 첫 화면 = 한지 배경 + `<img poster>`(preload) → `<video autoplay muted playsinline loop poster>`(있으면) + 스토어 버튼 2개 + 보조 줄 "송연먹 · 느긋결 몽망이를 보셨군요" + 작은 '알리기'. **카카오톡·인스타 인앱 브라우저는 여기서 완결**(Q10: 첫 페인트 1초).
2. 첫 페인트 뒤(`load` + `requestIdleCallback`) **조건이 다 맞을 때만** `/w/live.{hash}.js`(약 40KB gzip [팀 추정])를 불러온다: WebGL2 가능 · `navigator.connection.saveData` 아님 · `prefers-reduced-motion` 아님 · `/config/v1.json`의 `webLive`가 켜짐.
3. `live.js`는 `/w/ck/{ver}/canvaskit.wasm`(약 3MB gzip [확인 필요: 쓰는 빌드의 실제 크기])과 `snap.json`을 받아, `@mong/core`의 몸 생성 + 작은 CanvasKit 페인터로 **숨 쉬고 눈 깜빡이며 톡 치면 빗이 흔들리는** 몽망이를 그리고, 준비되면 포스터·영상 자리를 페이드로 바꾼다. 실패·시간 초과(5초)면 아무것도 바꾸지 않는다. 소리는 첫 탭 뒤 짧은 허밍만(기획 11-6, 미정이면 무음).
4. 이미지가 404면(숨김 직후 캐시된 HTML) `onerror`로 빈 한지 + '사라진 링크' 문구로 바뀐다(3-9).

- **언어(v1에서 바뀜)**: v1은 `Accept-Language`로 골랐는데, 그러면 CDN 캐시가 언어마다 갈라져야 한다(Firebase Hosting의 `Vary: Accept-Language` 처리 **[확인 필요]**). v2는 **HTML 기본 언어 = 주인의 `lang`**(링크는 주인의 말로 퍼진다) + 두 언어 문구를 페이지에 함께 넣고 인라인 스크립트가 `navigator.language`로 고른다. 캐시 키는 URL 하나.
- **OG 메타**: `og:image` = `og.jpg`, `twitter:card=summary_large_image`, `og:title` = **이름(공개일 때만) 아니면 앱 이름**, `og:description` = 보조 줄. `og:video`는 넣지 않는다(미리보기 호환성 [팀 추정]).
- **검색**: `noindex`, 랜딩 `/`만 색인. 목록·사이트맵 없음.
- **딥링크**(v1 그대로): iOS 유니버설 링크(AASA `/m/*`) + Android 앱 링크(`assetlinks.json`에 **EAS 업로드 키와 Play 앱 서명 키 SHA-256 둘 다**). 앱이 있으면 이름표처럼 카드만 보여 주는 시트. 디퍼드 딥링크는 하지 않는다.
- **공유 직후 데우기**: 앱은 `commit` 성공 뒤 `/m/{code}`를 한 번 `GET`해 CDN에 올려 둔다(SNS 크롤러가 콜드 스타트를 만나지 않게, v1 반증 #8).

### 3-6. 지표 — 식별자 없이, 차원 3개 [v2]

**핑 하나의 모양**

```json
POST /api/v1/ping
{ "cohortDay": "2026-12-22", "dayN": 3, "platform": "android", "appVer": "1.0.0(14)", "lang": "ko",
  "dims": { "nt": "A", "wg": "1", "moon": "0" },
  "events": [ { "e": "name_set", "dayN": 2 } ] }
```

- **열기 칸**: 하루 첫 실행 때 한 번 → `metric_daily(event='open', day_n=dayN, …dims)` +1. 같은 `dayN`은 기기에서 한 번만(MMKV 표시).
- **이벤트 칸(v1 보완)**: 화이트리스트 이벤트는 **일어난 날의 `dayN`을 붙여 아웃박스에 쌓았다가 다음 핑(또는 앱이 백그라운드로 갈 때의 작은 핑)으로** 보낸다. 한 번만 일어나는 이벤트(`first_tap`·`first_night`·`ire7`·`name_set`·`ink_chosen`·`cloud_on`)는 기기에서 **평생 한 번**만 보낸다 — 그래야 '같은 코호트·같은 군의 개수 비율'이 '사람 비율'과 같아진다(기획 10-1 이름 A/B 주지표). 화이트리스트 10개는 늘리지 않는다(기획 6-2).
- **차원 3개**(기획 2-4·6-4)

| 차원 | 값 | 기기에서 만드는 법 |
|---|---|---|
| `nt` 이름 시점 군 | `A`·`B`·`-`(플래그 꺼짐·배정 전) | 설치 때 만든 **별도 로컬 난수**(`birth.seed`와 무관, 서버로 안 감)로 50:50. 군 값만 보낸다 |
| `wg` 위젯 | `1` 홈 화면에 있음 / `0` 없음 / `?` 모름 | 위젯 로컬 모듈의 `getInstalledCount()` — iOS `WidgetCenter.getCurrentConfigurations`, Android `AppWidgetManager.getAppWidgetIds` **[확인 필요: `react-native-android-widget` 노출 여부]**. **이 함수는 빌드 2 네이티브 묶음에 들어가야 한다** — 놓치면 위젯 화면 스토어 업데이트(01-08 전후)까지 `?` |
| `moon` 보름 창 | `1`·`0` | `@mong/core` 달 위상 함수(현지 날짜, 기획 2-6)가 오늘을 창 안으로 보면 1 |

- **계산**(기획 6-4): D1·D7·D14·D30 = `sum(open, day_n=n) / sum(open, day_n=0)`(같은 코호트 묶음), 이름 A/B = `nt`별 `sum(name_set, day_n ≤ 6) / sum(open, day_n=0)`, 위젯(참고) = `wg`별 `day_n` 비율, 보름(참고) = `moon=1`인 날의 `open` ÷ 앞뒤 주 평균. 판정은 기획 10-1(윌슨 95%·최소 표본·미달 시 기본값)을 **SQL 스니펫 `docs/ops/metrics/*.sql`로 고정**한다 — 판정 날 손으로 계산하지 않는다.
- **칸이 잘게 쪼개지는 문제**: 차원 3개를 더하면 한 칸에 1~2명만 있는 칸이 생긴다. 식별자·IP를 저장하지 않으므로 칸으로 사람을 되짚을 수는 없지만, **대시보드 SQL은 `count < 5` 칸을 '기타'로 합쳐 보이고**, 원표는 내보내지 않는다. 칸 수 상한 추정: 하루 `day_n` 0~35(그 이상은 `99` 한 칸) × 이벤트 11 × 플랫폼 3 × 버전 5 × 언어 2 × 차원 2·3·2 ≈ 최대 수십만 칸, 실제로는 수천 칸 [팀 추정] — 90일 말기로 충분하다.
- **쓰기 방식(v2)**: 핑마다 `UPSERT count+1`을 하면 출시 아침 같은 칸에 잠금이 몰린다. Nest 인스턴스가 **메모리에서 칸별로 더해 10초마다 한 번 `UPSERT … count = count + $n`**으로 내보낸다(인스턴스 종료 신호 때도 flush). 인스턴스가 강제로 죽으면 최대 10초분을 잃는다 — 집계 지표로는 허용 [팀 추정].
- **지표 끄기**: 앱 설정에서 끄면 핑·이벤트·비콘 어느 것도 보내지 않는다 → 모든 집계에서 빠진다(기획 6-4).
- **링크 퍼널(v1 결함 정정)**: v1은 `/m/{code}` HTML을 그릴 때 `view`를 셌는데, HTML은 CDN이 1시간 캐시하므로 **대부분의 조회가 Nest에 닿지 않는다**. v2는 페이지 인라인 스크립트가 `navigator.sendBeacon('/api/v1/m/{code}/seen')`을 한 번 보낸다(쿠키·식별자 없음, `no-store`). 크롤러는 스크립트를 거의 돌리지 않아 자연히 빠진다. 같은 메모리 합산 → `link_daily(view)`. `/get` 302는 원래 Nest를 지나므로 v1 그대로.
- 설치 귀속: Play `utm_*`·App Store `pt`/`ct` 캠페인 링크(v1 그대로) **[확인 필요: 콘솔에서 첫 링크로 검증]**.

### 3-7. 원격 기능 플래그 [v2]

```json
{ "v": 12, "ttlSec": 3600,
  "flags": { "cloud": false, "link": false, "remoteMotifs": false, "webLive": false,
             "nameTiming": true, "jeongCaptions": true, "moonNight": true, "widget": false, "hesitation": false },
  "rollout": { "cloud": 0.2 },
  "minBundle": { "cloud": 3, "link": 4 },
  "minAppBuild": { "ios": 0, "android": 0 } }
```

- 키: 기획 6-2의 5개(`nameTiming`·`jeongCaptions`·`moonNight`·`widget`·`webLive`) + 서버 기능 3개(`cloud`·`link`·`remoteMotifs`) + 기존 `hesitation`. `webLive`는 **웹 뷰어만** 읽는다(3-5).
- **TTL을 6시간 → 1시간**으로, 그리고 포그라운드 때 캐시가 15분보다 오래됐으면 다시 받는다. 소프트런칭 중 서버 기능을 끄는 손잡이가 6시간 늦으면 늦다. 파일은 1KB 정적이라 비용은 사실상 0.
- **`minBundle`(v2)**: 앱 JS에 OTA마다 1씩 올리는 상수 `BUNDLE_SEQ`가 있다. 플래그가 켜져 있어도 `BUNDLE_SEQ < minBundle[key]`면 끈 것으로 본다. → 버그가 있던 OTA 3을 받은 기기는, 고친 OTA 4가 나온 뒤 `minBundle.cloud = 4`로 올리면 그 기능만 꺼진다(3-11).
- 우선순위: **`FEATURE_DEFAULTS`(바이너리) < 원격 캐시 < 개발 메뉴**. 비율 배포는 기기 로컬 난수(서버로 안 감). 플래그로 끄는 건 화면·몸짓뿐, 세이브 필드는 늘 쌓는다. 크래시 루프 탈출(직전 실행이 적용 10초 안에 죽었으면 원격 값을 한 번 무시) v1 그대로.

### 3-8. 남용 방지·신고·백업·삭제 [v2]

**레이트 리밋**(`@nestjs/throttler`, 인스턴스 메모리)

| 대상 | 한도 |
|---|---|
| `/ping` | IP당 20/분 |
| `/m/*` 조회(Nest에 닿는 것) | IP당 60/분, '사라진 링크'는 30/분 |
| `/api/v1/m/*/seen` | IP당 30/분(넘으면 조용히 버림) |
| `PUT /creature/page` | 사용자당 20/일, 파일은 3-5 상한·`image/jpeg`·`video/mp4`·`application/json`만, 서명 URL 1회·5분 |
| `PUT /saves` | 사용자당 60/시간 |
| `/recover` | IP당 5/시간, 글귀당 10/일 |
| `/m/*/report` | IP당 5/시간 |
| Supabase 익명 가입 | 기본 30/시간/IP → CGNAT로 막히면 120 |

- 비용 상한: Cloud Run max-instances 3, GCP 예산 알림(월 30·60·120달러), Supabase Spend cap 켬.
- **이름 공개**: 금칙어 목록(한·영, 서버 검사, 3-5 순서). 걸리면 웹·OG에서 이름 대신 '몽망이'.
- **신고 → 자동 숨김(기획 S5, Q12)**
  1. `POST /m/{code}/report` → `reports`(대상별 열린 행 하나) + `report_hits`. `reporter_key = HMAC(오늘의 소금, IP ‖ User-Agent)`. 같은 대상에 같은 `reporter_key`는 한 번만 센다.
  2. **서로 다른 `reporter_key` 3개**가 30일 안에 모이면 즉시 자동 숨김: `public_pages.state = quarantined`, 공개 파일을 `quarantine` 버킷으로 **옮긴다**(Storage move). 공개 경로에서는 바로 사라진다(3-9).
  3. 운영자 확인 **7일 안**(3-12): 복원(파일을 되돌리고 `live`) / 확정(격리 파일 삭제, `creatures.hidden = true`, 링크 영구 끔) / 이름만 문제면 '이름 가리기'(`name_visible=false` 강제 + 주인 앱에 '다시 만들기' 안내).
  4. `reporter_key`는 48시간 뒤 NULL, 소금은 2일 뒤 삭제 → 그 뒤에는 누가 신고했는지 되짚을 수 없다. **기획 6-5 '신고자 정보는 저장하지 않음'과 다르다** — 이것 없이는 한 사람이 남의 링크를 세 번 눌러 숨길 수 있다(리뷰 질문 1).
  - 한계: IP를 바꾸며 신고하는 사람은 못 막는다. 대신 격리(삭제 아님)라 운영자가 7일 안에 되돌릴 수 있고, 같은 링크가 반복해서 걸리면 `reports` 이력으로 판단한다.
- **백업**: Supabase Pro 일일 백업(보존 7일). PITR은 사지 않는다(앱이 정본). 분기마다 스테이징 복원 리허설 1회(첫 회는 B7).
- **삭제(파기) 절차**
  1. 앱 안: 공방 노트 → '서버에 맡긴 것 지우기' → `DELETE /me` → `202`. Nest가 한 트랜잭션에서 `users` 삭제(→ `creatures`·`saves`·`save_versions`·`public_pages`·(1.0 직후) 소셜 테이블 CASCADE) → Storage `public-pages/{creatureId}/`·`quarantine/{creatureId}/` 삭제 → Auth Admin API로 `auth.users` 삭제 → `deletion_log`. Storage·Auth 단계가 실패하면 `storage_gc`·재시도 대기열에 남기고 Scheduler가 이어 한다. 기기 세이브는 그대로.
  2. 웹: `/delete` = Google Play 계정 삭제 정책의 웹 링크([정책](https://support.google.com/googleplay/android-developer/answer/13327111)). 앱이 없는 사람은 **인장 코드 + 되찾기 글귀**를 메일로 → 운영자가 관리 도구 '삭제 요청 처리'(3-12)로 **7일 안**. 되찾기 글귀가 없으면 링크 끄기만(본인 확인 불가를 페이지에 적는다).
  3. 백업 속 사본 7일 뒤 소멸 — 처리방침에 적는다.
  4. 장기 미사용 2년 — 5-5.
- Apple 5.1.1(v): 익명 자동 계정도 보수적으로 같은 대상으로 본다(앱 안 삭제를 '맡겨 두기'·'링크'와 같은 OTA에).

### 3-9. 링크 끄기·신고 숨김의 캐시 정책 — Q12 [v2]

기획 Q12: "앱 안 표시·JSON은 즉시, `/m` HTML·OG 캐시는 최대 1시간(`s-maxage` 3600), 신고 3건 자동 숨김 시 이미지 파일 삭제로 즉시 안 보임". 층마다 무엇이 언제 사라지는지:

| 층 | `Cache-Control` | 링크 끄기(주인) | 신고 자동 숨김 | 다시 만들기 |
|---|---|---|---|---|
| 앱 안 표시(`GET /creature`) | `no-store` | **즉시** | 즉시(주인 앱에 '잠시 가려졌어요' — 문구 작가 몫) | 즉시 |
| API JSON 전부 | `no-store` | 즉시 | 즉시 | 즉시 |
| `/m/{code}` HTML(살아 있는 링크) | `public, max-age=300, s-maxage=3600` | **최대 1시간** 옛 HTML — 단 이미지가 이미 없으므로 빈 한지 + '사라진 링크'로 보임 | 같음 | 최대 1시간 옛 판 HTML → 옛 판 파일은 **2시간 유예 뒤** 지워 깨지지 않음 |
| `/m/{code}` '사라진 링크' | `public, max-age=60, s-maxage=60` | — | — | 끈 뒤 다시 켜면 최대 1분 안에 살아남 |
| 공개 파일(포스터·OG·루프·스냅숏) | `public, max-age=31536000, immutable`(판마다 새 경로) | **즉시 삭제** → Supabase Smart CDN 무효화(약 60초) **[확인 필요]** | **즉시 격리 이동** → 같은 무효화 | 새 경로라 캐시 문제 없음 |
| `/config/v1.json`(`webLive`) | `max-age=300` | — | — | — |
| 이미 본 사람의 브라우저 | — | 이미 받은 파일은 남는다(통제 밖, 새로 고치면 HTML이 바뀐 뒤 사라짐) | 같음 | — |
| **외부 미리보기 캐시**(카카오톡·X·iMessage) | 우리 통제 밖 | 이미 붙여진 미리보기 카드는 남을 수 있다. 카카오는 공유 디버거로 캐시 초기화 가능 **[확인 필요]** → 확정 숨김 때 운영 런북에 포함 | 같음 | 같음 |

- 결론: **Q12는 이 설계로 통과 가능**하다. 단 Q12 문구에 '외부 서비스가 이미 만든 미리보기 카드는 범위 밖'을 덧붙일 것을 제안한다(리뷰 질문 3).
- 더 빨리 지워야 할 때(법적 요청 등): `firebase hosting` 재배포로 CDN 전체 무효화(약 1분, 정적 파일 같이 다시 올라감).

### 3-10. 원격 꿈 모티프 배포 형식 [v2]

**어디에**: 기획 6-2는 'Storage 자산'이라 적었지만 v2는 **Firebase Hosting 정적 + Git**으로 둔다(기획과 다름). 까닭: 모티프는 주 1개·수 KB짜리 **데이터**라 PR 리뷰·되돌리기·CI 검증이 Git에서 가장 싸고, DB·Nest를 거치지 않으며, 플래그와 같은 배포 경로(`deploy-static.yml`) 하나로 끝난다.

**매니페스트** `https://mongmang.ink/content/v1.json`(`max-age=3600`)

```json
{ "v": 1, "seq": 31,
  "motifs": [
    { "id": "w2026-52-crane", "kind": "weekly", "from": "2026-12-28", "schema": 1, "minAppBuild": 14,
      "url": "/content/motifs/w2026-52-crane.3f9a1c7e.json", "sha256": "…", "bytes": 9123 },
    { "id": "moon-01", "kind": "moon", "month": 1, "schema": 1, "minAppBuild": 14,
      "url": "/content/motifs/moon-01.a1b2c3d4.json", "sha256": "…", "bytes": 11204 } ],
  "revoked": [] }
```

**모티프 파일**(`immutable` 캐시, 이름에 내용 해시)

```json
{ "schema": 1, "id": "w2026-52-crane",
  "paths": [ { "d": "M12 40 C …", "w": 1.4, "layer": "ink" } ],
  "shader": { "bleed": 0.35, "grain": 0.2, "tone": "night" },
  "text": { "ko": { "title": "…", "line": "…" }, "en": { "title": "…", "line": "…" } },
  "tags": ["water"] }
```

| 규칙 | 내용 |
|---|---|
| 실행 코드 0 | 경로 데이터·숫자 파라미터·언어별 원작 문구만. 셰이더는 **앱에 있는 셰이더의 파라미터**만 바꾼다(새 셰이더 소스 금지) **[확인 필요: App Store 2.5.2 해석, 기획 2-4]** |
| 검증 | `@mong/core`의 `parseMotif`(스키마·경로 길이·점 수·문구 길이 상한)가 **CI(`deploy-static.yml`)와 앱 양쪽**에서 돈다. 앱은 `schema`를 모르거나 `sha256`이 다르면 조용히 건너뛴다 |
| 받는 때 | 플래그와 같이(실행·1시간 TTL). `seq`가 바뀌었을 때만 새 파일을 받는다. 받은 파일은 **기기에 영구 저장** |
| 풀에 들어가는 때 | 기기 **현지 날짜**가 `from` 이후면 풀에 들어갈 뿐, 그날 반드시 나오지 않는다(기획 2-4). **한 번 들어간 모티프는 빠지지 않는다**(한정 획득 없음) |
| 보름 모티프 | `kind: moon`, `month` 1~12. 보름 창(core)일 때 그달 모티프를 쓴다. **첫 3개월분(12월·1월·2월)은 앱에 번들** — 원격은 3월부터. 다음 해 같은 달에 다시 온다 |
| 비상 철회 | `revoked`에 id를 넣으면 앱은 **새 카드에서만** 그 모티프를 뽑지 않는다. 이미 현상된 카드는 그대로(카드는 세이브에 렌더 결과·id로 남는다). 문구 오류 등은 철회 대신 새 해시 파일로 교체 |
| 앱 버전 | `minAppBuild` 미만 앱은 그 모티프를 무시(새 경로 문법 등) |
| 도감(1.0 직후) | 칸 수 = 번들 25 + 매니페스트의 `weekly` 수 + 보름 칸. 서버는 칸 수만 알려 줄 뿐 도감 데이터는 없다(기획 2-8) |

- 제작 흐름: 아트 → `content/motifs/*.json` PR → CI 검증·미리보기 PNG 생성(core 렌더 스냅숏) → 오너 승인 → 병합 → `firebase deploy`. 주 1개 기준 0.25일/주 [팀 추정].

### 3-11. OTA(`expo-updates`) — 채널과 플래그의 관계 [v2]

**왜 필요한가**: 앱 레인은 12-24까지 C 일정으로 꽉 차 있고(41 대 40.75), 서버 연동 앱 작업은 **소프트런칭 중 OTA로 들어가는 것이 정상 경로**다(기획 4-6). 네이티브 변경은 빌드 2 한 번(+ 위젯 화면 스토어 업데이트 1회)으로 묶는다.

| 항목 | 값 |
|---|---|
| 러너 버전 | `runtimeVersion: { policy: "fingerprint" }` — 네이티브가 바뀌면 자동으로 달라져 **맞지 않는 바이너리에 JS가 가지 않는다** **[확인 필요: Expo SDK 58에서 기본 권장값]** |
| 채널 | EAS 빌드 프로필 `preview` → 채널 `preview`(내부·비공개 테스트 12명) / `production` → 채널 `production`(소프트런칭·TestFlight 외부 테스트·정식) |
| 브랜치 흐름 | `eas update --branch preview` → 내부 확인 → **같은 번들을** `production`으로 다시 게시(재빌드 없음). 비율 배포(`--rollout-percentage`) 사용 **[확인 필요: 요금제 조건]** |
| 받는 방식 | `checkAutomatically: ON_LOAD`, `fallbackToCacheTimeout: 0` → **시작을 기다리지 않는다**(P1). 새 번들은 다음 콜드 스타트에 적용 |
| 되돌리기 | ① **행동**: 플래그 끄기(최대 1시간, 3-7) ② **코드**: 이전 업데이트 재게시(`eas update:rollback` 류) ③ 시작 직후 크래시는 `expo-updates`의 오류 복구가 내장 번들로 되돌림 **[확인 필요: 동작 조건]** |
| 서명 | 코드 서명(`codeSigningCertificate`)은 넣고 싶지만 요금제 조건 **[확인 필요]** — 안 되면 HTTPS + EAS 계정 2단계 인증으로 갈음 |

**코드는 OTA, 켜기는 플래그 — 순서 규칙**

1. 서버를 먼저 배포한다(스테이징 → 운영, 이 기능 API가 살아 있음).
2. 기능 코드를 **플래그 꺼짐**으로 OTA 게시. `BUNDLE_SEQ`를 1 올린다.
3. 운영자 기기·내부 테스트에서 개발 메뉴로 켜 본다.
4. `config/v1.json`에서 `minBundle[key] = 이 SEQ`, `rollout[key]` 0.2 → 0.5 → 1.0(하루씩).
5. 문제가 생기면 플래그 끄기 → 고친 OTA → `minBundle` 올리고 다시 켬.

- **세이브 형식을 바꾸는 OTA는 서버를 먼저**(v1 6-4 CI 버전 가드 그대로). OTA로 `SCHEMA_VERSION`을 올릴 수 있으므로 가드는 **EAS Update 게시 스크립트에도** 둔다(`/healthz`의 `saveSchema`보다 크면 게시 중단).
- 개인정보: EAS Update는 기기마다 **영속 무작위 id(`EAS-Client-ID` 헤더류)**를 보낸다 **[확인 필요]** → 수탁자 표(5-4)와 데이터 라벨 검토에 넣는다(리뷰 질문 7).

### 3-12. 관리 도구 — 최소판 [v2]

v1은 '관리 API 없음, Studio + SQL'이었다. 기획 v2.2는 신고 처리(7일 SLA)와 운영용 원형 보기(1.0 직후 밤물)를 요구한다. 자동 숨김이 파일을 **격리**하므로(3-8) Studio로는 격리 이미지를 볼 수 없다. 그래서 최소판을 만든다.

| 항목 | 결정 |
|---|---|
| 형태 | **별도 Cloud Run 서비스 `mong-admin`**, 같은 Docker 이미지 `ADMIN_MODE=1`, 서버 렌더 HTML(프레임워크 없음) |
| 접근 | `--no-allow-unauthenticated`. 오너는 `gcloud run services proxy mong-admin --region asia-northeast3` → `localhost:8080`. **로그인 코드 0줄**, IAM이 문지기 **[확인 필요: proxy 명령 사용 조건]**. 휴대폰에서는 못 쓴다(7일 SLA라 감수) |
| 화면 1: 신고 대기열 | `reports.status in (open, auto_hidden)` — 대상·사유·서로 다른 신고자 수·처음/마지막 시각·이 대상의 지난 신고 수 |
| 화면 2: 격리본 보기 | `quarantine` 파일을 서명 URL(5분)로 보여 줌 — 포스터·OG·루프 + **원형 보기** |
| 원형 보기 | `snap.json`의 파생 획을 **SVG 폴리라인**으로 그림(θ·d → 점, core 함수). CanvasKit 없이 0.5일. 1.0 직후 밤물 마주침·동기 신고도 같은 화면(3-13) |
| 동작 | 복원 / 확정 숨김 / 이름 가리기 / 신고 기각 — 모두 `admin_actions`에 남김 |
| 화면 3: 삭제 요청 처리 | 메일로 받은 인장 코드 + 되찾기 글귀 입력 → 해시 대조 → 3-8 삭제 절차 실행 → `deletion_log(kind=web_request)` |
| 하지 않는 것 | 세이브 본문 열람·검색, 사용자 목록, 지표 화면(그건 SQL 스니펫) |
| 비상용 | Supabase Studio + `docs/ops/sql/*.sql`(v1 그대로) |
| 공수 | 1.0판 1.0일(B5) [팀 추정] |

### 3-13. 1.0 직후 확장 자리 — 밤물·동기·발자국·도감 [v2]

1.0 서버에는 **만들지 않는다**. 대신 지금 정해 두어 1.0의 결정이 나중을 막지 않게 한다.

**1.0에서 이미 지키는 것**: ① 모든 사용자 데이터 테이블은 `creatures`에 CASCADE ② 공개 스냅숏 `snap:1`이 밤물·동기의 실루엣 원천(새 형식을 만들지 않는다) ③ `reports.target_kind`에 `encounter`·`cohort`·`footprint` 자리 ④ 관리 도구 원형 보기가 스냅숏만 받으면 됨 ⑤ API 경로 예약(3-2).

| 기능(기획) | 테이블(1.0 직후 마이그레이션) | API | 규칙·보관 |
|---|---|---|---|
| **도감**(①, 2-8) | 없음 | 없음 | 세이브 안. 맡겨 두기로 함께 보관 |
| **발자국**(②, 2-3) | `footprint_raw(creature_id, visitor_key, day, created_at)` UNIQUE`(creature_id, visitor_key, day)` / `footprint_daily(creature_id, day, bucket smallint)` | `POST /m/{code}/pat`(무인증, `visitor_key = HMAC(오늘의 소금, IP‖UA)`, IP당 10/시간) / `GET /api/v1/footprints?since=` → `[{day, bucket}]` | 원본 **48시간** 뒤 `bucket`(0/1/2~4/5+)만 남김. 숫자·목록·누구 없음. `daily_salts`를 신고와 함께 쓴다 |
| **밤물**(③, 2-10·2-11) | `creatures`에 `night_open bool default false`, `born_local_date date`, `pool_excluded bool` / `night_drops(id, creature_id, local_date, snap jsonb, ink, texture, paper, created_at)` — **48시간** / `encounters(id, guest_creature_id, host_creature_id, local_date, gift_ink?, delivered_at?)` / `blocks(creature_id, blocked_creature_id)` | `POST /api/v1/night/drop`(잠든 뒤, 어젯밤 스냅숏) / `GET /api/v1/night/encounter?localDate=` → 마주침 하나 또는 `204`(**300ms 목표**) / `POST /api/v1/night/encounters/{id}/report` / `POST /api/v1/blocks` / `PATCH /creature {nightOpen}` | 짝 고르기(요청 때, 한 SQL): 같은 `local_date` 풀에서 `night_open`·`!pool_excluded`·막기 제외·사흘 연속·같은 아이 연속 금지 → **다른 먹 우선**(없으면 카드 장면만, 먹 조각 없음) → 가중 `1 ÷ (1 + 최근 7일 받은 손님 수)` 무작위. 결과를 `encounters`에 저장해 멱등. 풀이 작으면 빈도를 낮춘다(가짜로 채우지 않음) |
| **형태·신고 필터**(밤물·동기 공통) | `pool_excluded` | — | `night/drop` 때 스냅숏에서 **돌출 비율·같은 자리 반복 획 비율**(core 함수)을 계산해 상위 0.5% [팀 추정]면 `true`. 신고 확정·숨김 이력이 있어도 `true` |
| **동기**(④, 2-12) | 새 테이블 없음(`night_drops` + `born_local_date`) | `GET /api/v1/cohort?bornDate=` → 실루엣 6(스냅숏 축약) | 같은 현지 날짜·밤물 열림·필터 통과 중 무작위 6, 이름 없음. 결과는 이레 두루마리에 그려지고 서버는 보관하지 않음 |
| 운영용 원형 보기 | — | 관리 도구 | 3-12 화면 2 그대로 |

- **세 번째 계정 생성 순간**: 밤물은 `night/drop`을 올려야 하므로 계정이 필요하다. '밤물 열기' 직전 14세 확인 → 익명 로그인(3-3 ③). 맡겨 두기·링크를 이미 켠 사람은 같은 계정.
- **개인정보 영향**: 밤 맡김 = 파생 획·먹·결·종이(공개 스냅숏과 같은 범위) + 현지 날짜, 48시간. 처리방침 '밤물' 절과 데이터 라벨 갱신이 1.0 직후 업데이트와 **같은 릴리스**에 필요하다.
- 공수(서버 몫, 기획 4-2의 8.5일 안): 발자국 1.0, 밤물·필터·짝 고르기 3.0, 동기 0.5 [팀 추정].

---

## 4. 앱 쪽 변경

### 4-1. 서버 없이도 완전히 동작하는 원칙을 지키는 법

v1 그대로(서버 호출은 게임 경로 밖 `apps/mobile/src/net/`, 비차단 5초, 아웃박스 `mong.net.outbox`, 실패는 숨기고 링크 실패만 이미지 공유로 내려감, `EXPO_PUBLIC_API_BASE`가 비면 no-op, 서버 시각 미사용). v2 추가:

| 규칙 | 방법 |
|---|---|
| OTA가 시작을 막지 않음 | `fallbackToCacheTimeout: 0`(3-11) |
| 모티프·플래그 실패 | 마지막 캐시 → 없으면 번들. 아침 카드 현상은 원격 모티프를 기다리지 않는다 |
| 링크 켜기 중 끊김 | `PUT page` → 업로드 → `commit` 중 어디서 끊겨도 다음 시도는 처음부터(판 번호가 올라가 이전 반쪽 판은 `storage_gc`가 치움) |

### 4-2. 네이티브 변경 — 빌드 2 한 번에 묶는다 [v2]

| 필요한 것 | 네이티브? | 언제 |
|---|---|---|
| `fetch`, `@supabase/supabase-js`(+ `react-native-url-polyfill`) | 아니오 | OTA 가능 |
| 딥링크 수신 | RN `Linking`(코어) | OTA 가능 |
| **유니버설·앱 링크**(`ios.associatedDomains: applinks:mongmang.ink`(+ `staging.mongmang.ink`는 preview 프로필만), `android.intentFilters` `autoVerify`) | 설정 변경 → 재빌드 | **빌드 2** |
| **`expo-updates`** | 새 네이티브 모듈 | **빌드 2** |
| **위젯**: `@bacons/apple-targets` 타깃·App Group·로컬 Expo 모듈(**`getInstalledCount()` 포함**, 3-6) / `react-native-android-widget` | 네이티브 | **빌드 2**(화면 완성은 스토어 업데이트 1회) |
| 영상 인코더 웹 저용량 설정(540×675, 무음) | 기존 D-18 모듈의 매개변수 | 빌드 2 모듈에 매개변수 자리가 있으면 OTA [확인 필요] |
| Apple/Google 로그인 | 새 모듈 2개 | 1.0.x |

- 빌드 2 직전 **EAS 리허설 빌드(12-05 전후)**에서 AASA·assetlinks를 실기기로 확인한다 → B0의 `.well-known`이 그 전에 운영 도메인에 떠 있어야 한다.

### 4-3. 웹 미리보기·테스트 전략 [v2]

v1 그대로(net 모듈 가짜 fetch, core 고정물 세이브를 core·서버 e2e가 같이 읽음, 서버 단위는 실제 로컬 DB, e2e는 로컬 Supabase, OpenAPI 계약, `pnpm web` → 로컬 Nest). v2 추가:

| 층 | 무엇으로 |
|---|---|
| 공개 스냅숏 | core 고정물 `fixtures/snap/*.json` — 금지 키가 섞인 본을 서버가 `422`로 거르는지 e2e |
| 웹 뷰어 | Playwright: 정적 HTML 첫 페인트(느린 3G 모의) / WebGL 없는 브라우저에서 `live.js`를 안 부름 / 이미지 404 때 '사라진 링크' / `webLive` 꺼짐 |
| 모티프 | `parseMotif` 고정물(정상·스키마 모름·해시 불일치·과대) |
| Q9 기기 이동 | 두 기기 번갈아 쓰기·미래 버전·409 나란히 고르기·되찾기 글귀 — iOS·Android 각 20회+(앱 레인 C13, 서버는 스테이징 제공) |
| Q5 느린 서버 | 7절 L6 |

---

## 5. 개인정보·스토어 영향

### 5-1. '수집 없음'이 무엇으로 바뀌나 [v2]

| 사용자 | 서버로 가는 것 | 처리방침 | Google Data safety | Apple App Privacy |
|---|---|---|---|---|
| 모두(빌드 2부터) | 집계 칸 +1(코호트 날짜·n일째·플랫폼·버전·언어·**이름 시점 군·위젯 유무·보름 창**), 식별자 없음. IP는 레이트 리밋 메모리에서만 | "이용 통계(개인 식별 불가)" 절에 **차원 3개를 적는다** | 앱 활동 > 앱 상호작용: 수집, 공유 안 함, 분석 [확인 필요: 집계만이면 대상인지 — 보수적으로 선언] | Usage Data > Product Interaction, **Not Linked** |
| 모두(빌드 2부터) | **OTA 확인 요청**(EAS, 영속 설치 id 가능성 [확인 필요]) | 처리위탁 표에 Expo | 기기 ID 해당 여부 [확인 필요] | 같음 |
| 링크 손님(웹) | 조회 비콘(쿠키·식별자 없음), 신고 시 48시간 해시 | "웹 페이지" 절 | 앱 밖 | 앱 밖 |
| 링크를 켠 사람 | 익명 계정 id, 14세 확인 기록(날짜), **공개 스냅숏**(파생 획·타고남 요약·먹·결·날짜·켤 때 날 세기·이름(켰을 때)), 포스터·OG·루프(공개) | "공유 링크" 절, 공개 범위·끄기·지우기 | 사용자 ID, 기타 사용자 생성 콘텐츠(앱 기능) | Identifiers > User ID, User Content > Other, Linked |
| 맡겨 두기를 켠 사람 | 위 + **세이브 전체**: 획 좌표·시간·필압, 잠 시각 설정, 정·손 기억, **이용 시간대 패턴(`relation.hour[24]`·`todayHour`)·부재 길이(`lastAbsenceMs`·`longestAbsenceMs`)·마지막 방문 시각(`lastSeenAt`)·설치 시각(`birth.at`, ms)·시간대(`clock.tzOffsetMin`)**·이름 | "클라우드 보관" 절에 위 항목을 **이름 붙여** 적는다(빌드 1 리뷰 #10), 보유 4주(이력)·파기 | 위 + 앱 활동 > **기타 앱 활동**(이용 시간대·부재 기간) [확인 필요: 분류], 게임 진행, **삭제 요청 가능** | 위 + Gameplay Content + Usage Data(Linked) [확인 필요] |
| 1.0 직후: 밤물을 연 사람 | 밤 맡김(파생 획·먹·결·종이·현지 날짜) 48시간, 마주침 기록 | "밤물" 절 | 사용자 생성 콘텐츠 | 같음 |
| 1.0.x: Apple/Google 연결 | + 이메일 | "계정 연결" 절 | 이메일 | Contact Info > Email |

- **세이브 속 생활 리듬 값을 어떻게 다루나**(빌드 1 리뷰 #10): 업로드 때 빼는 방안은 택하지 않는다 — 서버 검증이 `parseState`이고, 되찾은 기기에서 정(情)·손 기억이 그대로여야 '나를 알아본다'(기획 2-1)가 성립한다. 대신 ① 처리방침·라벨에 이름 붙여 적고 ② 서버는 본문에서 이 값을 **꺼내 열로 저장하거나 색인하지 않으며** ③ 관리 도구에 세이브 열람 화면이 없고 ④ 공개 스냅숏에는 키 화이트리스트로 들어갈 수 없고 ⑤ 이력은 4주로 줄였다. 열 단위 암호화(서버 키)는 DB 덤프 유출에만 효과가 있어 1.0에서는 하지 않는다 [팀 추정].
- store-listing 7-1의 "아니요"는 **빌드 2 제출(12-10) 전에** 바꾼다(빌드 2에 핑이 들어가므로). 처리방침도 그 전에 게시(B8).
- 처리방침 고칠 곳: v1 목록(1·2·3·5·6·7·8·9·10·11) + **이용 통계 차원 3개, 웹 페이지 비콘, 신고 해시 48시간, 생활 리듬 항목, Expo 위탁, 장기 미사용 2년, 서비스 종료 약속(90일 전 공지 + 내보내기, 기획 6-5)**.

### 5-2. 데이터 최소화 원칙(설계에 박음)

v1 그대로(이메일·이름·전화·광고 ID·기기 모델을 받지 않음, IP는 DB에 없고 인프라 로그 7일 **[확인 필요: Cloud Logging 요청 로그 IP·보존 7일 설정]**, 핑에 ID 없음). v2 추가: **활동 시각은 월 단위(`last_active_month`)**, 연령은 확인 기록만, 신고·발자국 해시는 48시간.

### 5-3. 아동·연령 [v2]

- **타깃 14세 이상**(D-23, D-06 개정). 한국 개인정보 보호법 제22조의2(만 14세 미만 법정대리인 동의) 대상이 되지 않게 한다 [법률 검토, 오너 12-05].
- 설계: ① 핑은 식별 불가 ② 계정이 생기는 모든 순간(링크·맡겨 두기·(1.0 직후) 밤물) 직전에 확인 1회 ③ '아니요'는 기기에만, 서버 저장 없음 ④ `bootstrap`이 확인 기록 없이 계정을 만들지 않음(3-3) ⑤ 법정대리인 동의 절차는 없다.
- 공개 웹에 실명이 올라가는 위험: 이름 공개 기본 끔 + 금칙어 + OG도 같은 설정 + 이름 입력 화면 안내 한 줄.

### 5-4. 처리위탁·국외 이전 [v2]

| 수탁자 | 위탁 업무 | 저장 위치 | 국외 이전? |
|---|---|---|---|
| Supabase, Inc.(미국) | DB·인증·파일 | 서울(AWS) | 저장은 국내, 원격 운영 접근 가능성 → 보수적으로 기재 [법률 검토] |
| Google LLC(미국) — Cloud Run·Firebase Hosting·Cloud Logging·Cloud Scheduler | API 실행, 웹 전송, 로그 | 서울(Cloud Run), CDN은 전 세계 엣지(공개 콘텐츠만) | CDN은 공개 콘텐츠뿐. 로그 버킷 서울 [확인 필요] |
| **650 Industries, Inc.(Expo, 미국)** — EAS Update | OTA 번들 배포(요청 헤더에 플랫폼·러너 버전·설치 id 가능성) | 미국 | **국외 이전에 해당 가능** [확인 필요·법률 검토] |

- 거부 방법: 링크·맡겨 두기를 쓰지 않으면 계정 데이터 이전 없음. OTA는 거부 수단이 없으므로 **수집 항목을 최소인지 확인**하는 것이 B8의 일.

### 5-5. 보관·파기 표 [v2]

| 항목 | 보관 | 방법 |
|---|---|---|
| 세이브 현재본 | 계정 존속 중 | — |
| 세이브 이력 | **최대 4주**(최근 3 + 주 1벌 4주), 충돌본·복원 전 본 30일 | `pg_cron` |
| 공개 사본·포스터·OG·루프·스냅숏 | 링크 켜져 있는 동안. 끄면 즉시 파일 삭제(HTML 캐시 최대 1시간) | 3-9 |
| 신고 격리본 | 30일(확정이면 즉시 삭제) | Scheduler |
| 되찾기 글귀 | 해시만 | — |
| 14세 확인 | 판 번호·날짜(계정과 함께 삭제) | — |
| 집계 지표 | 90일 원표 → 월 단위로 말아 보관(식별자 없음) | `pg_cron` |
| IP | DB 없음, 인프라 로그 7일 | 로그 버킷 설정 |
| 신고 | 1년(목적: 같은 대상 재발 판단), 신고자 해시 48시간 | `pg_cron` |
| 발자국 방문자 키·밤물 맡김(1.0 직후) | 48시간 | `pg_cron` |
| 백업 속 사본 | 7일 뒤 소멸 | Supabase |
| **장기 미사용 계정** | **마지막 활동 월로부터 2년** | 아래 |

**장기 미사용 2년(규칙은 1.0 처리방침, 실행은 1.0.x)**
- '활동' = 인증된 API 호출(세이브 올림·링크 켜기·`/me/touch`). `users.last_active_month`를 **그달 1일로만** 갱신(달마다 최대 한 번 UPDATE) → 언제 썼는지 일 단위로 남지 않는다. **이 열은 1.0부터 쌓아야** 1.0.x에 시계가 맞는다.
- 맡겨 두기는 껐지만 링크만 켠 사람도 앱을 열면 `/me/touch`로 활동이 된다. 앱을 2년 안 연 사람만 대상.
- 1.0.x 작업(매월 1일 Scheduler): 23개월 지난 계정에 `inactive_notice_at` 표시 → 그 사이 앱을 열면 공방 노트에 "오래 쉬어서 맡긴 것이 곧 정리돼요" 한 줄 + 활동으로 갱신 → 24개월이면 3-8 삭제 절차(`deletion_log(kind=inactive)`).
- 정직한 한계: 연락 수단(이메일)이 없어 **앱을 열지 않는 사람에게는 알릴 길이 없다**. 처리방침 사전 고지로 갈음한다 [법률 검토 — 리뷰 질문 10].

---

## 6. Docker·모노레포·CI

### 6-1. 모노레포 배치와 `@mong/core` 공유 [v2]

```
apps/
  mobile/            (지금)
  server/            NestJS — src/{auth,saves,pages,web,metrics,reports,admin,deletion,cron}, prisma/, Dockerfile
  web-live/          웹 뷰어 live.js(esbuild 번들, @mong/core + CanvasKit 페인터) → web-static/w/ 로 빌드
  web-static/        Firebase Hosting 공개 폴더(랜딩·.well-known·config/v1.json·content/·w/·delete·privacy)
packages/
  core/              세이브·공개 스냅숏·모티프 검증·달 위상의 정본 — 앱·서버·웹 뷰어가 같은 코드
  api-contract/      OpenAPI 타입
content/             (또는 apps/web-static/content/) 모티프 원본 JSON — PR로만 바뀜
```

- core에 더할 순수 함수(이 문서는 자리만 정하고, 구현은 core 담당 PR): `toPublicSnapshot`·`parsePublicSnapshot`(3-5), `parseMotif`(3-10), 달 위상·보름 창(기획 2-6), 형태 지표(3-13, 1.0 직후). **Node·RN·DOM API 금지 계약**(tsconfig `lib: ["ES2022"]`, `types: []`) 유지 — 웹 뷰어도 같은 코드를 먹는다.
- core 빌드(`tsup` → `dist/`, `exports` 조건 분기), 서버 ESM, `nest build -b swc`는 v1 그대로.

### 6-2. Dockerfile

v1 그대로(node:24-slim 다단, `pnpm fetch` 캐시, core 빌드 → `prisma generate` → `nest build` → `pnpm deploy --prod`, 비루트 사용자, Cloud Run은 startup/liveness probe `/healthz`). `mong-admin`은 같은 이미지에 `ADMIN_MODE=1`. 목표 200MB 미만. `pnpm deploy` + `nodeLinker: hoisted` 확인 **[확인 필요]** — 안 되면 esbuild 한 파일 번들.

### 6-3. 로컬 개발 — Supabase CLI + docker compose

v1 그대로(`pnpm dlx supabase start` + `docker compose -f apps/server/compose.yaml up`, 빠른 테스트는 `postgres:17` + 테스트 JWT 서명기, 시드는 core 고정물로 사용자 3명). v2 추가: 시드에 **링크 켠 몽망이 1(이름 공개)·격리된 몽망이 1**, 로컬 Storage 버킷 둘.

### 6-4. 레지스트리·CI/CD [v2]

레지스트리 Artifact Registry(서울), 인증 Workload Identity Federation(v1 그대로).

| 워크플로 | 트리거 | 단계 |
|---|---|---|
| `ci.yml` | 모든 PR | install → typecheck → test(core·mobile·server·web-live) → 서버 e2e(`supabase start`) → OpenAPI diff → **세이브 버전 가드** → `docker build` → **모티프·플래그 JSON 검증**(`parseMotif`·플래그 스키마) |
| `deploy-staging.yml` | `main` 푸시(server·core) | 이미지 `:sha` → `migrate deploy`(스테이징) → `mong-api-staging`·`mong-admin-staging` 배포 → 스모크(`/healthz`, `/m/TESTTEST`, `/config/v1.json`) |
| `deploy-prod.yml` | 태그 `server-v*` + 수동 승인 | 같은 이미지 → migrate → deploy(api·admin) → 스모크 → 실패 시 `update-traffic` 이전 리비전 100 |
| `deploy-static.yml` | `apps/web-static/**`·`apps/web-live/**`·`content/**` | web-live 빌드(해시 이름) → 검증 → `firebase deploy --only hosting:staging` → (태그 `static-v*` + 승인) `hosting:prod`. **플래그 바꾸기 = 이 PR 하나** |
| `ota-guard`(스크립트) | 사람이 `eas update` 전에 | 운영 `/healthz`의 `saveSchema`·`simSchema` ≥ 앱 core 값인지 확인, 아니면 중단(3-11) |

- 비밀: GitHub Environments에 `DIRECT_URL`, Secret Manager에 `DATABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`·`RECOVERY_PEPPER`·`REPORT_HMAC_KEY`(소금과 별도의 고정 키).
- 모니터링: 업타임 체크 2개(`/healthz`, `/m/{고정 코드}`) + 5xx 비율 알림 1개 + **비용 알림 3단** + Supabase 디스크·연결 수 알림(대시보드).

---

## 7. 부하 시험 계획 [v2]

- 도구: **k6**(Docker 이미지로 로컬에서 실행, 설치 없음), 대상 = **스테이징**(`staging.mongmang.ink`, 운영과 같은 설정이되 max-instances 3). 결과는 `docs/ops/loadtest/YYYY-MM-DD.md`.
- 시기: **B7 12-16~12-17**(소프트런칭 전) / 정식 출시 전 01-27~01-30에 L1·L3 재실행(min 1, 운영 설정).
- 가정: 기획 6-7 '링크 하나가 하루 10만 조회', number-one 낙관 첫 달 60만 설치 [팀 추정].

| # | 시나리오 | 부하 | 통과 기준 [팀 추정] | 보는 위험 |
|---|---|---|---|---|
| **L1** | **입소문 링크**: 한 코드에 HTML + 포스터 + 루프 + 비콘 + 일부 `/get` | 하루 10만 = 최빈 시간 20% → 분당 약 330, **순간 60 rps 10분** | HTML p95 < 300ms(CDN 적중), CDN 적중률 > 95%, Nest p95 < 150ms, 오류 < 0.1%, 인스턴스 ≤ 2, `link_daily` 합계 오차 < 1% | CDN 미적중 폭주, 비콘 합산 손실 |
| **L2** | **콜드 스타트 크롤러**: min 0에서 20분 유휴 후 새 코드 첫 요청 | 10회 | 첫 응답 < 3초(카카오 스크랩 제한 시간 **[확인 필요]**), 공유 직후 데우기가 있으면 크롤러는 캐시 적중 | 미리보기 실패(v1 반증 #8) |
| **L3** | **출시 아침 핑 폭주**: DAU 15만의 40%가 07~09시 | 평균 8 rps, **순간 100 rps 5분**(같은 칸 집중) | 오류 0, DB 잠금 대기 없음(메모리 합산 덕), flush 지연 < 15초, 합계 오차 0(정상 종료) | 같은 행 UPSERT 잠금 |
| **L4** | **세이브 올림**: 맡겨 두기 4만 명 × 하루 5회 + 64KB 본 | 평균 2.3 rps, **순간 20 rps 10분**, 그중 5% 409 | `PUT` p95 < 400ms, `parseState` CPU < 30ms/건, 연결 ≤ 15 | 검증 CPU·풀 고갈 |
| **L5** | **남용**: 한 IP에서 없는 코드 100 rps, 신고 50회, 익명 가입 200회 | 3분 | 404는 분당 30 뒤 429, 신고는 5회/시간 뒤 무시, **같은 IP 신고로 숨김 0건**, 익명 가입 한도 동작 | 열거·악성 숨김 |
| **L6** | **느린 서버**(Q5): toxiproxy로 지연 300ms·1s·4.9s·5.1s, 응답 직전 끊기, 업로드 50%에서 끊기 | 앱 자동 시나리오(C13) | 아침 지연 0, `PUT` 반쯤 성공 → 재시도가 빨리 감기로 수렴(3-4), 링크 켜기 반쪽 판이 `live`가 되지 않음, 아웃박스 크기 상한 유지 | P1 위반 |

- 판정이 실패하면: L1 → `s-maxage`·이미지 크기 조정, L3·L4 → max-instances 5 + 풀 재계산, L5 → 해당 한도 강화. 결과는 Q5·Q10·Q12 근거 자료로 RC1(12-19)에 붙인다.
- 비용: k6 로컬 실행 + 스테이징 Cloud Run 수십 분 → 1달러 미만. Firebase 전송량은 L1 10분에 약 3GB [팀 추정] → 0.5달러 미만.

---

## 8. 비용 재추정 [v2]

단가는 v1 출처 기준이며 전부 **[팀 추정]**, 단가 자체가 **[확인 필요]**인 항목은 따로 적었다.

| 항목 | 소프트런칭(12-22~01-26, 설치 수백~수천) | 출시 후 10만 설치·DAU 3만 | 낙관 60만 설치·DAU 15만 |
|---|---|---|---|
| Supabase | Pro 25(12-18부터) + 스테이징 Free | Pro 25(MAU 10만·DB 8GB·Storage 100GB·egress 250GB 포함). 계정 사용자 3~4만 | MAU 약 15만 → 초과 5만 × 0.00325 ≈ 165, 컴퓨트 Small 상향 +15 → **약 205** |
| DB 크기 | 수십 MB | 맡겨 두기 4만 × 평균 5벌 × 40KB ≈ 8GB → 0~1 | 15만 × 5 × 40KB ≈ 30GB → 약 3 |
| Storage 저장 | 수십 MB | 링크 3만 × 약 1MB(포스터 0.25 + OG 0.15 + 루프 0.6) ≈ 30GB, 포함 | 15만 × 1MB ≈ 150GB → 약 1 |
| Storage 전송 | 0 | 조회 월 10만 × 0.85MB ≈ 85GB, 포함 | 조회 월 100만 × 0.85MB ≈ 850GB → 초과 600GB × 0.09 ≈ **54** |
| Firebase Hosting | Blaze 0~1 | HTML 3GB + **CanvasKit wasm**(조회의 절반 × 3MB ≈ 150GB) → 약 **23** | wasm 1.5TB → 약 **225** → 대응: wasm·루프를 **Cloudflare R2(전송 무료)** `assets.mongmang.ink`로 옮기면 약 5 |
| Cloud Run | 무료 한도 안(min 0) | 핑·이벤트 약 150만 + 세이브 150만 + 비콘·302 약 15만 ≈ 월 300만 요청 → 소액 + **min 1 유휴 약 10~20** [확인 필요: 서울 Tier 2] | max 6~10 상향, 약 **60~100** |
| Cloud Scheduler·Logging·Artifact Registry | 0 | 0~2 | 약 5 |
| **EAS Update** | 무료 한도(MAU 1천 [확인 필요]) 안 | **[확인 필요: expo.dev/pricing]** — 요금제에 따라 월 0~200 | 같음 이상 → 대응: OTA를 큰 업데이트 때만 쓰거나 **자체 업데이트 서버**(expo-updates 프로토콜, Nest + Firebase 정적, 약 2일) |
| 도메인 `mongmang.ink` | 연 약 25~40(월 약 3) [확인 필요: 갱신가] | 같음 | 같음 |
| **합계(월)** | **약 25~30달러 + 도메인** | **약 75~110달러 + EAS Update** | **약 300~550달러**(R2 이전 시 아래쪽) **+ EAS Update** |

- v1(10만 명 월 35~70달러)보다 커진 까닭: ① 웹 뷰어의 CanvasKit wasm 전송(가장 큼) ② 8초 루프 파일 ③ min 1 유휴 ④ EAS Update. 줄이는 순서: wasm·루프 R2 이전(0.5일) → `webLive` 비율 배포(0.5 등) → 루프 해상도 낮춤.
- 비용 상한 장치: Supabase Spend cap, GCP 예산 알림 30·60·120달러, Cloud Run max-instances, 공개 파일 상한(3-5).
- 서버 종료 약속(기획 6-5): 서버를 닫는 경우 비용은 '90일 공지 + 내보내기' 기간만큼.

---

## 9. 일정·구현 순서·레인 [v2]

### 9-1. 구현 순서 B0~B8 (빌드 2 12-10·소프트런칭 12-22 기준)

> 원칙: 바이너리에 박히는 것과 측정 장치가 먼저, 사용자 데이터를 받는 기능은 안전 바닥과 함께. 일수는 서버 레인 [팀 추정].

| 순서 | B | 내용 | 날짜 | 서버 | 웹 | 끝났다는 기준 |
|---|---|---|---|---|---|---|
| 1 | **B1 골격** | `apps/server` Nest + Prisma 7 + 로컬 Supabase + Docker·compose + `/healthz`·`/readyz` + CI(`ci.yml`) + core `tsup`·`exports`(core 담당과 조율) | 11-21~11-23 | 2.0 | — | `docker compose up`으로 로컬 e2e 1개 통과 |
| 2 | **B6 배포** | GCP 프로젝트·Artifact Registry·WIF·Secret Manager·Cloud Run 스테이징/운영·Firebase Hosting 두 사이트·**서울 rewrite 확인**·Cloudflare DNS(프록시 끔)·업타임·예산 알림 | 11-24~11-25 | 1.5 | — | `https://staging.mongmang.ink/api/healthz` 200, rewrite 실패 시 대안 결정 |
| 3 | **B0 측정 시계** | `/ping`(차원 3·메모리 합산) + `config/v1.json` + `content/v1.json`(빈 목록) + `/m/*` 임시 정적('곧 열려요' 랜딩) + AASA(Team ID) + assetlinks(업로드 키, 앱 서명 키는 11-30 추가) + `/privacy`·`/delete` 자리 | 11-26~11-27 | 1.0 | 0.5 | 운영 도메인에서 `.well-known` 둘·플래그·핑 동작 |
| 4 | **B3 링크·웹 정적** | `bootstrap`(연령 확인)·`touch`·`creature/page` PUT·commit·DELETE·서명 업로드·스냅숏 검증·금칙어·`/m/{code}` 템플릿·`/get`·비콘·`storage_gc` | 11-28~12-03 | 2.5 | 1.0 | e2e: 켜기 → HTML 메타 → 끄기 → 파일 0 |
| 5 | **B4 모티프·플래그** | 플래그 키 9 + `minBundle`, 모티프 매니페스트·`parseMotif` CI, 첫 원격 모티프 1개로 끝까지 | 12-04~12-05 | 0.5 | 1.0 | CI가 나쁜 모티프를 막고, 앱 개발 빌드가 받아 풀에 넣음 |
| — | (앱) EAS 리허설 | 네이티브 묶음 + 실기기 링크 확인 | 12-05 전후 | — | — | 유니버설·앱 링크가 스테이징·운영에서 앱을 엶 |
| 6 | **B2 맡겨 두기** | saves PUT/GET/meta·409·반쯤 성공·이력 4주·되찾기 글귀·recover·`DELETE /me`·삭제 재시도·Scheduler | 12-06~12-11 | 3.5 | — | Q9 시나리오가 스테이징에서 자동으로 돎 |
| 7 | **B8 처리방침·라벨** | ko·en 재작성(5-1·5-5), Data safety·App Privacy·store-listing 7절, 네트워크 기록 대조(Q13) — **문서 레인** | 12-01~12-08 | — | — | **빌드 2 제출(12-10) 전 게시** |
| 8 | **B5 안전** | 신고·`report_hits`·소금·격리 이동·자동 숨김·레이트 리밋 전체·**관리 도구 최소판**·운영 런북(`docs/ops/`) | 12-12~12-15 | 2.5 | 0.5 | L5 전 단계 수동 통과, 격리 → 복원 → 확정 한 바퀴 |
| 9 | **B7 부하·느린 서버** | 7절 L1~L5(+ L6은 앱 C13과), 복원 리허설 1회 | 12-16~12-17 | 1.0 | — | 7절 기준 통과 또는 조치 기록 |
| 10 | 운영 전환 | Supabase Pro, 운영 마이그레이션, 비밀 교체, 런북 점검 | 12-18 | 0.5 | — | 운영 스모크 통과 |
| — | **웹 뷰어 live**(웹 레인) | `apps/web-live`: CanvasKit 지연 로드·core 몸 생성·숨·깜빡임·톡 반응, `webLive` 꺼짐으로 배포 | 12-08~12-19 | — | 3.0 | Playwright 4종 통과, Q11 자체 비교 |
| | | | **합계** | **15.0 + 운영 0.5 = 15.5** | **6.0** | |

- 기획 4-1의 서버 14.0·웹 5.0보다 **서버 +1.5·웹 +1.0**. 더해진 것: 관리 도구 최소판(+1.0, 기획은 '관리 API 없음'), 격리·신고 중복 판정(+0.5), 비콘·메모리 합산(+0.25), 모티프 CI 검증(+0.5), 연령 확인 기록·`touch`(+0.25) / 줄어든 것: 서버 기획 수치에 있던 일부 중복(−1.0). 웹 +1.0은 정적 페이지와 live 사이의 폴백·Playwright. [팀 추정] → 리뷰 질문 9.
- 오너 계정이 11-23에 없으면 B6이 밀리고 B0이 빌드 2 리허설(12-05)과 겹친다. **이 날짜가 이 계획에서 가장 약한 고리다.**

### 9-2. 레인별 일정

| 레인 | 11-21 ~ 11-30 | 12-01 ~ 12-10 | 12-11 ~ 12-21 | 12-22 ~ 01-15(소프트런칭) | 01-16 ~ 출시 |
|---|---|---|---|---|---|
| **서버** | B1 → B6 → B0 → B3 시작 | B3 끝 → B4 → B2 시작 | B2 끝 → B5 → B7 → 운영 전환(12-18) | 운영·신고 대응·지표 SQL·플래그 올리기, 1.0 직후 소셜 설계 | 출시 주 min 1, L1·L3 재실행 |
| **웹** | `/m` 정적 틀 | 정적 페이지 완성, live 시작 | live 완성(`webLive` 꺼짐) | `webLive` 0.2 → 1.0 | Q11 외부 5명 비교 |
| **문서** | 처리방침 초안 | **B8 게시(12-08)** | Q13 대조 | 갱신 | 법률 검토 반영 |
| **앱(서버 연동 몫)** | — | **빌드 2(12-10)**: 핑+아웃박스, 플래그 로더, `expo-updates`, 링크 설정, 위젯 모듈 자리(`getInstalledCount`) | 맡겨 두기 OTA 준비 | **OTA #1 맡겨 두기(12-24 전후)** → **OTA #2 링크·딥링크 시트·OG·루프 업로드(12-29 전후)** → 원격 모티프(01-08 전후) → **위젯 화면 스토어 업데이트(01-08 전후)** | 판정 01-21~01-26 |
| **오너** | **계정·결제(11-23)**, Team ID(11-26), Play 앱 서명 SHA-256(11-30) | 법률 검토 14세·국외 이전(12-05), 처리방침 빈칸(운영자 정보) | Pro 결제(12-18), Expo 요금제 결정 | 신고·삭제 메일 주 1회 이상 | 출시 승인 |

**소프트런칭 중 켜는 순서(서버 쪽 전제)**

| 날짜(목표) | 켜는 것 | 손잡이 | 서버 전제 |
|---|---|---|---|
| 12-22 | 핑·플래그(빌드 2에 이미 있음) | — | B0 |
| 12-24 전후 | **맡겨 두기** | OTA #1 + `cloud` 0.2 → 1.0 | B2·B5·B7, Pro |
| 12-24 전후 | 보름밤(첫 보름 **12-24** [확인 필요]) | `moonNight`(번들 모티프) | 없음 |
| 12-29 전후 | **링크·웹 정적** | OTA #2 + `link` | B3·B5 |
| 01-05 전후 | 살아 있는 웹 | `webLive`(웹만, OTA 불필요) | live 배포 |
| 01-08 전후 | 원격 모티프 / 위젯 화면 | `remoteMotifs` / 스토어 업데이트 + `widget` | B4 |
| 01-15 | 전부 켜진 상태로 판정 기간 진입 | — | — |

- 늦어질 때 미루는 순서(기획 4-1과 같음): `webLive` → 원격 모티프(번들로) → 되찾기 UI 다듬기. **맡겨 두기·링크 정적·안전·삭제는 미루지 않는다.**

### 9-3. 오너가 해야 할 일 [v2]

| 언제까지 | 일 | 비고 |
|---|---|---|
| ~~11-27 도메인~~ | **완료(11-20 `mongmang.ink`)** | D-21 |
| **11-23** | GCP 계정·**결제 계정**·프로젝트 `mongmange`(Cloud Run·Artifact Registry·Secret Manager·Scheduler·Firebase 같은 프로젝트, Blaze), 예산 알림 | v1의 11-27에서 당김(B6 11-24 시작) |
| **11-23** | Supabase 조직·프로젝트 2개(서울) | 운영은 12-18 Pro |
| 11-23 | GitHub Actions·Environments(승인자 = 오너) | 레포가 GitHub에 있어야 함 |
| 11-23 | Cloudflare DNS 접근(또는 Firebase 인증용 TXT·A 레코드 직접 입력) | 프록시 끔 |
| 11-26 | Apple Team ID, App ID Associated Domains | AASA |
| 11-30 | Play Console **앱 서명 키 SHA-256**(빌드 1 업로드 뒤 보임) | assetlinks |
| 12-01 | **Expo 요금제 확인**(EAS Update MAU·비율 배포·코드 서명 조건) | 3-11·8 |
| 12-05 | 법률 검토: 14세 이상·국외 이전(Supabase·Google·Expo)·장기 미사용 고지 방식 | 5-3·5-4·5-5 |
| 12-08 | 처리방침 운영자 실명·연락처 빈칸 | B8 |
| 12-18 | Supabase Pro 결제 | 2-4 |
| 운영 | 신고·삭제 메일 확인 주 2회(SLA 7일) | 3-12 |

---

## 10. 반증 — 서버 도입이 실패하는 시나리오와 대응 [v2]

v1의 14개는 유지한다(일정 잠식·세이브 손실·미래 세이브 거부·비용 폭주·부적절한 이름·스토어 라벨·Supabase 장애·콜드 스타트·지표 무용·도메인 고착(이름 중립 `mongmang.ink`로 해소)·1인 운영·법적 위험·링크 무반응·Cloud Run 과중). 대응 중 바뀐 것: #1은 '최소의 최소' 대신 **B 순서와 OTA 경로**, #5는 **격리 + 운영자 확인**, #8은 **공유 직후 데우기 + L2**. v2에서 더한 것:

| # | 시나리오 | 신호 | 대응 |
|---|---|---|---|
| 15 | **OTA가 기능을 깨뜨림** — 켜진 플래그 아래 버그 번들 | 크래시·핑의 `dayN` 급감 | 플래그 끄기(1시간) → 고친 OTA → `minBundle` 올림. 시작 크래시는 `expo-updates` 복구 |
| 16 | **악성 신고로 남의 링크 숨기기** | 한 링크에 짧은 시간 신고 몰림 | 신고자 해시 중복 제거, 격리(삭제 아님), 7일 안 복원, 반복 대상 기록 |
| 17 | **외부 미리보기 캐시에 숨긴 카드가 남음** | 확정 숨김 뒤에도 단톡방 카드 | Q12 범위 밖 명시 + 카카오 캐시 초기화 런북 |
| 18 | **웹 뷰어 비용이 링크 하나로 폭주** | Firebase 전송량 알림 | `webLive` 비율 낮춤(즉시) → wasm·루프 R2 이전 |
| 19 | **EAS Update 비용·정책 변화** | 요금 고지 | OTA 빈도 낮춤, 자체 업데이트 서버(약 2일) |
| 20 | **지표 칸이 너무 잘아 판정 불가** | 군별 n이 기획 10-1 최소 표본 미달 | 기획 10-1의 '미판정 → 기본값' 규칙 그대로. 차원을 더 늘리지 않는다 |
| 21 | **`wg` 감지가 빌드 2에 빠짐** | 핑의 `wg`가 전부 `?` | 위젯 스토어 업데이트(01-08)에 넣음, 그 전 위젯 리텐션은 참고값 없음 |
| 22 | **밤물(1.0 직후)이 개인정보 범위를 슬쩍 넓힘** | 처리방침 없이 `night/drop` 배포 | 밤물 OTA와 처리방침·라벨 갱신을 같은 릴리스로 묶는 체크(3-13) |

---

## 11. 리뷰 질문 [v2]

독립 리뷰에 특히 봐 달라고 부탁하는 곳. 앞쪽일수록 출시 관문·법무에 가깝다.

1. **신고자 48시간 해시**(3-8): 기획 6-5 '신고자 정보는 저장하지 않음'과 다르다. 해시 없이 '3건 자동 숨김'을 지키는 다른 방법이 있는가, 아니면 기획 문구를 고쳐야 하는가.
2. **자동 숨김 = 삭제가 아니라 격리 이동**(3-8·3-9): Q12의 '이미지 파일 삭제로 즉시'를 공개 경로에서 즉시 사라진다는 뜻으로 읽어도 되는가. 격리 30일 보관이 처리방침상 문제없는가.
3. **Q12가 기대는 것**: Supabase Smart CDN의 삭제 무효화(약 60초) [확인 필요]와, 통제 밖의 외부 미리보기 캐시. Q12 문구에 '외부 서비스의 미리보기 카드는 범위 밖'을 덧붙이는 것이 맞는가.
4. **밤물이 세 번째 계정 생성 순간**(3-3·3-13): 기획 P9·6-5는 두 순간만 적었다. 1.0 직후 밤물 열기 때 14세 확인 + 익명 계정을 만드는 것이 원칙과 맞는가.
5. **지표 차원 3개**(3-6): 작은 칸(`count < 5`) 합쳐 보기로 식별 가능성 처리가 충분한가. 이벤트를 '기기 평생 한 번'으로 묶어 '개수 비율 = 사람 비율'로 보는 가정이 이름 A/B 주지표(기획 10-1)에 맞는가. `wg` 감지 함수를 빌드 2 네이티브 묶음에 넣는 것이 앱 레인에 전달됐는가.
6. **조회 비콘**(3-6, v1 결함 정정): 쿠키·식별자 없는 비콘도 처리방침 '웹 페이지' 절에 적어야 하는가. 크롤러 제외가 충분한가.
7. **EAS Update의 영속 설치 id·국외 이전**(3-11·5-4) [확인 필요]: 사실이면 'Usage Data Not Linked'·'설치만 한 사람은 서버가 모른다'(P9) 주장에 영향이 있는가. 자체 업데이트 서버를 1.0에 두어야 하는가.
8. **관리 도구 = 비공개 Cloud Run + `gcloud` 프록시**(3-12): 1인 운영·7일 SLA에 맞는가. 휴대폰으로 못 쓰는 것이 SLA에 위험한가.
9. **공수**(9-1): 서버 15.5·웹 6.0으로 기획 4-1(서버 14.0·웹 5.0)보다 2.5일 크다. 어느 레인이 흡수하는가, 아니면 관리 도구를 Studio로 되돌리는가.
10. **장기 미사용 고지**(5-5): 연락 수단이 없어 '30일 전 앱 안 표시'가 실제로는 앱을 여는 사람에게만 보인다. 처리방침 사전 고지로 갈음해도 되는가 [법률 검토].
11. **기획과 다르게 정한 곳**: 원격 모티프를 Storage가 아닌 Firebase 정적(3-10), 웹 언어를 `Accept-Language` 대신 주인 언어 + 클라이언트 선택(3-5), 링크 기본 꺼짐으로 v1 고침(3-1), 플래그 TTL 1시간(3-7). 각각 기획 의도를 해치지 않는가.
12. **비용**(8): CanvasKit wasm 전송이 가장 큰 변동비다. 출시 전에 R2로 미리 옮길지, 알림을 보고 옮길지.
13. **이력 4주와 Q9**: 충돌본 30일·주 1벌 4주만으로 '분실 문의 0'을 지킬 수 있는가(되찾기가 4주 넘게 늦은 사용자는 현재본만 있다).

**v1 리뷰 질문의 처리**

| v1 # | 질문 | v2 상태 |
|---|---|---|
| 1 | 인장 코드를 `sealSeed` 파생이 아닌 서버 난수로 | 유지(3-5). 정본(C-integrated 2-2·`pillars.ts` 주석) 수정은 여전히 정본 담당 몫 — **열림** |
| 2 | 계정 '필요할 때만'·맡겨 두기 기본 끔 | 기획 v2.2가 채택(P9, 이레 아침에 한 번 권함 — 기획 11-3) — **닫힘** |
| 3 | 서버 레인 담당 | 기획 4-6이 서버·웹 레인 병렬로 정함, 일정은 9-2 — **닫힘**(공수 차이는 질문 9) |
| 4 | 핑을 Data safety에 선언 | 보수적으로 선언(기획 6-5) — **닫힘**, 차원 3개를 적는 것만 추가 |
| 5 | Firebase rewrite 서울 지원 | B6 첫날 확인, 대안 Cloudflare Worker — **열림** |

---

## 출처

- Supabase 리전(서울 ap-northeast-2): https://supabase.com/docs/guides/platform/regions
- Supabase 요금(Free 일시정지·Pro 25달러·포함 한도·초과 단가): https://supabase.com/pricing
- Supabase 익명 로그인(`linkIdentity`, IP당 30/시간, 자동 정리 없음): https://supabase.com/docs/guides/auth/auth-anonymous
- Supabase Storage CDN(Smart CDN 무효화) [확인 필요]: https://supabase.com/docs/guides/storage/cdn/smart-cdn
- Supabase × Prisma: https://supabase.com/docs/guides/database/prisma
- Prisma 7: https://www.prisma.io/changelog/2025-11-19 , https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7
- Supabase Apple 로그인: https://supabase.com/docs/guides/auth/social-login/auth-apple
- Supabase Edge Functions HTML 제한: https://supabase.com/docs/guides/functions/http-methods , https://supabase.com/changelog/29633-xhtml-responses-are-only-allowed-with-a-custom-domain-enabled , https://supabase.com/docs/guides/platform/custom-domains
- Supabase 로컬 개발: https://supabase.com/docs/guides/local-development/cli/getting-started
- Cloud Run 요금: https://cloud.google.com/run/pricing
- Cloud Run 커스텀 도메인: https://docs.cloud.google.com/run/docs/mapping-custom-domains
- Firebase Hosting 요금(전송 GB당 단가) [확인 필요]: https://firebase.google.com/pricing
- Expo `expo-updates`·EAS Update(러너 버전·채널·롤아웃·요금) [확인 필요]: https://docs.expo.dev/eas-update/introduction/ , https://expo.dev/pricing
- Fly.io·Render·Railway·Koyeb 리전: https://docs.fly.io/reference/regions , https://render.com/docs/regions , https://docs.railway.com/reference/deployment-regions , https://www.koyeb.com/docs/reference/regions
- Google Play Data safety: https://support.google.com/googleplay/android-developer/answer/10787469
- Google Play 계정 삭제 요구: https://support.google.com/googleplay/android-developer/answer/13327111
- 내부: 기획 v2.2 `docs/design/plan-v2/plan-v2.md`, 리뷰 `docs/team/reviews/2026-11-20-plan-v2-review.md`, 빌드 1 코드 리뷰 `docs/team/reviews/2026-11-20-build1-code-review.md` 5절, DECISIONS D-21·D-22·D-23

변경 이력: 2026-11-20 v1 초안(인프라 층) → **2026-11-20 v2**(기획 v2.2 2차 반영, 상세는 맨 위 '변경 이력' 표). 다음: 독립 리뷰 → D-21 확정.
