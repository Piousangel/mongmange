# 서버 아키텍처 v2.2 — 몽망이 키우기

- 상태: **v2.2(2026-11-20, 로드맵 A4) — 기획 v2.2 6-2 '더할 것' 열을 항목마다 대조하고(부록 A-2), 이미 커밋된 구현(B1 a817d30·B0 2240ff2·C4 679c4d1)이 문서보다 앞서거나 다른 곳을 구현 쪽으로 맞췄으며(부록 A-3), B2~B7이 이 문서만 보고 착수하도록 빠진 설계(이력 데이터 모델·공개 스냅숏 형식·`nameVisibility`·8초 루프 슬롯·플래그 대응·모티프 팩)를 채웠다. A4 독립 리뷰(`docs/team/reviews/2026-11-20-a4-review.md`, 치명 0·중요 11·사소 12) 반영 완료.** v2.1은 서버 v2 독립 리뷰(`docs/team/reviews/2026-11-20-server-v2-review.md`)를 반영해 D-21로 확정된 판이다. 이 문서는 코드를 고치지 않는다. 파일 이름은 v1 그대로 둔다(다른 문서가 이 경로를 정본으로 가리킨다).
- 범위: **인프라 층 + 1.0 서버 기능 전부**(스택·Docker·호스팅·인증·세이브 동기화·공유 링크·웹 뷰어·지표·플래그·원격 모티프·OTA·안전·관리 도구·개인정보·부하 시험·비용·일정). 1.0 직후 소셜(밤물·동기·발자국)은 **테이블·API의 자리와 규칙**까지만 정한다(3-13).
- 전제(오너 11-20 지정): **NestJS + Prisma + Supabase(Postgres·Auth·Storage) + Docker**, 도메인 **`mongmang.ink`**(11-20 구매, Cloudflare Registrar, D-21). 후보 스택 비교는 하지 않고 이 조합 안에서 호스팅·역할 분담·운영 방식을 고른다.
- 역할 분담: 기획 v2.2(`docs/design/plan-v2/plan-v2.md`)가 **무엇이 필요한가**를, 이 문서가 **어떻게**를 정한다. 둘이 다르면 이 문서를 따르고, 다르게 정한 곳은 해당 절에 '기획과 다름'으로 적었다.
- 근거(v2.2 추가): DECISIONS 'D-21 확정' 절의 빌드 방식 개정 줄(core 원본 번들), 'B0 측정 시계 구현 결정' 절, D-25(원격 모티프 스키마 1)와 C4 개정 줄(밤의 날짜), `docs/design/server-v1/B0-B1-report.md` 2·6·7·8절, `docs/ops/metrics/README.md`, 코드 `apps/server`·`packages/contract`·`apps/web-static`·`packages/core/src/moon`, 시스템 v1.4 4.3·4.4(획 상한 24·획당 64점).
- 근거: D-06·D-13·D-15·D-17·D-18·D-19·D-20·D-21·D-22·D-23, 기획 v2.2(2-1~2-12, 4-1·4-5·4-6, 6-0~6-7, 10-1·10-2), 리뷰 `docs/team/reviews/2026-11-20-plan-v2-review.md`(C2·I1·I2·I4·I5·I7), 빌드 1 코드 리뷰 `docs/team/reviews/2026-11-20-build1-code-review.md` 5절(#10 개인정보), `docs/design/pillars-v1/C-integrated.md` v1.1, `docs/release/privacy-policy.ko.md`, `store-listing.md` 7절, `packages/core/src/save/*`·`sim/pillars.ts`·`sim/save.ts`, `apps/mobile/src/game/storage.ts`·`features.ts`.
- 표기: 출처가 있는 사실은 링크(끝 '출처'), 팀 판단은 **[팀 추정]**, 공식 문서로 끝까지 못 본 것은 **[확인 필요]**, 법률 판단이 필요한 것은 **[법률 검토]**. v2에서 새로 쓰거나 바꾼 곳은 제목에 **[v2]**, v2.2에서 바꾼 곳은 **[v2.2]**. 구현이 이미 있는 값은 **(구현: 파일)**로 코드 위치를 적는다 — 둘이 다르면 코드가 맞고 이 문서를 고친다(코드가 결정을 어긴 경우는 DECISIONS로).

- **판 사이 정리 기록**(변경 이력·v1 → v2 표·v2.1 반영표·6-2 대조·문서 ↔ 구현 차이)은 **부록 A**로 옮겼다(A4 리뷰 '과함'). 구현자는 0절(요약·0-3 대응표)부터 읽는다.

---

## 0. 한 장 요약 [v2.2]

| 항목 | 결정(제안) |
|---|---|
| 원칙 | **앱이 정본, 서버는 사본·창구.** 서버가 죽어도 게임은 한 프레임도 멈추지 않는다(D-21, 기획 P1). 모든 서버 호출은 비차단·재시도·포기 가능 |
| DB·인증·파일 | Supabase **서울(ap-northeast-2)** — 운영 `mong-prod`(**12-18까지 Pro**) + 스테이징 `mong-staging`(Free) |
| API 서버 | NestJS(Fastify) → Docker → **Cloud Run 서울(asia-northeast3)** `mong-api`. 관리 도구 `mong-admin`(비공개, 같은 이미지)은 **정식 출시 전(01월)** |
| 경로 [v2.1] | **앱 API는 Cloud Run 서울에 직접**(`*.run.app`. 주소는 `EXPO_PUBLIC_API_BASE`라 OTA로 바꿀 수 있다). **`mongmang.ink` = Firebase Hosting**: 정적(랜딩·`.well-known`·플래그·모티프·웹 뷰어 JS·CanvasKit) + **`/m/**`만** Cloud Run rewrite. 세이브·글귀·JWT는 국외 CDN 엣지를 지나지 않는다 |
| 인증 | 계정은 **필요한 순간에만**(첫 링크 켜기·맡겨 두기 켜기. 1.0 직후 밤물은 D-23 개정 필요, 13절). 직전에 **중립형 연령 확인**(태어난 해·달, 기기에서 판정, 서버엔 통과 표시만). 세션은 **백업 제외 MMKV**. 되찾기 글귀(되찾으면 새로 발급) → Apple/Google 연결은 1.0.x |
| 세이브 | 통째 + 리비전(If-Match), 병합 없음, 충돌은 나란히 고르기. 이력 **최대 4주**(최근 3벌은 PUT 안에서 솎음) |
| 링크·웹 | `mongmang.ink/m/{코드8}`(서버 난수 40비트). 정적 HTML + 앱이 올린 포스터·OG·8초 루프 → WebGL이면 CanvasKit. 공개 스냅숏은 서버가 검증한 뒤 직접 쓰고(3-5-1), 기기는 이미지·영상만 **비공개 staging 버킷**에 올린다(커밋 때 공개로, 3-5-3). 공개 값은 링크 켤 때 고정, 이름 공개 기본 끔(3-5-2) |
| Q12 캐시 | 앱·JSON 즉시 / `/m` HTML **`s-maxage` 5분 + 끄기·가리기 때 CDN 무효화**(Q12의 '최대 1시간' 안) / 신고 자동 숨김은 공개 파일을 격리 버킷으로 옮겨 **약 1분 안**(Smart CDN) 공개에서 사라짐, 격리 중 다시 만들기 차단. 외부 미리보기 카드·이미 받은 브라우저 캐시는 범위 밖 |
| 신고 | 키 = IP만(IPv6 /64 → **B5에서 /48**, 부록 A-3 #68), **대상마다 소금 하나**, 판정 창 = 소금 수명 = 7일, 서로 다른 신고자 3 → 자동 숨김(격리). 복원 뒤 7일 면역·서비스 1시간 5건 차단기·운영 기본 꺼짐(B6 XFF 실측 뒤 켬) |
| 지표 | **식별자 없는 집계 핑** + `nt`(설치 때 확정)·`wg`(7일째 고정)·`moon`(이벤트 현지 날짜, core `isMoonWindow`). 판정 SQL은 핑이 든 빌드 이후 코호트만 쓰고 스토어 설치 수·단조 검사로 거른다. 쓰기는 **요청 안 flush(최대 1.5초)**, 사람은 `count ≥ 5` 뷰만, 90일 뒤 월 합계(구현됨) |
| 플래그·모티프 | 정적 `config/v1.json`(TTL 1시간, `minBundle`, 빠진 키 = 번들 기본값) / 정적 `content/v1.json` + 해시 이름 모티프 파일. 스키마 정본 = **`@mong/contract`**. Git → `firebase deploy`. **iOS는 심사 때 들어 있고 켜져 있거나 설명된 기능만** 플래그로 다룬다 |
| OTA | `expo-updates` — 채널 `preview`·`production`, 러너 버전 `fingerprint`, **첫 실행에는 확인하지 않음**. 코드는 OTA, 켜기는 플래그. **[v2.3 V21] 배포 서버 = EAS Update가 아니라 우리 서버(Expo Updates 프로토콜, 설치 id 저장 0) — `ota-self-host.md`**(업데이트 주소가 바이너리에 박힘) |
| 관리 | 소프트런칭: Supabase Studio + SQL 함수(`restore_page`·`confirm_hide`) + 작은 CLI(Storage 이동). 01월: `mong-admin`(IAM 프록시 + CSRF 방어) |
| 비용 | 소프트런칭까지 **월 약 25~30달러 + 도메인**. 10만 설치 **월 약 45~60달러**(정식 출시 전 wasm·루프 R2 이전 뒤), 60만 낙관 **월 약 300~400달러** — 둘 다 **+ EAS Update(요금 확인 뒤 기입)** [팀 추정]. 예산 알림은 상한이 아니다 |
| 일정 | B1·B6(11-21~11-25) → B0(11-27) → core 함수(11-29) → B3(12-03) → B4(12-05) → B2(12-11) → B5(12-13) → B7(12-15) → 운영 전환(12-16) → Pro(12-18). 서버 레인 **14.75일**(core 1.25 포함) + 웹 5.5 + 문서 1.0. 01월: 관리 도구·L1·L3·R2 이전 2.1일 |
| 오너 할 일(급함) | **11-21~22 주말에 GCP·Firebase·Supabase 계정·결제**, **법률 검토 질문 11-24까지 발송**(14세·국외 이전·EAS 설치 id·캐나다(퀘벡)·필리핀·뉴질랜드), 11-26 Apple Team ID, 11-30 Play 앱 서명 SHA-256, **12-01 EAS 요금 확정** |
| 구현 상태 [v2.2] | **B1 골격(a817d30)·B0 측정 시계(2240ff2)·C4 달 위상(679c4d1) 완료.** 표 `users`·`creatures`·`saves`·`metric_daily`·`metric_monthly`, 핑 수신, 정적 `config`·`content`·`/m` 임시 페이지·AASA·assetlinks, 원격 계약 `@mong/contract`. 나머지(B2~B7)는 아래 0-3 대응표의 절을 보고 착수한다 |

### 0-3. 로드맵 항목 → 이 문서의 절 [v2.2]

B2~B7 담당은 아래 '읽을 절'만 보고 착수한다. '끝났다는 기준'은 9-1 표.

| 로드맵 | 상태 | 읽을 절(설계) | 데이터·계약 | 함께 지킬 규칙 |
|---|---|---|---|---|
| B1 골격 | 완료 a817d30 | 2-5·6-1~6-4 | `users`·`creatures`·`saves` | 부록 A-3 #1~#4·#16~#18 |
| B0 측정 시계 | 완료 2240ff2 | 3-6·3-7·3-10·3-2 정적 행 | `metric_daily`·`metric_monthly`·`metric_daily_k5`, `@mong/contract` | 부록 A-3 #5~#15 |
| core 함수 | 달 위상 완료(C4), 스냅숏 남음 | **3-5-1**(`toPublicSnapshot`·`parsePublicSnapshot`)과 그 **착수 조건 5개**, 6-1 | `snap:1` | Node·RN·DOM 금지, 런타임 의존성 0. 남은 공수는 0-4 결정 대기 |
| **B2** 맡겨 두기 | **코드 완료(커밋 대기, 11-20)** — 구현에서 정한 것은 부록 A-3 #21~#36(독립 리뷰 `docs/team/reviews/2026-11-20-b2-review.md` 반영) | 3-3(계정·연령·세션·글귀·JWT), **3-4·3-4-1**(동기화·이력), 3-8 '삭제' | `save_versions`, **`user_auth`**, `creatures.recovery_*`, `deletion_log`(영수증), `storage_gc(creature_id)` | 3-2 인증 공통 규칙(401·410), 3-4-1 남용 상한, 5-2 로그 가림, 7절 L4·L5·L6. **core `normalizeName` 숫자 규칙(3-5-2)은 B2에서** |
| **B3** 링크·웹 정적 | **코드 완료(커밋 대기, 11-20)** — 구현에서 정한 것은 부록 A-3 #37~#52, DECISIONS 'B3 구현 결정'. '서버 렌더 없음' = React SSR·서버 그림 그리기 없음(Nest 고정 틀 + 이스케이프 값, PM 승인) | 3-2 링크 행, **3-5·3-5-1~3-5-3**, 3-6 '링크 퍼널', 3-9, 2-4 Storage | `public_pages`·`storage_gc`·`link_daily`·`link_funnel_daily` | 부록 A-3 #15(`/m/**`를 Cloud Run으로 옮김), 3-8 레이트 리밋, 5-2(IP와 코드 분리). **B3 체크**: `page-staging` 버킷·서명 URL 유효 시간·버킷 상한 시험(3-5-3), 이름 이스케이프(3-5-2), `/m` `s-maxage` 300 + CDN 무효화(3-9), 포스터·루프 렌더에 이름 인자 없음(C11과 함께), **공개 이름 검사는 반드시 core `normalizeName`**(불러오기 검사 `nameShape`는 숫자 규칙이 없어 조작 세이브의 전화번호가 통과한다 — B2 리뷰 m4), **`DELETE /me` ① `public_pages` 경로 모으기·② `link_daily` 삭제·④ CDN 무효화, Storage 삭제기 실제 구현**(B2가 남긴 자리, A-3 #30) |
| **B4** 플래그·모티프 | 계약·정적 배포 준비 완료, 앱 연결·첫 원격 모티프 남음 | **3-7·3-7-1**, **3-10**, 3-11 순서 규칙 | `config/v1.json`·`content/v1.json`(contract) | 3-11 iOS 2.3.1 원칙 |
| **B5** 안전 | **코드 완료(커밋 대기, 11-20)** — 구현에서 정한 것은 부록 A-3 #57~#71(독립 리뷰 `docs/team/reviews/2026-11-20-b5-review.md` 반영), DECISIONS 'B5 안전 장치 구현 결정'. 운영 런북 `docs/ops/moderation/README.md`, 삭제 요청 절차 `docs/ops/deletion-requests.md` | 3-8(XFF·리밋·신고), 3-9(상태 전이), 3-12(SQL 함수·CLI), 3-5-2 '이름 가리기' | `reports`·`report_hits`·`admin_actions`, `creatures.name_blocked`, `users.delete_requested_at`, 마이그레이션 `20261123000000_b5_safety` | 7절 L5. **B6 체크**: Scheduler `moderation` 5분마다(OIDC, `CRON_AUDIENCE`), 로그 알림 `report_auto_hidden`·`report_held`(warn)·`report_auto_hidden_burst`·`moderation_sla`(error), 비공개 `quarantine` 버킷 Studio 미리보기, **Studio 실행 롤(`postgres`)의 운영 함수 EXECUTE·RLS 확인**(리뷰 M4), **XFF 실측 전 `REPORT_AUTO_HIDE` 끔 유지 — 출시 차단 조건**(리뷰 H2), Firebase `/m/**` rewrite가 `Sec-Fetch-Site`·`Origin`을 넘기는지(리뷰 C1) |
| **B6** 배포 | 대기(오너 계정) | 2-3·2-4·5-2·6-4, 12절 #1·#2·#4 | — | B6 체크: 서울 rewrite, XFF 실측 → `TRUSTED_PROXY_HOPS_*`, 로그 버킷 7일, `pg_cron`(`rollup_metric_daily` 포함), `metrics_reader` 롤·GRANT 재실행, `.well-known` curl, **Scheduler OIDC 검사**(`aud`·서비스 계정 이메일, 2-4), Hosting 릴리스 권한만 가진 무효화용 서비스 계정. **B2가 더한 값**: 운영 필수 `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`·`RECOVERY_PEPPER`(없으면 부팅 거부), `CRON_AUDIENCE`·`CRON_SA_EMAIL`(없으면 cron 404 = 삭제 재시도·옛 기기 정리가 멈춤), 정적 빌드 `API_ORIGIN`, `pg_cron`에 `app.prune_save_versions()`·`app.expire_deletion_log()`. **Scheduler 잡의 OIDC audience는 `CRON_AUDIENCE`와 정확히 같은 문자열 = 서비스 URL 전체(경로 없음, `https://mong-api-…-du.a.run.app`)로 명시**한다 — 비워 두면 Google이 대상 URL 전체(`…/internal/cron/storage-gc`)를 aud로 넣어 늘 404(B2 리뷰 I2). `gc_stuck` error 로그(3회 넘게 실패한 대기 행·24시간 넘은 미완료 삭제)를 알림에 건다. **B3가 더한 확인(리뷰 I3·M3·M4)**: ① Firebase `/m/**` rewrite에서 **서버 `Cache-Control`이 보존되는지** curl 실측(live 300·사라진 링크 60·503·429 no-store, 두 번째 요청 `x-cache`) ② Supabase 서명 업로드 URL의 **실제 수명·재사용 여부**와 버킷 상한(600KB·jpeg/mp4)이 서명 업로드에도 걸리는지 ③ 공개 객체 `cacheControl` 3600·삭제 때 Smart CDN 퍼지 ④ `cdn-purge` Scheduler(1분)·`rollup_link_daily` pg_cron 등록, Firebase 릴리스 무효화 구현(Hosting 릴리스 권한만) ⑤ `/w/ck/0.41.0/`에 canvaskit-wasm LICENSE 함께 배포. **Cloud Run 플랫폼 요청 로그(`httpRequest.requestUrl`)에는 `GET /deletion/{receipt}`의 영수증이 남는다** — 24시간짜리 상태 조회 값이라 영향은 작지만 로그 버킷 7일 확인 때 함께 본다(B2 리뷰 m3) |
| **B7** 부하 | 대기 | 7절(12월분 L2·L4·L5·L6) | — | 9-1 기준. L5에 3-4-1 남용 시나리오(미래 버전 쓰레기·계정 반복 생성). **B2 관찰 항목**: 새 계정 IP 접두 5/시간이 CGNAT 뒤 실사용자를 막는지(B2 리뷰 m9), 같은 사용자의 `recover`와 `DELETE /me`가 겹칠 때 교착 감지 500 빈도(데이터는 안전 — 한쪽만 커밋, m10), 복원 리허설에 `reapply-deletions` 한 바퀴 |
| B8 처리방침 | 대기 | 5절 전부 | — | v2.2-applied 4절 차이 목록. **B8 체크**: ① 기기 값을 받지 않음(A4 결정) → Data safety '기기 또는 기타 ID'·App Privacy 'Device ID'를 서버 몫에서는 선언하지 않음(Expo 설치 id는 3-11·5-4 따로) ② 처리방침 5절에 '운영자가 이름을 가릴 수 있다' ③ 공개 사본 항목에 '그은 순서·농도 단계'를 적을지(3-5-1) |
| C11 앱 net | 핑·로더 일부 완료 | 3-5(OG·루프 업로드), 3-5-2, 3-6(`moon`·`wg` 연결), 3-7-1 | contract | 4-1 비차단 원칙. **B3 리뷰 L10**: 이름 가리기 = `PATCH nameVisible=false` + 다시 만들기(PUT·commit) 성공까지 재시도, 끝내 실패하면 '링크 끄기'를 제안(PATCH만으로는 공개 판이 그대로) |
| E1~E4 1.0 직후 | — | 3-13 | `snap:1` 재사용 | 13절 D-23 개정 |

### 0-4. 결정 대기 [v2.2]

| 항목 | 누가 | 언제까지 | 지금 문서의 가정 |
|---|---|---|---|
| `nameTiming` 판정 뒤 처리(이긴 군을 모두에게 주는 길 — 스위치냐 OTA 기본값이냐) | C2 담당 | B4 전 | 3-7-1: 끄면 모두 A, 판정 뒤는 OTA 기본값 [팀 추정] |
| core 함수 남은 공수 재산정(`snap:1`에 받침·앵커·농도 단계·빗 성장·렌더 선택이 더해짐) | core 담당 | core 착수 때 | 9-1의 '남은 몫 약 0.75일'은 리뷰 전 값 — 다시 잡는다 |
| `name_blocked` 해제 뒤 주인 앱 안내 문구가 필요한가 | PM·작가 | B5 전 | 해제는 운영자만, 문구 없음 |

---

## 1. 서버 역할과 우선순위 [v2]

| 순위 | 역할 | 기둥 | 서버 준비 | 사용자에게 켜는 때(플래그) | 없으면 |
|---|---|---|---|---|---|
| ① | **측정** — 집계 핑(차원 3) + 링크 퍼널 | 운영 | 11-27(B0) | 빌드 2(12-10)부터 늘 | 콘솔 지표만(D-18 원래 방식). 이름 A/B 판정 불가 |
| ② | **원격 플래그 + OTA 관계** | 운영 | 11-27(B0) | 빌드 2부터 늘 | 서버 기능을 소프트런칭 중 켤 수 없다 → 기획 4-5 일정 붕괴 |
| ③ | **클라우드 보관(맡겨 두기)** | ③ 잃지 않음 | 12-11(B2) | 소프트런칭 중 OTA #1(12-24 전후) | OS 백업·내보내기 코드만 |
| ④ | **공유 링크 웹 뷰어** — 정적 → 살아 있는 몽망이 | ② 자랑 → 호기심 | 12-03(B3) | OTA #2(12-29 전후), `webLive`는 01-05 전후 | 링크가 랜딩으로만 감 |
| ⑤ | **원격 꿈 모티프** | ① 다름 | 12-05(B4) | 01-08 전후 | 번들 모티프 25 + 보름 3만 |
| ⑥ | **안전 바닥**(관리 도구는 01월) | 전제 | 12-13(B5) | ③④와 같이(③④보다 늦게 켜지 않는다) | ③④를 켤 수 없다(스토어 UGC·삭제 정책) |
| ⑦ | **1.0 직후 소셜 자리**(밤물·동기·발자국) | ①②③ | 자리만(3-13) | 1.0 직후 | — |

①②가 1순위인 까닭(v1에서 바뀜): 출시일을 정하는 것은 **측정 시계**다(기획 4-5, 리뷰 C3). 바이너리에 박히는 것(도메인 링크 설정·핑·플래그 로더·`expo-updates`)은 빌드 2 한 번에 들어가야 하고, 그 뒤 서버 기능은 **JS + OTA + 플래그로만** 들어온다. ③~⑥은 소프트런칭 중에 차례로 켜므로 빌드 2 날짜에 묶이지 않는다. 단 ⑥은 ③④보다 늦게 켜지 않는다(신고·삭제 없이 공개 링크를 열지 않는다).

---

## 2. 스택 구성과 역할 분담

### 2-1. 그림 [v2.1]

```
[앱 iOS/Android/웹]                                   [SNS 크롤러·링크 손님 브라우저]
   │ 모든 호출 비차단·5초·아웃박스                           │
   │ OTA 확인(둘째 실행부터) ─▶ mong-api /api/v1/ota (v2.3 V21) ▼
   │                          ┌── Firebase Hosting (https://mongmang.ink) ──┐
   │ 플래그·모티프(정적) ───▶  │ 정적: /, /.well-known/*, /config/v1.json,   │
   │                          │  /content/*, /w/*, /delete, /privacy        │
   │                          │ rewrite: /m/** 만 → Cloud Run mong-api       │
   │                          └──────────────────────┬──────────────────────┘
   │ /api/v1/** 직접(TLS는 서울에서 끝남)              ▼
   └─────────────────────────▶ ┌─ Cloud Run 서울 mong-api (공개) ───────────┐  ┌─ mong-admin (01월, 비공개) ─┐
                               │ /api/v1/* JSON · /m/{code} HTML·비콘·신고    │  │ IAM 프록시 + CSRF 방어      │
                               │ JWT 검증 · @mong/core 검증 · snap.json 작성  │  └─────────────────────────────┘
                               │ 핑·비콘 메모리 합산 → 요청 안 flush           │
                               └────┬───────────────┬─────────────────────┘
          Cloud Scheduler(OIDC) ────┘               │ service role
                     ▼ Prisma(풀러)                  ▼
 Supabase Auth ◀─익명 로그인  Supabase Postgres(서울, app)  Supabase Storage: public-pages(공개) / quarantine(비공개)
 (앱이 직접)                                               ◀── 앱이 서명 URL로 포스터·OG·루프만 PUT
```

- v2와 다른 점: v2는 `/api/**`도 Firebase Hosting rewrite로 보냈다. 그러면 세이브 본문·되찾기 글귀·JWT가 **사용자 근처의 Google 엣지(소프트런칭이면 캐나다·뉴질랜드·필리핀)**에서 TLS가 풀린다(리뷰 I3). v2.1은 앱 API를 Cloud Run 서울에 직접 보내 이 국외 경로를 없앤다. 서울 rewrite에 기대는 범위도 `/m/**` 하나로 줄어든다.

### 2-2. 누가 무엇을 하나 [v2]

| 구성 요소 | 맡는 일 | 맡지 않는 일 |
|---|---|---|
| **Supabase Auth** | 익명 로그인, JWT 발급·갱신, (1.0.x) Apple/Google 연결 | 권한 판단(그건 Nest) |
| **Supabase Postgres** | 모든 데이터. `pg_cron`으로 **DB만 건드리는** 정리(이력 솎기, 집계 말기, 신고 해시 비우기) | Data API 노출 — `app` 스키마는 노출하지 않는다 |
| **Supabase Storage** | `page-staging`(비공개): 커밋 전 업로드 / `public-pages`(공개 읽기): 커밋된 포스터·OG·8초 루프·공개 스냅숏 / `quarantine`(비공개): 신고로 숨긴 본 30일 | 세이브 본문(Postgres), 모티프(Firebase 정적) |
| **NestJS `mong-api`** | 공개 API 전부, `/m/{code}` HTML, 레이트 리밋, 세이브·스냅숏 검증, 삭제 처리, 핑·비콘 합산, `/internal/cron/*`(Scheduler만) | 이미지·영상 렌더(앱이 한다), 정적 파일 |
| **NestJS `mong-admin`**(01월) | 3-12 관리 화면(서버 렌더 HTML, 같은 이미지 `ADMIN_MODE=1`) | 공개 인터넷 노출. 소프트런칭 동안은 없음(Studio + SQL 함수 + CLI) |
| **Cloud Scheduler** | Storage를 건드리는 정기 작업 호출(삭제 재시도, 파일 정리, 1.0.x 장기 미사용) — 무료 3개 | — |
| **Firebase Hosting** | 도메인·TLS·CDN, 정적 파일, **`/m/**`만** Cloud Run rewrite·CDN 캐시 | 동적 로직, **앱 API 중계**(앱은 Cloud Run 서울에 직접) |
| ~~EAS Update~~ → **mong-api `/api/v1/ota`**(v2.3 V21, `ota-self-host.md`) | OTA 번들 배포(3-11) | 플래그(그건 `config/v1.json`) |
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
| Storage | 버킷 **`page-staging`(비공개, 서명 업로드만)** → `public-pages`(공개 읽기, 클라이언트 쓰기 없음) / `quarantine`(비공개) [v2.2, A4 리뷰 I10]. 업로드는 Nest가 service role로 `createSignedUploadUrl`(staging) 발급 → 앱이 직접 PUT → `commit`이 검사 뒤 공개 버킷으로 이동(수명은 3-5-3). 경로 `{bucket}/{pageKey}/{poster.jpg,og.jpg,loop.mp4,snap.json}` — `pageKey`는 **판마다 새 128비트 난수**다. 내부 `creatureId`를 드러내지 않고 판끼리 연결되지 않으며, `public_pages.path_prefix`로만 찾는다(리뷰 I7). 파일은 `immutable` 캐시. **`page-staging` 상한**: `file_size_limit` 600KB, `allowed_mime_types` = `image/jpeg`·`video/mp4`(JSON 없음 — 스냅숏은 서버만 씀) **[확인 필요: 서명 업로드에도 버킷 상한이 걸리는지 — B3 첫날 시험]** |
| Storage CDN | 공개 파일은 Supabase CDN을 거친다. **Pro의 Smart CDN은 파일 삭제·덮어쓰기 때 캐시를 무효화(전파 최대 약 60초)** **[확인 필요: Smart CDN 동작·요금제 조건]** — Q12 '격리로 약 1분 안'이 여기에 기댄다(3-9). 스테이징(Free)에는 없을 수 있으므로 **Q12 검증은 운영 설정에서** 한다 |
| Auth | 익명 로그인 켬, 수동 연결 켬(1.0.x 대비), 익명 가입 IP 한도 기본 30/시간 → CGNAT로 막히면 120 |
| JWT 검증 | JWKS(`/auth/v1/.well-known/jwks.json`) 비대칭 서명 검증(`jose`). 검사 항목은 3-3 ⑧. 프로젝트 기본 서명 방식·새 API 키 체계는 B1에서 확인 **[확인 필요]** |
| `pg_cron`(DB만) | 매일 04:00 KST: ① 데이터 없는 익명 사용자 30일 뒤 삭제([Anonymous](https://supabase.com/docs/guides/auth/auth-anonymous)) ② 이력 솎기 28일·30일(3-4-1의 SQL) ③ 판정 창(7일)이 끝난 신고의 소금·`report_hits` 삭제(3-8) ④ `link_daily` 30일 지난 행을 코드 없이 `link_funnel_daily`로 말고 지움 ⑤ **`select app.rollup_metric_daily()`** — `metric_daily` 90일 이전 행을 `metric_monthly`로 말기(함수는 B0에서 구현됨 `migrations/20261120140000_metric_rollup`, 첫 실제 이동은 03월) [v2.2] ⑥ `reports` 1년 지난 행 삭제 (⑦ 옛 기기 로그인(`user_auth.revoked_at`) 30일 뒤 정리는 `auth.users`를 지워야 해서 Scheduler 쪽, 아래 행). **예약 등록은 B6 체크 항목** |
| Cloud Scheduler(Storage 포함) | 매일 04:30 KST `POST /internal/cron/storage-gc`(지난 판 파일 2시간 유예 뒤 삭제, **발급 6시간 지나도 commit 없는 업로드 삭제**, 격리 30일 지난 파일 처리(3-9 기본값), 실패한 삭제 작업 재시도, **되찾기로 끊긴 옛 기기 로그인 30일 뒤 `auth.users` 삭제**) / 1.0.x 매월 1일 `inactive-sweep`. 무료 3개 안(storage-gc가 Auth 정리도 겸함). `/internal/cron/*`는 **OIDC 검사: `aud` = 서비스 URL, `email` = 전용 Scheduler 서비스 계정**만(B6) |

### 2-5. Prisma 운영

v1 그대로(Prisma 7, `@prisma/adapter-pg`, `prisma.config.ts`, 트랜잭션 풀러 6543 = 런타임 / 세션 풀러 5432 = 마이그레이션, 인스턴스당 풀 5 × 최대 3 = 15 연결, 전용 `prisma` 롤, **컨테이너 시작 때 마이그레이션하지 않음**, 확장 → 배포 → 축소, Supabase 전용 SQL은 마이그레이션 안 raw SQL, 잠금 지점은 Supabase Auth 하나 → `AuthVerifier` 인터페이스)([Prisma 7](https://www.prisma.io/changelog/2025-11-19), [Supabase × Prisma](https://supabase.com/docs/guides/database/prisma)).

- v2 추가: `mong-admin`도 같은 풀러를 쓰되 풀 2. 합계 최대 17 연결 — Supabase Pro Micro의 풀러 한도 안 **[확인 필요: 풀러 클라이언트 한도]**.

---

## 3. 데이터 모델·API·인증·동기화·링크

### 3-1. 테이블(Prisma, 스키마 `app`) [v2.2]

- 구현 상태(v2.2): **있음** = `users`·`creatures`(되찾기 열 제외)·`saves`(B1 `migrations/20261120000000_init`), `metric_daily`·뷰 `metric_daily_k5`·`metric_monthly`·함수 `rollup_metric_daily`(B0). 나머지는 해당 B 항목의 새 마이그레이션. 모든 표는 RLS 켜고 정책 0개, `anon`·`authenticated` 권한 회수(B1 방어 겹과 같은 DO 블록).

| 테이블 | 키·열 | 인덱스·제약 | 비고 |
|---|---|---|---|
| `users` | `id uuid PK`(B1: 첫 기기의 `auth.users.id`와 같은 값으로 만든다. 그 뒤로는 **내부 id** — 기기 로그인은 `user_auth`로 찾는다), `created_at`, `last_active_month date`(그달 1일, 5-5), `locale char(2)`, `age_gate_v smallint`, `age_confirmed_on date` | — | 이름·이메일·나이·생년 없음. 연령은 '확인 절차 통과' 기록만(3-3). [v2.2 A4 리뷰 I5] v2.1의 `moved_away_at`은 `user_auth.revoked_at`으로 옮겼다 |
| `user_auth` [v2.2 새로, B2] | `sub uuid PK`(= Supabase `auth.users.id`, 기기의 익명 로그인), `user_id FK→users ON DELETE CASCADE`, `linked_at`, `revoked_at?` | **`UNIQUE(user_id) WHERE revoked_at IS NULL`**(1.0은 쓰는 기기 하나) | JWT `sub` → 사용자. 되찾기는 몽망이를 옮기지 않고 **새 기기의 `sub`를 기존 사용자에 붙이고 옛 `sub`를 `revoked`** 한다(3-3 ⑤). B2 마이그레이션이 기존 `users.id`로 한 행씩 채운다. `revoked` 행과 그 `auth.users`는 30일 뒤 지운다 |
| `creatures` | `id uuid PK`, `user_id FK→users ON DELETE CASCADE`, `code char(8) UNIQUE`, `link_enabled bool default false`, `name_visible bool default false`(= 기획 `nameVisibility`, 3-5-2), **`name_blocked bool default false`**(운영자 이름 가리기, B5) [v2.2], `hidden bool`(운영 확정 숨김), **`recovery_hash bytea?`, `recovery_pepper_v smallint?`, `recovery_rotated_at?`**, `created_at` | **`UNIQUE(user_id)` DB 제약**(1.0 동안) | v2.1: ① `bootstrap` 멱등을 DB가 보장한다 — 재시도·동시 요청에 몽망이 두 마리가 생기지 않는다(리뷰 I9). 1.x 여러 마리는 확장 → 배포 → 축소로 푼다 ② 되찾기 해시를 `users`에서 옮겼다(몽망이를 따라 다님, 리뷰 S3) |
| `saves` | v1 그대로(`creature_id PK`, `rev`, `body bytea` gzip, `body_sha256`, `envelope_ver`, `sim_ver`, `validated`, `client_saved_at`, `day_index`, `strokes_total`, `updated_at`) — **기기 값(`device_id`)은 없다**(B1 스키마와 같음, A4 리뷰 결정: 받지 않음) | — | 본문 상한은 3-4-1 '남용 상한'. **서버는 `day_index`·`strokes_total`·버전 외에는 본문에서 꺼내 저장하지 않는다**(5-1) |
| `save_versions` | `id bigserial`, **`public_id uuid UNIQUE`**(API에 내보내는 값), `creature_id FK CASCADE`, `rev`, `body`, `body_sha256`, `envelope_ver smallint`, `sim_ver smallint`, `validated bool`, `day_index int`, `strokes_total int`, `client_saved_at`, `reason enum(overwritten, weekly, conflict, pre_restore)`, `iso_week char(8)?`(`weekly`만, 예 `2026-W52`), `created_at` | `(creature_id, reason, created_at desc)`, **`UNIQUE(creature_id, iso_week) WHERE reason = 'weekly'`** | **최대 4주**. 열·트랜잭션·솎기는 3-4-1 [v2.2] |
| `public_pages` | `creature_id PK FK CASCADE`, `ver int`, `state enum(live, off, quarantined, removed)`, `meta jsonb`(3-5 `public_pages.meta`), `name_shown bool`(이 판에 이름이 실제로 실렸나, 3-5-2), `path_prefix text`(불투명 `pageKey`), `has_loop bool`, `published_at`, `state_changed_at`, `pending_ver int?`·`pending_prefix text?`(커밋 전 판, 3-5-3) | `(state)` | 몽망이마다 현재 공개 사본 하나. 상태 전이는 3-9 |
| `storage_gc` | `id bigserial`, `bucket`(`page-staging`·`public-pages`·`quarantine`), `prefix`, **`creature_id uuid?`**(FK 아님 — 계정 삭제 뒤에도 남은 항목을 찾으려고, 처리하면 행째 지움), `reason enum(old_version, uncommitted, quarantine_expiry, deletion)`, `not_before timestamptz`, `attempts smallint` | `(not_before)`, `(creature_id)` | Storage 삭제 대기열. 업로드 URL을 발급할 때 `uncommitted`(6시간 뒤)를 미리 넣고, `commit`이 지운다 |
| `reports` | `id bigserial`, `target_kind enum(link, encounter, cohort, footprint)`, `target_ref text`, `reason enum`, `created_at`(첫 신고), `window_ends_at`(= 첫 신고 + 7일), **`salt bytea?`**(창이 끝나거나 숨김이 되면 NULL), `distinct_reporters smallint`, `status enum(open, auto_hidden, expired, restored, confirmed, dismissed)`, `resolved_at?` | `UNIQUE(target_kind, target_ref) WHERE status = 'open'` | 대상마다 열린 행 하나, 소금 하나(3-8). 1년 보관(목적: 같은 대상의 재발 판단) |
| `report_hits` | `report_id FK`, `reporter_key bytea`, `created_at` | **`PRIMARY KEY(report_id, reporter_key)`** | `reporter_key = HMAC-SHA256(reports.salt, IP 접두)`. 창이 끝나거나 숨김이 되면 **행째 지운다**(v2처럼 NULL로 두면 NULL끼리 중복이 허용돼 셀 수 없다) |
| `metric_daily` | PK `(day, event, cohort_day, day_n, platform, app_ver, lang, nt, wg, moon)`, `count int` | — | **구현됨(B0)**. 식별자 없는 집계(3-6). `day` = 이벤트 현지 날짜 = `cohort_day + day_n`, `event` = `open` + 화이트리스트 10, `app_ver` = 출시 판 `1.0`, `nt` 'A'·'B', `wg` '0'·'1'·'-', `moon` '0'·'1'. **서비스 롤만 읽는다**. 열 목록은 `test/db.db.test.ts`가 고정(열을 더하면 처리방침 3-1도) |
| 뷰 `metric_daily_k5` | `metric_daily`에서 `count ≥ 5`인 행만 | — | **구현됨(B0)**. 사람·대시보드는 이 뷰만, 조회 롤 `metrics_reader`(B6에서 만들고 GRANT 재실행) [v2.2] |
| `metric_monthly` | PK `(month, cohort_month, event, day_n, platform, app_ver, lang, nt)`, `count` | — | **구현됨(B0)**. 90일 지난 `metric_daily`를 `app.rollup_metric_daily(cutoff = 오늘 − 90)`가 옮긴다(삭제·삽입 한 문장). 날짜·코호트는 달로 접고 `wg`·`moon`은 버린다 [v2.2] |
| `link_daily` | PK `(day, code, event enum(view, store_ios, store_android, open_app))`, `count` | — | **30일 보관**(리뷰 I12). 그 뒤 코드 없이 `link_funnel_daily`로 말고 지운다. 계정 삭제 때 그 코드의 행을 바로 지운다 |
| `link_funnel_daily` | PK `(day, event)`, `count` | — | 개인과 무관한 합계(퍼널 판정용) |
| `deletion_log` | `id`, `requested_at`, `completed_at`, `channel enum(app, web, email)`, `kind enum(user_request, web_request, inactive, report_confirmed)`, `items jsonb`, **`receipt_hash bytea?`·`receipt_expires_at?`**(삭제 영수증, 3-8) | `(receipt_hash)` | 누구인지 없이 개수만. 영수증은 만료 뒤 NULL |
| `admin_actions` | `id`, `action`, `target_kind`, `target_ref`, `note`, `at` | — | 운영 기록. 소프트런칭에는 SQL 함수가, 01월부터는 `mong-admin`이 쓴다 |
| (1.0 직후 자리) `night_drops`, `encounters`, `blocks`, `footprint_raw`, `footprint_daily`, `footprint_salts` | 3-13 | — | **모두 `creatures`에 CASCADE.** 1.0에는 만들지 않는다 |

- v2에서 빠진 것: `daily_salts`(신고는 대상별 소금으로 바뀌었고, 발자국은 1.0 직후 전용 소금을 쓴다).

### 3-2. API(접두 `/api/v1`, JSON, 인증 = `Authorization: Bearer <Supabase JWT>`) [v2.2]

앱은 `EXPO_PUBLIC_API_BASE` = **Cloud Run 서울 주소**(`https://mong-api-…-du.a.run.app`)로 직접 부른다. `/m/**`만 `https://mongmang.ink`(Firebase)를 거친다.

| 메서드·경로 | 인증 | 요청 → 응답 | 준비(B) |
|---|---|---|---|
| `GET /healthz` / `GET /readyz` | 없음 / **`x-ready-token`** | `200 {ok, ver, saveSchema, simSchema}`(DB 안 봄) / `200 {ok, db:"up"}`·`503 db_unavailable`. `/readyz`는 토큰이 다르면 **404**(운영 필수 `READY_TOKEN`), 결과 캐시 2초, OpenAPI 제외. 둘 다 `no-store`·요청 로그 제외 (구현: `src/health/*`) [v2.2] | B1 ✔ |
| `POST /api/v1/ping` | **없음** | 3-6의 모양 → 늘 `204`·`no-store`. 스키마·날짜·출시 판 검사에 걸리면 조용히 버린다. IP 접두당 20/분 (구현: `src/metrics/*`) | B0 ✔ |
| `POST /api/v1/me/bootstrap` | JWT | `{ageGate:{v:2, ok:true}}` → `{userId, creature:{code}}`. `ageGate`가 없으면 `400`. **Auth Admin API로 이 `sub`가 `auth.users`에 있는지 확인**하고, 없으면 `401`(삭제한 계정의 남은 토큰으로 되살아나지 않게, 3-8). `users` + `user_auth(sub)` + `creatures`를 한 트랜잭션에. 멱등(`user_auth` PK·`UNIQUE(user_id)`). 계정 생성 한도는 3-4-1 '남용 상한' | B2·B3 |
| `POST /api/v1/me/touch` | JWT | `{}` → `204`. 앱이 **달이 바뀐 뒤 첫 실행 때 한 번만**(세션이 있을 때) | B3 |
| `PUT /api/v1/creature/page` | JWT | 링크 켜기·다시 만들기. `{snapshot, nameVisible, name?, lang, files:{poster, og, loop?}}`(각 `{contentType, bytes}`) → `{ver, nameAllowed, url, upload:{poster:{signedUrl, token}, og, loop?}}`. 서버가 스냅숏 검증(3-5-1)·이름 검사(3-5-2)를 하고 `snap.json`을 직접 쓴 뒤 **비공개 `page-staging`** 업로드 URL만 발급한다(3-5-3). 상태가 `quarantined`·`removed`이거나 `hidden`이면 **`409`**(3-9) | B3 |
| `POST /api/v1/creature/page/{ver}/commit` | JWT | → `200`(파일 셋의 존재·크기·시그니처·해상도 확인 → `live`, 지난 판은 `storage_gc`) / `409`(더 새 판 또는 격리 중) / `422`(검사 실패) | B3 |
| `DELETE /api/v1/creature/page` | JWT | → `204`. 링크 끄기: `live → off`, `link_enabled=false`, **공개 파일 즉시 삭제**. 격리 중이면 `link_enabled=false`만 바꾸고 격리본은 운영 판단까지 둔다 | B3 |
| `PATCH /api/v1/creature` | JWT | `{nameVisible}` → `200`. 이름 공개를 바꾸면 **다시 만들기 필요**(OG 이미지에 이름이 그려지므로) — 앱이 바로 `PUT page`를 이어 부른다 | B3 |
| `GET /api/v1/creature` | JWT | → `{code, linkEnabled, nameVisible, page:{ver, state}}` — 앱 안 표시는 이 값(즉시) | B3 |
| `GET /api/v1/saves/main/meta` | JWT | → `{rev, sha, clientSavedAt, dayIndex, strokesTotal, envelopeVer, simVer, validated}` / `404`(맡긴 적 없음) | B2 |
| `GET /api/v1/saves/main` | JWT | → 위 + `body`(세이브 JSON 문자열, 서버가 gzip을 푼 값) | B2 |
| `PUT /api/v1/saves/main` | JWT, `If-Match: <rev>`(처음은 `If-None-Match: *`) | `{body, clientSavedAt, resolve?: "keep_mine"}` → `200 {rev, sha}` / `409 {server: meta}` / `413`(512KB 초과) / `422 {reason}`(JSON·필수 키 깨짐). 트랜잭션은 3-4-1 [v2.2: v1의 `deviceId`는 받지 않는다 — 5-2 최소화] | B2 |
| `POST /api/v1/saves/main/conflicts` | JWT | `{body, clientSavedAt}` → `201 {id}`. 409 뒤 사용자가 **서버 본을 고르면** 이 기기의 진 본을 `conflict`로 올려 30일 둔다(3-4-1). 몽망이당 열린 `conflict` 상한 3 [v2.2 새로] | B2 |
| `GET /api/v1/saves/main/versions` | JWT | → `[{id, reason, rev, clientSavedAt, dayIndex, strokesTotal, validated, createdAt}]`(본문 없음, 최신순, 최대 3 + 4 + 충돌·복원 전) | B2 |
| `GET /api/v1/saves/main/versions/{id}` | JWT | → 위 한 행 + `body`(나란히 고르기·미리 보기용) [v2.2 새로] | B2 |
| `POST /api/v1/saves/main/versions/{id}/restore` | JWT, `If-Match: <rev>` | → `200 {rev, sha}`(현재본은 `pre_restore`로 이력에, 그 본이 새 현재본) / `409` | B2 |
| `POST /api/v1/recovery-code` | JWT | `{}` → `{code:"XXXX-XXXX-XXXX-XXXX"}`(한 번만 보여 줌, 다시 부르면 옛 해시 무효) | B2 |
| `POST /api/v1/recover` | JWT(새 기기의 익명 로그인, **`bootstrap` 없이**) | `{code, ageGate:{v:2, ok:true}}` → `200 {creature:{code}, save: meta, newCode}` — 이 `sub`를 **기존 사용자에 붙이고** 옛 `sub`를 끊으며 **새 글귀를 한 번 보여 주고 옛 해시 무효**(흐름표 3-3 ⑤) / `404`(글귀 없음·틀림) / `409 has_creature`(이 `sub`에 이미 몽망이가 있음) / 시도 한도는 3-8 | B2 |
| `DELETE /api/v1/me` | JWT | → `202 {receipt}` — **삭제 영수증 토큰**(128비트 난수 base64url, 서버는 해시만 `deletion_log`에, **수명 24시간** [팀 추정]). 연쇄 삭제 목록은 3-8 | B2 |
| `GET /api/v1/deletion/{receipt}` | **없음**(영수증이 곧 권한) | → `{state: pending\|done}`, 모르는·만료된 영수증은 `404`. `no-store`, IP 접두당 30/분. 계정이 이미 없으므로 JWT를 받지 않는다(A4 리뷰 I5) [v2.2 새로] | B2 |
| `POST /api/v1/deletion/web` | **없음**(코드 + 글귀가 곧 본인 확인) | `{code, phrase}` → `202 {receipt}`(앱 안 삭제와 같은 연쇄) / `404`(둘이 같은 몽망이를 가리키지 않음 — 어느 쪽이 틀렸는지 알리지 않음) / `429`(IP 접두당 5/시간·글귀당 10/일). CORS는 `WEB_ORIGIN` 한 곳만. 웹 `/delete` 폼이 Cloud Run 서울로 직접 보낸다(3-8 ②) [B2 구현, 부록 A-3 #25] | B2 |
| `GET /m/{code}` | 없음 | 정적 HTML(3-5). 없는·꺼진·숨긴 코드는 같은 틀의 '사라진 링크'(200, noindex) | B3 |
| `GET /m/{code}/get?p=ios\|android` | 없음 | `302` 스토어(캠페인 파라미터) + 카운트, `no-store` | B3 |
| `POST /m/{code}/seen` | 없음 | 비콘(`sendBeacon`, 본문 없음) → `204`, `no-store`(3-6). v2의 `/api/v1/m/{code}/seen`에서 옮겼다(`/api`가 Firebase를 거치지 않게 되어서) | B3 |
| `POST /m/{code}/report` | 없음 | 폼(`reason`) → `303` 감사 페이지(3-8) | B5 |
| `POST /internal/cron/{job}` | Scheduler OIDC | 정기 작업 | B2·B5 |
| 정적(Firebase) | — | `/`, `/.well-known/apple-app-site-association`, `/.well-known/assetlinks.json`, `/config/v1.json`, `/content/v1.json`, `/content/motifs/*`, `/w/*`, `/delete`, `/privacy`, `/robots.txt`. **B0 구현**: `apps/web-static/src` → `scripts/build.mjs` → `public/`(팀 ID·지문·App Store id가 비었거나 자리표시자면 `predeploy`가 멈춤), `/m/**`는 B3 전까지 정적 `/m/index.html`로 rewrite(부록 A-3 #15). `/w/*`·`/delete`·`/privacy`는 아직 없음 | B0 ✔·B3·B4 |
| (1.0 직후 자리) `/api/v1/night/*`, `/api/v1/cohort`, `/api/v1/footprints`, `/api/v1/blocks`, `POST /m/{code}/pat` | — | 3-13. **경로 이름만 예약**, 1.0 서버에는 없다(404) | — |

- **인증 공통 규칙(v2.2)**: ① JWT `sub` → `user_auth`. **`bootstrap`·`recover` 외** 모든 JWT API는 행이 없으면 `401` ② 그 행이 `revoked_at`이면 `410`(되찾기로 다른 기기에 옮겨 감) ③ JWT 검사 항목은 3-3 ⑧. 인증 없는 경로는 핑·`/m/**`·삭제 영수증 조회·**웹 삭제(`POST /api/v1/deletion/web`, 코드 + 글귀가 곧 본인 확인)**뿐 [B2]. `/internal/cron/*`는 JWT가 아니라 Scheduler OIDC(2-4).
- **계약 [v2.2, 부록 A-3 #5]**: 서버 HTTP 요청 스키마는 zod로 쓰고 `z.toJSONSchema(target openapi-3.0)` → `openapi.json`(CI 산출물 `pnpm --filter server openapi`, 개발 때만 `/api/docs`). 앱은 그 타입으로 `fetch`만 쓴다. **원격 계약(핑·`config/v1.json`·`content/v1.json`·모티프 파일)은 `packages/contract`(`@mong/contract`, `zod/mini`)** 한 파일에 둬 앱·서버·정적 CI가 같은 코드로 검사한다. v1의 `packages/api-contract`는 만들지 않는다.
- **공통 응답 [v2.2]**: 오류는 `{error:{code, message, details?}, requestId}`(5xx는 문구 숨김), 모든 응답 `X-Content-Type-Options: nosniff`·`Referrer-Policy: no-referrer`·`X-Frame-Options: DENY`·`Cross-Origin-Resource-Policy: same-site`. `/m` 페이지 CSP는 B3(B0 정적 페이지는 인라인 해시 하나). (구현: `src/common/http-exception.filter.ts`, `src/app.factory.ts`)
- `/api/v1/saves/validate`는 **개발 전용 예시**다. 운영 이미지(`NODE_ENV=production`)에는 모듈 자체가 없다(B1 리뷰 I7). B2의 `PUT /saves/main`이 같은 `inspectSave`를 쓴다.
- 관리자 API는 공개 서비스에 두지 않는다(3-12). `mong-api` 배포 스모크가 관리 라우트 `404`를 확인한다.

### 3-3. 인증 — "필요할 때 익명 → 되찾기 글귀 → (선택) Apple/Google" [v2.1]

1. **설치 직후에는 계정을 만들지 않는다.** 핑·플래그·모티프·OTA는 인증이 필요 없다(기획 P9 — 단 '**우리** 서버는 모른다'로 고칠 것, 13절).
2. **계정이 생기는 순간**: ① 첫 '링크 켜기' ② '맡겨 두기' 켜기 — 1.0. ③ **'밤물 열기'**(1.0 직후, 3-13) — 밤 맡김을 올리고 막기·삭제를 하려면 주체가 있어야 한다. D-23([확정])은 ①②만 적었으므로 **D-23 개정이 필요하다**(13절).
3. **중립형 연령 확인(v2.1, 리뷰 I4)**: 계정이 생기기 직전에 "태어난 해와 달을 골라 주세요"를 한 번 묻는다. 연·월 휠은 **기본값 없이 빈 칸에서 시작**하고, '14세'라는 기준 숫자를 화면에 미리 보이지 않는다(정답을 알려 주는 '예/아니요' 유도형을 버림). 판정은 기기에서 한다(만 나이 = 오늘 − 연·월. 같은 달이 경계면 통과로 본다 [팀 추정]). **연·월은 어디에도 저장하지 않고** 판정 결과만 쓴다.
   - 미달: 기기에 '미달·날짜'만 기록하고 24시간 다시 묻지 않으며, 익명 로그인을 하지 않는다 → 서버에 `under14`가 존재할 수 없다. 안내 문구는 '기기 안 게임·이미지 공유는 그대로'(작가 몫).
   - 통과: `signInAnonymously()` → `bootstrap {ageGate:{v:2, ok:true}}` → `age_gate_v`·`age_confirmed_on`(날짜만). `ageGate` 없는 `bootstrap`은 `400`.
   - Google Families의 '중립적 연령 확인' 취지에 맞추려는 설계다 **[확인 필요]**. 스토어 연령 선언을 맞추는 일은 13절.
4. **세션 저장(v2.1, 리뷰 I2)**: supabase-js `storage`는 **세션 전용 MMKV 인스턴스(`mong.session`)**에 두고 OS 백업에서 뺀다(iOS 파일 `isExcludedFromBackup`, Android `dataExtractionRules`·`fullBackupContent` 제외 규칙). 세이브 MMKV는 D-06대로 백업 대상이다.
   - 새 폰이 OS 백업으로 복원되면 세이브는 오고 세션은 없다 → 공방 노트가 '맡겨 둔 몽망이가 있다면 되찾기 글귀로 이어 주세요'로 안내한다.
   - 막는 사고: 두 기기가 같은 refresh token을 돌리다 재사용 감지로 **둘 다** '맡겨 두기 끊김'이 되는 일(리뷰어 지적, 동작은 [확인 필요]).
   - 백업 제외 설정은 네이티브라 **빌드 2 네이티브 묶음**에 넣는다(4-2).
5. **되찾기 글귀**: 서버가 80비트 보안 난수로 16자 Crockford base32를 만들고, ~~`SHA-256(pepper_v ‖ 글귀)`~~ **`HMAC-SHA256(pepper, 정규 16자)`**(B2, 부록 A-3 #21) 해시와 pepper 판 번호(`recovery_pepper_v`)를 `creatures`에 둔다. '맡겨 두기'를 켤 때 한 번 보여 준다. `POST /recover` 성공 시:
   - [v2.2, A4 리뷰 I5] **몽망이·사용자는 그대로 두고 기기 로그인만 바꾼다.** 새 기기는 `bootstrap`을 하지 않으므로 빈 몽망이가 생기지 않고, `creatures UNIQUE(user_id)`와 부딪칠 일이 없다. 서버가 따로 토큰을 찍지 않는다 — 새 기기의 Supabase 익명 세션(JWT)이 그대로 '새 기기 토큰'이 되고, 서버는 그 `sub`를 기존 사용자에 연결한다(비대칭 JWT만 받는 원칙 유지, ⑧).

   | 단계 | 새 기기(sub S2) | 서버 | 옛 기기(sub S1) |
   |---|---|---|---|
   | 1 | 공방 노트 '되찾기' → **중립형 연령 확인**(③) 통과 → `signInAnonymously()` | — | 그대로 씀 |
   | 2 | `POST /recover {code, ageGate}` | Auth Admin으로 S2 존재 확인. S2가 이미 `user_auth`에 있으면: 그 사용자에 몽망이가 있으면 `409 has_creature`(앱은 '이 기기 몽망이를 지우고 되찾을까요' → `DELETE /me` 뒤 새 익명 로그인으로 다시), 없으면 계속 | — |
   | 3 | — | 한 트랜잭션: 글귀 해시로 `creatures` → 사용자 U(`FOR UPDATE`) / `UPDATE user_auth SET revoked_at = now() WHERE user_id = U AND revoked_at IS NULL`(S1) / `INSERT user_auth(S2, U)` / 새 글귀 해시·`recovery_rotated_at` / `users.age_gate_v`·`age_confirmed_on`을 새 기기 확인으로 / `users.last_active_month` | — |
   | 4 | `200 {creature, save: meta, newCode}` → 새 글귀를 한 번 보여 주고 `GET /saves/main` → 복원(3-4) | — | 다음 호출부터 `410` → '이 몽망이는 다른 기기로 옮겨졌어요'(작가 몫), 세션을 비우고 로컬 게임은 계속 |
   | 5 | — | 30일 뒤 Scheduler가 `revoked` 행의 `auth.users`(S1)를 Auth Admin으로 지우고 행 삭제 | — |

   - 새 글귀를 주고 옛 해시를 무효로 하는 까닭: 글귀를 한 번 본 사람이 언제든 다시 가져가는 일을 막는다(리뷰 S3).
   - 시도 한도 IP 접두당 5회/시간, 글귀당 10회/일.
   - pepper는 Secret Manager 버전 관리 + **오프라인 사본**(런북). 잃으면 글귀가 전부 무효가 된다. `recovery_pepper_v`로 회전에 대비한다(리뷰 S4).
   - **pepper 회전 절차 [B2 리뷰 m1]**: ① 새 값을 만들고 `RECOVERY_PEPPER`=새 값, `RECOVERY_PEPPER_V`=판+1, **`RECOVERY_PEPPERS_PREVIOUS`=`옛판:옛값`**으로 함께 배포한다(서버는 찾을 때 모든 판을 대 보고, 새로 쓸 때는 늘 지금 판). ② 재해시는 **글귀를 다시 쓸 때** 일어난다 — `recover`(새 글귀 발급)·`recovery-code` 재발급. 서버에는 평문 글귀가 없으므로 로그인(JWT)만으로는 다시 해시할 수 없다. ③ `select count(*) from app.creatures where recovery_pepper_v < 지금판`이 0이 되거나, 정책상 기한(유출 의심이면 즉시)을 넘기면 `RECOVERY_PEPPERS_PREVIOUS`에서 뺀다 — 그때까지 바꾸지 않은 글귀는 무효가 되므로(유출 대응일 때만) 앱이 '글귀 다시 받기'를 안내한다. 옛 판을 너무 일찍 빼면 글귀가 말없이 무효가 된다(시험 'pepper 회전'). ④ 판 번호가 지금 판보다 크거나 겹치면 부팅 거부(env 시험).
6. **Apple/Google 연결(1.0.x)**: v1 그대로(`linkIdentity`, 새 네이티브 모듈 2개라 빌드 2 묶음 밖).
7. 토큰 갱신 실패·세션 소실 = '맡겨 두기 끊김' 표시만, 게임은 계속.
8. **JWT 검사(리뷰 S6)**: `iss` = 프로젝트 Auth URL, `aud` = `authenticated`, `exp`, `role = authenticated`, `sub` 존재. **비대칭 알고리즘만 받고 HS256은 거부**한다(레거시 키로 서명된 토큰 차단). Supabase 새 API 키 체계(`sb_secret_…`)의 이름·수명은 B1에서 확인 **[확인 필요]**.

### 3-4. 세이브 동기화 규칙 — 통째, 리비전, 병합 없음 [v2.2]

**왜 병합하지 않나**(v1): 세이브는 정본 점열(D-13) + 시뮬레이션 상태다. 몸은 획이 그어진 순서·시각·그때의 성향에서 결정적으로 나오므로, 두 기기의 획을 합치면 어느 기기에도 없던 **다른 몽망이**가 생긴다. 그래서 "어느 한 마리를 고른다"가 맞고, 고르지 않은 쪽은 지우지 않고 이력에 남긴다(D-03).

v2.2에서 v1 본문을 이 절로 옮겨 적는다(v1 문서는 이 파일에 더 이상 없다 — B2가 이 절만 보고 짠다).

| 규칙 | 내용 |
|---|---|
| 정본 | **기기의 MMKV 세이브가 정본.** 서버는 마지막으로 받은 사본 + 이력 |
| 단위 | core `serializeState` 결과 문자열 통째(이미 int16 base64 점열 포함). 서버에서 gzip해 `bytea` |
| 올리는 때 | 로컬 세이브 해시가 '마지막으로 올린 해시'와 다르고, ① 백그라운드 전환 ② 깸 직후 `rotateBackup`(D-15) ③ 그 밖에는 10분에 한 번 이하. 아웃박스 1칸(최신본만) |
| 버전 확인 | `PUT` + `If-Match: <마지막으로 본 rev>`. 같으면 `rev+1`로 덮고 덮인 본은 이력(3-4-1) |
| 빨리 감기 | 서버 `sha` == 내 본 `sha`면 충돌이 아니다 → `200`(rev만 맞춤) |
| 충돌(409) | 서버 본이 다른 기기에서 온 경우뿐. 앱은 **자동으로 고르지 않고** 이 기기 본을 계속 쓴다. 공방 노트에 '다른 기기의 몽망이가 맡겨져 있어요' → **두 몽망이 나란히 고르기**(기획 2-1, `GET versions/{id}` 또는 `GET /saves/main`으로 서버 본을 받아 core로 그린다). ① 이 기기 본을 고름(또는 아무것도 안 고름) → `PUT` + `If-Match: <서버 rev>` + `resolve: "keep_mine"` → 덮인 서버 본은 `conflict`(30일) ② 서버 본을 고름 → 이 기기 본을 `POST /saves/main/conflicts`로 올려 `conflict`(30일)로 둔 뒤 서버 본을 받아 로컬에 쓴다 |
| 복원(새 기기) | `GET /saves/main` → **앱이 `parseState`로 검증** → 지금 기기의 세이브(첫날 몽망이 등)가 있으면 기기 안 `pre_restore` 키로 보존 후 `writeSave(kv, state, now, {rotateBackup:true})`. 복원은 **인트로 뒤 공방 노트에서**, 복원 순간 홈을 다시 그린다(D-15 '설치 판정 = 세이브 존재') |
| 서버 검증 | `PUT` 본문을 `@mong/core` `parseState`로 읽어 본다(B1 `inspectSave`). 통과 → `validated=true`, 메타 추출 |
| **미래 버전** | 앱이 서버보다 **1 큰** `schemaVersion`·`sim.version`을 올리면 거부하지 않고 JSON·크기·필수 키만 보고 `validated=false`로 원문만 보관한다(2 이상 크면 `422`, 3-4-1 '남용 상한'). 세이브 버전을 올리는 릴리스 전에 서버를 먼저 배포(6-4 가드) |
| 시계 | 시간·성장은 기기 시계(D-07). 서버 시각은 이력 솎기(`weekly`의 ISO 주·30일)에만 쓴다. `client_saved_at`은 표시용 |
| 크기 | 상한은 3-4-1 '남용 상한'(초과 `413` → 앱은 조용히 '맡겨 두기 보류'). 보통 30KB, 최대 약 100KB(시스템 4.4) |

v2에서 바뀌거나 더한 것:

| 규칙 | 내용 |
|---|---|
| **이력 보관(최대 4주)** | `overwritten`: 최근 **3벌** — **PUT 트랜잭션 안에서** 4번째부터 바로 지운다(날마다 솎으면 하루 수백 행이 쌓였다 지워져 TOAST·WAL이 부푼다, 리뷰 S1) / `weekly`: PUT 때 **이번 ISO 주(서버 시각)에 `weekly`가 없으면, 덮이는 본을 `overwritten` 대신 `weekly`로 저장**, 4주(리뷰 S2) / `conflict`·`pre_restore`: 30일. `pg_cron`은 주·30일 규칙만 맡는다. v1의 `daily` 7일은 없앤다 |
| **반쯤 성공한 업로드** | 서버가 커밋했는데 응답이 끊기면, 앱은 같은 본을 같은 `If-Match`로 다시 보낸다 → 서버 `rev`가 이미 올라가 409. 이때 409 응답의 `server.sha` == 내 본 `sha`면 **충돌이 아니라 성공**으로 처리하고 `rev`만 맞춘다(빨리 감기 규칙의 응용). 느린 서버 테스트(7절 L6)의 필수 시나리오 |
| **올림 주기와 부하** | 10분에 한 번 이하 + 해시가 다를 때만 → 사용자당 하루 평균 3~6회 [팀 추정](7절 L4) |
| 서버가 본문에서 꺼내는 것 | `day_index`, `strokes_total`, `envelope_ver`, `sim_ver`뿐. 시간대 패턴·부재 길이 같은 값은 **열로 꺼내지도, 색인하지도, 관리 도구에 보여 주지도 않는다**(5-1) |

#### 3-4-1. 이력 데이터 모델 — 최대 4주·충돌본 30일 (B2) [v2.2, A4 리뷰 I1·I3·I4·I6 반영]

**칸 넷과 보관** — 기간과 개수 중 **먼저 걸리는 쪽**으로 지운다(I1).

| `reason` | 언제 생기나 | 개수 상한 | 기간 상한 |
|---|---|---|---|
| `overwritten` | `PUT`이 현재본을 덮을 때(이번 주 `weekly`가 이미 있으면) | 최근 3벌(PUT 안에서) | **28일**(`pg_cron`) |
| `weekly` | `PUT`이 현재본을 덮을 때 **이번 ISO 주(서버 UTC)에 `weekly`가 없으면** 덮이는 본을 여기로 | 주마다 1벌 | **28일** |
| `conflict` | ① `PUT … resolve:"keep_mine"`이 덮은 서버 본 ② `POST /saves/main/conflicts`로 올린 이 기기의 진 본 | 최대 3(4번째가 오면 가장 오래된 것부터) | 30일 |
| `pre_restore` | `restore`가 덮기 직전의 현재본 | 최대 3 | 30일 |

- 그래서 일반 이력(`overwritten`·`weekly`)은 **어떤 경우에도 28일을 넘지 않고**, 충돌·복원 전 본은 30일을 넘지 않는다 — 처리방침 6절 '최근 3벌 + 주 1벌 최대 4주, 충돌·복원 전 본 30일'과 같다. 한 몽망이의 이력은 많아야 3 + 4 + 3 + 3 = 13벌.
- '주'는 서버 UTC 기준 ISO 주(`to_char(now() at time zone 'UTC', 'IYYY-"W"IW')`) [팀 추정]. 서버는 사용자 시간대를 열로 갖지 않는다(5-1).
- 이력 `id`는 `bigserial`이지만 **API에는 행의 `uuid`(열 `public_id uuid UNIQUE default gen_random_uuid()`)만 내보낸다** — 순번이 전체 규모를 드러내지 않게(I4).

**잠금 규칙(I4)**: `PUT`·`restore`·`POST /conflicts`는 모두 **먼저 `saves` 행을 `FOR UPDATE`로 잡는다**. 그래서 같은 몽망이의 쓰기는 줄을 서고, `conflict` 3·`pre_restore` 3·`weekly` 주 1벌이 동시 요청에서도 지켜진다. `saves` 행이 없을 때의 `conflicts`는 `404`(맡긴 본이 없으면 충돌도 없다).

**`PUT /saves/main` 트랜잭션**

| 경우 | 처리 | 응답 |
|---|---|---|
| 행 없음 + `If-None-Match: *` | `INSERT … ON CONFLICT (creature_id) DO NOTHING RETURNING rev`. 행이 나오면 끝. **안 나오면(첫 PUT이 동시에 둘)** 트랜잭션을 다시 시작해 아래 '행 있음' 규칙으로 한 번 재시도 — 같은 본이면 `200`, 다른 본이면 `409 {server: meta}`(결정적) | `200 {rev:1, sha}` / 재시도 결과 |
| 행 없음 + `If-Match` | (서버 백업 복원 등으로 서버가 사본을 잃음) | `409 {server: null}` → 앱은 `If-None-Match: *`로 다시 올림 |
| 행 있음 + `If-None-Match: *` | — | `409 {server: meta}` |
| 행 있음 + `If-Match ≠ rev` | 서버 `sha` == 받은 본 `sha`면 빨리 감기 | `200 {rev, sha}` / `409 {server: meta}` |
| 행 있음 + `If-Match = rev` + 같은 `sha` | 아무것도 쓰지 않음 | `200` |
| 행 있음 + `If-Match = rev` + 다른 `sha` | ① 덮이는 현재본을 이력에: `resolve:"keep_mine"`이면 `conflict`, 아니면 `INSERT … reason='weekly', iso_week=$w ON CONFLICT (creature_id, iso_week) WHERE reason='weekly' **DO NOTHING** RETURNING id` → 행이 안 나오면 `overwritten`으로 INSERT(I3 — UNIQUE 위반으로 트랜잭션이 깨지지 않게) ② `saves` UPDATE(`rev + 1`) ③ `overwritten`·`conflict`를 최신 3개만 남기고 DELETE ④ 달이 바뀌었으면 `users.last_active_month` | `200 {rev, sha}` |

- 서버 `rev`가 백업 복원으로 뒤로 가 기기의 `If-Match`가 더 크면 그냥 `409` → 나란히 고르기로 간다(의도, S8).

**`restore`·이력 조회**: 조회는 언제나 `WHERE public_id = $id AND creature_id = $c`(본인 소유, I4). 없으면(남의 것·`pg_cron`이 막 지운 것 포함) **`404`**. `restore`는 `If-Match`가 맞으면 현재본을 `pre_restore`로 넣고(최신 3개만 남김) 고른 이력 본을 새 현재본(`rev + 1`)으로 쓴다. 고른 이력 행은 지우지 않는다. **성공 뒤 앱은 `GET /saves/main`으로 새 현재본을 받아 로컬에 쓴다**(안 하면 다음 `PUT`이 409, S7). `validated=false` 본은 목록에 보이되 앱이 못 읽으면 '이 기기에서는 열 수 없어요'(작가 몫).

**남용 상한(I6)** — 검증 안 된 본·익명 계정으로 DB 디스크를 채우지 못하게.

| 상한 | 값 [팀 추정] | 넘으면 |
|---|---|---|
| 본문 크기 | 압축 전 **512KB**, gzip 뒤 **256KB**(압축이 안 되는 쓰레기 차단. 보통 본 30KB, 최대 약 100KB) | `413` |
| 세이브 스키마 상한 | `envelope_ver`·`sim_ver`가 서버가 아는 값(`/healthz`의 `saveSchema`·`simSchema`)보다 **1 이하로만** 클 때 `validated=false`로 받는다. 2 이상 크면 `422 future_too_far` | 미래 본은 **원문 보관만**(파싱·메타 추출 없음, `day_index`·`strokes_total`은 NULL) |
| 몽망이당 하루 새 이력 바이트 | 4MB/일(압축 뒤) | `429 save_quota` → 앱은 다음 날 조용히 다시 |
| `POST /conflicts` | 사용자당 10/일 | `429` |
| 익명 계정 생성(`bootstrap`·`recover`가 새 `user_auth`를 만들 때) | **IP 접두당 5/시간·20/일**, 서비스 전체 하루 새 계정 상한 `ACCOUNT_NEW_PER_DAY`(기본 5,000) | `429` / 전체 상한은 `503` + 운영 알림 |
| DB 디스크 | Supabase 디스크 70%·85% 알림(6-4 모니터링) | 사람 판단 |

**`pg_cron` 솎기(매일 04:00 KST, 2-4 ②)**
```sql
DELETE FROM app.save_versions
 WHERE (reason IN ('overwritten', 'weekly') AND created_at < now() - interval '28 days')
    OR (reason IN ('conflict', 'pre_restore') AND created_at < now() - interval '30 days');
```

**용량**(맡겨 두기 4만 명 [팀 추정]): 평균 이력 5벌 × 압축 약 15KB ≈ 3GB + 현재본 0.6GB → Pro 포함 8GB 안. 상한 덕에 계정 하나의 최악은 13벌 × 256KB ≈ 3.3MB, 하루 4MB. 솎기는 PUT 안 삭제 + 하루 한 번 배치뿐이고 행을 UPDATE로 고치지 않는다(INSERT·DELETE만).

**B2 e2e 필수**
1. 같은 주 PUT 5번 → `weekly` 1 + `overwritten` 3.
2. **'최대 4주' 시험(I1)**: 1주 차에 PUT 4번(`weekly` 1 + `overwritten` 3) → 그 뒤 올리지 않음 → 시각을 29일 뒤로 주입하고 솎기 실행 → `overwritten`·`weekly` **0벌**, 현재본만 남음. 같은 시나리오에서 `conflict`는 30일 경계(29일 남음·31일 삭제).
3. 동시 PUT 둘(같은 `If-Match`) → 하나 `200`·하나 `409`, `weekly` 1벌.
4. **첫 PUT 동시 둘** → 500 없이, 같은 본이면 둘 다 `200`, 다른 본이면 하나 `200`·하나 `409`.
5. 반쯤 성공 재전송 → `200` 빨리 감기. 행 없음 + `If-Match` → `409 {server:null}`.
6. `keep_mine` → 서버 본이 `conflict`. `conflicts` 4번 → 3벌. 동시 `restore` 둘 → `pre_restore` 상한 지킴.
7. 남의 `public_id`로 `GET versions/{id}`·`restore` → `404`.
8. gzip 256KB 넘는 본 `413`, `sim_ver` +2 본 `422`, +1 본 `200 validated:false`.
9. 삭제 직후 옛 토큰 `PUT` → `401`(3-8).

### 3-5. 공유 링크와 웹 뷰어 — 정적 먼저, 살아 있는 몽망이는 나중에 [v2.2]

**링크 코드**(v1 그대로): `https://mongmang.ink/m/K7M3QX9P`, 표시는 `K7M3-QX9P`. 서버가 `crypto.randomBytes(5)`로 40비트 발급, 몽망이 한 마리에 평생 하나. **`sealSeed`에서 파생하지 않는다**(32비트라 열거 가능) — 인장 **무늬**는 `sealSeed`, 링크 **코드**는 서버 난수. 추측 불가성: 활성 링크 100만 개·404 IP당 분당 30회면 하루 기대 적중 약 0.04 [팀 추정].

**공개 사본 — 링크를 켤 때 값으로 고정**(기획 2-2·6-3)

| 넣는다(`snap.json` + `public_pages.meta`) | 빼는다 |
|---|---|
| 파생 획(획마다 ≤64점, θ·d를 int16로) + attach | 원본 점열의 시간 t·필압 p |
| 타고남 요약(체형·빗), 먹, 결 이름(이레 뒤) | `relation.hour`·`todayHour`·`spot`·`lastSeenAt`·부재 길이 |
| 이름(**`nameVisible`이고 금칙어 통과일 때만**) | 성향 원값, 정 일수, 태어난 시진·ms 시각 |
| 태어난 날짜(현지 날짜), **켤 때의** 날 세기, 언어 | 계정 id, 기기 정보, 위치 |

- 스냅숏의 형식·검증·**서버가 직접 쓰는 규칙**(기기는 이 파일을 올리지 않는다, 리뷰 C2)은 **3-5-1이 정본**이다. 같은 형식을 웹 뷰어·관리 도구 원형 보기·1.0 직후 밤물·동기가 그대로 쓴다(3-13).
- 갱신은 **'링크 켜기'와 '다시 만들기'(이름 공개를 바꿀 때 포함)** 때만. 매일 바뀌지 않으므로 링크를 아는 사람이 주인의 접속 리듬을 읽을 수 없다.
- **이름 공개**: 검사 순서·표면·이스케이프는 **3-5-2가 정본**이다.
- `public_pages.meta` = `{snap:1, name?, ink, texture?, bornDate, dayAtPublish, lang}` — `snap.json`의 같은 이름 필드를 그대로 복사한 것(3-5-1)이고 HTML의 한 줄·`<title>`·`og:title`에만 쓴다. `name`은 3-5-2의 '이름이 실린 판'일 때만 있다.

**파일(포스터·OG·루프는 앱이 만들어 올리고, 스냅숏은 서버가 씀)**

| 파일 | 규격 | 상한 |
|---|---|---|
| `poster.jpg` | 4:5 1080×1350 첫 프레임(한지 위 그 아이, '획 → 몸'의 마지막 장면) | 250KB |
| `og.jpg` | 1200×630, 같은 `cardTextBoxes` 배치에 가로 여백 틀, 이름은 3-5-2 | 150KB |
| `loop.mp4` | **8초 '획 → 몸'**, H.264, **540×676**(PM 11-20 개정: 675 → 676 — H.264 4:2:0은 홀수 높이 불가), 무음, 24fps — D-18 인코더의 웹 전용 저용량 설정 | **600KB** |
| `snap.json` | 공개 스냅숏 — 서버가 씀(3-5-1) | 32KB |

- **`commit` 검사(v2.1)**: 파일 셋의 존재·크기·**시그니처**(JPEG `FF D8 FF`, MP4 `ftyp` 상자)·해상도(JPEG SOF 헤더)를 확인한다. 픽셀 내용은 보지 않는다 — 조작된 앱이 아무 이미지나 OG로 걸 수 있다는 위험은 막을 수 없고, **신고 → 격리로 감수한다**(10절 #23). 이름 금칙어도 OG 픽셀에는 적용되지 않는다(정상 앱은 `nameAllowed`를 따른다). 루프는 여기에 더해 faststart·길이·해상도·무음을 본다(3-5-3) [v2.2].
- **업로드는 비공개 `page-staging` 버킷으로 받고, `commit`이 검사한 뒤 `public-pages`로 옮긴다**(A4 리뷰 I10 — 커밋 전 파일이 공개 주소로 읽히지 않게). 버려진 업로드·판 전환·수명은 **3-5-3이 정본**이다.

**페이지 `/m/{code}` — 정적 먼저**(기획 2-2, 리뷰 I2)

1. Nest가 템플릿 문자열로 HTML을 만든다(React SSR 없음). **인라인 CSS 포함 30KB 미만**. 첫 화면 = 한지 배경 + `<img poster>`(preload) → `<video autoplay muted playsinline loop poster>`(있으면) + 스토어 버튼 2개 + 보조 줄 "송연먹 · 느긋결 몽망이를 보셨군요" + 작은 '알리기'. **카카오톡·인스타 인앱 브라우저는 여기서 완결**(Q10: 첫 페인트 1초).
2. 첫 페인트 뒤(`load` + `requestIdleCallback`) **조건이 다 맞을 때만** `/w/live.{hash}.js`(약 40KB gzip [팀 추정])를 불러온다: WebGL2 가능 · `navigator.connection.saveData` 아님 · `prefers-reduced-motion` 아님 · `/config/v1.json`의 `webLive`가 켜짐.
3. `live.js`는 `/w/ck/{ver}/canvaskit.wasm`(약 3MB gzip [확인 필요: 쓰는 빌드의 실제 크기])과 `snap.json`을 받아, `@mong/core`의 몸 생성 + 작은 CanvasKit 페인터로 **숨 쉬고 눈 깜빡이며 톡 치면 빗이 흔들리는** 몽망이를 그리고, 준비되면 포스터·영상 자리를 페이드로 바꾼다. 실패·시간 초과(5초)면 아무것도 바꾸지 않는다. 소리는 첫 탭 뒤 짧은 허밍만(기획 11-6, 미정이면 무음).
4. 이미지가 404면(숨김 직후 캐시된 HTML) `onerror`로 빈 한지 + '사라진 링크' 문구로 바뀐다(3-9).

- **언어(v1에서 바뀜)**: v1은 `Accept-Language`로 골랐는데, 그러면 CDN 캐시가 언어마다 갈라져야 한다(Firebase Hosting의 `Vary: Accept-Language` 처리 **[확인 필요]**). v2는 **HTML 기본 언어 = 주인의 `lang`**(링크는 주인의 말로 퍼진다) + 두 언어 문구를 페이지에 함께 넣고 인라인 스크립트가 `navigator.language`로 고른다. 캐시 키는 URL 하나.
- **OG 메타**: `og:image` = `og.jpg`, `twitter:card=summary_large_image`, `og:title`은 3-5-2 표, `og:description` = 보조 줄. `og:video`는 넣지 않는다(미리보기 호환성 [팀 추정]).
- **검색**: `noindex`, 랜딩 `/`만 색인. 목록·사이트맵 없음.
- **딥링크**(v1 그대로): iOS 유니버설 링크(AASA `/m/*`) + Android 앱 링크(`assetlinks.json`에 **EAS 업로드 키와 Play 앱 서명 키 SHA-256 둘 다**). 앱이 있으면 이름표처럼 카드만 보여 주는 시트. 디퍼드 딥링크는 하지 않는다.
- **공유 직후 데우기**: 앱은 `commit` 성공 뒤 `/m/{code}`를 한 번 `GET`해 CDN에 올려 둔다(SNS 크롤러가 콜드 스타트를 만나지 않게, v1 반증 #8). **그 사용자 근처 엣지만 데운다** — 한국 사용자 공유의 카카오 크롤러(국내)에는 효과가 있고, X·iMessage 크롤러(미국 엣지)에는 적다(리뷰 S8).
- **코드 회전**: 링크 코드는 평생 하나라, 끈 뒤 다시 켜면 같은 주소가 살아난다. 특정 상대에게 보낸 링크를 끊고 싶은 주인을 위해 '새 주소로 다시 만들기'(코드 회전)를 **1.0.x 후보**로 둔다(리뷰 S12). 인장 무늬는 `sealSeed`라 영향 없다.

#### 3-5-1. 공개 스냅숏 `snap:1` 형식·크기 상한 [v2.2, A4 리뷰 I7·I8 반영]

기획 6-2 '`public_meta`에 파생 획 스냅숏(≤64점 × 획 + attach + 타고남 요약)'의 형식이다. **정본 = core `toPublicSnapshot(state, opts)` / `parsePublicSnapshot(json)`**(로드맵 'core 함수', 순수 함수, 의존성 0). 웹 뷰어·관리 도구 원형 보기·1.0 직후 밤물·동기가 같은 함수로 읽는다. 원격 계약이 아니라 core 산출물이라 `@mong/contract`에 두지 않는다. 아래 표와 core가 다르면 core 테스트가 정본이고 이 표를 고친다. **원칙: 웹이 앱과 같은 몸을 그리는 데 필요한 것만 싣고, 언제 그었는지·얼마나 비웠는지는 싣지 않는다.**

```json
{ "snap": 1, "traitV": 1,
  "born": { "date": "2026-12-22", "shape": 1, "comb": 2 },
  "ink": "songyeon", "texture": "neutgeut",
  "dayAtPublish": 9, "lang": "ko", "name": "몽이",
  "coreScale": 1310, "combGrowth": { "protrude": 640, "thick": 820 },
  "strokes": [ { "st": 0, "fixed": 0, "base": 0, "lv": 2, "tp": 1, "anc": 11, "n": 48, "pts": "<base64: int16 LE [θ, d] × n>" } ],
  "soak":    [ { "n": 16, "pts": "<base64: int16 LE [θ, d] × n>" } ] }
```
(값은 예시다.)

| 필드 | 값·양자화 | 상한·검증 | 원천(core) |
|---|---|---|---|
| `snap` | `1` | 다른 값이면 `422` | — |
| `traitV` | 타고남 축 판(M1 `TRAIT_VERSION`) | 정수 1~99 | M1 |
| `born.date` | 태어난 **현지 날짜**(시각·시진 없음) | 실제 날짜 | `birth.at` + 시간대 → 날짜만 |
| `born.shape`·`born.comb` | **공개 순간 렌더에 실제로 쓴 몸**: 체형 0~2, 빗 모양 0~3. 플래그 `birthTraits`가 꺼진 개체는 기본형 값(I7) | 범위 밖 `422` | `visual/traits.ts`·렌더 선택 |
| `ink` | 고른 먹 id(core `InkId`, 4개) | 열거 | `visual/ink.ts` |
| `texture` | 결 이름 id(8개). **이레 전이면 키 자체가 없다** | 열거 | `sim/temperament.ts` |
| `dayAtPublish` | **켤 때의** 날 세기 | 0~4000 | `dayIndex` |
| `lang` | 주인 언어 `ko`·`en` | 열거 | 앱 언어 |
| `name` | 3-5-2를 통과했을 때만 키가 있다. **서버가 넣는다**(앱이 보낸 스냅숏의 `name`은 무시) | core `normalizeName` 통과값 | 이름표 |
| `coreScale` | 핵 크기 × 1000(1000~1600) | 정수 범위 | `coreScale(n)` |
| `combGrowth` | 빗 성장 `{protrude, thick}` × 1000 — 상한에 닿은 뒤에는 `coreScale`로 획 수를 역산할 수 없어 따로 싣는다(I7) | 정수 0~4000 | `combGrowth(n)` |
| `strokes[]` | **개별 경로 획**, 그은 순서(배열 순서가 유일한 순서 정보) | **최대 24개**(시스템 4.3·4.4) | 렌더 선택과 같은 집합 |
| `strokes[].st` | **렌더 농도 단계**: 0 = 나이 0~7(`stroke-ink`), 1 = 8~11, 2 = 12~16, 3 = 17~20 [팀 추정 — 아트 4절 바램 시간표의 실제 단계 수를 core가 정함]. **깸 수 나이(`age`)는 싣지 않는다** — 나이 빈칸과 `born.date`·`dayAtPublish`를 맞대면 '어느 날 비웠나'가 읽혀서다(I8) | 0~3 | 시스템 4.3 |
| `strokes[].fixed` | 고정 획(첫 두름·낙관) `1` — 단계 없이 그린다 | `fixed=1`은 최대 3개 | 시스템 4.3 |
| `strokes[].base` | 받침 `1` / 두름 `0` — `strokeLabel(attach.theta)`(끝 둥글림·틈 없음 여부, I7) | 0·1 | `visual/pose.ts` |
| `strokes[].lv`·`tp` | 부착 단계, 끝 테이퍼 0/1 | 열거 | `Attach.level`·`taper` |
| `strokes[].anc` | **앵커 점 번호**(몸에 가장 가까운 점, `openGap`이 여기서 틈을 연다, I7) | 0 ≤ `anc` < `n` | `nearestIndex` |
| `strokes[].pts` | 파생 단순화 점(≤64)을 **핵 극좌표**로: `θ` = `(round(wrap2pi(θ)/2π × 65536) mod 65536) − 32768`(먼저 `mod` — 2π 근처가 32768이 되어 넘치지 않게, S2), `d` = `round(d × 4096)`이 int16 범위 `[−32768, 32767]` 밖이면 **`422`(자르지 않음)**. 점마다 `r1`은 싣지 않고 웹이 `born.shape`로 다시 계산 → int16 LE → base64 | **점 2~64개**, base64 길이 = `n × 4` 바이트 | `simplifyStroke` → `toCorePolar` |
| `soak[]` | **스밈 층** 획(나이 21~59)을 점 ≤16으로 다시 뽑은 것. 순서·나이 없음 | **최대 39개**, 점 2~16 | 같은 함수 + 재표본 |

- **빼는 것은 형식으로 막는다**: 점에 시간 `t`·필압 `p` 칸이 없다. 원본 점열·`relation.*`·`lastSeenAt`·성향 원값·정 일수·태어난 시진·ms 시각·깸 수 나이·계정 id·기기 정보는 필드 자체가 없다. 나이 60 이상 획은 싣지 않는다. int16 이진 형식이라 NaN·Infinity가 원천적으로 들어올 수 없다.
- 총 획 수는 `coreScale`·`combGrowth`로 대략 드러난다. 몸 크기는 포스터에 이미 보이는 정보라 받아들인다(전체 획 수만, 어느 날인지는 아님).
- **획이 24개를 넘을 때(S4)**: `toPublicSnapshot`은 **그 순간 앱 렌더가 고르는 획 집합과 같은 것**을 싣는다(개별 경로 = 나이 0~20 + 고정, 스밈 = 21~59). 스밈 층은 1.0 구현이라 그 전에는 `soak = []`이고 나이 21 이상 획은 싣지 않는다 — 웹과 앱이 같게 보이려면 앱 렌더도 같은 선택을 써야 하므로, 이 선택 함수가 core 착수 조건이다(아래).
- **`ring`**(번짐 고리 폭, 아트 후보 축)이 채택되면 필드를 더한 **`snap:2`**가 된다. `snap:1` 페이지는 다시 만들기 전까지 `snap:1` 그대로 그린다.
- **크기**: 획 24 × 64점 × 4B = 6,144B → base64 8,192자, 스밈 39 × 16점 × 4B → 3,328자, 필드·키 약 3KB → **최대 약 15KB**. 상한 **32KB**는 두 배 여유다. 보통(획 24 안팎) 약 9KB [팀 추정]. 양자화 해상도(θ 약 0.0055°, d 약 0.00024W)는 1080px에서 0.1px 미만이라 충분하다(S3).
- **서버 검증(B3, `PUT page`)**: ① 본문 32KB 초과 `413` ② `parsePublicSnapshot`이 **모든 층에서 모르는 키 하나라도 있으면** `422 unknown_key`, 범위·개수·base64 길이 불일치·`anc ≥ n` `422` ③ 통과한 객체를 **서버가 정규화해(키 순서 고정·공백 없음) 직접 `snap.json`으로 쓴다**(먼저 `page-staging`, 커밋 때 공개 버킷으로 — 3-5-3). 이 절이 '서버가 snap.json을 직접 쓴다'의 정본이다 ④ `name`은 3-5-2 판정 뒤에만 넣는다.
- **로그**: `snapshot`·`name`은 로그 가림 목록(5-2).
- **고정물**: core `fixtures/snap/*.json`(정상·이름 있음·이레 전·최대 크기·금지 키·`age` 키·점 65개·base64 길이 어긋남·`anc` 범위 밖·θ 2π 경계) — core 단위 시험과 서버 e2e가 같은 파일을 읽는다(4-3).

**core 함수 착수 조건(로드맵 'core 함수', A4 리뷰 6절)** — 다섯이 모두 맞아야 `toPublicSnapshot`을 시작한다.
1. 이 절의 필드표가 리뷰로 닫혔다(v2.2 리뷰 반영 = 이 판).
2. 렌더 선택 함수(개별 24·스밈 21~59·고정 3)가 core에 있거나, 1.0 전에는 '`soak` 비움·나이 21 이상 제외'로 앱 렌더와 같게 간다는 것을 core 담당이 확인했다.
3. `strokeLabel`·앵커 점(`nearestIndex`, 지금 모듈 안 함수)을 스냅숏 생성기가 쓸 수 있게 내보낸다(core 안 변경).
4. 농도 단계 `st`의 구간 수를 아트 4절 바램 시간표와 맞췄다.
5. `normalizeName`의 숫자 규칙(3-5-2)이 B2에서 들어갔거나 같은 PR에 들어간다.

#### 3-5-2. 이름 공개 `nameVisibility` — 검사·표면·이스케이프 (정본) [v2.2, A4 리뷰 I9 반영]

- **용어**: 기획 6-2의 `nameVisibility` = DB `creatures.name_visible`(기본 `false`, B1 구현) = API `nameVisible`. 켬/끔 두 값뿐.
- **이름 규칙 = core `normalizeName`**(`packages/core/src/sim/pillars.ts`, 앱 이름 입력과 같은 함수, 서버는 core 원본 번들로 같은 코드를 돌린다): NFC 정규화, 앞뒤 공백 제거·연속 공백 하나로, 허용 문자 = 한글 완성형·라틴·숫자·공백·가운뎃점, **한글이 들어가면 6자·아니면 12자**. 양방향 제어 문자·폭 없는 문자·다른 정규형은 허용 문자 검사에서 떨어진다.
- **요구사항(B2에서 core에 더함, 앱·서버 같은 함수)**: **숫자가 7개 이상 이어지면 거부**(`reason: 'digits'` — 전화번호 방지). 앱 입력 화면도 이 결과로 막는다.
- **이름이 실제로 실리는 조건(`nameShown`)** = `nameVisible` **그리고** 요청의 `name`이 `normalizeName` 통과 **그리고** 통과값이 받은 문자열과 같음(정규화로 바뀌었으면 거부) **그리고** 금칙어 통과 **그리고** `creatures.name_blocked` 아님. 하나라도 아니면 `nameAllowed:false`. 판정은 `PUT page` 때 한 번, 결과는 `public_pages.name_shown`. 판마다 고정.
- **서버가 이름을 갖는 곳**: `nameShown`인 판의 `snap.json`·`public_pages.meta.name`뿐. `nameVisible`이 꺼져 있으면 앱은 `PUT page`에 `name`을 보내지 않는다.

| 표면 | `nameShown` | 아님(끔·검사 실패·가리기 — 셋 다 같음) |
|---|---|---|
| `snap.json`·`public_pages.meta` | `name` 키 있음 | 키 없음 |
| `/m` HTML `<title>`·`og:title` | 이름 | **앱 이름**('몽망이 키우기' / 영문명) — 처리방침 5절과 같은 표현(S10) |
| `/m` HTML 캐시 | `s-maxage` 5분 + 링크 끄기·가리기 때 CDN 무효화(3-9) | 같음 |
| `/m` 보조 줄 | "송연먹 · 느긋결 몽망이를 보셨군요"(이름 넣지 않음, 문구는 작가 몫) | 같음 |
| `og.jpg`(앱이 그림) | 이름 있는 변형 | **이름 없는 변형** — 앱은 `nameAllowed`를 받은 뒤 그린다 |
| `poster.jpg`·`loop.mp4` | **그리지 않는다**(늘). 포스터·루프 렌더 함수는 **이름 인자를 아예 받지 않게 타입으로 막는다**(공유 꼬리표·두루마리 끝 장면 재사용 방지, C11 체크) | 같음 |
| 웹 뷰어 live | `snap.json`의 `name`으로 몸 아래 작은 세로 이름(아트 몫) | 없음 |
| 관리 도구 원형 보기 | 이름 보임(판정 근거) | 없음 |
| 1.0 직후 밤물·동기 | **늘 이름 없음**(`night_drops`에 `name` 없음) | 같음 |
| 앱 안 이름표·카드 | 공개 설정과 무관(기기 안) | 같음 |

- **이스케이프(B3 필수)**: `/m` HTML은 템플릿 문자열이라 이름·결 이름·먹 이름 등 **모든 데이터 값**은 ① 본문 텍스트: `& < > " '` 다섯 글자를 엔티티로 ② 속성 값: 같은 다섯 글자 + **늘 큰따옴표로 감싼 속성에만** 넣는다(따옴표 없는 속성·이벤트 속성·`href`/`src`·`<script>`·`<style>` 안에는 넣지 않는다) ③ `live.js`는 이름을 **`textContent`로만** DOM에 넣는다(`innerHTML` 금지 — 린트 규칙 후보) ④ 인라인 스크립트에 데이터를 박지 않는다(CSP 해시 고정, `snap.json`은 `fetch`로). 허용 문자가 좁아도(위 규칙) 이스케이프는 따로 지킨다 — 다층 방어. e2e: `<`·`"`·`&`가 섞인 이름 고정물이 금칙어 전 단계에서 떨어지는지, 떨어지지 않는 경로가 생겨도 출력이 이스케이프되는지.
- **바꿀 때**: 이름 공개는 OG 픽셀에 박히므로 **다시 만들기(새 판)로만** 반영. 링크가 켜져 있으면 앱은 `PATCH /creature {nameVisible}` 뒤 바로 `PUT page`. 꺼져 있으면 `PATCH`는 다음 켜기의 기본값만 바꾼다. 앱에서 이름을 바꿔도 다시 만들기 전까지 옛 이름.
- **검사에 걸리면**: `nameAllowed:false` → 앱은 이름 없는 OG를 올리고 '이 이름은 링크에 보이지 않아요'를 한 번 알린다(작가 몫). `nameVisible` 값은 그대로 둔다.
- **운영자 '이름 가리기'**(3-8 ⑤): CLI `ops:mask-name <code>`(B5, 0.3일 [팀 추정])가 ① `creatures.name_blocked = true` ② 지금 판의 포스터·루프를 새 `pageKey`로 복사하고 `name`을 뺀 `snap.json`을 서버 정규화로 쓰며 **`og:image`는 포스터로 대신** ③ `ver + 1`, 옛 경로 즉시 삭제(Smart CDN 약 60초) ④ **`/m` HTML CDN 무효화**(3-9) ⑤ `admin_actions` 기록 — 를 한 번에 한다. 그 뒤 그 몽망이의 `nameAllowed`는 늘 `false`. **해제는 운영자만**(`ops:unmask-name`), 주인 앱 안내 문구가 필요한지는 0-4 결정 대기. 처리방침 5절에 '운영자가 이름을 가릴 수 있다'는 B8. `name_blocked`는 B5 마이그레이션.

#### 3-5-3. 8초 루프 업로드 슬롯 — 업로드·저장·만료 (정본) [v2.2, A4 리뷰 I10·I11·S5·S11 반영]

판(`ver`)마다 슬롯 셋(포스터·OG·루프)이 있고 **루프는 선택**이다. 인코더(D-18 웹 저용량 설정)가 없거나 12-05 관문을 못 넘은 기기는 루프 없이 올리고 `has_loop = false`(웹은 포스터만으로 완결). 루프만 나중에 더하는 길은 없다 — 다시 만들기로 새 판.

**버킷 셋**: `page-staging`(**비공개**, 클라이언트 서명 업로드 전용) → `commit` 검사 → `public-pages`(공개 읽기, 클라이언트 쓰기 없음) / `quarantine`(비공개). 커밋 전 파일은 공개 주소가 없다 — 6시간짜리 무료 호스팅이 되지 않게(I10).

**판 전환의 자리**: `PUT page`는 `public_pages.pending_ver = ver + 1`, `pending_prefix` = 새 `pageKey`를 잡고 `snap.json`을 `page-staging/{pending_prefix}/`에 쓴 뒤 업로드 URL을 준다. `commit`이 검사를 통과한 파일을 `public-pages/{pending_prefix}/`로 옮기고 `path_prefix ← pending_prefix`, `ver ← pending_ver`, `pending_*`를 비운다. 커밋 전에 새 `PUT`이 오면 앞의 `pending_prefix`는 `storage_gc(uncommitted, not_before = 지금)`. `commit/{ver}`의 `ver`가 `pending_ver`와 다르면 `409`.

| 단계 | 무엇이 일어나나 | 상한·검사 | 실패하면 |
|---|---|---|---|
| ① 발급(`PUT page`) | 파일마다 `page-staging/{pending_prefix}/{poster.jpg,og.jpg,loop.mp4}`에 **서명 업로드 URL**. **콘텐츠 유형을 파일별로 고정**(포스터·OG `image/jpeg`, 루프 `video/mp4`, JSON은 서버만). `storage_gc(uncommitted, page-staging, +6시간)` | `bytes` ≤ 250KB·150KB·600KB. 유효 시간·1회성은 Supabase 기본값(약 2시간으로 알려짐)이 '5분·1회'와 다를 수 있다 **[확인 필요 — B3 첫날 시험]**. 사용자당 `PUT page` 20/일(3-8) | — |
| ② 올림(앱 → Storage 직접) | 앱이 그 URL로 PUT. 서버를 거치지 않는다 | `page-staging` 버킷 상한 `file_size_limit` 600KB·`allowed_mime_types` `image/jpeg`·`video/mp4`. **서명 업로드에도 버킷 상한이 걸리는지 B3 첫날 시험**(크기 남용과 직결) | 앱은 처음부터 다시(4-1) |
| ③ 커밋(`commit/{ver}`) | 서버가 각 파일 앞 64KB를 Range로 읽어 검사. JPEG: `FF D8 FF`·SOF 해상도. MP4: `ftyp` 상자, **`moov`가 `mdat`보다 앞(faststart)이고 64KB 안에 끝남**, `mvhd` 길이 **7.5~8.5초**, 영상 트랙 하나 `tkhd` **540×676**, 그 밖 트랙 없음(오디오·메타·텍스트 모두). **상자 크기 0·64비트 `largesize`·64KB 밖으로 넘는 상자·트랙 둘 이상은 모두 실패**(S11). 통과 → `public-pages`로 이동, `has_loop`, `uncommitted` 항목 삭제 | 실제 크기 ≤ 상한(Storage 메타) | `422 {file, reason}` — **판 전체가 `live`가 되지 않는다** |
| ④ 공개 | `/m` HTML `<video autoplay muted playsinline loop poster>`, 파일 캐시 `public, max-age=31536000, immutable`(판마다 새 경로) | — | 404면 포스터가 남는다 |
| ⑤ 다시 만들기 | 새 판 커밋 순간 옛 `path_prefix`를 `storage_gc(old_version, creature_id, +2시간)` — 캐시된 옛 HTML이 5분 안에 바뀌므로 2시간이면 넉넉하다 | — | 재시도는 2-4 Scheduler |
| ⑥ 링크 끄기 | 공개 파일 **즉시 삭제** → Smart CDN 무효화 약 60초 + `/m` HTML CDN 무효화(3-9) | — | `storage_gc(deletion)` 재시도 |
| ⑦ 신고 격리 | `quarantine` 버킷으로 이동, 최대 30일(3-8·3-9) | — | — |
| ⑧ 계정 삭제 | 3-8 연쇄 삭제 목록(공개·커밋 전·지난 판·격리 모두) | — | `storage_gc(deletion)` |

- **만료**: 링크가 켜져 있는 동안에는 시간 만료가 없다(공개 값 고정). 사라지는 길은 ③ 실패·⑤ 교체·⑥ 끄기·⑦ 격리·⑧ 삭제·미커밋 6시간뿐이다.
- 이름은 그리지 않는다(3-5-2 표). 커밋 검사는 **내용을 보지 않는다** — 조작된 앱의 내용 위험은 신고 → 격리로 감수한다(10절 #23).
- 01월 R2 이전은 8절(옮길 때 격리·삭제·무효화도 R2 쪽에 똑같이 걸어야 Q12가 지켜진다).

### 3-6. 지표 — 식별자 없이, 차원 3개 [v2.2]

**핑 하나의 모양**(정본 = `@mong/contract` `pingSchema`, B0 구현) [v2.2: 구현에 맞춤]

```json
POST /api/v1/ping
{ "cohortDay": "2026-12-22", "dayN": 3, "platform": "android", "appVer": "1.0", "lang": "ko",
  "dims": { "nt": "A", "wg": "-", "moon": "0" },
  "events": [ { "e": "open", "dayN": 3 }, { "e": "name_set", "dayN": 2 } ] }
```

- **모든 객체 strict**: 모르는 키(기기 id·세이브 씨앗·ms 시각 등)가 하나라도 있으면 핑 통째로 조용히 버린다(204). 자유 문자열 칸이 없다: 날짜는 일 단위, 차원·플랫폼·언어는 열거, `appVer`는 `^\d{1,2}\.\d{1,2}$`(**출시 판 `1.0`, 빌드 번호 없음** — 칸이 한 사람 단위로 갈라지는 것을 막음, B0 리뷰 I2) + 서버 설정 `METRIC_APP_VERSIONS` 목록 안. 새 판을 낼 때 이 목록을 먼저 늘린다.
- `dayN`(보내는 날)·`events[].dayN`(일어난 날) 0~400, 이벤트는 보내는 날 이전 **7일 안**, 한 핑 최대 32개, 보내는 날(`cohortDay + dayN`)이 서버 UTC 날짜 ±2일 밖이면 버림.
- `dims`는 핑 단위다. 앱은 **같은 `dims`를 가진 이벤트끼리 묶어** 보낸다 — 그래서 `moon`처럼 날마다 다른 차원도 이벤트마다 맞는 값이 실린다. 7일째 전 이벤트에 `wg ≠ '-'`가 섞이면 스키마가 거부한다.
- **열기 칸**: 하루 첫 실행 때 한 번 → `events` 안의 `{e:"open", dayN}` 항목 → `metric_daily(event='open', …)` +1. 같은 `dayN`은 기기에서 한 번만. **오프라인이면 열기도 그날의 `dayN`을 붙여 아웃박스에 넣는다**(이벤트와 같은 규칙).
- **켜지는 조건**(앱, `net/gate.ts`): 서버 주소가 있고 **사용자 동의**가 있을 때만. 설정 화면 토글이 연결되기 전에는 `METRICS_SETTING_CONNECTED = false`로 늘 꺼져 있다(처리방침 3-1이 끄기를 약속하므로 빌드 2 전 연결 필수, C11).
- **이벤트 칸**: 화이트리스트 이벤트는 일어난 날의 `dayN`을 붙여 아웃박스에 쌓았다가 다음 핑(또는 백그라운드 전환 때의 작은 핑)으로 보낸다. 한 번만 일어나는 이벤트(`first_tap`·`first_night`·`ire7`·`name_set`·`ink_chosen`·`cloud_on`)는 기기에서 **평생 한 번**만 보낸다 → '같은 코호트·같은 군의 개수 비율'이 '사람 비율'과 같아진다. 화이트리스트 10개는 늘리지 않는다.

**차원 3개(v2.1 다시 정의, 리뷰 C3)**

| 차원 | 값 | 정하는 법 | 쓰는 곳 |
|---|---|---|---|
| `nt` 이름 시점 군 | `A`·`B`만 | **설치 첫 실행 때 별도 로컬 난수**(`birth.seed`와 무관, 서버로 안 감)로 확정해 기기에 저장하고, **플래그와 무관하게 늘 보낸다.** 플래그 `nameTiming`은 '군 처리를 실제로 적용하느냐'만 정한다. v2의 `-`(플래그 꺼짐·배정 전)는 없앤다 — 첫 핑이 플래그를 받기 전에 나가면 분모는 `-`, 분자는 `A`로 갈라졌기 때문이다 | 이름 A/B |
| `wg` 위젯 | `1`·`0`, dayN < 7이면 `-` | **dayN = 7 첫 실행 때 위젯 유무를 한 번 재서 기기에 고정**한다(그 뒤 떼거나 달아도 바뀌지 않음). 날마다 바뀌는 값이면 D_n의 분모가 없기 때문이다. 재는 함수 = 위젯 로컬 모듈 `getInstalledCount()`(빌드 2 묶음, 4-2). 함수가 없는 기기는 `-` 그대로 | 위젯 리텐션(참고) |
| `moon` 보름 창 | `1`·`0` | **[v2.2 고정]** `moon = isMoonWindow(이벤트 현지 날짜, clock.tzOffsetMin) ? '1' : '0'` — core `packages/core/src/moon/phase.ts`(C4). 이벤트 현지 날짜 = `cohortDay + events[].dayN` = `metric_daily.day`라서 판정 SQL의 '보름 창 날짜 d'와 같은 축이다. **`nightDateOf`(04:00 경계)를 거치지 않는다** — 열기·이벤트는 '밤'이 아니라 그날 달력 날짜로 센다(보름 카드의 '밤의 날짜'와 다를 수 있음을 판정 보고에 적는다). 앱 연결 자리는 `net/index.ts`의 `isMoonWindow` 의존성(지금 비어 있어 늘 `'0'`) — **연결 전에는 핑을 켜지 않는다** | 보름 복귀(참고)에서 날짜 고르기 |

**계산식 — 판정 SQL `docs/ops/metrics/*.sql`로 고정, 판정 날 손으로 계산하지 않는다**

| 지표 | 식 | 규칙 |
|---|---|---|
| D_n(n = 1·7·14·30) | `Σopen(day_n=n) ÷ Σopen(day_n=0)`, 같은 코호트 묶음 | **`nt`·`wg`·`moon`을 모두 합산한 뒤** 계산 |
| 이름 A/B 주지표 | 군 g마다 `Σname_set(nt=g, day_n ≤ 6) ÷ Σopen(nt=g, day_n=0)` | `nameTiming`이 켜진 날 이후의 코호트만 |
| 위젯 리텐션(참고) | w마다 `Σopen(wg=w, day_n=14) ÷ Σopen(wg=w, day_n=7)`, 같은 식으로 30/7 | 7일째 살아 있던 사람 안의 조건부 리텐션. 인과 아님(위젯을 다는 사람이 원래 충성). **판정에 쓰지 않음** |
| 보름 복귀(참고) | 보름 창 날짜 d의 `Σopen(day=d, day_n ≥ 1, moon=1)` ÷ 앞뒤 7일 같은 요일의 `Σopen(day_n ≥ 1)` 평균 | **판정에 쓰지 않음.** 시간대 차이로 `moon`이 갈리는 날은 `moon=1` 칸만 센다 |
| D30 판정 | **기획 10-1 그대로**: 30일 지난 코호트의 `Σopen(day_n=0)` ≥ 300이면 윌슨 95% 하한 ≥ 3.5% / 미달이면 **D14 ≥ 10% 그리고 D14 ÷ D7 ≥ 0.6** | 핑이 12-22에 시작하면 01-21~01-26에 30일이 지난 코호트는 첫 4~5일치뿐이고, 수백 설치 규모에서 n ≥ 300은 어렵다 → **사실상 D14 대체 규칙이 판정한다**(판정 날 놀라지 않게 미리 적는다) |

**분모를 더럽히는 경로와 처리**

| 경로 | 처리 |
|---|---|
| 빌드 1 비공개 테스트 설치자(핑 없이 dayN=0을 지남) | 판정 SQL은 **`cohort_day ≥ 핑이 든 빌드 2의 배포일`**만 쓴다. 빌드 1 사용자도 `birth.at`으로 `cohortDay`를 정확히 보내므로 이 조건에 걸러진다 |
| 지표를 나중에 끈 기기 | 분모에는 남고 분자에서 빠져 리텐션이 **낮게**(보수 방향) 나온다. 끈 비율은 알 수 없다(세면 끄기가 아니다). 이름 A/B는 두 군에 같이 걸리므로 군 차이에는 영향이 작다. 판정 보고에 이 편향을 적는다 |
| 첫 실행이 오프라인 | 열기도 아웃박스(위) |
| 조작된 핑(인증 없음) | 값 범위 검증(위 '핑 하나의 모양'), 출시 판 목록, **인스턴스당 하루 새 칸 상한 2만**(넘는 새 칸은 버리고 개수만 로그). 판정 SQL에 **`Σopen(day_n=0)` ≤ 같은 날 스토어 콘솔 설치 수 × 1.2** 대조, 그리고 **단조 검사 `docs/ops/metrics/monotonic-check.sql`**(n일째 열기·평생 1회 사건이 설치일 열기보다 많은 코호트 묶음은 판정에서 뺌) [v2.2]. 한계: 리밋·상한은 인스턴스 메모리라 인스턴스 수만큼 느슨하다(`docs/ops/metrics/README.md`) |

- **칸 쪼개짐·원표 접근 [v2.2: 구현에 맞춤]**: 차원을 더하면 한 칸에 1~2명만 있는 칸이 생긴다. 식별자·IP를 저장하지 않지만 소규모(특히 비공개 테스트)에서는 설치일·플랫폼·언어로 한 사람 칸을 되짚을 수 있다(B0 리뷰 I2). 그래서 **원표 `metric_daily`는 서비스 롤(판정 SQL)만 읽고, 사람·대시보드는 `count ≥ 5`만 남긴 뷰 `metric_daily_k5`를 조회 롤 `metrics_reader`로만** 본다. 원표 내보내기 금지, 테스터 기간 원표 열람 금지(`docs/ops/metrics/README.md`). 칸 수는 하루 수천 칸 [팀 추정] — 90일 뒤 `app.rollup_metric_daily()`가 `metric_monthly`(날짜·`wg`·`moon` 없음, 코호트는 달)로 만다(2-4 ⑤).
- **쓰기 방식(v2.2: 구현에 맞춤, B0 리뷰 I4·I5)**: Cloud Run 기본 CPU 할당(요청 처리 중에만)에서는 요청 사이에 타이머가 돌지 않는다는 전제로 설계한다 **[확인 필요]**. (구현: `apps/server/src/metrics/metric-aggregator.ts`)
  - **요청 안 flush**: 인스턴스는 칸별 합계를 메모리에 모은다(칸 상한 5,000). 요청을 처리하다 **마지막 flush 뒤 10초가 지났거나 칸이 꽉 찼으면** 그 요청이 `unnest` 한 문장 `UPSERT … count = count + $n`을 시작하고 **최대 1.5초만 기다린다** — 넘으면 쓰기는 뒤에서 계속되고 응답 `204`는 바로 나간다. 쓰기가 실패하면 칸을 메모리에 되돌린다.
  - **중복보다 유실**: 앱은 응답을 받았거나 10초 시간 초과면 '보냄'으로 보고, **연결 실패만** 다시 보낸다(4xx·5xx·429 재전송 없음). 그래서 오류 쪽은 중복이 아니라 유실이고 리텐션은 낮게(보수 방향) 나온다 — 판정 보고에 적는다.
  - 종료 신호(SIGTERM, 축소 때 유예 10초)에서는 진행 중 쓰기를 기다린 뒤 남은 칸이 없어질 때까지 **최대 3번** flush한다(`beforeApplicationShutdown`). 강제 종료면 마지막 flush 뒤 분량을 잃는다.
  - CPU 상시 할당(인스턴스 과금)은 비용 때문에 쓰지 않는다. L3가 이 구조를 시험한다(7절).
- **지표 끄기**: 앱 설정에서 끄면 핑·이벤트·비콘 어느 것도 보내지 않는다.
- **링크 퍼널**: 페이지 인라인 스크립트가 `navigator.sendBeacon('/m/{code}/seen')`을 한 번 보낸다(쿠키·식별자 없음, `no-store`, Firebase 경로). 크롤러는 스크립트를 거의 돌리지 않아 자연히 빠진다. 같은 메모리 합산 → `link_daily(view)`. **대시보드 표기는 '고유 방문자'가 아니라 '페이지 로드 수'.** `/get` 302는 원래 Nest를 지난다. `link_daily`는 30일 뒤 코드 없이 말아 둔다(3-1).
- 설치 귀속: Play `utm_*`·App Store `pt`/`ct` 캠페인 링크 **[확인 필요: 콘솔에서 첫 링크로 검증]**.

### 3-7. 원격 기능 플래그 [v2.2]

정본 = `@mong/contract`의 `remoteConfigSchema`(앱, lenient)·`remoteConfigStrictSchema`(CI, strict). 파일 = `apps/web-static/src/config/v1.json` → `https://mongmang.ink/config/v1.json`(`Cache-Control: public, max-age=300`). 지금 배포본은 서버 스위치 넷만 `false`로 적은 최소본이다(B0).

```json
{ "v": 12, "ttlSec": 3600,
  "flags": { "cloud": false, "link": false, "remoteMotifs": false, "webLive": false,
             "nameTiming": true, "moonNight": true },
  "rollout": { "cloud": 0.2 },
  "minBundle": { "cloud": 3, "link": 4 },
  "minAppBuild": { "ios": 0, "android": 0 },
  "dreamUnlock": {} }
```

| 필드 | 규칙(contract) |
|---|---|
| `v` | 정수 ≥ 1. 올릴 때마다 1씩(PR 리뷰에서 확인) |
| `ttlSec` | **60~3600**(상한 1시간) |
| `flags` | 키는 아래 9개만(strict). **빠진 키 = 원격이 말하지 않음 → 앱 번들 기본값**. 서버 스위치 4개(`cloud`·`link`·`remoteMotifs`·`webLive`)만은 **늘 명시**해야 CI가 통과한다(끄는 손잡이가 파일에 보이게) |
| `rollout` | 키별 0~1. 기기 로컬 난수 < 값이면 켬(난수는 서버로 안 감). 빠지면 `{}` |
| `minBundle` | 키별 정수. 앱 `BUNDLE_SEQ` < 값이면 끈 것으로 봄. 빠지면 `{}` |
| `minAppBuild` | `{ios, android}` 필수. 바이너리 빌드 번호가 이보다 작으면 **원격 값을 통째로 무시**하고 번들 기본값 |
| `dreamUnlock` | `{모티프 id: 카드 수}` — 꿈 모티프 해금 앞당기기(dreams-30days 2-1). 앱은 `min(번들 값, 이 값)`만 쓴다(늦추지 못함). 빠지면 `{}` |
| 모르는 최상위 키 | CI 실패 / 앱은 지우고 읽음(새 키가 생겨도 옛 앱이 설정 전체를 버리지 않게) |

- 키: 기획 6-2의 5개(`nameTiming`·`jeongCaptions`·`moonNight`·`widget`·`webLive`) + 서버 기능 3개(`cloud`·`link`·`remoteMotifs`) + 기존 `hesitation` = `REMOTE_FLAG_KEYS` 9개. `webLive`는 **웹 뷰어만** 읽는다(3-5). 앱 기능과의 대응은 3-7-1.
- **앱 로더 상태(B0)**: `apps/mobile/src/net/remoteConfig.ts`가 캐시·TTL·포그라운드 15분·`minAppBuild`·`minBundle`·`rollout`을 구현했지만, **읽는 곳이 생길 때까지 `refresh`를 부르지 않는다**(B0 리뷰 m9). 크래시 루프 탈출과 `features.ts` 가운데 층 연결은 B4·C11에서 함께.
- **TTL을 6시간 → 1시간**으로(기획 6-1의 '6시간'과 다름 — 13절), 그리고 포그라운드 때 캐시가 15분보다 오래됐으면 다시 받는다. 소프트런칭 중 서버 기능을 끄는 손잡이가 6시간 늦으면 늦다. 파일은 1KB 정적이라 비용은 사실상 0.
- **`minBundle`(v2)**: 앱 JS에 OTA마다 1씩 올리는 상수 `BUNDLE_SEQ`가 있다. 플래그가 켜져 있어도 `BUNDLE_SEQ < minBundle[key]`면 끈 것으로 본다. → 버그가 있던 OTA 3을 받은 기기는, 고친 OTA 4가 나온 뒤 `minBundle.cloud = 4`로 올리면 그 기능만 꺼진다(3-11). **`BUNDLE_SEQ`는 바이너리 내장 값과 OTA를 통틀어 하나의 증가 값**이다 — 위젯 스토어 업데이트처럼 새 바이너리가 나가면 그 내장 SEQ는 앞선 마지막 OTA보다 커야 한다. 아니면 새 바이너리에서 기능이 꺼진다(리뷰 S9).
- 우선순위: **`FEATURE_DEFAULTS`(바이너리) < 원격 캐시 < 개발 메뉴**. 비율 배포는 기기 로컬 난수(서버로 안 감). 플래그로 끄는 건 화면·몸짓뿐, 세이브 필드는 늘 쌓는다. 크래시 루프 탈출(직전 실행이 적용 10초 안에 죽었으면 원격 값을 한 번 무시) v1 그대로.

#### 3-7-1. 원격 키 ↔ 앱 기능 대응 [v2.2 새로]

B0 보고(7-4 '연결 대기 ②')가 짚은 대로 원격 키 9개와 앱 `FEATURE_DEFAULTS`(`apps/mobile/src/features.ts`)의 키 이름이 다르고, 기획 6-2의 다섯 키는 앱에 아직 없다. 서버 쪽 정본은 원격 키이고, 앱은 아래 표대로 **`features.ts`에 같은 이름의 키를 더해** 가운데 층(원격)이 이름 그대로 덮게 한다(번역 표를 두지 않는다 — 이름이 같으면 대응 오류가 생길 자리가 없다). 앱 쪽 추가는 C 항목 몫이고 이 문서는 대응만 정한다.

| 원격 키 | 무엇을 켜나 | 읽는 곳 | 번들 기본값(제안) | 앱에 지금 | 켜는 때(9-2) | 끄면 |
|---|---|---|---|---|---|---|
| `cloud` | 맡겨 두기 UI·동기화 | 앱 | `false` | 없음 → 더함 | OTA #1(12-24 전후) | 올림 중단, 로컬 그대로 |
| `link` | 링크 켜기·다시 만들기 | 앱 | `false` | 없음 → 더함 | OTA #2(12-29 전후) | 새 켜기만 막음, 이미 켠 링크는 서버에 남음 |
| `remoteMotifs` | `content/v1.json` 받기·풀에 넣기 | 앱 | `false` | 없음 → 더함 | 01-08 전후 | 번들 모티프 25 + 보름 3만 |
| `webLive` | CanvasKit 지연 로드 | **웹 뷰어만** | `false`(웹 `live.js`의 기본) | 앱에 넣지 않음 | 01-05 전후 | 정적 페이지(포스터·루프) |
| `nameTiming` | 이름 시점 A/B **군 처리를 실제로 적용**(군 배정 `nt`는 플래그와 무관하게 늘 정해져 핑에 실림, 3-6) | 앱 | `true` | 없음 → 더함(C2) | 빌드 2부터 | 모두 **A**(D-20 개정 줄의 미판정 기본값). 판정 뒤 이긴 군을 모두에게 주는 것은 이 스위치가 아니라 OTA 기본값 변경 [팀 추정 — C2 담당 확인] |
| `jeongCaptions` | 정 신호 '처음 3번 자막' | 앱 | `true`(D-20: 출시 기본값) | 없음(M4 `relation` 하위) → 더함 | 빌드 2부터 | 자막 없이 몸짓만 |
| `moonNight` | 보름밤 카드·보름 모티프 | 앱 | `true` | 없음(C4는 core만) → 더함 | 12-24 전후 첫 보름 | 보름 사흘도 평소 꿈. **`moon` 핑 차원은 이 플래그와 무관하게 계산**(날짜 고르기용) |
| `widget` | 위젯 화면(스토어 업데이트 뒤) | 앱(+ 위젯 타깃이 App Group으로 읽음) | `false` | 없음 → 더함(C3) | 01-08 전후 | 위젯이 기본 그림만. **`wg` 측정은 무관**(7일째 `getInstalledCount()`) |
| `hesitation` | M4 서운 = 머뭇거림 | 앱 | `false` | **있음**(같은 이름) | 비네트 테스트 뒤 | 머뭇거림 없음 |

- `birthTraits`·`inkChoice`·`naming`·`nameMelody`·`temperamentLabel`·`relation`·`thumbLod`·`breathe`·`share`·`review`는 **원격 키가 아니다**(바이너리·OTA로 켜는 출시 기능, 개발 메뉴로만 덮음). 원격으로 끌 손잡이가 필요해지면 `REMOTE_FLAG_KEYS`에 더하는 contract PR + 처리방침과 무관함 확인 + 이 표 갱신을 한 번에 한다.
- iOS 2.3.1(3-11): 위 '켜는 때'가 소프트런칭 중인 키(`cloud`·`link`·`remoteMotifs`·`widget`)는 iOS에서 그 기능이 든 번들로 베타 심사를 받거나 심사 노트에 적은 뒤 켠다.

### 3-8. 남용 방지·신고·백업·삭제 [v2.2]

**클라이언트 IP — 어느 값을 믿나(v2.1, 리뷰 C1-4)**
- 경로가 둘이다. ① 앱 API = 클라이언트 → Google 프런트엔드 → Cloud Run(직접) ② `/m/**` = 클라이언트 → Firebase Hosting CDN → Cloud Run. 두 경로 모두 Nest의 `req.ip`는 클라이언트가 아니고, `X-Forwarded-For` 맨 왼쪽 값은 클라이언트가 마음대로 넣을 수 있다.
- 규칙: **신뢰하는 프록시가 붙인 값(오른쪽에서 N번째)만 쓴다.** N이 경로마다 다르므로 Fastify 전역 `trustProxy`는 끄고 `ClientIpService.clientIp(req, group)` 하나로 고정했다(B1 구현 `src/common/client-ip.ts`, 경로로 그룹 자동 선택). N = 환경 변수 **`TRUSTED_PROXY_HOPS_API`**(앱 직접)·**`TRUSTED_PROXY_HOPS_WEB`**(`/m/**`, Firebase 경유), 운영에서 0이면 부팅 거부. 체인이 짧거나 IP가 아니면 소켓 주소. **B6 첫날** 두 경로에 실제 요청과 가짜 XFF를 보내 N을 측정하고, 그 값을 e2e 고정물로 박는다 **[확인 필요]**(로컬 compose 값 API 1·WEB 2는 추정).
- 남는 구멍: 공격자가 Firebase를 건너뛰고 `*.run.app/m/…`을 직접 부르면 Firebase용 N이 맞지 않는다. B6 측정에서 두 경로를 구분할 표지(Firebase가 붙이는 헤더 등)가 없으면, `/m/**` 앞단을 **Cloudflare Worker**(DNS가 이미 Cloudflare)로 바꾼다. 그때는 Worker가 붙인 비밀 헤더와 `CF-Connecting-IP`만 믿는다(0.5일).
- **IP 접두**: 레이트 리밋·신고 키에는 IPv4 /32, **IPv6 /64로 접은 값**을 쓴다. IPv6 사용자는 /64를 통째로 받아 주소를 바꾸는 비용이 0이기 때문이다.

**레이트 리밋**(`@nestjs/throttler`, 인스턴스 메모리, 키 = IP 접두 또는 사용자) — [v2.2: 구현 구조] **전역 IP 접두당 120/분 카운터 하나**(`RATE_LIMIT_PER_MIN`)를 모든 경로가 함께 쓰고, 아래 경로별 한도는 같은 카운터의 더 낮은 천장(`@Throttle`)이다. 없는 경로의 404는 가드 전에 끝나 리밋을 받지 않으므로, `/m/{code}` '사라진 링크'는 실제 경로로 만들어 30/분을 건다(B3).

| 대상 | 한도 |
|---|---|
| `/ping` | IP 접두당 20/분 |
| `/m/*` 조회(Nest에 닿는 것) | IP 접두당 60/분, '사라진 링크'는 30/분 |
| `/m/*/seen` | IP 접두당 30/분(넘으면 조용히 버림) |
| `PUT /creature/page` | 사용자당 20/일, 파일은 3-5 상한·`image/jpeg`·`video/mp4`만, 서명 URL 1회·5분 |
| `PUT /saves` | 사용자당 60/시간 + 몽망이당 하루 새 이력 4MB(3-4-1) |
| `POST /saves/main/conflicts` | 사용자당 10/일 |
| 익명 계정 생성(`bootstrap`·`recover`) | IP 접두당 5/시간·20/일, 서비스 전체 `ACCOUNT_NEW_PER_DAY`(3-4-1) |
| `GET /deletion/{receipt}` | IP 접두당 30/분 |
| `/recover` | IP 접두당 5/시간, 글귀당 10/일 |
| `/m/*/report` | IP 접두당 5/시간 |
| Supabase 익명 가입 | 기본 30/시간/IP → CGNAT로 막히면 120 |

- 한계(리뷰 S7): 인스턴스 메모리라 min 0에서는 콜드 스타트마다 초기화되고, 인스턴스 수만큼(최대 3배) 새어 나간다. 소프트런칭에서는 감수하고, L5는 인스턴스 1개 기준으로 본다.
- **알림과 상한을 나눈다(리뷰 S10)**: *알림*(지출을 멈추지 않음) = GCP 예산 30·60·120달러, Firebase 전송량 알림. *상한*(실제로 멈춤) = Cloud Run max-instances 3, 공개 파일 버킷 상한. Supabase Spend cap은 켜 두면 한도를 넘을 때 전송·가입이 제한되어, **입소문이 난 순간에 링크 이미지가 끊길 수 있다** **[확인 필요]** → 소프트런칭에는 켜고, 정식 출시 전에 끄고 알림으로 바꿀지 정한다(리뷰 질문 3).
- **이름 공개**: 검사 규칙·표면은 3-5-2(정본).

**신고 → 자동 숨김(v2.1 다시 설계, 리뷰 C1)**
1. `POST /m/{code}/report` → 그 대상의 **열린 `reports` 행**을 찾거나 만든다. 새로 만들 때 **그 신고 전용 소금**(32바이트 난수)을 넣고 `window_ends_at = 지금 + 7일`로 둔다.
2. `reporter_key = HMAC-SHA256(reports.salt, IP 접두)`. **User-Agent는 넣지 않는다**(UA만 바꿔 세 번 신고하는 우회를 막는다). `report_hits`의 PK가 `(report_id, reporter_key)`라 같은 사람은 창 안에서 몇 번을 눌러도 1이다. 소금이 날마다 바뀌지 않으므로 '하루 간격 3회'도 1이다.
3. 창 안에서 서로 다른 키 **3개** → 즉시 자동 숨김: `state = quarantined`, 공개 파일을 `quarantine`으로 이동(약 1분 안에 공개에서 사라짐, 3-9), `status = auto_hidden`, **소금과 `report_hits` 행 삭제**.
4. 7일 안에 3에 못 미치면 창 종료: `status = expired`, 소금·`report_hits` 삭제. 다음 신고는 새 행·새 소금으로 시작한다.
   - → **판정 창 = 소금 수명 = 7일.** 소금이 대상마다 다르므로 대상끼리 신고자를 연결할 수 없고, 소금을 지운 뒤에는 IP를 되짚을 수 없다.
   - 소금이 살아 있는 7일 동안은 IPv4 전수 대입으로 되짚을 수 있다. 그래서 처리방침에는 **'신고 대상별로 최대 7일 보관하는 가명 정보'**로 적는다.
   - v2의 비밀값 `REPORT_HMAC_KEY`('소금과 별도의 고정 키')는 쓰지 않는다(공식과 비밀값 불일치 정리).
5. 운영자 확인 **7일 안**(3-12): 복원 / 확정 / 이름 가리기 / 기각. 상태 전이는 3-9. ~~SLA를 넘겨 격리 30일이 지나면 기본값은 확정~~ **[B5 리뷰 H2 개정] 격리 30일이 지나면 기본값은 복원** — 악성 신고가 운영자 부재로 영구 삭제(파일 손실)가 되지 않게. 복원 뒤 7일 면역(부록 A-3 #68·#69).
- 한계: ~~실제로 다른 회선·VPN을 쓰는 세 사람이면 숨길 수 있다.~~ **[B5 리뷰 H2 정정]** 실제 비용은 더 싸다 — IPv6 /64 접기에서는 /48을 가진 VPS 한 대 + 요청 3번, XFF hops가 틀리면 한 사람이 요청 3번. B5는 /48 접기·7일 면역·1시간 차단기·운영 기본 꺼짐(B6 XFF 실측 뒤 켬)·30일 복원 기본값으로 막는다. 남는 비용 = 서로 다른 /48(또는 IPv4) 셋. 격리라 되돌릴 수 있고, 반복 대상은 `reports` 1년 이력으로 본다. 기획 6-5 문구 수정은 13절.

**백업**: Supabase Pro 일일 백업(보존 7일). PITR은 사지 않는다(앱이 정본). **복원 리허설에서 운영 데이터를 스테이징에 넣지 않는다**(리뷰 S11 — 스테이징은 Free이고 접근 범위가 넓으며, 지운 사용자도 함께 되살아난다). 운영 백업을 **새 임시 프로젝트**에 복원해 확인한 뒤 바로 지우거나, 시드 데이터로 한다. 첫 회는 B7.

**삭제(파기) 절차(v2.2, A4 리뷰 I5·I11)**
1. **앱 안**: `DELETE /me` → `202 {receipt}`. **연쇄 삭제 목록**(정본 — 다른 절은 여기를 가리킨다):

   | # | 무엇 | 언제·어떻게 |
   |---|---|---|
   | ① | 지울 Storage 경로를 먼저 모은다: `public_pages.path_prefix`(공개 판), **`pending_prefix`(커밋 전 판, `page-staging`)**, 격리본(`quarantine`), **그 몽망이의 `storage_gc` 대기 항목**(`creature_id`로 — 지난 판 2시간 유예분 포함) | 트랜잭션 시작 전 |
   | ② | 트랜잭션: `deletion_log`(영수증 해시, 수명 24시간) INSERT → 모은 경로를 `storage_gc(reason = deletion, creature_id, not_before = 지금)`으로, 기존 대기 항목도 `not_before = 지금`으로 당김 → 그 코드의 `link_daily` 행 삭제 → `users` 삭제(CASCADE: `user_auth`·`creatures`·`saves`·`save_versions`·`public_pages`) | 한 트랜잭션 |
   | ③ | Storage 삭제를 **요청 안에서 바로 한 번** 실행(실패분은 `storage_gc`가 04:30 Scheduler에서 재시도) | 커밋 뒤 |
   | ④ | `/m/{code}` CDN 무효화 요청(3-9, 묶음 처리) | 커밋 뒤 |
   | ⑤ | Auth Admin으로 이 사용자의 **모든 `sub`**(살아 있는 것 + 되찾기로 끊긴 것)의 `auth.users` 삭제 | 커밋 뒤, 실패하면 재시도 대기열 |
   | ⑥ | `deletion_log.completed_at` → 영수증 조회가 `done` | 모두 끝난 뒤 |
   | — | **남기는 것**: `reports`(코드만, 1년 — 재발 판단), `metric_*`(식별자 없음), 백업 속 사본(7일 뒤 소멸) | — |

   - **되살아남 막기(리뷰 I1)**: ① `bootstrap`·`recover` 외 모든 JWT API는 `user_auth` 행이 없으면 `401` ② `bootstrap`은 Auth Admin으로 `auth.users` 존재를 확인한다 — 삭제된 계정의 남은 액세스 토큰(최대 1시간)으로 아웃박스 `PUT`이나 재시도 `bootstrap`이 와도 행이 다시 생기지 않는다 ③ 앱은 `202`를 받으면 세션·아웃박스·`cloud.*` 메타를 바로 비운다. e2e: '삭제 직후 옛 토큰으로 `PUT` → `401`'.
2. **웹 `/delete`**(Play 계정 삭제 정책의 웹 링크): **인장 코드와 되찾기 글귀가 둘 다 맞을 때만** 처리한다(7일 안 — B2 구현은 **즉시**: 정적 폼 → `POST /api/v1/deletion/web`, 부록 A-3 #25).
   - 인장 코드는 링크 URL에 공개된 값이라 그것만으로는 본인 확인이 안 된다(리뷰 I5). 그래서 **글귀가 없는 요청은 처리하지 않는다.** 이유와 대안(앱 안 '지우기', 앱을 2년 열지 않으면 자동 정리)을 `/delete`에 적는다. 링크만 켜고 맡겨 두기를 안 켠 사용자는 글귀가 없다 → 리뷰 질문 7.
   - ~~처리한 뒤 받은 메일(글귀 평문 포함)은 지운다(런북).~~ **[B2에서 대체됨]** 메일로 글귀를 받지 않는다 — 웹 폼이 API로 바로 보낸다(처리방침 12절 '글귀를 이메일에 적지 마세요'). 혹시 메일로 글귀가 오면 처리하지 않고 웹 페이지를 안내한 뒤 그 메일을 지운다(런북).
   - 시도 한도: `/deletion/web`은 IP 접두당 5/시간(`web_delete_ip`)과 글귀당 10/일(`/recover`와 같은 글귀 버킷). IP 버킷이 `/recover`와 따로라 IP 하나가 글귀를 대 볼 수 있는 횟수는 사실상 10/시간이다 — 80비트 공간이라 위험은 없다(B2 리뷰 I3). 두 한도 모두 `test/cloud.db.test.ts`가 고정.
3. 백업 속 사본은 7일 뒤 소멸한다. **백업에서 복원하면** 그 사이 지운 계정이 되살아나므로, `deletion_log.subject_hmac`(지운 user id의 단방향 HMAC, **백업 보관 기간과 같은 7일**만, `app.expire_deletion_log`가 NULL로)으로 복원 직후 다시 지운다 — `POST /internal/cron/reapply-deletions`, 절차는 `docs/ops/restore-runbook.md` [B2 리뷰 m2].
4. 장기 미사용 — 5-5.
- Apple 5.1.1(v): 익명 자동 계정도 보수적으로 같은 대상으로 본다(앱 안 삭제를 '맡겨 두기'·'링크'와 같은 OTA에).

### 3-9. 링크 끄기·신고 숨김의 캐시 정책 — Q12 [v2.1]

기획 Q12: "앱 안 표시·JSON은 즉시, `/m` HTML·OG 캐시는 최대 1시간(`s-maxage` 3600), 신고 3건 자동 숨김 시 이미지 파일 삭제로 즉시 안 보임". 층마다 무엇이 언제 사라지는지:

| 층 | `Cache-Control` | 링크 끄기(주인) | 신고 자동 숨김 | 다시 만들기 |
|---|---|---|---|---|
| 앱 안 표시(`GET /creature`) | `no-store` | **즉시** | 즉시(주인 앱에 '잠시 가려졌어요 — 확인 중이에요', 문구는 작가 몫) | 즉시 |
| API JSON 전부 | `no-store` | 즉시 | 즉시 | 즉시 |
| `/m/{code}` HTML(살아 있는 링크) | `public, max-age=60, s-maxage=300` [v2.2, A4 리뷰 I9] | **CDN 무효화 호출**(아래) → 약 1분, 무효화가 실패해도 **최대 5분** 옛 HTML(이미지는 이미 없어 빈 한지 + '사라진 링크') | 같음(+ 이름 가리기 때도 무효화) | 최대 5분 옛 판 HTML → 옛 판 파일은 **2시간 유예 뒤** 지워 깨지지 않음 |
| `/m/{code}` '사라진 링크' | `public, max-age=60, s-maxage=60` | — | — | 끈 뒤 다시 켜면 최대 1분 안에 살아남 |
| 공개 파일(포스터·OG·루프·스냅숏) | `public, max-age=31536000, immutable`(판마다 새 경로) | **즉시 삭제** → Supabase Smart CDN 무효화(약 60초) **[확인 필요]** | **즉시 격리 이동** → 같은 무효화(**약 1분 안**) | 새 경로라 캐시 문제 없음 |
| `/config/v1.json`(`webLive`) | `max-age=300` | — | — | — |
| 이미 본 사람의 브라우저 | — | 이미 받은 파일은 남는다(통제 밖) | 같음 | — |
| **외부 미리보기 캐시**(카카오톡·X·iMessage) | 통제 밖 | 이미 붙여진 미리보기 카드는 남을 수 있다. 카카오는 공유 디버거로 캐시 초기화 **[확인 필요]** → 확정 숨김 런북에 포함 | 같음 | 같음 |

**공개 사본 상태 전이(v2.1, 리뷰 I6)**

| 지금 상태 | 주인 `PUT`(켜기·다시 만들기) | 주인 `commit` | 주인 `DELETE`(끄기) | 신고 3 | 운영자 |
|---|---|---|---|---|---|
| (없음)·`off` | 새 판 발급 | → `live` | `204`(이미 꺼짐) | — | — |
| `live` | 새 판 발급(지난 판 2시간 유예) | → `live`(새 판) | → `off`, 파일 즉시 삭제 | → `quarantined` | 확정 → `removed` |
| `quarantined` | **`409`** | **`409`** | `link_enabled=false`만, 격리본은 운영 판단까지 둠 | (이미 격리) | 복원 → `live` / 확정 → `removed` / **30일 경과 → `removed`(기본값, 3-8 ⑤)** |
| `removed` 또는 `creatures.hidden` | **`409`** | **`409`** | `204` | — | 운영자만 되돌림 |

- 주인 앱은 격리 중 '다시 만들기' 단추를 숨긴다(다시 만들기를 유도하지 않게).
- 결론: Q12는 이 설계로 통과 가능하다. 다만 **'즉시'는 Storage CDN 무효화 때문에 '약 1분 안'이 정직하다.** Q12 문구 보강을 제안한다: "신고 자동 숨김은 약 1분 안에 공개 경로에서 사라진다. 외부 서비스가 이미 만든 미리보기 카드와 이미 내려받은 브라우저 캐시는 범위 밖이며, 카카오는 런북으로 초기화한다"(13절). Smart CDN은 스테이징 Free에 없을 수 있어 **Q12 검증은 운영 설정에서** 한다.
- **CDN 무효화(B3 체크 항목)**: 링크 끄기·신고 격리·운영자 이름 가리기·계정 삭제 때 서버가 Firebase Hosting **새 릴리스 생성**(Hosting REST `sites.releases.create`로 지금 버전을 다시 릴리스 — 경로별 지우기 API가 없어 사이트 전체 캐시가 비워진다 **[확인 필요: 전파 시간·호출 한도]**)을 부른다. 여러 건은 **1분에 한 번으로 묶어** 부른다(릴리스 폭주 방지). 서비스 계정 권한은 Hosting 릴리스만. 실패하면 5분 `s-maxage`가 바닥이다. B0의 `firebase.json`은 아직 `s-maxage=3600`이므로 **B3에서 300으로 바꾸는 것까지가 이 항목**이다(코드는 B3 몫).
- `s-maxage`를 5분으로 줄인 비용: CDN 미적중이 12배 늘어도 링크 하나 하루 10만 조회에서 Nest 요청은 분당 수 건 수준이다(L1이 확인) [팀 추정].

### 3-10. 원격 꿈 모티프 배포 형식 — 모티프 팩 [v2.2]

**어디에**: 기획 6-2는 'Storage 자산'이라 적었지만 **Firebase Hosting 정적 + Git**으로 둔다(기획과 다름, 기획 v2.3에서 반영됨). 까닭: 모티프는 주 1개·수 KB짜리 **데이터**라 PR 리뷰·되돌리기·CI 검증이 Git에서 가장 싸고, DB·Nest를 거치지 않으며, 플래그와 같은 배포 경로 하나로 끝난다.

**정본 [v2.2]**: 스키마는 **`@mong/contract`의 `contentManifestSchema`·`motifFileSchema`**(B0 구현)이고, 그 내용은 D-25가 가리키는 `docs/design/content-v1/dreams-30days.md` v1.1 5-2(스키마 1)와 같다. core는 의존성 0이라 같은 모양의 **구조 타입만**(`packages/core/src/moon/motifs.ts`) 두고, contract 값이 core 타입에 대입되는지를 `apps/mobile/test/moon-contract.test.ts`가 묶는다. 원본 파일은 `apps/web-static/src/content/`(지금 빈 매니페스트 `{v:1, seq:0, motifs:[], revoked:[]}`).

**매니페스트** `https://mongmang.ink/content/v1.json`(`Cache-Control: public, max-age=3600`)

```json
{ "v": 1, "seq": 31,
  "motifs": [
    { "id": "w2026-53-crane", "kind": "weekly", "from": "2026-12-28", "schema": 1, "minAppBuild": 14,
      "url": "/content/motifs/w2026-53-crane.3f9a1c7e.json", "sha256": "<64 hex>", "bytes": 9123 },
    { "id": "moon-03", "kind": "moon", "month": 3, "schema": 1, "minAppBuild": 14,
      "url": "/content/motifs/moon-03.a1b2c3d4.json", "sha256": "<64 hex>", "bytes": 11204 } ],
  "revoked": [] }
```

| 매니페스트 필드 | 규칙(contract, strict) |
|---|---|
| `v` | `1` 고정(형식 판). 형식을 바꾸면 `/content/v2.json` 새 파일 |
| `seq` | 정수 ≥ 0, 바뀌었을 때만 앱이 새 파일을 받는다 |
| `motifs[].id` | 소문자·숫자·하이픈 ≤ 40자, 매니페스트 안에서 중복 금지. `kind: moon`이면 **`moon-MM`이고 `month`와 일치** |
| `motifs[].kind` | `weekly`(필드 `from` = 풀에 들어가는 현지 날짜) 또는 `moon`(필드 `month` 1~12) |
| `schema`·`minAppBuild` | `1` / 빌드 번호 0~1,000,000 |
| `url` | `/content/motifs/{id}.{내용 해시 앞 8자}.json`. **파일 이름의 id가 항목 id와 같아야** 한다 |
| `sha256`·`bytes` | 64자 16진 / 1~64KB. 정적 빌드(`apps/web-static/scripts/build.mjs`)가 실제 파일의 존재·바이트·해시·이름 해시·스키마를 다시 확인한다 |
| `revoked` | id 목록(새 카드에서만 뽑지 않음) |

**모티프 파일**(`Cache-Control: public, max-age=31536000, immutable`, 이름에 내용 해시) — 스키마 1(D-25)

```json
{ "schema": 1, "id": "w2026-53-crane", "zone": "far-alone", "family": "bird",
  "paths": [ { "d": "M12 40 C …", "w": 1.4, "layer": "ink" } ],
  "shader": { "bleed": 0.35, "grain": 0.2, "tone": "night" },
  "text": { "ko": { "title": "…", "line": "…", "scene": "…" },
            "en": { "title": "…", "line": "…", "scene": "…" } },
  "tags": ["water"] }
```
(예시다. `"…"`·`"M12 40 C …"`는 자리표시자라 그대로 쓰면 `MOTIF_FORBIDDEN`(말줄임표)·경로 문법 검사에 걸린다 — S12.)

| 파일 필드 | 규칙(contract, strict) |
|---|---|
| `zone` | `near-alone`·`near-with`·`far-alone`·`far-with`·`center`·`moon`. **`moon-` id만 `zone: moon`**, 그 밖은 `moon` 금지 |
| `family` | 소문자 낱말·하이픈 ≤ 16자(반복 방지 규칙의 '가족') |
| `paths[]` | 1~64개. `d` = SVG 경로 명령·숫자·구분자만(≤ 4,000자, 실행 코드 0), `w` 0.1~8, `layer` `ink`·`gold`·`wash`(`gold`는 아트 4절 허용 자리만 — 아트 검수) |
| `shader` | `bleed`·`grain` 0~1, `tone` `day`·`night` — **앱에 있는 셰이더의 파라미터만** |
| `text.ko`·`text.en` | 최소 한 언어. 없는 언어에서는 그 모티프를 풀에서 뺀다(기계 번역 금지, D-17). 글자 수(코드 포인트) 상한: **ko title 12·line 22·scene 45 / en 32·45·100**. `scene`(접근성 장면 문장) 필수. 금지 표현(느낌표·말줄임표·숫자·광고체·외로움·FOMO·발 동사 등 `MOTIF_FORBIDDEN`)이면 실패 |
| `tags` | 선택, 최대 8개·각 24자 |

| 규칙 | 내용 |
|---|---|
| 실행 코드 0 | 경로 데이터·숫자 파라미터·언어별 원작 문구만. 셰이더는 **앱에 있는 셰이더의 파라미터**만 바꾼다(새 셰이더 소스 금지) **[확인 필요: App Store 2.5.2 해석, 기획 2-4]** |
| 검증 | contract 스키마가 **정적 빌드·CI(지금 `static-ci.yml` → A6 통합 `ci.yml`, B6 뒤 `deploy-static.yml`)와 앱 양쪽**에서 같은 코드로 돈다. 앱은 `schema`를 모르거나 `sha256`이 다르면 조용히 건너뛴다 |
| 받는 때 | 플래그와 같이(실행·1시간 TTL). `seq`가 바뀌었을 때만 새 파일을 받는다. 받은 파일은 **기기에 영구 저장** |
| 풀에 들어가는 때 | 기기 **현지 날짜**가 `from` 이후면 풀에 들어갈 뿐, 그날 반드시 나오지 않는다(기획 2-4). **한 번 들어간 모티프는 빠지지 않는다**(한정 획득 없음) |
| 보름 모티프 | `kind: moon`, `month` 1~12. 보름 창(core `moonNightOf`, 밤의 날짜 = 그 밤이 시작된 저녁의 현지 날짜, 04:00 경계 — D-25 개정 줄)일 때 **당일 밤의 현지 월** 모티프를 쓴다. **`moon-12`·`moon-01`·`moon-02`는 앱에 번들**(C4) — 원격은 3월부터. 그달 모티프가 없으면(오프라인·원격 꺼짐) **`월 mod 3` 대체**(0 → 12월, 1 → 1월, 2 → 2월 번들). 처음 3장은 보호(D-25). 다음 해 같은 달에 다시 온다 |
| 해금 앞당기기 | 매니페스트가 아니라 `config/v1.json`의 `dreamUnlock`(3-7) |
| 비상 철회 | `revoked`에 id를 넣으면 앱은 **새 카드에서만** 그 모티프를 뽑지 않는다. 이미 현상된 카드는 그대로(카드는 세이브에 렌더 결과·id로 남는다). 문구 오류 등은 철회 대신 새 해시 파일로 교체 |
| 앱 버전 | `minAppBuild` 미만 앱은 그 모티프를 무시(새 경로 문법 등) |
| 도감(1.0 직후) | 칸 수 = 번들 25 + 매니페스트의 `weekly` 수 + 보름 칸. 서버는 칸 수만 알려 줄 뿐 도감 데이터는 없다(기획 2-8) |

- 제작 흐름: 아트 → `apps/web-static/src/content/motifs/{id}.{해시}.json` + 매니페스트 항목 PR(해시·바이트는 스크립트로) → CI 검증·미리보기 PNG 생성(core 렌더 스냅숏, B4) → 오너 승인 → 병합 → `firebase deploy`. 주 1개 기준 0.25일/주 [팀 추정].

### 3-11. OTA(`expo-updates`) — 채널과 플래그의 관계 [v2]

> **[v2.3 V21, 11-24] 배포 서버 부분은 `ota-self-host.md`가 대체한다**(법률 1차 검토 C-1 → 오너 결정 3). 아래 표의 `eas update`·`eas update:rollback`·요금제·`EAS-Client-ID` 줄은 역사로 남긴다. 대체: 게시 = `ota-cli publish`, 되돌리기 = `ota-cli republish`·`rollback`(rollBackToEmbedded), 서명 = 게시 때 CLI(개인키는 서버 밖), 설치 id = 서버가 받지만 저장·로그 0, 세이브 형식 가드 = `publish --server-url`. 채널·`checkAutomatically: NEVER`·둘째 실행부터·순서 규칙(1~5)은 그대로.

**왜 필요한가**: 앱 레인은 12-24까지 C 일정으로 꽉 차 있고(41 대 40.75), 서버 연동 앱 작업은 **소프트런칭 중 OTA로 들어가는 것이 정상 경로**다(기획 4-6). 네이티브 변경은 빌드 2 한 번(+ 위젯 화면 스토어 업데이트 1회)으로 묶는다.

| 항목 | 값 |
|---|---|
| 러너 버전 | `runtimeVersion: { policy: "fingerprint" }` — 네이티브가 바뀌면 자동으로 달라져 **맞지 않는 바이너리에 JS가 가지 않는다** **[확인 필요: Expo SDK 58에서 기본 권장값]** |
| 채널 | EAS 빌드 프로필 `preview` → 채널 `preview`(내부·비공개 테스트 12명) / `production` → 채널 `production`(소프트런칭·TestFlight 외부 테스트·정식) |
| 브랜치 흐름 | `eas update --branch preview` → 내부 확인 → **같은 번들을** `production`으로 다시 게시(재빌드 없음). 비율 배포(`--rollout-percentage`) 사용 **[확인 필요: 요금제 조건]** |
| 받는 방식 | `checkAutomatically: NEVER` + JS가 직접 `checkForUpdateAsync()` — **첫 실행에는 확인하지 않고 둘째 실행부터**, 포그라운드 때 하루 한 번. `fallbackToCacheTimeout: 0`이라 시작을 기다리지 않는다(P1). 새 번들은 다음 콜드 스타트에 적용 |
| 되돌리기 | ① **행동**: 플래그 끄기(최대 1시간, 3-7) ② **코드**: 이전 업데이트 재게시(`eas update:rollback` 류) ③ 시작 직후 크래시는 `expo-updates`의 오류 복구가 내장 번들로 되돌림 **[확인 필요: 동작 조건]** |
| 서명 | 코드 서명(`codeSigningCertificate`)은 넣고 싶지만 요금제 조건 **[확인 필요]** — 안 되면 HTTPS + EAS 계정 2단계 인증으로 갈음 |

**코드는 OTA, 켜기는 플래그 — 순서 규칙**

1. 서버를 먼저 배포한다(스테이징 → 운영, 이 기능 API가 살아 있음).
2. 기능 코드를 **플래그 꺼짐**으로 OTA 게시. `BUNDLE_SEQ`를 1 올린다.
3. 운영자 기기·내부 테스트에서 개발 메뉴로 켜 본다.
4. `config/v1.json`에서 `minBundle[key] = 이 SEQ`, `rollout[key]` 0.2 → 0.5 → 1.0(하루씩).
5. 문제가 생기면 플래그 끄기 → 고친 OTA → `minBundle` 올리고 다시 켬.

- **세이브 형식을 바꾸는 OTA는 서버를 먼저**(v1 6-4 CI 버전 가드 그대로). OTA로 `SCHEMA_VERSION`을 올릴 수 있으므로 가드는 **EAS Update 게시 스크립트에도** 둔다(`/healthz`의 `saveSchema`보다 크면 게시 중단).
- **개인정보·연령(v2.1, 리뷰 I4·질문 7)**: EAS Update 확인 요청에는 플랫폼·러너 버전과 **기기마다 영속 무작위 id(`EAS-Client-ID`류)**가 실린다 **[확인 필요]**. 이 요청은 계정·연령 확인과 무관하게 **모든 설치자**(14세 미만 포함)에게서 미국으로 간다. 그래서:
  1. 첫 실행(인트로·첫 획)에는 Expo로 아무 요청도 보내지 않고 **둘째 실행부터** 확인한다(위 '받는 방식').
  2. 그 id를 끄거나 바꿀 수 있는지 `expo-updates` 설정을 B1에서 확인한다.
  3. 14세 미만 설치자에게서 설치 id·IP가 가는 것이 제22조의2 판단에 영향이 있는지를 **법률 검토 질문에 명시**한다(5-4).
  4. 결과가 '문제 있음'이면 대안은 **자체 업데이트 서버**다(expo-updates 프로토콜을 Nest + Firebase 정적으로, 설치 id 없음, 약 2일).
- **이탈 경로는 바이너리에 묶여 있다(리뷰 I11)**: `updates.url`은 네이티브 설정이라 EAS ↔ 자체 서버 전환에는 **스토어 업데이트**가 필요하다(런타임 덮어쓰기는 SDK 제약 **[확인 필요]**). 그러므로 **EAS 요금과 위 3의 법률 판단을 빌드 2(12-10) 전에 확정**한다. v2의 '비용이 크면 나중에 자체 서버로'라는 대응은 뺀다.
- **iOS 심사와 플래그(v2.1, 리뷰 I10, App Store 2.3.1 숨긴 기능)** — 원칙: **심사받는 빌드에 기능이 실제로 들어 있고, 심사 때 켜져 있거나 심사 노트로 설명할 수 있어야 한다.**
  1. TestFlight 외부 테스트: 소프트런칭 중 OTA로 들어오는 기능(맡겨 두기·링크)은, iOS에서는 그 기능이 든 번들로 **베타 심사를 다시 받거나 '테스트할 내용'·심사 노트에 적은 뒤** 켠다.
  2. 정식 1.0 제출 때는 1.0 기능 전부를 **켠 상태로** 심사받는다.
  3. 그 뒤 플래그는 **끄는 손잡이·비율 배포·A/B**로만 쓴다. 심사 뒤에 새 기능을 원격으로 처음 켜지 않는다.
  4. Android는 JS 번들 OTA가 정책 범위 안이다.

### 3-12. 관리 도구 — 소프트런칭은 Studio, `mong-admin`은 정식 출시 전 [v2.1]

리뷰의 과설계 판정을 받아 미룬다. 소프트런칭 규모(설치 수백~수천)에는 Studio로 충분하다.

| 시기 | 무엇 |
|---|---|
| **소프트런칭(12-22~)** | Supabase Studio + **SQL 함수** `app.restore_page(code)`·`app.confirm_hide(code)`·`app.dismiss_report(id)`(상태 전이와 `admin_actions` 기록을 한 트랜잭션에) + 작은 **CLI 스크립트** `pnpm --filter server ops:quarantine <code> restore\|confirm`(Storage 이동·삭제, service role, 오너 노트북에서만). 격리 파일은 Studio Storage 화면에서 미리 본다 **[확인 필요: 비공개 버킷 미리보기]** — 안 되면 CLI가 5분짜리 서명 URL을 찍어 준다. ~~웹 삭제 요청은 `ops:delete <code> <글귀>`(글귀 해시 대조 → 3-8 절차).~~ **[B2에서 대체됨]** 웹 삭제는 `POST /api/v1/deletion/web`이 바로 처리한다(운영자가 글귀를 다루지 않음). B5 안에서 0.5일 |
| **정식 출시 전(01월, 1.1일)** | `mong-admin` 최소판: 신고 대기열 / 격리본 보기 + **원형 보기**(`snap.json` 파생 획을 SVG 폴리라인으로) / 삭제 요청 처리. 동작은 위 SQL 함수를 그대로 부른다 |
| 1.0 직후 | 원형 보기를 밤물 마주침·동기 신고까지 넓힌다(3-13) |

**`mong-admin` 규칙(01월)**
- 같은 이미지 `ADMIN_MODE=1`, `--no-allow-unauthenticated`, `gcloud run services proxy`로만 연다 **[확인 필요]**. 급할 때는 Cloud Shell 웹 미리보기로 휴대폰에서도 연다 **[확인 필요]**.
- **CSRF(리뷰 I8)**: 프록시는 오너 자격 증명을 `localhost:8080`에 붙여 준다. 그래서 그 시간에 오너가 연 아무 웹페이지가 POST를 보내 '확정 숨김·삭제'를 실행시킬 수 있다. 대응: ① 상태를 바꾸는 요청은 `Origin`·`Host`가 정확히 `localhost:8080`인지 검사(DNS 리바인딩 대비) ② 폼마다 CSRF 토큰 ③ GET은 상태를 바꾸지 않는다. 0.1일.
- **배포 스모크**: `mong-api`(ADMIN_MODE 없음)에서 관리 라우트가 `404`인지 확인한다(같은 이미지라 환경 변수가 빠지는 사고에 대비).
- 하지 않는 것: 세이브 열람·검색, 사용자 목록, 지표 화면(지표는 SQL 스니펫).

### 3-13. 1.0 직후 확장 자리 — 밤물·동기·발자국·도감 [v2]

1.0 서버에는 **만들지 않는다**. 대신 지금 정해 두어 1.0의 결정이 나중을 막지 않게 한다.

**1.0에서 이미 지키는 것**: ① 모든 사용자 데이터 테이블은 `creatures`에 CASCADE ② 공개 스냅숏 `snap:1`이 밤물·동기의 실루엣 원천(새 형식을 만들지 않는다) ③ `reports.target_kind`에 `encounter`·`cohort`·`footprint` 자리 ④ 관리 도구 원형 보기가 스냅숏만 받으면 됨 ⑤ API 경로 예약(3-2).

| 기능(기획) | 테이블(1.0 직후 마이그레이션) | API | 규칙·보관 |
|---|---|---|---|
| **도감**(①, 2-8) | 없음 | 없음 | 세이브 안. 맡겨 두기로 함께 보관 |
| **발자국**(②, 2-3) | `footprint_raw(creature_id, visitor_key, day, created_at)` UNIQUE`(creature_id, visitor_key, day)` / `footprint_daily(creature_id, day, bucket smallint)` | `POST /m/{code}/pat`(무인증, `visitor_key = HMAC(오늘의 발자국 소금, IP 접두)`, IP 접두당 10/시간) / `GET /api/v1/footprints?since=` → `[{day, bucket}]` | 원본 **48시간** 뒤 `bucket`(0/1/2~4/5+)만 남김. 숫자·목록·누구 없음. 발자국 전용 일일 소금 `footprint_salts`(2일 뒤 삭제)를 둔다 — 신고 소금과 분리 |
| **밤물**(③, 2-10·2-11) | `creatures`에 `night_open bool default false`, `born_local_date date`, `pool_excluded bool` / `night_drops(id, creature_id, local_date, snap jsonb, ink, texture, paper, created_at)` — **48시간** / `encounters(id, guest_creature_id, host_creature_id, local_date, gift_ink?, delivered_at?)` / `blocks(creature_id, blocked_creature_id)` | `POST /api/v1/night/drop`(잠든 뒤, 어젯밤 스냅숏) / `GET /api/v1/night/encounter?localDate=` → 마주침 하나 또는 `204`(**300ms 목표**) / `POST /api/v1/night/encounters/{id}/report` / `POST /api/v1/blocks` / `PATCH /creature {nightOpen}` | 짝 고르기(요청 때, 한 SQL): 같은 `local_date` 풀에서 `night_open`·`!pool_excluded`·막기 제외·사흘 연속·같은 아이 연속 금지 → **다른 먹 우선**(없으면 카드 장면만, 먹 조각 없음) → 가중 `1 ÷ (1 + 최근 7일 받은 손님 수)` 무작위. 결과를 `encounters`에 저장해 멱등. 풀이 작으면 빈도를 낮춘다(가짜로 채우지 않음) |
| **형태·신고 필터**(밤물·동기 공통) | `pool_excluded` | — | `night/drop` 때 스냅숏에서 **돌출 비율·같은 자리 반복 획 비율**(core 함수)을 계산해 상위 0.5% [팀 추정]면 `true`. 신고 확정·숨김 이력이 있어도 `true` |
| **동기**(④, 2-12) | 새 테이블 없음(`night_drops` + `born_local_date`) | `GET /api/v1/cohort?bornDate=` → 실루엣 6(스냅숏 축약) | 같은 현지 날짜·밤물 열림·필터 통과 중 무작위 6, 이름 없음. 결과는 이레 두루마리에 그려지고 서버는 보관하지 않음 |
| 운영용 원형 보기 | — | 관리 도구 | 3-12 화면 2 그대로 |

- **세 번째 계정 생성 순간**: 밤물은 `night/drop`을 올리고 막기·삭제를 해야 하므로 계정이 필요하다. '밤물 열기' 직전에 중립형 연령 확인 → 익명 로그인(3-3 ②③). 맡겨 두기·링크를 이미 켠 사람은 같은 계정이다. D-23([확정])은 두 순간만 적었으므로 **1.0 직후 릴리스 전에 D-23 개정이 필요하다**(13절).
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
| 링크 켜기 중 끊김 | `PUT page` → 업로드 → `commit` 중 어디서 끊겨도 다음 시도는 처음부터(판 번호가 올라가 이전 반쪽 판은 `storage_gc`가 치움, 다시 시도하지 않아도 6시간 뒤 치움) |
| '서버에 맡긴 것 지우기' 성공 | 세션·아웃박스·`cloud.*` 메타를 바로 비운다(옛 토큰으로 되살아나지 않게, 3-8) |
| 되찾기로 옮겨 간 옛 기기(`410`) | '다른 기기로 옮겨졌어요' 표시 후 세션을 비우고 로컬 게임은 계속 |

### 4-2. 네이티브 변경 — 빌드 2 한 번에 묶는다 [v2]

| 필요한 것 | 네이티브? | 언제 |
|---|---|---|
| `fetch`, `@supabase/supabase-js`(+ `react-native-url-polyfill`) | 아니오 | OTA 가능 |
| 딥링크 수신 | RN `Linking`(코어) | OTA 가능 |
| **유니버설·앱 링크**(`ios.associatedDomains: applinks:mongmang.ink`(+ `staging.mongmang.ink`는 preview 프로필만), `android.intentFilters` `autoVerify`) | 설정 변경 → 재빌드 | **빌드 2** |
| **`expo-updates`** | 새 네이티브 모듈 | **빌드 2** |
| **위젯**: `@bacons/apple-targets` 타깃·App Group·로컬 Expo 모듈(**`getInstalledCount()` 포함**, 3-6) / `react-native-android-widget` | 네이티브 | **빌드 2**(화면 완성은 스토어 업데이트 1회) |
| **세션 전용 MMKV의 OS 백업 제외**(iOS `isExcludedFromBackup`, Android `dataExtractionRules`·`fullBackupContent` 제외 규칙) | 설정·네이티브 → 재빌드 | **빌드 2**(3-3 ④) |
| 영상 인코더 웹 저용량 설정(540×676, 무음) | 기존 D-18 모듈의 매개변수 | 빌드 2 모듈에 매개변수 자리가 있으면 OTA [확인 필요] |
| Apple/Google 로그인 | 새 모듈 2개 | 1.0.x |

- 빌드 2 직전 **EAS 리허설 빌드(12-05 전후)**에서 AASA·assetlinks를 실기기로 확인한다 → B0의 `.well-known`이 그 전에 운영 도메인에 떠 있어야 한다.

### 4-3. 웹 미리보기·테스트 전략 [v2]

v1 그대로(net 모듈 가짜 fetch, core 고정물 세이브를 core·서버 e2e가 같이 읽음, 서버 단위는 실제 로컬 DB, e2e는 로컬 Supabase, OpenAPI 계약, `pnpm web` → 로컬 Nest). v2 추가:

| 층 | 무엇으로 |
|---|---|
| 공개 스냅숏 | core 고정물 `fixtures/snap/*.json`(3-5-1 목록) — 금지 키·점 65개·base64 길이 어긋남을 서버가 `422`로 거르는지, 서버가 쓴 `snap.json`이 정규화본인지 e2e |
| 웹 뷰어 | Playwright: 정적 HTML 첫 페인트(느린 3G 모의) / WebGL 없는 브라우저에서 `live.js`를 안 부름 / 이미지 404 때 '사라진 링크' / `webLive` 꺼짐 |
| 모티프 | contract `motifFileSchema`·`contentManifestSchema` 시험(정상·스키마 모름·해시 불일치·과대·금지어) + `web-static` 고장 사본 시험(B0 구현) [v2.2] |
| Q9 기기 이동 | 두 기기 번갈아 쓰기·미래 버전·409 나란히 고르기·되찾기 글귀 + **OS 백업 복원 뒤 옛 기기 계속 사용**·**되찾은 뒤 옛 기기 업로드(410)**·**삭제 직후 옛 토큰으로 PUT(401)** — iOS·Android 각 20회+(앱 레인 C13, 서버는 스테이징 제공) |
| Q5 느린 서버 | 7절 L6 |

---

## 5. 개인정보·스토어 영향

### 5-1. '수집 없음'이 무엇으로 바뀌나 [v2.1]

| 사용자 | 서버로 가는 것 | 처리방침 | Google Data safety | Apple App Privacy |
|---|---|---|---|---|
| 모두(빌드 2부터) | 집계 칸 +1(코호트 날짜·n일째·플랫폼·버전·언어·이름 시점 군·7일째 위젯 유무·보름 창), 식별자 없음. IP는 레이트 리밋 메모리와 7일 요청 로그에만(5-2) | "이용 통계(개인 식별 불가)" 절에 차원 3개를 적는다 | 앱 활동 > 앱 상호작용: 수집, 공유 안 함, 분석 [확인 필요: 집계만이면 대상인지 — 보수적으로 선언] | Usage Data > Product Interaction, **Not Linked** |
| 모두(**둘째 실행부터**) | **OTA 확인 요청** → Expo(미국): 플랫폼·러너 버전·영속 설치 id 가능성 [확인 필요]·IP | 처리위탁·국외 이전 표(5-4) | 기기 또는 기타 ID(Expo 처리) 선언 가능성 [확인 필요] | Identifiers > Device ID 해당 여부 [확인 필요] |
| 모두(빌드 2부터) | 플래그·모티프 정적 파일 요청(Firebase CDN 엣지, IP만) | "웹 전송" 한 줄 | 해당 없음 [확인 필요] | 같음 |
| 링크 손님(웹) | 페이지 로드 비콘·`/get`(쿠키·식별자 없음). **IP와 링크 주소가 같은 로그에 남지 않음**(5-2). 신고하면 신고 대상별 가명 값 최대 7일 | "웹 페이지" 절: '페이지 로드 수를 세며 IP는 저장하지 않고, 신고 때만 7일 가명 처리' | 앱 밖 | 앱 밖 |
| 링크를 켠 사람 | 익명 계정 id, 연령 확인 통과 기록(날짜), **공개 스냅숏**(파생 획·타고남 요약·먹·결·날짜·켤 때 날 세기·이름(켰을 때)), 포스터·OG·루프(공개) | "공유 링크" 절, 공개 범위·끄기·지우기 | 사용자 ID, 기타 사용자 생성 콘텐츠(앱 기능) | Identifiers > User ID, User Content > Other, Linked |
| 맡겨 두기를 켠 사람 | 위 + **세이브 전체**: 획 좌표·시간·필압, 잠 시각 설정, 정·손 기억, **이용 시간대 패턴(`relation.hour[24]`·`todayHour`)·부재 길이(`lastAbsenceMs`·`longestAbsenceMs`)·마지막 방문 시각(`lastSeenAt`)·설치 시각(`birth.at`, ms)·시간대(`clock.tzOffsetMin`)**·이름 | "클라우드 보관" 절에 위 항목을 **이름 붙여** 적는다(빌드 1 리뷰 #10), 이력 4주·파기 | 위 + 앱 활동 > **기타 앱 활동**(이용 시간대·부재 기간) [확인 필요: 분류], 게임 진행, **삭제 요청 가능** | 위 + Gameplay Content + Usage Data(Linked) [확인 필요] |
| 1.0 직후: 밤물을 연 사람 | 밤 맡김(파생 획·먹·결·종이·현지 날짜) 48시간, 마주침 기록 | "밤물" 절 | 사용자 생성 콘텐츠 | 같음 |
| 1.0.x: Apple/Google 연결 | + 이메일 | "계정 연결" 절 | 이메일 | Contact Info > Email |

- **세이브 속 생활 리듬 값**(빌드 1 리뷰 #10): 업로드 때 빼지 않는다. 서버 검증이 `parseState`이고, 되찾은 기기에서 정(情)·손 기억이 그대로여야 '나를 알아본다'(기획 2-1)가 성립한다. 대신 ① 처리방침·라벨에 이름 붙여 적고 ② 서버는 본문에서 이 값을 꺼내 열로 저장하거나 색인하지 않으며 ③ 관리 도구에 세이브 열람 화면이 없고 ④ 공개 스냅숏은 **서버가 검증한 본만 공개**되며(3-5) ⑤ 이력은 4주로 줄였다. 열 단위 암호화는 1.0에서 하지 않는다 [팀 추정].
- 기획 P9 '설치만 한 사람은 서버가 모른다'는 '**우리** 서버는 모른다'로 고친다(Expo는 설치 id를 받을 수 있다, 13절).
- store-listing 7-1의 "아니요"는 **빌드 2 제출(12-10) 전에** 바꾼다. 처리방침도 그 전에 게시한다(B8).
- 처리방침 고칠 곳: v1 목록(1·2·3·5·6·7·8·9·10·11) + 이용 통계 차원 3개, 웹 페이지 로드 수·요청 로그 7일, **신고 대상별 가명 값 7일**, 생활 리듬 항목, **국외 이전 고지 항목 전부(5-4)**, 장기 미사용 2년, 서비스 종료 약속(90일 전 공지 + 내보내기, 기획 6-5).

### 5-2. 데이터 최소화·로그 [v2.2]

- v1 원칙 그대로: 이메일·이름·전화·광고 ID·기기 모델을 받지 않고, IP는 DB에 없으며, 핑에 ID가 없다.
- **로그 위치·보존(리뷰 I3)**: B6에서 **서울(asia-northeast3) 로그 버킷 `mong-logs`를 새로 만들고 보존 7일**로 둔다. `_Default` 싱크를 이 버킷으로 돌리고 `_Default` 버킷 수집은 끈다. 기존 `_Default` 버킷은 global·30일이고 위치를 바꿀 수 없다 **[확인 필요]**. 이 작업 없이는 처리방침의 'IP 7일'이 거짓이 된다. Firebase Hosting의 Cloud Logging 연동은 켜지 않는다.
- **IP와 링크 코드를 같은 로그에 남기지 않는다**: Cloud Run 요청 로그는 IP(`remoteIp`)와 전체 URL을 함께 적는다. 그대로 두면 '어느 IP가 어느 몽망이 링크를 봤나'가 7일 동안 남는다. 그래서 **`/m/` 경로의 Cloud Run 요청 로그는 제외 필터로 수집하지 않는다.** 대신 Nest가 구조화 로그를 남기되, 경로는 템플릿(`/m/:code`)·상태 코드·지연만 쓰고 IP·코드는 넣지 않는다. 앱 API 요청 로그(IP + `/api/v1/…` 경로, 링크 코드 없음)는 7일 보관한다.
- **로그 가림 목록(리뷰 S5)**: `Authorization` 헤더, `/recover`·`/recovery-code`의 본문·응답(글귀), `PUT /saves`·`/conflicts` 본문, `snapshot`, **`name`**, Storage 서명 URL·토큰. [v2.2: B1 구현] 요청 로그는 **키 화이트리스트**(reqId·method·route 템플릿·statusCode·responseTime)만 남기고 IP·XFF·UA·Authorization·Cookie·쿼리 문자열·본문은 직렬화기 + redact 이중으로 빠진다(`src/common/logging.ts`, `test/log-redaction.test.ts`가 200·422·404·500에서 고정). 예외 로그에 요청 본문을 넣지 않는다.
- 그 밖: 활동 시각은 월 단위(`last_active_month`), 연령은 확인 통과 기록만, 신고 가명 값 7일, 발자국 해시 48시간(1.0 직후).

### 5-3. 아동·연령 [v2.1]

- **타깃 14세 이상**(D-23, D-06 개정). 한국 개인정보 보호법 제22조의2(만 14세 미만 법정대리인 동의) 대상이 되지 않게 한다 [법률 검토].
- 설계: ① 핑은 식별 불가 ② 계정이 생기는 모든 순간 직전에 **중립형 연령 확인**(3-3 ③: 태어난 해·달, 기본값·기준 숫자 노출 없음, 기기에서 판정, 연·월 저장 안 함) ③ 미달은 기기에만 기록 ④ `bootstrap`은 확인 기록 없이 계정을 만들지 않음 ⑤ 법정대리인 동의 절차는 없다.
- 남는 빈틈: **EAS 설치 id**는 연령 확인 전에 모든 설치자에게서 간다(3-11). 첫 실행에는 보내지 않도록 늦췄지만 없애지는 못했다 → 법률 검토 질문에 명시한다(5-4).
- 스토어 선언: Google Play 타깃 연령은 '13~15세' 같은 묶음이라 '14세 이상'만 고를 수 없을 수 있다 **[확인 필요]**. D-06(13+)·D-23(14+)·store-listing 선언을 한 줄로 맞추는 일은 PM에 넘긴다(13절).
- 공개 웹에 실명이 올라가는 위험: 이름 공개 기본 끔 + 금칙어 + OG도 같은 설정 + 이름 입력 화면 안내 한 줄.

### 5-4. 처리위탁·국외 이전 [v2.1]

| 받는 자(연락처) | 업무 | 이전 국가·위치 | 항목 | 일시·방법 | 보유·이용 기간 |
|---|---|---|---|---|---|
| Supabase, Inc.(미국, 연락처 [확인 필요]) | DB·인증·파일 보관 | 저장은 서울(AWS). 미국 법인의 원격 운영 접근 가능성 → 보수적으로 국외 이전에도 기재 | 계정 id, 세이브, 공개 사본, 연령 확인 기록 | 링크·맡겨 두기를 켤 때부터 수시, TLS 전송 | 계정 삭제까지(이력 4주, 백업 7일) |
| Google LLC(미국) — Cloud Run·Cloud Logging·Cloud Scheduler | API 실행, 로그 | 서울(Cloud Run·`mong-logs`) | 요청(IP·경로), 로그 | 앱 사용 중 수시, TLS | 로그 7일 |
| Google LLC — Firebase Hosting | 웹·정적 전송 | **전 세계 CDN 엣지**(사용자 근처에서 TLS 종료) | 링크 페이지·플래그·모티프 요청의 IP, 공개 콘텐츠 | 요청 때 | 우리 쪽 로그 없음(엣지 처리 기록은 Google 정책 [확인 필요]) |
| ~~650 Industries, Inc.(Expo, 미국) — EAS Update~~ | ~~OTA 배포~~ — **v2.3 V21: 자체 서버로 바꿔 이 위탁·이전 행은 없어진다**(`ota-self-host.md` 9절, 처리방침 반영은 release 담당) | — | — | — | — |

- **v2.1 정정**: v2의 'CDN은 공개 콘텐츠뿐'은 틀렸다. 앱 API가 Firebase를 거치면 세이브·글귀·JWT가 국외 엣지에서 TLS가 풀린다. **앱 API를 Cloud Run 직접으로 옮겨**(2-1) 이 경로를 없앴다. Firebase에 남는 것은 공개 콘텐츠와 그 요청의 IP다.
- **고지 항목**: 개인정보보호법 제28조의8에 따라 처리방침에 **이전 국가, 일시와 방법, 받는 자(연락처), 항목, 목적, 보유·이용 기간, 거부 방법과 거부의 결과**를 모두 적는다 [법률 검토]. 거부 방법: 링크·맡겨 두기를 쓰지 않으면 계정 데이터 이전이 없다. OTA·정적 요청은 거부 수단이 없으므로 항목을 최소로 줄인다.
- **법률 검토 범위(오너 12-05, 질문은 11-24까지 발송)**:
  - 한국: 제22조의2(14세), 제28조의8(국외 이전 고지), 장기 미이용 자율 규칙(2023 개정 후).
  - **소프트런칭 국가**: 캐나다(PIPEDA, **퀘벡 Law 25** — 국외 이전 전 평가·14세 미만 동의), 필리핀(Data Privacy Act 2012), 뉴질랜드(Privacy Act 2020 IPP 12 국외 공개).
  - EAS 설치 id·IP가 14세 미만 설치자에게서 가는 것의 판단(3-11).
  - 획의 시간·필압이 생체인식 정보(민감정보)에 해당하지 않는지(D-13, 리뷰 기준 문서 점검).
- 법률 검토(12-05) → 처리방침 게시(12-08)는 사흘뿐이다. 결과가 '동의 필요'면 B8과 빌드 2 라벨을 다시 써야 하므로, **질문을 이번 주에 확정해 보낸다**.

### 5-5. 보관·파기 표 [v2.1]

| 항목 | 보관 | 방법 |
|---|---|---|
| 세이브 현재본 | 계정 존속 중 | — |
| 세이브 이력 | **최대 4주**(최근 3벌 + 주 1벌 4주), 충돌본·복원 전 본 30일 | PUT 안 + `pg_cron` |
| 공개 사본·포스터·OG·루프·스냅숏 | 링크 켜져 있는 동안. 끄면 즉시 파일 삭제(HTML 캐시는 무효화로 약 1분, 최대 5분) | 3-9 |
| 미커밋 업로드 | 6시간 | Scheduler |
| 신고 격리본 | 최대 30일(확정이면 즉시 삭제, 30일 경과 기본값 확정) | Scheduler |
| 되찾기 글귀 | 해시만, 되찾으면 회전 | — |
| 되찾기로 끊긴 옛 기기 로그인(`user_auth` revoked + 그 `auth.users`) | 30일 | Scheduler(Auth Admin) |
| 연령 확인 | 판 번호·날짜(계정과 함께 삭제) | — |
| 집계 지표 | 90일 원표 → 월 단위로 말아 보관(식별자 없음, 날짜·보름·위젯 칸 버림) | `pg_cron` → `app.rollup_metric_daily()`(B0 구현, 예약은 B6) |
| **링크 조회(`link_daily`)** | **30일** → 코드 없는 합계로 말기. 계정 삭제 때 즉시 삭제 | `pg_cron` |
| IP | DB 없음, 앱 API 요청 로그 7일(`/m/` 요청 로그는 수집 안 함) | 로그 버킷 |
| 신고 | 1년(목적: 같은 대상 재발 판단). 신고자 가명 값은 **신고 대상별 최대 7일** | `pg_cron` |
| 발자국 방문자 키·밤물 맡김(1.0 직후) | 48시간 | `pg_cron` |
| 백업 속 사본 | 7일 뒤 소멸 | Supabase |
| 지운 계정의 표지(`deletion_log.subject_hmac`, user id의 단방향 HMAC) [B2] | **7일**(백업 보관 기간과 같음) — 복원 뒤 다시 지울 근거 | `pg_cron` → `app.expire_deletion_log()` |
| **장기 미사용 계정** | **앱을 2년 동안 열지 않으면 정리** | 아래 |

**장기 미사용 2년(규칙은 1.0 처리방침, 실행은 1.0.x)**
- '활동' = 인증된 API 호출(세이브 올림·링크 켜기·`/me/touch`). `users.last_active_month`를 **그달 1일로만** 갱신한다(달마다 최대 한 번 UPDATE). 언제 썼는지가 일 단위로 남지 않는다. **이 열은 1.0부터 쌓아야** 1.0.x에 시계가 맞는다.
- 링크만 켠 사람도 앱을 열면 `/me/touch`로 활동이 된다.
- 고지 문구는 **'앱을 2년 동안 열지 않으면 서버에 맡긴 것을 정리합니다'**로 단순화한다(리뷰 질문 10 답). v2의 '23개월에 앱 안 표시'는 앱을 열면 곧 활동이 되어 시계가 다시 돌므로 사실상 아무에게도 보이지 않는다 → 뺀다. 연락 수단이 없으므로 처리방침 사전 고지로 갈음한다 [법률 검토].
- 1.0.x 작업: 매월 1일 Scheduler가 24개월 지난 계정에 3-8 삭제 절차를 실행(`deletion_log(kind=inactive)`).

---

## 6. Docker·모노레포·CI

### 6-1. 모노레포 배치와 `@mong/core` 공유 [v2.2]

```
apps/
  mobile/            앱
  server/            NestJS — 지금 src/{common,config,health,metrics,prisma,saves(개발 전용)} + prisma/·Dockerfile·compose.yaml
                     B2~B5에서 src/{auth,saves,pages,web,reports,deletion,cron} 추가, admin은 01월
  web-live/          (B3 웹 레인) live.js(esbuild 번들, @mong/core + CanvasKit 페인터) → web-static/w/ 로 빌드
  web-static/        Firebase Hosting — src/(.well-known·config/v1.json·content/·m/·index.html·robots.txt) → scripts/build.mjs → public/
packages/
  core/              세이브·공개 스냅숏·달 위상(C4 ✔)의 정본 — 앱·서버·웹 뷰어가 같은 코드, 런타임 의존성 0
  contract/          @mong/contract — 원격 계약(핑·config·content·모티프 파일), zod/mini, 한 파일(B0 ✔)
```

- core에 더할 순수 함수(구현은 core 담당 PR): `toPublicSnapshot`·`parsePublicSnapshot`(**3-5-1**), 형태 지표(3-13, 1.0 직후). 달 위상·보름 창(`isMoonWindow`·`moonNightOf`·`nightDateOf`)은 C4에서 끝났다. ~~`parseMotif`~~ → contract `motifFileSchema`(부록 A-3 #6). **Node·RN·DOM API 금지 계약**(tsconfig `lib: ["ES2022"]`, `types: []`) 유지 — 웹 뷰어도 같은 코드를 먹는다. contract도 같은 금지 + **지울 수 있는 TS 문법만**(정적 빌드 스크립트가 Node 타입 지우기로 바로 import, `erasableSyntaxOnly`).
- **core·contract를 서버에 넣는 법 [v2.2, D-21 빌드 방식 개정]**: core를 빌드하지 않는다. 서버 tsup(esbuild, 데코레이터 메타데이터는 SWC)이 `@mong/core`·`@mong/contract` **원본을 서버 번들에 넣는다**. core의 `main`·`exports`를 바꾸지 않아 Metro·앱 Vitest 해석이 그대로다. `pnpm --filter server check:bundle`이 dist의 두 패키지 import 0건·core 런타임 의존성 0개·contract의 zod 버전이 서버와 같음을 검사한다(CI). 웹 뷰어 `live.js`도 esbuild 번들이라 같은 방식.

### 6-2. Dockerfile

[v2.2: 구현에 맞춤, `apps/server/Dockerfile`] `node:24-slim@sha256:…`(다이제스트 고정) 다단(manifests → deps → build → prod-deps → runtime), pnpm `--filter server...`로 서버·core·contract만 설치 → `prisma generate` → **tsup 번들(core·contract 원본 포함)** → 운영 의존성만 `--prod --filter server` 설치(번들 안이라 워크스페이스 패키지 없음 — v2.1의 `pnpm deploy` [확인 필요]는 쓰지 않는다), Prisma 런타임에서 postgresql 외 wasm 제거, 파일은 root 소유 + `USER node`(uid 1000), `HEALTHCHECK /healthz`, **시작 때 마이그레이션 없음**. Cloud Run은 startup/liveness probe `/healthz`, 배포 스모크는 `/readyz` + `x-ready-token`. 압축 94.6MB(목표 200MB 미만 통과, 풀린 크기 450MB — 콜드 스타트 실측은 B6). `mong-admin`은 같은 이미지에 `ADMIN_MODE=1`(01월, 지금은 모듈 없음).

### 6-3. 로컬 개발 — Supabase CLI + docker compose

[v2.2: 구현에 맞춤] **지금(B1·B0)**: `docker compose -f apps/server/compose.yaml up -d --build --wait db api` — `db`(postgres:17-alpine 다이제스트 고정, 127.0.0.1:54329, 헬스체크는 TCP) → `prisma/local/00-roles.sql`(비슈퍼유저·NOBYPASSRLS `prisma` 롤, `anon`·`authenticated`·`metrics_reader` 자리 롤) → `migrate`(prisma 롤, `DIRECT_URL`) → `api`(8080, 운영 이미지 그대로라 `TRUSTED_PROXY_HOPS_*`·`READY_TOKEN`에 로컬 값). DB 시험은 `pnpm --filter server test:db`. **B2·B3부터**: Auth·Storage가 필요하므로 `pnpm dlx supabase start`(DB 54322)로 바꾸고 `DATABASE_URL`만 바꾼다. `auth.users` 외래 키를 둘지는 그때 결정(로컬 postgres에는 `auth` 스키마가 없다). 시드: core 고정물로 사용자 3명 + **링크 켠 몽망이 1(이름 공개)·격리된 몽망이 1**, 로컬 Storage 버킷 둘.

### 6-4. 레지스트리·CI/CD [v2.2]

레지스트리 Artifact Registry(서울), 인증 Workload Identity Federation(v1 그대로).

- **지금 있는 것 [v2.2, 부록 A-3 #19]**: ① `ci.yml`(A6 작업 중, 미커밋) — `pnpm verify` 하나(타입 → ESLint 경고 0 → 로컬 린트 규칙 시험 → 전 패키지 시험 → 서버 번들 검사 → 정적 빌드 빈 값 실패 확인). 옛 `static-ci.yml`(contract·web-static, B0)을 흡수 ② `server-ci.yml` — Postgres 서비스가 필요한 일만: `migrate deploy`(prisma 롤) → 실제 DB 시험 → **`prisma migrate diff --exit-code`**(스키마·마이그레이션 어긋남) → `openapi.json` 산출물 → docker build(push 없음) → compose 스모크(`/healthz`·`/readyz`+토큰·핑 204). 액션은 커밋 SHA 고정, `persist-credentials: false`, 비밀값 없음. 아래 표의 `deploy-*.yml`·`ota-guard`는 **B6에서 만든다**.

| 워크플로 | 트리거 | 단계 |
|---|---|---|
| `ci.yml` + `server-ci.yml` | 모든 PR | 위 '지금 있는 것' + B2·B3에서 더함: 서버 e2e를 `supabase start`로, OpenAPI diff, **세이브 버전 가드**(core `SCHEMA_VERSION` 변경 PR은 서버 배포가 앞섰는지), 모티프·플래그 JSON 검증(contract strict, 지금도 정적 빌드가 함) |
| `deploy-staging.yml` | `main` 푸시(server·core·contract) | 이미지 `:sha` → `migrate deploy`(스테이징, `DIRECT_URL` = 세션 풀러) → **`metrics_reader` GRANT 재실행**(뷰 마이그레이션의 DO 블록) → `mong-api-staging` 배포 → 스모크(`/healthz`, `/readyz` + 토큰, `/m/TESTTEST`, `/config/v1.json`, 핑 204, **관리 라우트 404**, `/api/v1/saves/validate` 404) |
| `deploy-prod.yml` | 태그 `server-v*` + 수동 승인 | 같은 이미지 → migrate → deploy → 같은 스모크 → 실패 시 `update-traffic` 이전 리비전 100. 01월부터 `mong-admin`도 같은 이미지로 |
| `deploy-static.yml`(B6) | `apps/web-static/**`(모티프 원본 `src/content/` 포함)·`apps/web-live/**` | web-live 빌드(해시 이름) → 검증 → `firebase deploy --only hosting:staging` → (태그 `static-v*` + 승인) `hosting:prod`. 플래그 바꾸기 = 이 PR 하나 |
| `ota-guard`(스크립트) | 사람이 OTA 게시 전에(v2.3: `ota-cli publish --server-url`이 세이브 형식 가드를 한다. `BUNDLE_SEQ` 확인은 남음) | 운영 `/healthz`의 `saveSchema`·`simSchema` ≥ 앱 core 값인지 확인, 아니면 중단. **`BUNDLE_SEQ`가 지금까지 게시한 최댓값보다 큰지**도 확인(3-7) |

- 비밀:
  - GitHub Environments: **`DIRECT_URL_SESSION_POOLER`** — 이름에 세션 풀러(5432)를 드러낸다. 직접 연결은 IPv6 전용이라 GitHub 호스티드 러너에서 마이그레이션이 실패한다(리뷰 S12).
  - Secret Manager: `DATABASE_URL`(트랜잭션 풀러), `SUPABASE_SERVICE_ROLE_KEY`(새 키 체계 이름은 B6에서 확인), `RECOVERY_PEPPER`(버전 관리 + 오프라인 사본), **`READY_TOKEN`**(16자+). v2의 `REPORT_HMAC_KEY`는 없앤다(3-8).
  - 운영 필수 환경 변수(비밀 아님, 없으면 부팅 거부 — `apps/server/src/config/env.ts`): `TRUSTED_PROXY_HOPS_API`·`TRUSTED_PROXY_HOPS_WEB`(B6 실측값, 3-8), `READY_TOKEN`. 그 밖 `METRIC_APP_VERSIONS`(기본 `1.0`, 새 출시 판 전에 늘림)·`METRIC_NEW_CELLS_PER_DAY`(기본 2만)·`RATE_LIMIT_PER_MIN`(기본 120)·`DB_POOL_MAX`(5)·`DB_CONNECT_TIMEOUT_MS`(1.5초 < `READY_TIMEOUT_MS` 2초)·`DB_STATEMENT_TIMEOUT_MS`(5초)·`APP_VERSION`(git sha).
- 로그 가림 목록은 5-2.
- 모니터링: 업타임 체크 2개(`/healthz`, `/m/{고정 코드}`) + 5xx 비율 알림 1개 + 비용 **알림** 3단 + Supabase 디스크·연결 수 알림.

---

## 7. 부하 시험 계획 [v2.1]

- 도구: **k6**(Docker 이미지로 실행, 설치 없음). 결과는 `docs/ops/loadtest/YYYY-MM-DD.md`.
- **두 번에 나눈다(v2.1, 과설계 판정 반영)**
  - **12월 B7(12-14~12-15, 0.5일)** — 소프트런칭 규모에 맞는 것만, 대상은 스테이징: L2, L4(축소), L5(우회 5종), L6. 복원 리허설 1회(임시 프로젝트).
  - **01월 정식 출시 전(01-27~01-30, 0.5일)** — 대상은 운영 설정(min 1): **L1·L3**, L4 원래 크기. Smart CDN이 있는 운영에서 Q12도 함께 확인.
- 가정: 기획 6-7 '링크 하나가 하루 10만 조회', number-one 낙관 첫 달 60만 설치 [팀 추정].

| # | 시나리오 | 언제 | 부하 | 통과 기준 [팀 추정] | 보는 위험 |
|---|---|---|---|---|---|
| **L1** | **입소문 링크**: 한 코드에 HTML + 포스터 + 루프 + 비콘 + 일부 `/get` | 01월 | 하루 10만 → **순간 60 rps 10분** | HTML p95 < 300ms(CDN 적중), 적중률 > 95%, Nest p95 < 150ms, 오류 < 0.1%, 인스턴스 ≤ 2, `link_daily` 합계 오차 < 1% | CDN 미적중 폭주, 비콘 합산 손실 |
| **L2** | **콜드 스타트 크롤러**: min 0에서 20분 유휴 후 새 코드 첫 요청 | 12월 | 10회 | 첫 응답 < 3초(카카오 스크랩 제한 시간 **[확인 필요]**). 데우기는 공유자 근처 엣지만 데우므로 미국 엣지 크롤러(X·iMessage)는 이 기준 그대로 본다 | 미리보기 실패 |
| **L3** | **출시 아침 핑 폭주**: DAU 15만의 40%가 07~09시 | 01월 | 평균 8 rps, **순간 100 rps 5분**(같은 칸 집중) | 오류 0, DB 잠금 대기 없음, 정상 종료 시 합계 오차 0 — **요청 안 flush + SIGTERM flush 구조**(3-6)를 시험한다 | 같은 행 UPSERT 잠금, flush 누락 |
| **L4** | **세이브 올림**: 64KB 본, 5%는 409 | 12월(축소)·01월 | 12월 순간 10 rps 5분 / 01월 순간 20 rps 10분 | `PUT` p95 < 400ms, `parseState` CPU < 30ms/건, 연결 ≤ 15, **삭제 직후 옛 토큰 `PUT` → 401** | 검증 CPU·풀 고갈·부활 |
| **L5** | **남용·우회**(인스턴스 1개 기준) | 12월 | ① 한 IP에서 없는 코드 100 rps ② 같은 IP에서 **UA만 바꿔** 신고 3회 ③ 창 안 **서로 다른 날** 신고 3회(소금 고정 확인) ④ **같은 IPv6 /64 안 주소 3개**로 신고 ⑤ **가짜 XFF**(맨 왼쪽 임의 IP)로 신고 3회·레이트 리밋 우회 + Firebase를 건너 `*.run.app/m/…` 직접 호출 ⑥ 익명 가입 200회 | ①은 분당 30 뒤 429, **②~⑤ 모두 숨김 0건**·리밋 동작, ⑥ 한도 동작 | 열거·악성 숨김 |
| **L6** | **느린 서버**(Q5): toxiproxy로 지연 300ms·1s·4.9s·5.1s, 응답 직전 끊기, 업로드 50%에서 끊기 | 12월(앱 C13과) | 앱 자동 시나리오 | 아침 지연 0, `PUT` 반쯤 성공 → 빨리 감기로 수렴(3-4), 반쪽 판이 `live`가 되지 않고 6시간 뒤 치워짐, 아웃박스 상한 유지 | P1 위반 |

- 실패하면: L1 → `s-maxage`·이미지 크기 조정, L3·L4 → max-instances 5 + 풀 재계산, L5 → 해당 한도 강화 또는 3-8의 Worker 앞단. 12월 결과는 Q5·Q12 근거로 RC1(12-19)에, 01월 결과는 출시 관문에 붙인다.
- 비용: 두 번 합쳐 수 달러 미만.

---

## 8. 비용 재추정 [v2.1]

단가는 v1 출처 기준이고 전부 **[팀 추정]**이다. 단가 자체가 **[확인 필요]**인 항목은 따로 적었다.

| 항목 | 소프트런칭(12-22~01-26, 설치 수백~수천) | 출시 후 10만 설치·DAU 3만 | 낙관 60만 설치·DAU 15만 |
|---|---|---|---|
| Supabase | Pro 25(12-18부터) + 스테이징 Free | Pro 25(MAU 10만·DB 8GB·Storage 100GB·egress 250GB 포함). 계정 사용자 3~4만 | MAU 약 15만 → 초과 5만 × 0.00325 ≈ 165, 컴퓨트 Small +15 → **약 205** |
| DB 크기 | 수십 MB | 맡겨 두기 4만 × 평균 5벌 × 40KB ≈ 8GB → 0~1 | 약 30GB → 약 3 |
| Storage 저장 | 수십 MB | 링크 3만 × 약 1MB ≈ 30GB, 포함 | 약 150GB → 약 1 |
| Storage 전송 | 0 | 조회 월 10만 × 0.85MB ≈ 85GB, 포함 | 조회 월 100만 → 초과 약 600GB × 0.09 ≈ **54** |
| Firebase Hosting(HTML·정적) | Blaze 0~1 | 약 1~3 | 약 5~10 |
| **CanvasKit wasm·루프 전송**(01월 R2 이전 때 `loop.mp4`도 같은 `{pageKey}/loop.mp4` 경로로 R2 공개 버킷에 두고, 격리·삭제·무효화를 R2 쪽에도 똑같이 건다 [확인 필요: R2 캐시 무효화 시간]) | Firebase에서 0~1(`webLive` 01-05부터) | **정식 출시 전 Cloudflare R2(전송 무료)로 옮긴 뒤** 약 1(R2 저장) — 옮기지 않으면 Firebase에서 약 23 | R2 약 1~5 — 옮기지 않으면 약 225 |
| Cloud Run | 무료 한도 안(min 0) | 월 약 300만 요청 → 소액 + **min 1 유휴 약 10~20** [확인 필요: 서울 Tier 2] | max 6~10 상향, 약 **60~100** |
| Cloud Scheduler·Logging·Artifact Registry | 0 | 0~2 | 약 5 |
| ~~EAS Update~~ → 자체 OTA(v2.3) | Cloud Run 송신·저장소에 포함 | 에셋 송신 OTA당 설치 × 약 5MB(br 전) [팀 추정, B6 실측] | 같음 |
| 도메인 `mongmang.ink` | 월 약 3(연 25~40 [확인 필요]) | 같음 | 같음 |
| **합계(월)** | **약 25~30달러 + 도메인** | **약 45~60달러 + EAS Update** | **약 300~400달러 + EAS Update** |

- v2(10만 75~110, 60만 300~550)보다 줄어든 까닭: wasm·루프를 **정식 출시 전에 R2로 미리 옮기는 것**을 기본으로 바꿨다(리뷰 질문 12 답 — Firebase 전송에는 상한이 없고, 예산 알림은 몇 시간 늦게 오며, 입소문은 그보다 빠르다). 01월 0.5일. 옮길 때 CORS·`application/wasm`·압축 전송을 확인한다.
- **알림과 상한은 다르다**(3-8): GCP 예산은 알림일 뿐 지출을 멈추지 않는다. 실제 상한은 Cloud Run max-instances·버킷 상한뿐이고, Supabase Spend cap은 켜면 서비스가 제한될 수 있다 **[확인 필요]**.
- 서버 종료 약속(기획 6-5): 서버를 닫는 경우 비용은 '90일 공지 + 내보내기' 기간만큼.

---

## 9. 일정·구현 순서·레인 [v2.2]

### 9-1. 구현 순서 B0~B8 (빌드 2 12-10·소프트런칭 12-22 기준)

> 원칙: 바이너리에 박히는 것과 측정 장치가 먼저, 사용자 데이터를 받는 기능은 안전 바닥과 함께. 일수는 [팀 추정].

| 순서 | B | 내용 | 날짜 | 서버 | 웹 | 끝났다는 기준 |
|---|---|---|---|---|---|---|
| 1 | **B1 골격 ✔ a817d30** | Nest + Prisma 7 + 로컬 Postgres(compose) + Docker + `/healthz`·`/readyz`(토큰) + CI + **core 원본 번들**(D-21 개정) + XFF·로그 가림·RLS 롤 재현. JWT 검사·EAS 설치 id 조사는 **B2·B6로 넘어감** | 11-20 완료 | 2.0 | — | 로컬 e2e 통과(B0-B1 보고 6-1) |
| 2 | **B6 배포** | GCP·Artifact Registry·WIF·Secret Manager·Cloud Run 스테이징/운영·Firebase 두 사이트(**`/m/**`만 rewrite**)·서울 rewrite 확인·Cloudflare DNS + **XFF 위치 측정·`clientIp` 고정** + **서울 로그 버킷 7일·`/m/` 요청 로그 제외** + 업타임·예산 알림 | 11-24~11-25 | 1.5 | — | 스테이징 `/healthz` 200(직접), `/m/TESTTEST` 200(Firebase), XFF 고정물 커밋 |
| 3 | **B0 측정 시계 ✔ 2240ff2(코드)** | `/ping`(차원 3·값 검증·요청 안 flush 1.5초) + `@mong/contract` + `config/v1.json` + `content/v1.json`(빈 목록) + `/m/*` 임시 정적 + AASA·assetlinks + `metric_daily_k5`·`rollup_metric_daily`. `/privacy`·`/delete` 자리는 B3·B8 | 11-20 완료(배포는 B6) | 1.0 | 0.5 | 운영 도메인에서 `.well-known` 둘·플래그·핑 동작 — **B6 배포 뒤 확인** |
| 4 | **core 함수(v2.1, 서버 레인으로 이관)** | 달 위상·보름 창 **✔ C4 679c4d1**, 모티프 검증 **✔ contract(B0)**. 남은 것: `toPublicSnapshot`·`parsePublicSnapshot`(**3-5-1** 형식) + `fixtures/snap/*` + 핑 `moon` 연결(C11) | 11-28~11-29 | **1.25**(남은 몫은 0-4 재산정 대기) | — | core 테스트 통과, 앱·서버·웹 뷰어가 같은 함수 사용 |
| 5 | **B3 링크·웹 정적** | `bootstrap`(연령 기록·Auth 확인)·`touch`·`page` PUT(**서버가 snap 씀**)·commit(시그니처·해상도)·DELETE·상태 전이·서명 업로드(미커밋 TTL·불투명 경로)·금칙어·`/m` 템플릿·`/get`·비콘·`storage_gc` | 11-30~12-03 | 2.5 | 1.0 | e2e: 켜기 → HTML 메타 → 끄기 → 파일 0, 격리 중 PUT 409 |
| 6 | **B4 모티프·플래그** | 스키마·정적 검사는 B0에서 끝남. 남은 것: 앱 로더 `refresh` 연결 + 크래시 루프 탈출 + `features.ts` 키 추가(3-7-1) + 매니페스트 받기·영구 저장·`revoked` + CI 미리보기 PNG + 첫 원격 모티프 1개로 끝까지 | 12-04~12-05 | 0.5 | 1.0 | CI가 나쁜 모티프를 막고 개발 빌드가 받음 |
| — | (앱) EAS 리허설 | 네이티브 묶음 + 실기기 링크 + **세션 MMKV 백업 제외** 확인 | 12-05 전후 | — | — | 유니버설·앱 링크가 앱을 엶 |
| 7 | **B2 맡겨 두기** | saves·409·반쯤 성공·이력(PUT 안 솎기·`weekly`)·글귀·recover(회전·410)·`DELETE /me`(401 규칙)·삭제 재시도·Scheduler | 12-06~12-11 | 3.5 | — | Q9 시나리오(4-3)가 스테이징에서 자동으로 돎 |
| 8 | **B8 처리방침·라벨**(문서 레인) | ko·en 재작성(5절), Data safety·App Privacy·store-listing 7절, 네트워크 기록 대조 | 12-01~12-08 | — | — | **빌드 2 제출(12-10) 전 게시**. 법률 결과(12-05)가 '동의 필요'면 다시 씀 |
| 9 | **B5 안전** | 신고(대상별 소금·IP 접두)·격리 이동·레이트 리밋 전체·**SQL 함수 + CLI**(관리 도구 대신)·운영 런북(`docs/ops/`) | 12-12~12-13 | 1.5 | — | L5 시나리오 수동 통과, 격리 → 복원 → 확정 한 바퀴 |
| 10 | **B7 부하(12월분)** | L2·L4(축소)·L5·L6 + 복원 리허설(임시 프로젝트) | 12-14~12-15 | 0.5 | — | 7절 기준 통과 또는 조치 기록 |
| 11 | 운영 전환 | 운영 마이그레이션, 비밀 교체, 런북 점검, Pro 결제 확인(12-18 기한) | 12-16 | 0.5 | — | 운영 스모크 통과 |
| — | **웹 뷰어 live**(웹 레인) | CanvasKit 지연 로드·core 몸 생성·숨·깜빡임·톡 반응, `webLive` 꺼짐으로 배포 | 12-08~12-19 | — | 3.0 | Playwright 4종 통과 |
| | | | **합계** | **14.75** | **5.5** | 12-16~12-21이 버퍼 |

- **합계 정정(리뷰 I13)**: v2 표는 '15.0 + 운영 0.5 = 15.5'라 적었지만 운영 0.5가 이미 15.0에 들어 있어 실제는 15.0이었다. v2.1에서는 관리 도구 −1.0(01월로), B7 −0.5(L1·L3를 01월로), **core 함수 +1.25** → **14.75일**. B6·B3·B2·B5 안에 들어간 v2.1 항목(XFF·로그 버킷·서버 snap 작성·상태 전이·401 규칙·대상별 소금)은 각 단계 안에서 흡수한다 [팀 추정]. 기획 4-1 서버 14.0과의 차이 +0.75는 core 몫이다. 웹은 v2의 6.0에서 관리 화면 0.5가 01월로 빠져 **5.5**(기획 5.0 대비 +0.5는 정적 → live 폴백·Playwright).
- **빠듯한 곳**: B3는 2.5일에 할 일이 열 가지가 넘는다. 넘치면 12-16~12-21 버퍼를 쓰고, 그래도 넘치면 B3의 비콘·`touch`를 OTA #2(12-29) 직전으로 미룬다(링크 켜기 OTA 전까지만 있으면 된다).
- **01월(정식 출시 전) 서버 몫**: `mong-admin` 1.1(화면·CSRF 포함) · L1·L3 재실행 0.5 · wasm·루프 R2 이전 0.5 = **2.1일** (+ 법률·요금 판단에 따라 자체 업데이트 서버 2.0 — 이 경우 **빌드 2 전**에 해야 하므로 B4 뒤로 당겨 들어간다).
- **오너 계정이 늦을 때(리뷰 I13)**: 11-23까지 계정이 없으면 core 함수(4)와 B3(5)를 **로컬 Supabase CLI에서 먼저** 하고(11-24~11-28), B6·B0은 계정이 생긴 다음 날부터 한다. 단 B0의 `.well-known`은 **12-04까지** 운영 도메인에 떠 있어야 12-05 리허설이 산다. 그 날짜를 넘기면 리허설에서 링크 확인을 빼고 빌드 2 직전에 다시 확인한다.

### 9-2. 레인별 일정 [v2.1]

| 레인 | 11-21 ~ 11-30 | 12-01 ~ 12-10 | 12-11 ~ 12-21 | 12-22 ~ 01-15(소프트런칭) | 01-16 ~ 출시 |
|---|---|---|---|---|---|
| **서버** | B1 → B6 → B0 → core 함수 → B3 시작 | B3 끝 → B4 → B2 시작 | B2 끝 → B5 → B7 → 운영 전환(12-16), 버퍼 | 운영·신고 처리(Studio·CLI)·지표 SQL·플래그 올리기, 1.0 직후 소셜 설계 | `mong-admin`, L1·L3, R2 이전, 출시 주 min 1 |
| **웹** | `/m` 정적 틀 | 정적 페이지 완성, live 시작 | live 완성(`webLive` 꺼짐) | `webLive` 0.2 → 1.0 | Q11 외부 5명 비교 |
| **문서** | 처리방침 초안, **법률 질문서(11-24 발송)** | **B8 게시(12-08)** | Q13 대조 | 갱신 | 법률 검토 반영 |
| **앱(서버 연동 몫)** | — | **빌드 2(12-10)**: 핑+아웃박스(열기 포함), `nt` 설치 때 확정·`wg` 7일째 고정, 플래그 로더, `expo-updates`(둘째 실행부터 확인), 링크 설정, 위젯 모듈 자리(`getInstalledCount`), **세션 MMKV 백업 제외** | 맡겨 두기 OTA 준비, 중립형 연령 확인 화면 | **OTA #1 맡겨 두기(12-24 전후)** → **OTA #2 링크·딥링크 시트·OG·루프 업로드(12-29 전후)** → 원격 모티프(01-08 전후) → **위젯 화면 스토어 업데이트(01-08 전후)** | 판정 01-21~01-26 |
| **오너** | **계정·결제(11-21~22 주말)**, 법률 질문 확정, Team ID(11-26), Play 앱 서명 SHA-256(11-30) | **EAS 요금 확정(12-01)**, 법률 검토(12-05), 처리방침 빈칸 | Pro 결제(12-18) | 신고·삭제 메일 주 2회 | 출시 승인 |

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

- **iOS(TestFlight)**: 위 날짜는 Android 기준이다. iOS는 그 기능이 든 번들로 **베타 심사를 다시 받거나 '테스트할 내용'에 적은 뒤** 켠다(3-11). 베타 심사에 하루 이틀이 들면 iOS 켜기가 그만큼 늦는다 [확인 필요: 베타 심사 소요].
- **판정 날 미리 알 것**: 01-21~01-26에 D30은 표본이 모자라 **D14 대체 규칙(기획 10-1)이 판정한다**(3-6).
- 늦어질 때 미루는 순서(기획 4-1과 같음): `webLive` → 원격 모티프(번들로) → 되찾기 UI 다듬기. **맡겨 두기·링크 정적·안전·삭제는 미루지 않는다.**

### 9-3. 오너가 해야 할 일 [v2.1]

| 언제까지 | 일 | 비고 |
|---|---|---|
| ~~도메인~~ | **완료(11-20 `mongmang.ink`)** | D-21 |
| **11-21~22(주말)** | GCP 계정·**결제 계정**·프로젝트 `mongmange`(Cloud Run·Artifact Registry·Secret Manager·Scheduler·Logging·Firebase, Blaze), 예산 알림 | B6이 11-24 시작. 늦으면 9-1 순서 교체안 |
| **11-21~22** | Supabase 조직·프로젝트 2개(서울) | 운영은 12-18 Pro |
| 11-23 | GitHub Actions·Environments(승인자 = 오너), Cloudflare DNS 접근 | 프록시 끔 |
| **11-24** | **법률 검토 질문 발송**: 14세(제22조의2)·국외 이전 고지(제28조의8)·EAS 설치 id·장기 미이용 고지·획 시간·필압·캐나다(PIPEDA·퀘벡 Law 25)·필리핀 DPA·뉴질랜드 Privacy Act | 5-4. 결과가 12-05에 와야 12-08 게시가 가능 |
| 11-26 | Apple Team ID, App ID Associated Domains | AASA |
| 11-30 | Play Console **앱 서명 키 SHA-256**(빌드 1 업로드 뒤 보임) | assetlinks |
| **12-01** | **EAS 요금 확정**(Updates MAU 단가·비율 배포·코드 서명 조건) → EAS로 갈지 자체 업데이트 서버로 갈지 결정 | 업데이트 주소가 빌드 2 바이너리에 박힘(3-11) |
| 12-05 | 법률 검토 결과 수령 | B8 |
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
| 19 | **EAS Update 비용·정책 변화** | 요금 고지 | 업데이트 주소가 바이너리에 박혀 있어 **바꾸려면 스토어 업데이트**가 필요하다. 그래서 요금·법률 판단을 빌드 2 전에 확정한다(3-11). 출시 뒤 즉시 할 수 있는 것은 OTA 빈도를 낮추는 것뿐 |
| 20 | **지표 칸이 너무 잘아 판정 불가** | 군별 n이 기획 10-1 최소 표본 미달 | 기획 10-1의 '미판정 → 기본값' 규칙 그대로. 차원을 더 늘리지 않는다 |
| 21 | **`wg` 감지가 빌드 2에 빠짐** | 핑의 `wg`가 전부 `?` | 위젯 스토어 업데이트(01-08)에 넣음, 그 전 위젯 리텐션은 참고값 없음 |
| 22 | **밤물(1.0 직후)이 개인정보 범위를 슬쩍 넓힘** | 처리방침 없이 `night/drop` 배포 | 밤물 OTA와 처리방침·라벨 갱신·D-23 개정을 같은 릴리스로 묶는 체크(3-13) |
| 23 | **조작된 앱이 아무 이미지를 OG로 건다** | 신고 | 서버가 픽셀을 다시 그리지 않으므로 막을 수 없다. `commit`은 시그니처·해상도만 확인하고, 내용 위험은 신고 → 격리로 **감수한다**(3-5) |
| 24 | **삭제한 계정이 옛 토큰으로 되살아남** | 삭제 뒤 행 재생성 | `users` 없으면 401, `bootstrap`은 Auth로 확인, 앱이 세션·아웃박스를 비움(3-8) |
| 25 | **OS 백업 복원으로 두 기기가 세션을 공유해 둘 다 끊김** | 복원 직후 '맡겨 두기 끊김' 문의 | 세션 MMKV 백업 제외(3-3), Q9 시나리오(4-3) |
| 26 | **가짜 XFF로 신고·레이트 리밋 우회** | 한 출처의 신고가 숨김을 일으킴 | `clientIp` 고정(B6 측정), 안 되면 Cloudflare Worker 앞단(3-8), L5 ⑤ |

---

## 11. 리뷰 질문 [v2.1]

다음 리뷰(D-21 확정 전 마지막 확인)에 봐 달라고 부탁하는 곳.

1. **XFF 신뢰 위치**(3-8): B6 측정에서 Firebase 경로와 `*.run.app` 직접 경로를 구분할 표지가 없으면 `/m/**` 앞단을 Cloudflare Worker로 바꾸는(0.5일) 판단이 맞는가.
2. **격리 30일 경과 기본값 = 확정**(3-8 ⑤·3-9): 오탐이면 주인이 링크를 잃는다. 복원이 기본이어야 하는가.
3. **Supabase Spend cap**(3-8·8): 정식 출시 때 켜 둘 것인가(입소문 순간 차단 위험 대 비용 폭주).
4. **중립형 연령 확인**(3-3 ③): 연·월 휠, 기본값 없음, 기준 숫자 비노출, 경계 달 통과 처리가 Families·한국법 취지에 맞는가.
5. **EAS 첫 확인을 둘째 실행부터로**(3-11): 실질적인 완화인가, 아니면 처음부터 자체 업데이트 서버로 가야 하는가(빌드 2 전 결정).
6. **iOS 2.3.1 운영 부담**(3-11·9-2): 소프트런칭 중 OTA 기능을 켤 때마다 TestFlight 베타 심사를 다시 받으면 iOS가 며칠씩 늦는다. 받아들일 것인가.
7. **웹 삭제는 글귀가 있을 때만**(3-8): 링크만 켠 사용자는 웹 삭제 수단이 없다. 링크를 켤 때도 글귀를 발급할 것인가.
8. **`wg`를 7일째 값으로 고정**(3-6): 기획 6-4의 '위젯 사용자 리텐션' 의도와 맞는가.
9. **서버 14.75일**(9-1): B3 과밀을 버퍼 12-16~12-21로 흡수한다는 판단이 충분한가.
10. **앱 API를 `*.run.app` 직접으로**(2-1): 호스팅을 옮길 때 주소는 OTA로 바꿀 수 있다(`EXPO_PUBLIC_API_BASE`). 그 판단과, 커스텀 도메인 없이 Google 주소를 쓰는 것의 문제 유무.

**v2 리뷰 질문(13개)의 처리**

| v2 # | 질문 | v2.1 처리 |
|---|---|---|
| 1 | 신고자 48시간 해시 | 반영 — 대상별 소금·IP만·7일 창(3-8). 기획 6-5 문구 수정은 13절 |
| 2 | 격리 = 즉시 삭제로 읽어도 되나 | 닫힘 — 공개 경로에서 약 1분 안. 다시 만들기 우회 차단(3-9) |
| 3 | Q12 문구 | 보강 문구 제안(3-9, 13절) |
| 4 | 밤물 = 세 번째 계정 생성 | **D-23 개정 제안**(13절) |
| 5 | 지표 차원 | 재정의(3-6). `wg` 함수가 앱 레인 빌드 2 투두에 있는지는 **PM 확인** |
| 6 | 조회 비콘 | 처리방침 '웹 페이지' 절 + `/m/` 요청 로그 미수집(5-1·5-2), 표기 '페이지 로드 수' |
| 7 | EAS 설치 id | 첫 확인을 둘째 실행부터, 법률 질문, 빌드 2 전 결정(3-11·5-4) |
| 8 | 관리 도구 접근 | 01월로 미룸 + CSRF(3-12) |
| 9 | 공수 | 14.75일(9-1) |
| 10 | 장기 미사용 고지 | 문구 단순화(5-5) |
| 11 | 기획과 다르게 정한 곳 | 닫힘 — 기획 문구 수정은 13절 |
| 12 | wasm R2 | 정식 출시 전 미리 이전(8) |
| 13 | 이력 4주와 Q9 | 닫힘 — Q9 시나리오 3개 추가(4-3) |

v1 질문 중 열린 것: ① 인장 코드를 서버 난수로(정본 C-integrated 2-2·`pillars.ts` 주석 수정은 정본 담당) ⑤ Firebase 서울 rewrite(12절 #1).

---

## 12. 확인 필요 — 기능을 켜기 전에 꼭 확인할 13개 [v2.1]

문서의 나머지 [확인 필요](wasm 실제 크기, 도메인 갱신가, 서울 Tier 단가, 서명 업로드에 버킷 상한이 걸리는지, Studio 비공개 미리보기, Play 타깃 연령 묶음, MMKV 백업 제외 방식, `gcloud` 프록시, Cloud Run CPU 할당 전제, 베타 심사 소요 등)는 해당 단계에서 확인한다.

| # | 항목 | 절 | 언제 | 누가 | 안 되면 |
|---|---|---|---|---|---|
| 1 | Firebase Hosting → Cloud Run **서울 rewrite**(이제 `/m/**`만) | 2-3 | **B6 첫날 11-24** | 서버 | Cloudflare Worker 프록시 |
| 2 | Firebase 경로·직접 경로의 **XFF 신뢰 위치**와 두 경로를 구분할 표지 | 3-8 | **B6 첫날 11-24** | 서버 | `/m/**` 앞단 Worker(비밀 헤더 + `CF-Connecting-IP`) |
| 3 | **Supabase Smart CDN** 삭제 무효화·요금제 조건 | 2-4·3-9 | B5 12-12(운영 설정에서) | 서버 | Q12 '약 1분'을 '최대 1시간'으로 고치고 숨김 때 Firebase 재배포 |
| 4 | **Cloud Logging** 서울 버킷·보존 7일·`_Default` 싱크 이전·`/m/` 제외 필터 | 5-2 | B6 11-25 | 서버 | 처리방침의 보존 기간·위치를 실제 값으로 |
| 5 | **EAS Update 설치 id** 전송 여부·끌 수 있는지·보존 | 3-11·5-4 | B1 조사 11-23, 법률 12-05 | 서버·오너 | **해결(11-24 오너 결정 3 → V21 자체 서버, `ota-self-host.md`)** |
| 6 | **EAS 요금**(Updates MAU 단가·비율 배포·코드 서명) | 3-11·8 | **12-01** | 오너 | 같음 |
| 7 | `runtimeVersion: fingerprint`·시작 크래시 복구 조건 | 3-11 | 12-05 리허설 | 앱 | `appVersion` 정책 + 수동 롤백 런북 |
| 8 | `react-native-android-widget` 설치 개수 노출(`wg`) | 3-6 | 빌드 2 전 12-05 | 앱 | Android `wg = '-'` → 01-08 스토어 업데이트 |
| 9 | Data safety '앱 상호작용'·'기타 앱 활동'·기기 ID, Apple Usage Data Linked 분류 | 5-1 | B8 12-08 | 문서 | 보수적으로 넓게 선언 |
| 10 | Play·App Store **캠페인 링크** 귀속 실검증 | 3-6 | 링크 켜기 전 12-28 | 성장·오너 | 퍼널은 비콘·302까지만 판정 |
| 11 | Supabase JWT 서명 방식(비대칭)·새 API 키 체계 | 3-3 | B1 11-22 | 서버 | 비대칭 전환 후 진행(HS256 거부 원칙 유지) |
| 12 | 카카오 스크랩 제한 시간·캐시 초기화 도구 | 3-9·7 | 링크 켜기 전 12-28 | 서버 | 런북에 '외부 카드 잔존' 고지, L2 기준 조정 |
| 13 | 모티프 셰이더 파라미터와 App Store 2.5.2 해석 | 3-10 | 원격 모티프 켜기 전 01-05 | 오너·아트 | 경로·문구만 원격, 셰이더 값 고정 |

---

## 13. 정본 개정 제안 (PM이 DECISIONS·기획에 반영) [v2.1]

이 문서는 DECISIONS와 기획을 고치지 않는다. 아래는 PM이 반영할 제안이다.

- **D-23 개정(한 줄)**: "계정은 첫 링크 켜기·맡겨 두기 때 생기며, **1.0 직후 밤물을 열 때도 생긴다**(셋 모두 직전에 중립형 연령 확인)."
- 기획 6-5 신고 문구: "신고자를 식별하는 정보는 저장하지 않으며, 같은 사람의 중복 신고를 가려내려고 IP에서 만든 **신고 대상별 가명 값을 최대 7일** 보관한 뒤 파기한다."
- 기획 10-2 Q12: '즉시' → '**약 1분 안**', 끝에 '외부 서비스가 이미 만든 미리보기 카드와 이미 내려받은 브라우저 캐시는 범위 밖(카카오는 런북으로 초기화)'.
- 기획 P9: '설치만 한 사람은 서버가 모른다' → '**우리** 서버는 모른다(OTA 배포사는 설치 id를 받을 수 있다)'.
- 기획 6-1 플래그 '6시간' → 1시간(+ 포그라운드 15분), 6-2 모티프 'Storage 자산' → Firebase 정적(Git).
- 기획 2-5·6-2 '관리 API 없음' → '소프트런칭 Studio + SQL 함수 + CLI, 정식 출시 전 `mong-admin`'.
- D-06(13+)·D-23(14+)·store-listing의 연령 선언을 한 줄로 맞춘다(Play 타깃 연령 묶음 확인 뒤).
- 12-05 법률 검토 범위를 5-4대로 넓힌다(캐나다 퀘벡·필리핀·뉴질랜드, EAS 설치 id, 획 시간·필압).

---

## 부록 A. 판 사이 정리 기록 [v2.2]

구현자가 매번 읽을 필요는 없는 기록이다. 규칙의 정본은 본문 절이다.

#### A-1. 변경 이력

| 판 | 날짜 | 내용 |
|---|---|---|
| v1 | 2026-11-20 | 초안. 오너 스택 지정 반영, 인프라 층 한정 |
| v2 | 2026-11-20 | 기획 v2.2 2차 반영. 아래 'v1 → v2' 표 |
| v2.1 | 2026-11-20 | 서버 v2 독립 리뷰 반영. 아래 'v2.1 반영표'. D-21 확정 |
| **v2.2** | 2026-11-20 | 로드맵 A4: 기획 6-2 '더할 것' 열 대조(부록 A-2), 문서 ↔ 구현 차이 정리(부록 A-3), 로드맵 → 절 대응표(0-3), 빠진 설계 채움(3-4-1 이력 모델, 3-5-1 공개 스냅숏 `snap:1`, 3-5-2 `nameVisibility`, 3-5-3 8초 루프 슬롯, 3-7-1 플래그 대응, 3-10 모티프 팩 = contract) |

**A4 리뷰 반영표(리뷰 → 이 문서)** — `docs/team/reviews/2026-11-20-a4-review.md`

| 리뷰 | 반영(팀 결정) | 절 |
|---|---|---|
| 맞춤 오류 2 | `saves.device_id` 삭제(B1 스키마와 같음) / 이름 규칙 = core `normalizeName`, 서버도 같은 함수 | 3-1·3-5-2 |
| I1 이력 4주 | `overwritten`·`weekly` 28일, 기간·개수 중 먼저 걸리는 쪽. '최대 4주' e2e 시나리오 | 3-4-1 |
| I2 기기 값 | **받지 않음**. 처리방침 ko·en 3-5 고침, 라벨은 B8 체크 | 3-1·0-3 B8, 처리방침 |
| I3 | `weekly` INSERT `ON CONFLICT DO NOTHING` → 안 나오면 `overwritten` | 3-4-1 |
| I4 | 첫 PUT 동시 = `ON CONFLICT` + 재시도로 결정적 응답, 행 없음·`If-Match` 409, 모든 쓰기 `saves FOR UPDATE`, 이력 조회에 `creature_id`, API는 `public_id`, `restore` 404 | 3-4-1 |
| I5 | `recover`는 `bootstrap` 없이 — 새 기기 `sub`를 기존 사용자에 붙임(`user_auth`), 흐름표 / 삭제 상태 = 영수증 토큰(인증 없음, 24시간) | 3-1·3-2·3-3 ⑤·3-8 |
| I6 | 스키마 +1까지만 원문 보관, gzip 256KB, 하루 이력 4MB, 계정 생성 IP 접두 5/시간·20/일 + 전체 상한, `conflicts` 10/일 | 3-4-1·3-8 |
| I7·I8 | `snap:1`에 `base`·`anc`·`combGrowth`, 몸 = 렌더에 쓴 몸, `age` → 농도 단계 `st`, `ring` = `snap:2`, core 착수 조건 5개 | 3-5-1 |
| I9 | `/m` `s-maxage` 5분 + CDN 무효화(B3 체크), 이스케이프 규칙, 숫자 7개 연속 거부(core B2), 포스터·루프 렌더에 이름 인자 없음 | 3-5-2·3-9 |
| I10 | 비공개 `page-staging` 버킷 → 커밋 때 공개로, 콘텐츠 유형 고정, 서명 URL 유효 시간 [확인 필요] | 2-4·3-5-3 |
| I11 | `DELETE /me` 연쇄 삭제 목록(커밋 전·지난 판·격리·모든 `sub`) | 3-8 |
| 사소 S1~S12 | `moon` 식 통일, θ `mod` 먼저·d 범위 밖 422, 24획 넘을 때 규칙, `meta.media` 삭제(R2는 8절), '최대 3', `restore` 뒤 앱 할 일, `rev` 역행 의도, `name_blocked` 해제·문구 대기, 금칙어 시 앱 이름 통일(처리방침 5절도), MP4 상자 실패 규칙, 예시 자리표시자 표시·Scheduler OIDC | 각 절 |
| 과함 | 변경 이력·반영표·6-2 대조·문서 ↔ 구현 표를 이 부록으로. '서버가 snap.json을 쓴다'·'이름을 그리지 않는다'·업로드 수명은 3-5-1·3-5-2·3-5-3 한 곳에 두고 나머지는 절 번호로 | 부록 A·3-5 |

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

> **[D-25 갱신 11-20]** 원격 모티프 스키마 1은 docs/design/content-v1/dreams-30days.md v1.1을 정본으로 따른다: `zone`·`family` 정식 필드(tags 접두 아님), `scene` 필수(접근성 장면 문장), `line` 상한 ko 22·en 45. (v2.2: 표 사이에 있던 이 줄을 표 아래로 옮겼고, 3-10 본문에 반영했다.)

**v2.1 반영표(리뷰 → 이 문서)**

| 리뷰 | 반영 | 절 |
|---|---|---|
| C1 신고·IP | 키 = **IP만**(IPv4 /32, IPv6 /64로 접음), **신고 대상마다 소금 하나**, 판정 창 = 소금 수명 = 7일, 믿을 `X-Forwarded-For` 위치를 경로별로 고정(B6 측정), L5에 우회 5종 | 3-8·7 |
| C2 공개 스냅숏 | `snap.json`은 **서버가 검증한 뒤 직접 쓴다**. 기기는 이미지·영상만 올리고, 버킷 상한 + `commit`의 시그니처·해상도 검사, 미커밋 업로드는 6시간 TTL, 경로는 불투명 난수 | 2-4·3-2·3-5 |
| C3 지표 | `nt`는 설치 때 확정해 늘 A/B, `wg`는 7일째 값으로 고정, `moon`은 날짜 고르기용. 빌드 1·지표 끔·오프라인의 분모 규칙, **요청 안 flush**, 값 범위 검증·설치 수 대조, D30은 기획 10-1 그대로(사실상 D14 대체 규칙이 판정) | 3-6 |
| I1·I2·I5·I6 삭제·계정 | `users`가 없으면 401, `bootstrap`은 Auth로 확인, 세션은 **백업 제외 MMKV**(빌드 2 묶음), 웹 삭제는 글귀가 맞을 때만, 격리 중 다시 만들기 409(상태 전이표), 되찾으면 글귀 회전·옛 기기 410 | 3-2·3-3·3-8·3-9 |
| I3·I4 개인정보·법 | **앱 API는 Cloud Run 서울에 직접**(`/m/**`만 Firebase), 서울 로그 버킷 7일, IP와 링크 코드를 같은 로그에 남기지 않음, 국외 이전 고지 항목 보강, 법률 검토에 캐나다(퀘벡)·필리핀·뉴질랜드, EAS 첫 확인은 둘째 실행부터, 연령 확인은 **중립형**(태어난 해·달) | 2-1·3-3·3-11·5 |
| I8~I12 | 관리 도구 CSRF, `creatures UNIQUE(user_id)` DB 제약, iOS 2.3.1 플래그 원칙, EAS 요금 빌드 2 전 확정(근거 없는 숫자 삭제), `link_daily` 30일 뒤 코드 없이 말기 | 3-1·3-11·3-12·8 |
| 과설계 | `mong-admin`은 정식 출시 전(01월)으로, 소프트런칭은 Studio + SQL 함수 + CLI(Studio 미리보기는 [확인 필요]). L1·L3는 01월 재실행에 합침 | 3-12·7·9 |
| I13 일정 | 합계 정정(v2 표기 15.5 → 실제 15.0), core 함수 1.25일을 서버 레인에 배정 → **14.75일**, 오너 계정 주말 요청·늦을 때 순서 교체안 | 9 |
| 사소 S1~S12 | 최근 3벌은 PUT 안에서 솎음, `weekly` 표시 시점, 글귀 회전·pepper 판, 로그 가림, JWT 검사 항목, 레이트 리밋 근사, 데우기 한계, `BUNDLE_SEQ` 단일 증가, 알림 ≠ 상한, 복원 리허설은 임시 프로젝트, 코드 회전 1.0.x, `DIRECT_URL` 이름 | 각 절 |
| 리뷰 질문 4 | D-23 개정 제안 한 줄 | 13 |
| [확인 필요] 13 | 담당·시점 표 | 12 |


#### A-2. 기획 v2.2 6-2 '더할 것' 열 대조 [v2.2]

A3 반영표(#14)는 '6-2 전부 v2.1에 이미 반영'이라 적었다. 항목마다 다시 보니 **이름·자리는 있으나 B2·B3가 바로 짤 수 있는 형식이 빠진 곳**이 넷이었다(아래 '부분'). v2.2가 그 넷을 채웠다.

| 6-2 '더할 것' | v2.1 문서 | 실제 구현(코드) | v2.2 처리 | 절 |
|---|---|---|---|---|
| 계정 생기는 때 셋 + 중립형 연령 확인, `under14` 서버에 없음 | **있음**(3-3 ②③, 3-13, 5-3) | 열만 있음: `users.age_gate_v`·`age_confirmed_on`(B1 `prisma/schema.prisma`). `bootstrap`은 B3 | 그대로 | 3-3 |
| 세이브 이력 **최대 4주**(최근 3 + 주 1벌 4주 + 충돌본 30일) | **부분** — 규칙은 3-4에 있으나 API·응답·복원 의미·충돌본을 누가 올리는지가 'v1 그대로'로만 적혀 있었다. v1 본문은 이 파일에 더 이상 없어 B2가 이 문서만으로 착수할 수 없었다 | 없음(`saves`만 B1, `save_versions` 미생성) | **3-4-1 새로 씀**: 표 열·색인·PUT 트랜잭션·솎기 SQL·충돌본 업로드·복원·용량 | 3-1·3-4·3-4-1·5-5 |
| `public_meta`에 **파생 획 스냅숏**(≤64점 × 획 + attach + 타고남 요약) | **부분** — 넣고 빼는 표, 이름 `snap:1`, 상한 32KB만. 필드·양자화·획 수 상한·검증 실패 규칙 없음 | 없음(core `toPublicSnapshot`·`parsePublicSnapshot` 미구현, 로드맵 'core 함수') | **3-5-1 새로 씀**: `snap:1` 필드표·int16 양자화·획 24 + 스밈 39 상한·크기 계산·서버 검증 | 3-5-1 |
| **`nameVisibility`(기본 끔)** | **부분** — `nameVisible`·`nameAllowed` 흐름은 있음. 기획 용어와의 대응, '실제로 보이는' 조건, 어느 표면에 걸리는지 표가 없음 | `creatures.name_visible` 기본 `false`(B1) | **3-5-2 새로 씀**: 용어 대응·유효 조건·표면별 표·바꿀 때 절차 | 3-5-2 |
| **8초 루프 영상 1개 업로드 슬롯** | **부분** — 규격·상한·`commit` 시그니처 검사는 있음. 업로드 → 저장 → 만료의 수명이 여러 절에 흩어져 있고 길이 검사가 없음 | 없음 | **3-5-3 새로 씀**: 슬롯 수명표(발급·올림·커밋·교체·끄기·격리·삭제·R2 이전) | 3-5-3 |
| 공개 값은 '켜기·다시 만들기' 때만 | 있음(3-5) | 없음 | 그대로 | 3-5 |
| Q12 약 1분 / 1시간 | 있음(3-9) | `/m/**` 캐시 헤더만(`firebase.json`) | 그대로 | 3-9 |
| 집계 칸 차원 `nt`·`wg`·`moon` | 있음(3-6) | **구현됨**(B0): `pingDimsSchema`, `metric_daily` 열. 다만 핑 모양·쓰기 상한·원표 접근이 문서와 다름, `moon`은 아직 늘 `'0'` | 문서를 구현에 맞춤(부록 A-3 #7~#13), `moon` 연결 규칙 명시 | 3-6 |
| 플래그 키 5개(`nameTiming`·`jeongCaptions`·`moonNight`·`widget`·`webLive`) | 있음(3-7, 키 9) | `REMOTE_FLAG_KEYS` 9개 일치. **앱 `FEATURE_DEFAULTS`에는 다섯 키가 없고** 원격 층이 `isOn`에 아직 연결되지 않음 | **3-7-1 새로 씀**: 원격 키 ↔ 앱 기능 대응표·기본값·읽는 곳, config 스키마를 구현대로 | 3-7·3-7-1 |
| 모티프 팩 = Firebase 정적 + 매니페스트 `/content/v1.json` | 있음(3-10) — 단 예시 파일이 D-25 이전 모양(`zone`·`family`·`scene` 없음)이고 검증기를 core `parseMotif`로 적음 | **구현됨**(B0): `contentManifestSchema`·`motifFileSchema`(contract), 정적 빌드가 해시·바이트 검사, 빈 매니페스트 배포 준비 | 예시·규칙을 contract와 같게 고침 | 3-10 |
| 관리 도구: Studio + SQL 함수 + CLI → 01월 `mong-admin` | 있음(3-12) | 없음(B1은 `admin` 모듈을 일부러 뺌) | 그대로 | 3-12 |
| 삭제·장기 미사용 2년 규칙을 1.0 처리방침에 | 있음(5-5) | `users.last_active_month` 열만(B1) | 그대로 | 5-5 |

#### A-3. 문서 ↔ 구현 차이 — 구현에 맞춘 것 [v2.2]

구현이 문서보다 앞서거나 다르게 정한 곳이다. 모두 리뷰를 거친 팀 결정이라 **문서를 구현에 맞췄다**. 근거 열의 'B0 결정'은 DECISIONS 'B0 측정 시계 구현 결정' 절, 'B0-B1 n절'은 `docs/design/server-v1/B0-B1-report.md`.

| # | 무엇 | v2.1 문서 | 구현 | 고친 절 | 근거 |
|---|---|---|---|---|---|
| 1 | core를 서버에 넣는 법 | core `tsup → dist` + `exports` 조건 분기 | 서버 tsup이 **core 원본을 번들**에 넣는다(core `main`·`exports` 그대로, 앱 영향 0). CI `check:bundle`이 dist의 `@mong/core`·`@mong/contract` import 0건, core 런타임 의존성 0개를 검사 | 6-1·6-2 | DECISIONS 'D-21 확정' 절 빌드 방식 개정 줄, B0-B1 2절 1·6절 I6 |
| 2 | Docker 운영 의존성 | `pnpm deploy` + `nodeLinker: hoisted` [확인 필요] | `--prod --filter server` 설치(번들 안이라 워크스페이스 패키지 없음), 베이스 이미지·액션 다이제스트 고정, 파일 root 소유 + `USER node`. 압축 94.6MB | 6-2 | B0-B1 2절 2·4, 6절 사소 7·8 |
| 3 | `/readyz` | 인증 없음, DB `select 1` | **`READY_TOKEN`**(운영 필수, 16자+): `x-ready-token`이 다르면 404. 결과 캐시 2초·단일 비행, OpenAPI에서 제외, 레이트 리밋 적용. DB 연결 제한 1.5초 < 프로브 2초 | 3-2·6-4 | B0-B1 6절 I2 |
| 4 | 믿을 XFF 위치 | `clientIp(req, routeGroup)` 설계, N은 B6 측정 | 환경 변수 **`TRUSTED_PROXY_HOPS_API`·`TRUSTED_PROXY_HOPS_WEB`**(운영에서 둘 다 1 이상 아니면 부팅 거부). 로컬 기본값 API 1·WEB 2는 compose 전용, 실측은 B6 | 3-8 | B0-B1 6절 I1 |
| 5 | 계약 패키지 | `packages/api-contract`(OpenAPI 타입) | **`packages/contract`(`@mong/contract`, `zod/mini` 4.6.7, 한 파일)** = 원격 계약(핑·`config/v1.json`·`content/v1.json`·모티프 파일). 서버 HTTP 요청 스키마는 zod → `openapi.json`(CI 산출물, `pnpm --filter server openapi`) | 3-2·6-1 | B0 결정 '원격 계약' 줄 |
| 6 | 모티프 검증기 위치 | core `parseMotif` | contract `motifFileSchema`·`contentManifestSchema`. core는 의존성 0 계약이라 **구조 타입만**(`moon/motifs.ts`) 두고, 둘의 일치는 `apps/mobile/test/moon-contract.test.ts`가 묶는다 | 3-10·4-3·6-1 | B0 결정, C4 |
| 7 | 핑 모양 | '열기'는 별도 칸, `appVer: "1.0.0(14)"` | '열기' = `events` 안의 `{e:"open"}` 항목. **`appVer` = 출시 판 `1.0`**(빌드 번호 없음), 서버는 `METRIC_APP_VERSIONS` 목록의 판만 받음. 모든 객체 strict | 3-6 | B0 결정 '핑 모양' 줄 |
| 8 | 쓰기 방식 | 요청 안 flush(10초) | + **요청이 기다리는 상한 1.5초**(넘으면 쓰기는 뒤에서 계속, 응답 204), 앱은 10초 시간 초과도 '보냄'(중복보다 유실). 메모리 칸 상한 5,000, **인스턴스당 하루 새 칸 상한 2만**(`METRIC_NEW_CELLS_PER_DAY`), 종료 flush 최대 3번 | 3-6 | B0 결정 '중복보다 유실'·'칸 보호' 줄 |
| 9 | 원표 접근 | 대시보드 SQL이 `count < 5`를 '기타'로 | 원표 `metric_daily`는 **서비스 롤만**. 사람은 **뷰 `metric_daily_k5`**(count ≥ 5)를 조회 롤 **`metrics_reader`**로만. 원표 내보내기·테스터 기간 열람 금지 | 3-1·3-6 | B0 결정 '원표 접근' 줄, `docs/ops/metrics/README.md` |
| 10 | 90일 말기 | `pg_cron`이 월 단위로(03월부터) | **구현됨**: `metric_monthly` + `app.rollup_metric_daily(cutoff)`(삭제·월 합계 한 문장). 월 표에는 `day`·`cohort_day`(달로 접음)·`wg`·`moon` 칸이 없다. 실행 예약(pg_cron 매일)은 B6 | 2-4·3-1·5-5 | B0 결정 '90일 말기' 줄 |
| 11 | 판정 전 오염 검사 | 설치 수 × 1.2 대조 | + **단조 검사** `docs/ops/metrics/monotonic-check.sql`(n일째 열기·평생 1회 사건이 설치일 열기보다 많은 코호트 묶음은 판정에서 뺌) | 3-6 | B0 결정 '칸 보호' 줄 |
| 12 | `moon` 값 | '그날 현지 날짜가 보름 창이면 1(core 함수)' | 앱은 `deps.isMoonWindow?.(이벤트 현지 날짜)` 자리만 있고 **지금 늘 `'0'`**. 연결 규칙을 3-6에 고정: core `isMoonWindow(cohortDay + events[].dayN, tzOffsetMin)`(일어난 날 — 3-6이 정본). 연결 전에는 핑을 켜지 않는다(게이트) | 3-6 | C4 679c4d1, B0 리뷰 m10 |
| 13 | 핑 켜짐 조건 | 설정에서 끄면 안 보냄 | **서버 주소 AND 사용자 동의**(`apps/mobile/src/net/gate.ts`). 설정 토글 연결 전에는 `METRICS_SETTING_CONNECTED = false`로 늘 꺼짐. 주소는 https만(개발 예외) | 3-6 | B0 결정 '핑 켜짐' 줄 |
| 14 | `config/v1.json` | 키 9개를 모두 적은 예시, 모든 키 필수처럼 읽힘 | **빠진 키 = 번들 기본값**. CI(strict)는 서버 스위치 4개(`cloud`·`link`·`remoteMotifs`·`webLive`)만 명시를 요구, 앱(lenient)은 모르는 키를 버림. `ttlSec` 60~3600, `dreamUnlock` 필드, `minAppBuild` 미달이면 원격 통째 무시. 앱 로더는 읽는 곳이 생길 때까지 받지 않음 | 3-7 | B0 결정 'config 플래그' 줄 |
| 15 | `/m/**` 경로(B0~B3 사이) | Cloud Run rewrite | B0 동안 **Firebase 정적 한 파일**(`/m/index.html`)로 rewrite, B3에서 Cloud Run으로. 주소를 읽지 않고 외부 자원 0·CSP 해시·`no-referrer`. 검색은 `X-Robots-Tag` + meta noindex로만 — **robots.txt로 `/m/`을 막지 않는다** | 3-2·3-5 | B0 결정 '`/m/**`' 줄 |
| 16 | 레이트 리밋 구조 | 경로별 표 | 전역 **IP 접두당 120/분 카운터 하나** + 경로별 `@Throttle`은 같은 카운터의 더 낮은 천장(핑 20/분). 없는 경로 404는 가드 전에 끝나 리밋을 받지 않음 | 3-8 | B0-B1 6절 사소 1, 5절 |
| 17 | 공통 응답 헤더·오류 모양 | 없음 | 모든 응답 `nosniff`·`no-referrer`·`X-Frame-Options: DENY`·`CORP same-site`, 오류는 `{error:{code,message,details?}, requestId}`, 5xx 문구 숨김 | 3-2 | B0-B1 1절·6절 사소 2·3·5 |
| 18 | 로컬 DB | Supabase CLI | B1은 `postgres:17`(compose, 54329) + 비슈퍼유저 `prisma` 롤 재현. **Auth·Storage가 필요한 B2·B3부터 `supabase start`** | 6-3 | B0-B1 2절 3, 6절 I4 |
| 19 | CI 워크플로 | `ci.yml` 하나에 전부 | 커밋 기준 `server-ci.yml`(DB·docker)·`static-ci.yml`. **A6가 `ci.yml`(`pnpm verify`)로 통합 중**(static-ci 흡수). `deploy-*.yml`은 B6 | 6-4 | B0-B1 1절·7절, A6 작업 |
| 20 | 보름 모티프 번들 | 12·1·2월 번들, 원격은 3월부터 | 같음(`moon-12`·`moon-01`·`moon-02`) + **오프라인 대체 `월 mod 3`**(원격 팩이 없을 때 번들 셋 중 하나). 보름의 '밤의 날짜' = 그 밤이 시작된 저녁의 현지 날짜(04:00 경계, `nightDateOf`) | 3-10 | C4, D-25 개정 줄 |

- 거꾸로 **문서가 구현보다 앞선 곳**(B3·B5가 마이그레이션으로 더할 것): `public_pages`·`reports`·`report_hits`·`link_daily`·`link_funnel_daily`·`admin_actions`. B2가 `creatures.recovery_*`·`user_auth`·`save_versions`·`storage_gc`·`deletion_log`(+ `auth_gc`)를 더했다(`migrations/20261121000000_b2_cloud_save`). B1 주석대로 '확장 → 배포 → 축소'로 더한다.

**B2 구현에서 정한 것(11-20, 코드: `apps/server/src/{auth,account,saves,deletion,cron}`, 시험 `test/cloud.db.test.ts`·`cloud-logs.db.test.ts`·`auth-jwt.test.ts`·`cron-auth.test.ts`)** — 위 표와 같은 규칙으로 문서를 구현에 맞춘다.

| # | 무엇 | v2.2 문서 | 구현 | 근거 |
|---|---|---|---|---|
| 21 | 글귀 해시 | `SHA-256(pepper_v ‖ 글귀)` | **HMAC-SHA256(pepper, 정규 16자)** — 같은 취지(pepper 없이는 대입 불가)의 표준 구성. 정규화(대소문자·하이픈·공백 무시, I·L→1, O→0)는 contract `normalizeRecoveryCode`(앱 입력 칸과 같은 함수). pepper 회전 때는 옛 pepper로도 찾도록 그때 확장(`recovery_pepper_v`는 이미 저장) | 3-3 ⑤ |
| 22 | 같은 본 | 표마다 다름(`If-None-Match` + 행 있음 = 409) | **서버 sha == 받은 sha면 전제 조건과 무관하게 `200`**(빨리 감기). 반쯤 성공한 첫 PUT 재전송·같은 본 동시 첫 PUT이 모두 같은 규칙으로 수렴 | 3-4 '빨리 감기' |
| 23 | 409 모양 | `409 {server: meta}` | 공통 오류 모양 `{error:{code:"save_conflict", details:{server: meta\|null}}}`(3-2 공통 응답). 전제 조건이 없으면 `428 precondition_required`, 둘 다면 `400` | 3-2 |
| 24 | 계약 위치 | 서버 요청 스키마는 zod(서버 안) | B2 요청·응답 스키마도 **`@mong/contract`(zod/mini)** — 앱(C11·C12)이 같은 판정으로 읽는다. 요청은 strict(기기 값·태어난 해 등 모르는 키는 400) | 3-2 '계약' |
| 25 | 웹 `/delete` 처리 | '7일 안에' 처리(방법 미정, 메일 언급) | **`POST /api/v1/deletion/web` 즉시 처리**(코드 + 글귀, 위 3-2 행). 정적 `/delete` 폼이 `API_ORIGIN`(Cloud Run 서울)으로만 보낸다 — CSP `connect-src` 한 출처, 정적 빌드 검사가 고정. 글귀가 메일로 오가지 않는다(처리방침 12절 '글귀를 이메일에 적지 마세요'와 일치, '7일 안'은 여전히 참) | 3-8 ② |
| 26 | Auth 삭제 재시도 | '실패하면 재시도 대기열' | 새 표 **`auth_gc(sub, deletion_id, not_before, attempts)`** — users가 지워진 뒤 sub만 남는 유일한 자리, 지워지면 행째 삭제. `storage_gc`에 `deletion_id`. 대기 행이 없어지면 `deletion_log.completed_at`(영수증 `done`). `bootstrap`·`recover`는 `auth_gc`에 있는 sub도 401(Auth 삭제가 늦어도 되살아나지 않음) | 3-8 ⑤⑥ |
| 27 | 하루 4MB | 몽망이당 새 이력 바이트 | `saves.quota_day`·`quota_bytes`(잠근 행 위에서 셈) — **PUT·POST conflicts가 새로 쓰는 본문(압축 뒤)**을 센다. restore는 새 업로드가 아니라 세지 않는다 | 3-4-1 남용 상한 |
| 28 | 미래 판 | '1 이하로만 큼' | `schemaVersion`·`sim.version` 중 하나라도 서버보다 2 이상 크거나 판 번호가 없으면 `422`. 미래 본은 `day_index`·`strokes_total` NULL(열을 NULL 허용으로 바꿈) | 3-4-1 |
| 29 | 이력 시각 | DB `now()` | 서버 시계 하나(`Clock`)로 `created_at`·ISO 주·하루 상한·영수증 만료를 정한다(시험이 '29일 뒤'를 주입). 솎기 SQL은 `app.prune_save_versions(at)`, 영수증·지운 사용자 HMAC 만료는 `app.expire_deletion_log(at)` 함수(pg_cron 등록은 B6) | 3-4-1, 2-4 |
| 30 | `DELETE /me` 범위 | ①~⑥ | B2는 ①(그 몽망이의 `storage_gc`)·②·③⑤(요청 안 한 번 + Scheduler 재시도)·⑥. **`public_pages` 경로 모으기·`link_daily` 삭제·④ CDN 무효화는 B3**(표·공개 파일이 B3에서 생김). Storage 삭제기는 B3 전까지 '설정 안 됨'이라 행이 대기열에 남는다(B2에는 파일이 없다) | 3-8 |
| 31 | Scheduler | `/internal/cron/{job}` OIDC | `POST /internal/cron/storage-gc`(매일)·`reapply-deletions`(복원 뒤 한 번) — Google ID 토큰 RS256, `iss` accounts.google.com, **`aud`가 `CRON_AUDIENCE`(서비스 URL 전체, 경로 없음)와 정확히 같음**, `email = CRON_SA_EMAIL`·`email_verified`. 틀리면 **404**. **운영에서 두 값 필수(없으면 부팅 거부, B2 리뷰 I2)**. 일: Storage·Auth 대기열 + 되찾기로 끊긴 로그인 30일 뒤 `auth_gc`로 + 막힌 일 `gc_stuck` 알림 로그 | 2-4, 3-3 ⑤ 단계 5 |
| 32 | JWT | `jose`, 비대칭만 | `ES256`·`RS256` 허용 목록, JWKS 원격 캐시(10분, 모르는 kid는 30초 쿨다운 뒤 재조회), `clockTolerance` 30초. 오류 분류는 **허용 목록**: 토큰 쪽 잘못(서명·클레임·만료·형식·맞는 키 없음·허용 밖 알고리즘)만 401, 그 밖(JWKS 비 200·302·429·시간 초과·파싱 실패·연결 실패)은 전부 **503**(앱이 익명 세션을 버리지 않게, B2 리뷰 I1 — 500·503·429·302·깨진 본문을 시험이 고정). `SUPABASE_URL`이 없으면 모든 토큰 401(로컬·compose) | 3-3 ⑧ |
| 33 | 이력 기간 두 겹 | 기간 솎기는 `pg_cron`만 | PUT 안에서도 그 몽망이의 28·30일 지난 이력을 지우고 `weekly`는 최신 4벌만(B2 리뷰 I2) — `pg_cron` 등록이 빠져도 처리방침 '최대 4주'가 참. 시험: 일요일 시작 22일 안 ISO 주 5개 → weekly 4, 29일 뒤 PUT 한 번 → 28일 넘은 일반 이력 0 | 3-4-1 |
| 34 | 이름 숫자 규칙 | '숫자 7개 이상 이어지면' | **구분자(글자도 숫자도 아닌 것)를 뺀 뒤** `\p{Nd}`(전각·다른 문자 체계 숫자 포함) 7개 이상 연속이면 `digits`, 문자·길이 검사보다 먼저(B2 리뷰 m4). `010·1234·5678`·`010 123 4567` 거부, `ab123cd4567`은 통과(글자가 끊음) | 3-5-2 |
| 35 | 백업 복원 뒤 재삭제 | 없음 | `deletion_log.subject_hmac`(HMAC(pepper 파생 키, user id))·`subject_expires_at`(7일 = 백업 보관), 만료 함수 `app.expire_deletion_log(at)`(영수증 24시간과 한 함수), `DeletionService.reapplyAfterRestore`(kind `restore_reapply`) | 3-8 ③ |
| 36 | 인장 코드 읽기·본문 상한·리밋 메모리 | — | 웹 삭제의 인장 코드도 글귀와 같은 Crockford 읽기(contract `normalizeCreatureCode`). Fastify 본문 상한 1.06MB(세이브 512KB는 이스케이프 전 기준이라 JSON 안에서 최대 두 배). 레이트 리밋 창 5만 개를 넘으면 하루 지난 것 → 오래된 것부터 80%까지 버림 | B2 리뷰 m5·m7·m8 |
| 37 | `/m` HTML 만들기 | 'Nest 템플릿 문자열' | 고정 틀 + **값 화이트리스트 9개**(`LivePageValues`) + 문맥별 이스케이프 태그(`text`·`attr`·`url`·`storeHop`, 맨 문자열이면 던짐). CSP는 **응답 헤더**(인라인 스크립트 상수 하나의 해시, `script-src … {SITE_ORIGIN}/w/ 'wasm-unsafe-eval'`, `connect-src 'self' {SITE}/config/v1.json {SITE}/w/ {공개 파일 출처}`, `frame-ancestors 'none'`). 스토어 버튼은 같은 출처 `/m/{code}/get`(302 Location·캠페인 값에 코드 없음), 사라진 링크 페이지는 스토어 직접. 로드맵 '서버 렌더 없음' = SSR·그림 그리기 없음(PM 승인) | 3-5, 3-5-2 |
| 38 | Storage | Supabase Storage 버킷 셋 | **`ObjectStore` 인터페이스**(서명 업로드·put·stat·앞 n바이트·move·removePrefix·list·publicUrl) + `STORAGE_DRIVER=none\|local`. 운영 기본 `none`(링크 API `503 storage_unavailable`, 삭제 대기열은 재시도), `local`은 파일 시스템(개발·시험·캡처, 운영이면 부팅 거부). **키 = `{store_key 16진 32자}/{pageKey 22자}/{poster.jpg\|og.jpg\|loop.mp4\|snap.json}`**(정규식) — `public_pages.store_key`는 몽망이별 서버 난수 접두(코드·id에서 파생하지 않음)라 계정 삭제가 접두 하나로 세 버킷을 통째로 지운다(리뷰 I1). Supabase 구현·'서명 업로드에 버킷 상한이 걸리는가' 실측은 **B6** | 2-4, 3-5-3 |
| 39 | `public_pages` 칸 | `pending_ver`·`pending_prefix` | + **`pending_meta`·`pending_name_shown`·`pending_has_loop`**(커밋 전 판의 공개 값 — commit이 한 문장으로 옮김). CHECK: live면 `path_prefix` 있음, pending 칸 셋은 함께 있거나 함께 없음 | 3-1, 3-5-3 |
| 40 | CDN 무효화 대기 | '1분에 한 번으로 묶어' | 표 **`cdn_purge`(한 행: requested_at·released_at·attempts)** — 코드·경로 없음(Firebase 새 릴리스 = 사이트 전체). 차례 잡기는 원자적 UPDATE(호출 중 잠금 없음), 실패하면 요청을 되돌림. 요청 시점: 링크 끄기·**모든 commit**(다시 만들기 + 첫 켜기 — 캐시된 '사라진 링크'(s-maxage 60)도 바로 비운다)·격리·계정 삭제. 남은 요청은 `POST /internal/cron/cdn-purge`(1분마다, B6 등록). 실제 Firebase 호출은 B6(지금 구현은 횟수만 셈) | 3-9 |
| 41 | 이름 가린 다시 만들기 | 지난 판 2시간 유예 | 이름이 실렸던 live 판을 이름 없는 판으로 바꾸면 **유예 중인 더 옛 판까지 그 몽망이의 지난 판(`old_version`) 전부를 즉시 삭제**(옛 snap.json·OG에 이름, 리뷰 I2) — 운영자 가리기(3-5-2)와 같은 처리. 캐시된 옛 HTML(≤5분, 무효화 요청됨)은 포스터 404 → '사라진 링크' 모양 | 3-5-2, 3-5-3 ⑤ |
| 42 | 링크 퍼널 쓰기 | 메모리 합산 → `link_daily` | 비콘·스토어 이동마다 `link_daily` **upsert**(요청 안). `GET /m`은 세지 않는다(CDN 적중은 서버에 오지 않음). 30일 말기 = `app.rollup_link_daily(at)`(삭제·합산 한 문장, pg_cron 등록 B6) | 3-6, 3-1 |
| 43 | commit 순서 | 검사 → 이동 → live | **의도 기록 + 행 잠금**(리뷰 I1): PUT이 판 폴더를 staging·**public 두 버킷 모두** `uncommitted`(6시간)로 먼저 적는다. commit은 페이지 행을 `FOR UPDATE`로 잠근 한 트랜잭션(30초)에서 판 번호 재확인 → 검사 → staging→public 이동 → 확정(공개 쪽 행 삭제, staging 행은 서명 URL 최대 수명 2시간 뒤로) — 같은 판 commit 둘·계정 삭제·새 PUT·격리는 이 잠금을 기다린다. 이동이 실패하면 DB는 되돌려지고 `503 storage_unavailable`, 이미 옮겨진 공개 파일은 public 대기 행이 지운다 | 3-5-3 ③ |
| 44 | `/m` DB 실패 | — | **503 no-store**('사라진 링크'로 답하면 CDN이 거짓 사라짐을 1분 퍼뜨림). 비콘·스토어 이동은 DB 실패여도 204·302(기록만 버림) | 3-9 |
| 45 | 이름 공개 값 | `PATCH /creature`가 바꿈 | `PUT page`의 `nameVisible`도 `creatures.name_visible`을 같은 값으로 갱신(앱이 PATCH 뒤 바로 PUT하는 흐름과 같은 결과, 값이 둘로 갈리지 않게) | 3-5-2 |
| 46 | 금칙어 | '금칙어 통과' | 판정 자리(`nameBlocked`)만, **목록 비어 있음**(작가·PM 결정 대기). 허용 문자가 좁아 URL·@·연락처 기호는 이미 떨어짐 | 3-5-2 |
| 47 | 루프 해상도 | 540×675 | **540×676 확정(PM 11-20)** — H.264 4:2:0은 홀수 높이를 못 만든다(ffmpeg libx264 `height not divisible by 2`). 계약 `PAGE_FILES.loop`·commit 검사·고정물(ffmpeg 540×676)·3-5 표·3-5-3 ③ 모두 676 | 3-5 표, 3-5-3 ③ |
| 48 | 웹 뷰어 경로 | `/w/live.{hash}.js`·`/w/ck/{ver}/canvaskit.wasm` | 페이지 스크립트가 `config/v1.json` `webLive` → **`/w/manifest.json`**(5분 캐시) → `live.<sha256 10자>.js`를 붙인다(해시 이름을 서버가 몰라도 됨). webLive가 꺼져 있으면 live.js·manifest·CanvasKit은 0바이트, **`/config/v1.json` 한 번만**(WebGL2 등 조건이 맞을 때, 코드 없음, 5분 캐시 — 리뷰 L6). CanvasKit = npm `canvaskit-wasm@0.41.0` 그대로(`/w/ck/0.41.0/`, 0.41은 Path 대신 PathBuilder, `'wasm-unsafe-eval'`만 — Safari 15 이하는 wasm이 막혀 포스터가 남음). live.js 17.4KB(gzip 7.5KB, 예산 60KB — 빌드 실패), canvaskit.js gzip 37KB, wasm 7.16MB(gzip 2.9MB — saveData 신호는 Chrome Android만, 켤 때 PM 판단) | 3-5 '페이지' 2·3 |
| 49 | firebase.json | `/m/**` s-maxage 300 | `/m/**` → `run: mong-api, asia-northeast3`(맨 앞 rewrite), 헤더는 **`/m/*`만**(noindex·DENY) — **Cache-Control은 두지 않는다**: 캐시의 정본은 서버 응답 헤더 하나(live 300·사라진 링크 60·503·429 no-store). Hosting 헤더가 rewrite 응답을 덮으면 429·503이 5분 캐시되어 한 IP가 링크를 모두에게 막을 수 있다(리뷰 I3). `/m/**` 헤더도 `/seen`·`/get`의 no-store를 덮어 금지. 정적 `/m/index.html`(B0)은 지움. 셋 다 정적 빌드 검사 | 3-9, A-3 #15 |
| 50 | 격리 | B5 | `PageService.quarantine(creatureId)` — 상태 quarantined + 공개 → quarantine 이동을 **대기 행(`storage_gc` reason `quarantine_move`)**으로 적고 요청 안에서 한 번 옮김. 일부만 되면 Scheduler `storage-gc`가 남은 파일을 옮긴다(리뷰 M5), CDN 무효화. 신고 경로·운영 CLI는 B5 | 3-8, 3-9 |
| 51 | 삭제 ①②④ | B3 몫 | ① 페이지 행을 `FOR UPDATE`로 잠가 진행 중인 commit을 기다린 뒤, **`store_key` 접두로 공개·staging·격리 세 버킷 전부**를 `storage_gc(deletion)`에(접두 소거 — 이동 중 고아·대기 행 없는 파일까지, 리뷰 I1) + 그 몽망이의 기존 대기 행 ② 그 코드의 `link_daily` 즉시 삭제 ④ live·격리 페이지가 있었으면 CDN 무효화. `deletion_log.items.files`에 B3 행 수가 더해진다 | 3-8 |
| 52 | 공개 스냅숏 검사 | core 'core 함수' 몫 | **읽기 쪽만 B3에서** core에 둠: `parsePublicSnapshot`·`serializePublicSnapshot`(키 순서 고정, 이름은 인자로만)·점 양자화 `encode/decodeSnapPoints`, 고정물 `packages/core/test/fixtures/snap/*.json` 10개. 결 이름 id = 앱 문구 키(`tempoNeg`…). 만드는 함수 `toPublicSnapshot`은 여전히 'core 함수'(착수 조건 5개) | 3-5-1 |
| 53 | /m 리밋 | 3-8 표 | 페이지 60/분·사라진 링크 30/분·비콘 30/분·**스토어 이동 `/get` 30/분(새로)** — 모두 IP 접두 키, **DB 조회 앞에서** 검사(사라진 링크 한도만 조회 뒤 따로). 429는 no-store. 시험이 넷 다 고정(리뷰 M1) | 3-8 |
| 54 | 공개 파일 캐시 | `max-age=31536000, immutable` | **`public, max-age=3600`**(처리방침 '웹 캐시 최대 1시간'과 맞춤, 리뷰 M3). 판마다 새 경로라 낡은 판을 보여 줄 일은 없다. Supabase 공개 객체에도 같은 값·삭제 퍼지 여부는 B6 확인 | 3-9 |
| 55 | 서명 URL 재사용 | '1회·5분' | Supabase 서명 업로드는 수명 약 2시간·1회성 불명 **[확인 필요 — B6]**. 그래서 staging 경로는 commit으로 **한 번만** 인정(성공하면 pending이 비어 같은 판 번호 409)하고, commit 뒤에도 staging 대기 행을 2시간 남겨 재사용 토큰으로 다시 올린 파일을 지운다(리뷰 M4) | 3-5-3 ① |
| 56 | 대기열 견고성 | — | 처리한 행 지우기·실패 표시를 `deleteMany`·`updateMany`로(겹친 인스턴스가 먼저 지운 행이면 조용히 지나감). 커밋하지 않은 판의 staging 행을 처리하면 그 판의 `pending_*`(이름 포함)도 비운다(리뷰 L9). 비콘·스토어 이동 upsert는 그 코드의 몽망이가 있을 때만(삭제와 겹친 하루치 행 방지, L8). `rollup_link_daily`는 PUBLIC EXECUTE도 회수(L2). commit 뒤 CDN 무효화 요청 실패는 200 그대로(L3). 저장소 none인데 live 행이 있으면 `/m` 503 no-store(L5) | 3-1, 3-6 |
| 57 | 신고 행 열 | `reason enum`·`report_hits.created_at` | `reports.reason_counts jsonb`(사유 코드별 개수 — 신고자마다 사유가 달라 하나로 못 담음, 자유 글 없음) + `CHECK((status = 'open') = (salt IS NOT NULL))`. `report_hits`에는 시각을 두지 않는다(쓰지 않는 값 — 최소화). 열린 행이 닫히면 **트리거 `reports_close_hits`**가 신고자 키를 지운다(함수마다 지우기를 잊어도 구조가 막음) | 3-1·3-8 | B5 결정 |
| 58 | 신고 응답 | 폼 → 303 감사 페이지 | 폼(x-www-form-urlencoded) → `303 /m/{code}/report`(GET = 값 없는 감사 페이지, no-store) / **앱 JSON `{reason}` → 204**. 사유 코드 넷(`sexual`·`hate`·`personal`·`other`, contract `REPORT_REASONS`), 대상이 없거나 세지 않아도 같은 응답. **같은 출처 Origin만**(폼은 Origin = 사이트 필수, JSON은 없거나 사이트) — 남의 사이트 자동 제출이 방문자 IP로 신고를 세지 못하게. 폼 본문은 이 경로에서만 읽는다(다른 경로 415 — Nest 기본 폼 파서를 대체) | 3-2·3-8 | B5 결정 |
| 59 | 파기 여유 | 창 7일·격리 30일 | 만료 함수가 **10분 일찍** 닫는다(작업 5분 주기 + 여유) — 처리방침 '최대 7일'·'최대 30일'을 넘지 않게. 창 끝 행은 다음 신고도 먼저 닫는다. 함수는 `SET timezone = 'UTC'`·`search_path = pg_catalog, app` 고정(리뷰 L2·L3) | 3-8 ④⑤ | B5 결정 |
| 60 | 관리 | SQL 함수 + CLI `ops:quarantine`·`ops:mask-name` | **CLI 없음** — Storage 일은 SQL이 `storage_gc` 대기 행(`restore_move`·`name_mask`·`quarantine_expiry`)으로 적고 Scheduler **`moderation`(5분)**이 처리. 함수: `restore_page`·`confirm_hide`·`dismiss_report`(**코드로**, id 아님)·`mask_name`·`unmask_name`·`reopen_page`(removed → off)·`request_account_deletion`·`expire_reports`·`expire_quarantine`. 스니펫 `docs/ops/moderation/01~09.sql`을 시험이 파일 그대로 실행 | 3-12 | B5 결정 |
| 61 | 이름 가리기 | CLI가 새 pageKey·og:image 포스터·ver+1 | SQL이 즉시 `name_shown=false`·`meta - 'name'`·`meta.ogPoster`·커밋 전 판과 지난 판 지금 삭제·`name_visible=false`, 대기 행 `name_mask`가 새 pageKey에 포스터·루프 복사 + 이름 없는 snap.json(core `serializePublicSnapshot(…, null)`), og.jpg는 복사 안 함, 옛 폴더 즉시 삭제. 격리 중이면 격리 버킷에서 같은 일. 주인 `PATCH`·`PUT {nameVisible:true}` → **409 `name_blocked`**, `GET /creature`에 `nameBlocked`, 앱 문구 키 `link.nameBlocked`(자리만) | 3-5-2 | B5 결정·B3 리뷰 M2 |
| 62 | 복원 | `restore_page` → live | 격리본을 공개로 옮긴 **뒤에** live(포스터가 공개에 없으면 실패·재시도). 주인이 격리 중에 링크를 껐으면 되살리지 않고 off + 격리본 삭제 | 3-9 | B5 결정 |
| 63 | 확정 | quarantined → removed | live 판도 확정할 수 있다(문턱 전이지만 바로 내릴 때). 되돌리기 `reopen_page`(removed → off) | 3-9 | B5 결정 |
| 64 | 운영자 계정 삭제 | — (웹 삭제는 B2가 API로) | **요청 → 72시간 대기 → 실행**(리뷰 H1): `request_account_deletion(code, basis)` → `users.delete_requested_at` → 72시간 뒤 `moderation`이 `DeletionService.deleteUser(channel email, kind user_request)`. 대기 중 `GET /creature.deletionPendingUntil`(앱 알림 키 `account.deletionPending`), 취소 `cancel_account_deletion`. 기록 = 근거 유형(guardian·legal·self)·운영자(`actor`)만, 코드 없음. 인장 코드는 신원 근거가 아니다 — 즉시 조치는 공개 내리기(`confirm_hide`)뿐, 본인 확인은 법률 검토 B-14 ③ | 3-8 | B5 결정 |
| 65 | 금칙어 | 판정 자리 | 로더 `src/pages/name-blocklist.ts`: 한 줄 한 항목·`=` 전체 일치·`#` 주석, 항목과 이름을 **normalizeName → 소문자 → 공백·가운뎃점 제거**로 같게 접어 비교, 이름으로 나올 수 없는 항목은 기동 실패. 목록은 여전히 비어 있음(작가·PM) | 3-5-2 | B5 결정 |
| 66 | 잠금 순서 | — | 신고·운영 함수·PUT/commit 모두 **페이지 행 → (신고 행·몽망이 행)** 순서로 잠근다(교착 방지). 신고 문턱의 숨김과 격리는 한 트랜잭션 | 3-8·3-9 | B5 결정 |
| 67 | 같은 출처 판정 | — | `Sec-Fetch-Site`가 있으면 `same-origin`만, 없으면 Origin = 사이트(`null` 거부), 폼에 Origin이 없으면 거부·JSON(앱)은 통과(리뷰 C1 — `/m`이 no-referrer라 진짜 브라우저는 같은 출처 POST에 `Origin: null`). Playwright Chromium e2e(`test/b5-browser.db.test.ts`, server-ci test:db)가 고정 | 3-8 | B5 리뷰 C1 |
| 68 | 문턱 우회 비용 | '다른 회선·VPN 세 사람' | 신고자 키 IPv6 **/48**(레이트 리밋은 /64), 복원 뒤 **7일 면역**(held immune), 서비스 전체 **1시간 자동 숨김 5건 차단기**(held breaker + error `report_auto_hidden_burst`), **운영 기본 자동 숨김 꺼짐**(env `REPORT_AUTO_HIDE` — B6 XFF 실측 뒤 켬). 3-8 '한계'의 실제 비용: IPv6 /48 하나 가진 VPS 한 대 + 요청 3번이면 숨길 수 있었다 → 지금은 /48·차단기·면역·30일 복원 기본값으로 막고, 남는 것은 서로 다른 /48(또는 IPv4) 셋 | 3-8 | B5 리뷰 H2 |
| 69 | 30일 기본값 | 확정 삭제 | **복원**(`auto_restore`). 주인이 그사이 링크를 껐으면 off + 격리본 삭제 | 3-8 ⑤·3-9 | B5 리뷰 H2 |
| 70 | 끄기 우선·계정 삭제 | — | 복원 대기 중 주인이 링크를 끄면 복원 작업이 off로 내리고 두 버킷의 그 판을 지운다(리뷰 M1). 격리 중 계정 삭제 → 신고 `account_deleted`로 닫고 1년 만료(리뷰 M2). 이름 가리기 직후 `meta.snapPending` 동안 HTML에 `data-snap` 없음(리뷰 M3) | 3-8·3-9·3-5-2 | B5 리뷰 M1~M3 |
| 71 | 메모리 IP 접두 | '잠시' | 레이트 리미터가 창마다 길이를 적고 10초마다 만료 창을 지운다 — IP 접두가 메모리에 남는 시간 = 창 길이 + 10초(분 한도 약 1분·신고 1시간·계정 생성 하루, 처리방침 3-1·3-4·3-6). PUBLIC EXECUTE 회수를 시험이 고정하고 이 롤의 기본 권한에서도 뺀다(리뷰 L1) | 3-8 | B5 리뷰 M5·L1 |

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

변경 이력: 2026-11-20 v1 초안(인프라 층) → 2026-11-20 v2(기획 v2.2 2차 반영) → 2026-11-20 v2.1(서버 v2 독립 리뷰 반영, D-21 확정) → **2026-11-20 v2.2**(로드맵 A4: 6-2 대조·구현 정합·빠진 설계, 상세는 0-3·0-4·부록 A). A4 독립 리뷰(`docs/team/reviews/2026-11-20-a4-review.md`, '고친 뒤 확정 가능') 반영 완료 → 로드맵 A4 완료 표시.
