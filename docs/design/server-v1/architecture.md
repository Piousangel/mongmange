# 서버 아키텍처 v2.1 — 몽망이 키우기

- 상태: **v2.1(2026-11-20) — 독립 리뷰 `docs/team/reviews/2026-11-20-server-v2-review.md`('수정 후 확정': 치명 3·중요 13·사소 12·과설계 3)를 반영했다. D-21 확정 대기.** v2는 기획 v2.2의 서버 요구(6-2 '더할 것' 열, Q9~Q14, 10-1)를 2차 반영한 판이다. 이 문서는 코드·DECISIONS를 고치지 않는다. 파일 이름은 v1 그대로 둔다(다른 문서가 이 경로를 정본으로 가리킨다).
- 범위: **인프라 층 + 1.0 서버 기능 전부**(스택·Docker·호스팅·인증·세이브 동기화·공유 링크·웹 뷰어·지표·플래그·원격 모티프·OTA·안전·관리 도구·개인정보·부하 시험·비용·일정). 1.0 직후 소셜(밤물·동기·발자국)은 **테이블·API의 자리와 규칙**까지만 정한다(3-13).
- 전제(오너 11-20 지정): **NestJS + Prisma + Supabase(Postgres·Auth·Storage) + Docker**, 도메인 **`mongmang.ink`**(11-20 구매, Cloudflare Registrar, D-21). 후보 스택 비교는 하지 않고 이 조합 안에서 호스팅·역할 분담·운영 방식을 고른다.
- 역할 분담: 기획 v2.2(`docs/design/plan-v2/plan-v2.md`)가 **무엇이 필요한가**를, 이 문서가 **어떻게**를 정한다. 둘이 다르면 이 문서를 따르고, 다르게 정한 곳은 해당 절에 '기획과 다름'으로 적었다.
- 근거: D-06·D-13·D-15·D-17·D-18·D-19·D-20·D-21·D-22·D-23, 기획 v2.2(2-1~2-12, 4-1·4-5·4-6, 6-0~6-7, 10-1·10-2), 리뷰 `docs/team/reviews/2026-11-20-plan-v2-review.md`(C2·I1·I2·I4·I5·I7), 빌드 1 코드 리뷰 `docs/team/reviews/2026-11-20-build1-code-review.md` 5절(#10 개인정보), `docs/design/pillars-v1/C-integrated.md` v1.1, `docs/release/privacy-policy.ko.md`, `store-listing.md` 7절, `packages/core/src/save/*`·`sim/pillars.ts`·`sim/save.ts`, `apps/mobile/src/game/storage.ts`·`features.ts`.
- 표기: 출처가 있는 사실은 링크(끝 '출처'), 팀 판단은 **[팀 추정]**, 공식 문서로 끝까지 못 본 것은 **[확인 필요]**, 법률 판단이 필요한 것은 **[법률 검토]**. v2에서 새로 쓰거나 바꾼 곳은 제목에 **[v2]**.

### 변경 이력

| 판 | 날짜 | 내용 |
|---|---|---|
| v1 | 2026-11-20 | 초안. 오너 스택 지정 반영, 인프라 층 한정 |
| v2 | 2026-11-20 | 기획 v2.2 2차 반영. 아래 'v1 → v2' 표 |
| **v2.1** | 2026-11-20 | 서버 v2 독립 리뷰 반영. 아래 'v2.1 반영표' |

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

---

## 0. 한 장 요약 [v2.1]

| 항목 | 결정(제안) |
|---|---|
| 원칙 | **앱이 정본, 서버는 사본·창구.** 서버가 죽어도 게임은 한 프레임도 멈추지 않는다(D-21, 기획 P1). 모든 서버 호출은 비차단·재시도·포기 가능 |
| DB·인증·파일 | Supabase **서울(ap-northeast-2)** — 운영 `mong-prod`(**12-18까지 Pro**) + 스테이징 `mong-staging`(Free) |
| API 서버 | NestJS(Fastify) → Docker → **Cloud Run 서울(asia-northeast3)** `mong-api`. 관리 도구 `mong-admin`(비공개, 같은 이미지)은 **정식 출시 전(01월)** |
| 경로 [v2.1] | **앱 API는 Cloud Run 서울에 직접**(`*.run.app`. 주소는 `EXPO_PUBLIC_API_BASE`라 OTA로 바꿀 수 있다). **`mongmang.ink` = Firebase Hosting**: 정적(랜딩·`.well-known`·플래그·모티프·웹 뷰어 JS·CanvasKit) + **`/m/**`만** Cloud Run rewrite. 세이브·글귀·JWT는 국외 CDN 엣지를 지나지 않는다 |
| 인증 | 계정은 **필요한 순간에만**(첫 링크 켜기·맡겨 두기 켜기. 1.0 직후 밤물은 D-23 개정 필요, 13절). 직전에 **중립형 연령 확인**(태어난 해·달, 기기에서 판정, 서버엔 통과 표시만). 세션은 **백업 제외 MMKV**. 되찾기 글귀(되찾으면 새로 발급) → Apple/Google 연결은 1.0.x |
| 세이브 | 통째 + 리비전(If-Match), 병합 없음, 충돌은 나란히 고르기. 이력 **최대 4주**(최근 3벌은 PUT 안에서 솎음) |
| 링크·웹 | `mongmang.ink/m/{코드8}`(서버 난수 40비트). 정적 HTML + 앱이 올린 포스터·OG·8초 루프 → WebGL이면 CanvasKit. **공개 스냅숏은 서버가 검증한 뒤 직접 쓰고**, 기기는 이미지·영상만 올린다. 공개 값은 링크 켤 때 고정, 이름 공개 기본 끔 |
| Q12 캐시 | 앱·JSON 즉시 / `/m` HTML·OG 최대 1시간 / 신고 자동 숨김은 공개 파일을 격리 버킷으로 옮겨 **약 1분 안**(Smart CDN) 공개에서 사라짐, 격리 중 다시 만들기 차단. 외부 미리보기 카드·이미 받은 브라우저 캐시는 범위 밖 |
| 신고 | 키 = IP만(IPv6 /64), **대상마다 소금 하나**, 판정 창 = 소금 수명 = 7일, 서로 다른 신고자 3 → 자동 숨김(격리) |
| 지표 | **식별자 없는 집계 핑** + `nt`(설치 때 확정)·`wg`(7일째 고정)·`moon`(날짜). 판정 SQL은 핑이 든 빌드 이후 코호트만 쓰고 스토어 설치 수와 대조. 쓰기는 **요청 안 flush** |
| 플래그·모티프 | 정적 `config/v1.json`(TTL 1시간, `minBundle`) / 정적 `content/v1.json` + 해시 이름 모티프 파일. Git → `firebase deploy`. **iOS는 심사 때 들어 있고 켜져 있거나 설명된 기능만** 플래그로 다룬다 |
| OTA | `expo-updates` — 채널 `preview`·`production`, 러너 버전 `fingerprint`, **첫 실행에는 확인하지 않음**. 코드는 OTA, 켜기는 플래그. **EAS 요금·설치 id 법률 판단은 빌드 2 전에 확정**(업데이트 주소가 바이너리에 박힘) |
| 관리 | 소프트런칭: Supabase Studio + SQL 함수(`restore_page`·`confirm_hide`) + 작은 CLI(Storage 이동). 01월: `mong-admin`(IAM 프록시 + CSRF 방어) |
| 비용 | 소프트런칭까지 **월 약 25~30달러 + 도메인**. 10만 설치 **월 약 45~60달러**(정식 출시 전 wasm·루프 R2 이전 뒤), 60만 낙관 **월 약 300~400달러** — 둘 다 **+ EAS Update(요금 확인 뒤 기입)** [팀 추정]. 예산 알림은 상한이 아니다 |
| 일정 | B1·B6(11-21~11-25) → B0(11-27) → core 함수(11-29) → B3(12-03) → B4(12-05) → B2(12-11) → B5(12-13) → B7(12-15) → 운영 전환(12-16) → Pro(12-18). 서버 레인 **14.75일**(core 1.25 포함) + 웹 5.5 + 문서 1.0. 01월: 관리 도구·L1·L3·R2 이전 2.1일 |
| 오너 할 일(급함) | **11-21~22 주말에 GCP·Firebase·Supabase 계정·결제**, **법률 검토 질문 11-24까지 발송**(14세·국외 이전·EAS 설치 id·캐나다(퀘벡)·필리핀·뉴질랜드), 11-26 Apple Team ID, 11-30 Play 앱 서명 SHA-256, **12-01 EAS 요금 확정** |

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
   │ OTA 확인(둘째 실행부터) ─▶ EAS Update(Expo, 미국)        ▼
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
| **Supabase Storage** | `public-pages`(공개 읽기): 포스터·OG·8초 루프·공개 스냅숏(**스냅숏은 서버만 씀**) / `quarantine`(비공개): 신고로 숨긴 본 30일 | 세이브 본문(Postgres), 모티프(Firebase 정적) |
| **NestJS `mong-api`** | 공개 API 전부, `/m/{code}` HTML, 레이트 리밋, 세이브·스냅숏 검증, 삭제 처리, 핑·비콘 합산, `/internal/cron/*`(Scheduler만) | 이미지·영상 렌더(앱이 한다), 정적 파일 |
| **NestJS `mong-admin`**(01월) | 3-12 관리 화면(서버 렌더 HTML, 같은 이미지 `ADMIN_MODE=1`) | 공개 인터넷 노출. 소프트런칭 동안은 없음(Studio + SQL 함수 + CLI) |
| **Cloud Scheduler** | Storage를 건드리는 정기 작업 호출(삭제 재시도, 파일 정리, 1.0.x 장기 미사용) — 무료 3개 | — |
| **Firebase Hosting** | 도메인·TLS·CDN, 정적 파일, **`/m/**`만** Cloud Run rewrite·CDN 캐시 | 동적 로직, **앱 API 중계**(앱은 Cloud Run 서울에 직접) |
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
| Storage | 버킷 `public-pages`(공개 읽기, 쓰기 정책 없음) / `quarantine`(비공개). 업로드는 Nest가 service role로 `createSignedUploadUrl` 발급 → 앱이 직접 PUT. 경로 `public-pages/{pageKey}/{poster.jpg,og.jpg,loop.mp4,snap.json}` — `pageKey`는 **판마다 새 128비트 난수**다. 내부 `creatureId`를 드러내지 않고 판끼리 연결되지 않으며, `public_pages.path_prefix`로만 찾는다(리뷰 I7). 파일은 `immutable` 캐시. **버킷 상한**: `file_size_limit` 600KB, `allowed_mime_types` = `image/jpeg`·`video/mp4`·`application/json` **[확인 필요: 서명 업로드에도 버킷 상한이 걸리는지]**. 업로드 URL은 포스터·OG·루프만 발급하고, `snap.json`은 서버가 쓴다(3-5) |
| Storage CDN | 공개 파일은 Supabase CDN을 거친다. **Pro의 Smart CDN은 파일 삭제·덮어쓰기 때 캐시를 무효화(전파 최대 약 60초)** **[확인 필요: Smart CDN 동작·요금제 조건]** — Q12 '격리로 약 1분 안'이 여기에 기댄다(3-9). 스테이징(Free)에는 없을 수 있으므로 **Q12 검증은 운영 설정에서** 한다 |
| Auth | 익명 로그인 켬, 수동 연결 켬(1.0.x 대비), 익명 가입 IP 한도 기본 30/시간 → CGNAT로 막히면 120 |
| JWT 검증 | JWKS(`/auth/v1/.well-known/jwks.json`) 비대칭 서명 검증(`jose`). 검사 항목은 3-3 ⑧. 프로젝트 기본 서명 방식·새 API 키 체계는 B1에서 확인 **[확인 필요]** |
| `pg_cron`(DB만) | 매일 04:00 KST: ① 데이터 없는 익명 사용자 30일 뒤 삭제([Anonymous](https://supabase.com/docs/guides/auth/auth-anonymous)) ② 이력 솎기 중 주·30일 규칙(최근 3벌은 PUT 안에서, 3-4) ③ 판정 창(7일)이 끝난 신고의 소금·`report_hits` 삭제(3-8) ④ `link_daily` 30일 지난 행을 코드 없이 `link_funnel_daily`로 말고 지움 ⑤ `metric_daily` 90일 이전 행 월 단위로 말기(03월부터 작동) ⑥ `reports` 1년 지난 행 삭제 ⑦ 옮겨 간 옛 사용자(`moved_away_at`) 30일 뒤 삭제 |
| Cloud Scheduler(Storage 포함) | 매일 04:30 KST `POST /internal/cron/storage-gc`(지난 판 파일 2시간 유예 뒤 삭제, **발급 6시간 지나도 commit 없는 업로드 삭제**, 격리 30일 지난 파일 처리(3-9 기본값), 실패한 삭제 작업 재시도) / 1.0.x 매월 1일 `inactive-sweep` |

### 2-5. Prisma 운영

v1 그대로(Prisma 7, `@prisma/adapter-pg`, `prisma.config.ts`, 트랜잭션 풀러 6543 = 런타임 / 세션 풀러 5432 = 마이그레이션, 인스턴스당 풀 5 × 최대 3 = 15 연결, 전용 `prisma` 롤, **컨테이너 시작 때 마이그레이션하지 않음**, 확장 → 배포 → 축소, Supabase 전용 SQL은 마이그레이션 안 raw SQL, 잠금 지점은 Supabase Auth 하나 → `AuthVerifier` 인터페이스)([Prisma 7](https://www.prisma.io/changelog/2025-11-19), [Supabase × Prisma](https://supabase.com/docs/guides/database/prisma)).

- v2 추가: `mong-admin`도 같은 풀러를 쓰되 풀 2. 합계 최대 17 연결 — Supabase Pro Micro의 풀러 한도 안 **[확인 필요: 풀러 클라이언트 한도]**.

---

## 3. 데이터 모델·API·인증·동기화·링크

### 3-1. 테이블(Prisma, 스키마 `app`) [v2.1]

| 테이블 | 키·열 | 인덱스·제약 | 비고 |
|---|---|---|---|
| `users` | `id uuid PK`(= `auth.users.id`), `created_at`, `last_active_month date`(그달 1일, 5-5), `locale char(2)`, `age_gate_v smallint`, `age_confirmed_on date`, `moved_away_at timestamptz?` | — | 이름·이메일·나이·생년 없음. 연령은 '확인 절차 통과' 기록만(3-3). `moved_away_at` = 몽망이가 되찾기로 다른 기기에 옮겨 간 옛 사용자(그 뒤 모든 호출 410, 30일 뒤 삭제) |
| `creatures` | `id uuid PK`, `user_id FK→users ON DELETE CASCADE`, `code char(8) UNIQUE`, `link_enabled bool default false`, `name_visible bool default false`, `hidden bool`(운영 확정 숨김), **`recovery_hash bytea?`, `recovery_pepper_v smallint?`, `recovery_rotated_at?`**, `created_at` | **`UNIQUE(user_id)` DB 제약**(1.0 동안) | v2.1: ① `bootstrap` 멱등을 DB가 보장한다 — 재시도·동시 요청에 몽망이 두 마리가 생기지 않는다(리뷰 I9). 1.x 여러 마리는 확장 → 배포 → 축소로 푼다 ② 되찾기 해시를 `users`에서 옮겼다(몽망이를 따라 다님, 리뷰 S3) |
| `saves` | v1 그대로(`creature_id PK`, `rev`, `body bytea` gzip, `body_sha256`, `envelope_ver`, `sim_ver`, `validated`, `client_saved_at`, `day_index`, `strokes_total`, `device_id`, `updated_at`) | — | 본문 상한 512KB(압축 전). **서버는 `day_index`·`strokes_total`·버전 외에는 본문에서 꺼내 저장하지 않는다**(5-1) |
| `save_versions` | `id bigserial`, `creature_id FK CASCADE`, `rev`, `body`, `body_sha256`, `client_saved_at`, `reason enum(overwritten, weekly, conflict, pre_restore)`, `created_at` | `(creature_id, created_at desc)` | **최대 4주**(3-4) |
| `public_pages` | `creature_id PK FK CASCADE`, `ver int`, `state enum(live, off, quarantined, removed)`, `meta jsonb`, `path_prefix text`(불투명 `pageKey`), `has_loop bool`, `published_at`, `state_changed_at` | `(state)` | 몽망이마다 현재 공개 사본 하나. 상태 전이는 3-9 |
| `storage_gc` | `id bigserial`, `bucket`, `prefix`, `reason enum(old_version, uncommitted, quarantine_expiry, deletion)`, `not_before timestamptz`, `attempts smallint` | `(not_before)` | Storage 삭제 대기열. 업로드 URL을 발급할 때 `uncommitted`(6시간 뒤)를 미리 넣고, `commit`이 지운다 |
| `reports` | `id bigserial`, `target_kind enum(link, encounter, cohort, footprint)`, `target_ref text`, `reason enum`, `created_at`(첫 신고), `window_ends_at`(= 첫 신고 + 7일), **`salt bytea?`**(창이 끝나거나 숨김이 되면 NULL), `distinct_reporters smallint`, `status enum(open, auto_hidden, expired, restored, confirmed, dismissed)`, `resolved_at?` | `UNIQUE(target_kind, target_ref) WHERE status = 'open'` | 대상마다 열린 행 하나, 소금 하나(3-8). 1년 보관(목적: 같은 대상의 재발 판단) |
| `report_hits` | `report_id FK`, `reporter_key bytea`, `created_at` | **`PRIMARY KEY(report_id, reporter_key)`** | `reporter_key = HMAC-SHA256(reports.salt, IP 접두)`. 창이 끝나거나 숨김이 되면 **행째 지운다**(v2처럼 NULL로 두면 NULL끼리 중복이 허용돼 셀 수 없다) |
| `metric_daily` | PK `(day, event, cohort_day, day_n, platform, app_ver, lang, nt, wg, moon)`, `count int` | — | 식별자 없는 집계(3-6). `nt` 'A'·'B', `wg` '0'·'1'·'-', `moon` '0'·'1' |
| `link_daily` | PK `(day, code, event enum(view, store_ios, store_android, open_app))`, `count` | — | **30일 보관**(리뷰 I12). 그 뒤 코드 없이 `link_funnel_daily`로 말고 지운다. 계정 삭제 때 그 코드의 행을 바로 지운다 |
| `link_funnel_daily` | PK `(day, event)`, `count` | — | 개인과 무관한 합계(퍼널 판정용) |
| `deletion_log` | `id`, `requested_at`, `completed_at`, `channel enum(app, web, email)`, `kind enum(user_request, web_request, inactive, report_confirmed)`, `items jsonb` | — | 누구인지 없이 개수만 |
| `admin_actions` | `id`, `action`, `target_kind`, `target_ref`, `note`, `at` | — | 운영 기록. 소프트런칭에는 SQL 함수가, 01월부터는 `mong-admin`이 쓴다 |
| (1.0 직후 자리) `night_drops`, `encounters`, `blocks`, `footprint_raw`, `footprint_daily`, `footprint_salts` | 3-13 | — | **모두 `creatures`에 CASCADE.** 1.0에는 만들지 않는다 |

- v2에서 빠진 것: `daily_salts`(신고는 대상별 소금으로 바뀌었고, 발자국은 1.0 직후 전용 소금을 쓴다).

### 3-2. API(접두 `/api/v1`, JSON, 인증 = `Authorization: Bearer <Supabase JWT>`) [v2.1]

앱은 `EXPO_PUBLIC_API_BASE` = **Cloud Run 서울 주소**(`https://mong-api-…-du.a.run.app`)로 직접 부른다. `/m/**`만 `https://mongmang.ink`(Firebase)를 거친다.

| 메서드·경로 | 인증 | 요청 → 응답 | 준비(B) |
|---|---|---|---|
| `GET /healthz` / `GET /readyz` | 없음 | `200 {ok, ver, saveSchema, simSchema}` / DB `select 1` | B1 |
| `POST /api/v1/ping` | **없음** | 3-6의 모양 → `204`. 값 범위 검증(3-6)에 걸리면 조용히 버리고 `204` | B0 |
| `POST /api/v1/me/bootstrap` | JWT | `{ageGate:{v:2, ok:true}}` → `{userId, creature:{code}}`. `ageGate`가 없으면 `400`. **Auth Admin API로 이 `sub`가 `auth.users`에 있는지 확인**하고, 없으면 `401`(삭제한 계정의 남은 토큰으로 되살아나지 않게, 3-8). 멱등(`UNIQUE(user_id)`) | B3 |
| `POST /api/v1/me/touch` | JWT | `{}` → `204`. 앱이 **달이 바뀐 뒤 첫 실행 때 한 번만**(세션이 있을 때) | B3 |
| `PUT /api/v1/creature/page` | JWT | 링크 켜기·다시 만들기. `{snapshot, nameVisible, name?, lang, files:{poster, og, loop?}}`(각 `{contentType, bytes}`) → `{ver, nameAllowed, url, upload:{poster:{signedUrl, token}, og, loop?}}`. 서버가 스냅숏 검증·금칙어 검사를 하고 **`snap.json`을 직접 쓴 뒤** 이미지·영상 업로드 URL만 발급한다. 상태가 `quarantined`·`removed`이거나 `hidden`이면 **`409`**(3-9) | B3 |
| `POST /api/v1/creature/page/{ver}/commit` | JWT | → `200`(파일 셋의 존재·크기·시그니처·해상도 확인 → `live`, 지난 판은 `storage_gc`) / `409`(더 새 판 또는 격리 중) / `422`(검사 실패) | B3 |
| `DELETE /api/v1/creature/page` | JWT | → `204`. 링크 끄기: `live → off`, `link_enabled=false`, **공개 파일 즉시 삭제**. 격리 중이면 `link_enabled=false`만 바꾸고 격리본은 운영 판단까지 둔다 | B3 |
| `PATCH /api/v1/creature` | JWT | `{nameVisible}` → `200`. 이름 공개를 바꾸면 **다시 만들기 필요**(OG 이미지에 이름이 그려지므로) — 앱이 바로 `PUT page`를 이어 부른다 | B3 |
| `GET /api/v1/creature` | JWT | → `{code, linkEnabled, nameVisible, page:{ver, state}}` — 앱 안 표시는 이 값(즉시) | B3 |
| `GET /api/v1/saves/main/meta` · `GET /saves/main` · `PUT /saves/main` · `GET /saves/main/versions` · `POST .../versions/{id}/restore` | JWT | v1 그대로(3-4) | B2 |
| `POST /api/v1/recovery-code` · `POST /api/v1/recover` | JWT | v1 그대로 + **`recover` 성공 응답에 새 글귀**(한 번만 보여 줌, 옛 해시 무효, 3-3 ⑤) | B2 |
| `DELETE /api/v1/me` | JWT | → `202 {deletionId}` / `GET /api/v1/me/deletion/{id}` → `{state}`(3-8) | B2 |
| `GET /m/{code}` | 없음 | 정적 HTML(3-5). 없는·꺼진·숨긴 코드는 같은 틀의 '사라진 링크'(200, noindex) | B3 |
| `GET /m/{code}/get?p=ios\|android` | 없음 | `302` 스토어(캠페인 파라미터) + 카운트, `no-store` | B3 |
| `POST /m/{code}/seen` | 없음 | 비콘(`sendBeacon`, 본문 없음) → `204`, `no-store`(3-6). v2의 `/api/v1/m/{code}/seen`에서 옮겼다(`/api`가 Firebase를 거치지 않게 되어서) | B3 |
| `POST /m/{code}/report` | 없음 | 폼(`reason`) → `303` 감사 페이지(3-8) | B5 |
| `POST /internal/cron/{job}` | Scheduler OIDC | 정기 작업 | B2·B5 |
| 정적(Firebase) | — | `/`, `/.well-known/apple-app-site-association`, `/.well-known/assetlinks.json`, `/config/v1.json`, `/content/v1.json`, `/content/motifs/*`, `/w/*`, `/delete`, `/privacy`, `/robots.txt` | B0·B4 |
| (1.0 직후 자리) `/api/v1/night/*`, `/api/v1/cohort`, `/api/v1/footprints`, `/api/v1/blocks`, `POST /m/{code}/pat` | — | 3-13. **경로 이름만 예약**, 1.0 서버에는 없다(404) | — |

- **인증 공통 규칙(v2.1)**: ① `bootstrap` 외 모든 JWT API는 `users` 행이 없으면 `401` ② 그 사용자에 `moved_away_at`이 있으면 `410`(되찾기로 다른 기기에 옮겨 감) ③ JWT 검사 항목은 3-3 ⑧.
- OpenAPI → `packages/api-contract`(v1 그대로).
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
5. **되찾기 글귀**: 서버가 80비트 보안 난수로 16자 Crockford base32를 만들고, `SHA-256(pepper_v ‖ 글귀)` 해시를 `creatures`에 둔다. '맡겨 두기'를 켤 때 한 번 보여 준다. `POST /recover` 성공 시:
   - ① 몽망이를 새 익명 사용자로 옮긴다. ② **새 글귀를 발급해 한 번 보여 주고 옛 해시를 무효로 한다** — 글귀를 한 번 본 사람이 언제든 다시 가져가는 일을 막는다(리뷰 S3). ③ 옛 사용자에 `moved_away_at`을 두어 옛 기기의 모든 호출이 `410` → 앱은 '이 몽망이는 다른 기기로 옮겨졌어요'(작가 몫)를 보이고 로컬 게임은 계속. 옛 사용자 행은 30일 뒤 삭제.
   - 시도 한도 IP 접두당 5회/시간, 글귀당 10회/일.
   - pepper는 Secret Manager 버전 관리 + **오프라인 사본**(런북). 잃으면 글귀가 전부 무효가 된다. `recovery_pepper_v`로 회전에 대비한다(리뷰 S4).
6. **Apple/Google 연결(1.0.x)**: v1 그대로(`linkIdentity`, 새 네이티브 모듈 2개라 빌드 2 묶음 밖).
7. 토큰 갱신 실패·세션 소실 = '맡겨 두기 끊김' 표시만, 게임은 계속.
8. **JWT 검사(리뷰 S6)**: `iss` = 프로젝트 Auth URL, `aud` = `authenticated`, `exp`, `role = authenticated`, `sub` 존재. **비대칭 알고리즘만 받고 HS256은 거부**한다(레거시 키로 서명된 토큰 차단). Supabase 새 API 키 체계(`sb_secret_…`)의 이름·수명은 B1에서 확인 **[확인 필요]**.

### 3-4. 세이브 동기화 규칙 — 통째, 리비전, 병합 없음 [v2]

v1 규칙 그대로(기기 MMKV가 정본, `serializeState` 통째, 백그라운드·깸 직후·10분에 한 번 이하, `If-Match` 리비전, 409면 자동 선택 없이 **두 몽망이 나란히 고르기**(기획 2-1), 같은 `sha` 빨리 감기, 새 기기 복원은 `parseState` 검증 + `pre_restore` 보존, 서버 검증 = `@mong/core` `parseState`, **미래 버전은 거부하지 않고 `validated=false`**, 서버 시각 미사용, 상한 512KB). v2에서 바뀌거나 더한 것:

| 규칙 | 내용 |
|---|---|
| **이력 보관(최대 4주)** | `overwritten`: 최근 **3벌** — **PUT 트랜잭션 안에서** 4번째부터 바로 지운다(날마다 솎으면 하루 수백 행이 쌓였다 지워져 TOAST·WAL이 부푼다, 리뷰 S1) / `weekly`: PUT 때 **이번 ISO 주(서버 시각)에 `weekly`가 없으면, 덮이는 본을 `overwritten` 대신 `weekly`로 저장**, 4주(리뷰 S2) / `conflict`·`pre_restore`: 30일. `pg_cron`은 주·30일 규칙만 맡는다. v1의 `daily` 7일은 없앤다 |
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

- 스냅숏 형식은 **`@mong/core`의 `toPublicSnapshot(state)` / `parsePublicSnapshot(json)`**(버전 `snap:1`)이 정본이다. 서버는 `parsePublicSnapshot`으로 읽고 **알 수 없는 키가 하나라도 있으면 `422`**. 통과한 본은 **서버가 정규화해 `snap.json`으로 직접 쓴다** — 기기가 올리는 파일이 아니다(v2.1, 리뷰 C2). 그래서 공개되는 스냅숏은 언제나 검증된 본이고, 앱 버그나 조작된 클라이언트가 `relation.hour` 같은 값을 공개 파일에 넣을 길이 없다. 같은 형식을 웹 뷰어·관리 도구 원형 보기·1.0 직후 밤물·동기가 그대로 쓴다(3-13).
- 갱신은 **'링크 켜기'와 '다시 만들기'(이름 공개를 바꿀 때 포함)** 때만. 매일 바뀌지 않으므로 링크를 아는 사람이 주인의 접속 리듬을 읽을 수 없다.
- **이름 공개 순서**: `PUT page`에서 서버가 금칙어를 먼저 검사해 `nameAllowed`를 돌려준다 → 앱은 그 값에 맞춰 **이름 있는/없는 OG를 그린 뒤** 올린다. 그래서 OG 이미지에 걸린 이름이 그려지는 일이 없다. 8초 루프·포스터에는 **이름을 그리지 않는다**(영상 프레임 검사가 필요 없게).
- `public_pages.meta` = `{snap:1, name?, ink, texture?, bornDate, dayAtPublish, lang}` — HTML의 한 줄·`og:title`에만 쓴다.

**파일(포스터·OG·루프는 앱이 만들어 올리고, 스냅숏은 서버가 씀)**

| 파일 | 규격 | 상한 |
|---|---|---|
| `poster.jpg` | 4:5 1080×1350 첫 프레임(한지 위 그 아이, '획 → 몸'의 마지막 장면) | 250KB |
| `og.jpg` | 1200×630, 같은 `cardTextBoxes` 배치에 가로 여백 틀, 이름은 `nameAllowed`일 때만 | 150KB |
| `loop.mp4` | **8초 '획 → 몸'**, H.264, 540×675, 무음, 24fps — D-18 인코더의 웹 전용 저용량 설정 | **600KB** |
| `snap.json` | 공개 스냅숏 — **서버가 씀** | 32KB |

- **`commit` 검사(v2.1)**: 파일 셋의 존재·크기·**시그니처**(JPEG `FF D8 FF`, MP4 `ftyp` 상자)·해상도(JPEG SOF 헤더)를 확인한다. 픽셀 내용은 보지 않는다 — 조작된 앱이 아무 이미지나 OG로 걸 수 있다는 위험은 막을 수 없고, **신고 → 격리로 감수한다**(10절 #23). 이름 금칙어도 OG 픽셀에는 적용되지 않는다(정상 앱은 `nameAllowed`를 따른다).
- **버려진 업로드(리뷰 I7)**: 업로드 URL을 발급할 때 `storage_gc(reason=uncommitted, not_before=+6시간)`을 미리 넣고, `commit`이 그 항목을 지운다. 다시 시도하지 않는 사용자의 반쪽 판도 6시간 뒤 사라진다. 버킷 상한(2-4)이 1차 방어, `commit` 검사가 2차다.

**페이지 `/m/{code}` — 정적 먼저**(기획 2-2, 리뷰 I2)

1. Nest가 템플릿 문자열로 HTML을 만든다(React SSR 없음). **인라인 CSS 포함 30KB 미만**. 첫 화면 = 한지 배경 + `<img poster>`(preload) → `<video autoplay muted playsinline loop poster>`(있으면) + 스토어 버튼 2개 + 보조 줄 "송연먹 · 느긋결 몽망이를 보셨군요" + 작은 '알리기'. **카카오톡·인스타 인앱 브라우저는 여기서 완결**(Q10: 첫 페인트 1초).
2. 첫 페인트 뒤(`load` + `requestIdleCallback`) **조건이 다 맞을 때만** `/w/live.{hash}.js`(약 40KB gzip [팀 추정])를 불러온다: WebGL2 가능 · `navigator.connection.saveData` 아님 · `prefers-reduced-motion` 아님 · `/config/v1.json`의 `webLive`가 켜짐.
3. `live.js`는 `/w/ck/{ver}/canvaskit.wasm`(약 3MB gzip [확인 필요: 쓰는 빌드의 실제 크기])과 `snap.json`을 받아, `@mong/core`의 몸 생성 + 작은 CanvasKit 페인터로 **숨 쉬고 눈 깜빡이며 톡 치면 빗이 흔들리는** 몽망이를 그리고, 준비되면 포스터·영상 자리를 페이드로 바꾼다. 실패·시간 초과(5초)면 아무것도 바꾸지 않는다. 소리는 첫 탭 뒤 짧은 허밍만(기획 11-6, 미정이면 무음).
4. 이미지가 404면(숨김 직후 캐시된 HTML) `onerror`로 빈 한지 + '사라진 링크' 문구로 바뀐다(3-9).

- **언어(v1에서 바뀜)**: v1은 `Accept-Language`로 골랐는데, 그러면 CDN 캐시가 언어마다 갈라져야 한다(Firebase Hosting의 `Vary: Accept-Language` 처리 **[확인 필요]**). v2는 **HTML 기본 언어 = 주인의 `lang`**(링크는 주인의 말로 퍼진다) + 두 언어 문구를 페이지에 함께 넣고 인라인 스크립트가 `navigator.language`로 고른다. 캐시 키는 URL 하나.
- **OG 메타**: `og:image` = `og.jpg`, `twitter:card=summary_large_image`, `og:title` = **이름(공개일 때만) 아니면 앱 이름**, `og:description` = 보조 줄. `og:video`는 넣지 않는다(미리보기 호환성 [팀 추정]).
- **검색**: `noindex`, 랜딩 `/`만 색인. 목록·사이트맵 없음.
- **딥링크**(v1 그대로): iOS 유니버설 링크(AASA `/m/*`) + Android 앱 링크(`assetlinks.json`에 **EAS 업로드 키와 Play 앱 서명 키 SHA-256 둘 다**). 앱이 있으면 이름표처럼 카드만 보여 주는 시트. 디퍼드 딥링크는 하지 않는다.
- **공유 직후 데우기**: 앱은 `commit` 성공 뒤 `/m/{code}`를 한 번 `GET`해 CDN에 올려 둔다(SNS 크롤러가 콜드 스타트를 만나지 않게, v1 반증 #8). **그 사용자 근처 엣지만 데운다** — 한국 사용자 공유의 카카오 크롤러(국내)에는 효과가 있고, X·iMessage 크롤러(미국 엣지)에는 적다(리뷰 S8).
- **코드 회전**: 링크 코드는 평생 하나라, 끈 뒤 다시 켜면 같은 주소가 살아난다. 특정 상대에게 보낸 링크를 끊고 싶은 주인을 위해 '새 주소로 다시 만들기'(코드 회전)를 **1.0.x 후보**로 둔다(리뷰 S12). 인장 무늬는 `sealSeed`라 영향 없다.

### 3-6. 지표 — 식별자 없이, 차원 3개 [v2.1]

**핑 하나의 모양**

```json
POST /api/v1/ping
{ "cohortDay": "2026-12-22", "dayN": 3, "platform": "android", "appVer": "1.0.0(14)", "lang": "ko",
  "dims": { "nt": "A", "wg": "-", "moon": "0" },
  "events": [ { "e": "name_set", "dayN": 2 } ] }
```

- **열기 칸**: 하루 첫 실행 때 한 번 → `metric_daily(event='open', day_n=dayN, …dims)` +1. 같은 `dayN`은 기기에서 한 번만. **오프라인이면 열기도 그날의 `dayN`을 붙여 아웃박스에 넣는다**(v2.1, 이벤트와 같은 규칙).
- **이벤트 칸**: 화이트리스트 이벤트는 일어난 날의 `dayN`을 붙여 아웃박스에 쌓았다가 다음 핑(또는 백그라운드 전환 때의 작은 핑)으로 보낸다. 한 번만 일어나는 이벤트(`first_tap`·`first_night`·`ire7`·`name_set`·`ink_chosen`·`cloud_on`)는 기기에서 **평생 한 번**만 보낸다 → '같은 코호트·같은 군의 개수 비율'이 '사람 비율'과 같아진다. 화이트리스트 10개는 늘리지 않는다.

**차원 3개(v2.1 다시 정의, 리뷰 C3)**

| 차원 | 값 | 정하는 법 | 쓰는 곳 |
|---|---|---|---|
| `nt` 이름 시점 군 | `A`·`B`만 | **설치 첫 실행 때 별도 로컬 난수**(`birth.seed`와 무관, 서버로 안 감)로 확정해 기기에 저장하고, **플래그와 무관하게 늘 보낸다.** 플래그 `nameTiming`은 '군 처리를 실제로 적용하느냐'만 정한다. v2의 `-`(플래그 꺼짐·배정 전)는 없앤다 — 첫 핑이 플래그를 받기 전에 나가면 분모는 `-`, 분자는 `A`로 갈라졌기 때문이다 | 이름 A/B |
| `wg` 위젯 | `1`·`0`, dayN < 7이면 `-` | **dayN = 7 첫 실행 때 위젯 유무를 한 번 재서 기기에 고정**한다(그 뒤 떼거나 달아도 바뀌지 않음). 날마다 바뀌는 값이면 D_n의 분모가 없기 때문이다. 재는 함수 = 위젯 로컬 모듈 `getInstalledCount()`(빌드 2 묶음, 4-2). 함수가 없는 기기는 `-` 그대로 | 위젯 리텐션(참고) |
| `moon` 보름 창 | `1`·`0` | 그날 현지 날짜가 보름 창이면 1(core 함수) | 보름 복귀(참고)에서 날짜 고르기 |

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
| 조작된 핑(인증 없음) | 값 범위 검증: `dayN` 0~400, `cohortDay + dayN`이 서버 날짜 ±2일, 화이트리스트 밖 이벤트·차원 값 버림, `appVer` 형식. 판정 SQL에 **`Σopen(day_n=0)` ≤ 같은 날 스토어 콘솔 설치 수 × 1.2** 대조를 넣고, 넘는 날은 판정에서 뺀다 |

- **칸 쪼개짐**: 차원을 더하면 한 칸에 1~2명만 있는 칸이 생긴다. 식별자·IP를 저장하지 않으므로 칸으로 사람을 되짚을 수는 없지만, 대시보드 SQL은 `count < 5` 칸을 '기타'로 합쳐 보이고 원표는 내보내지 않는다. 칸 수는 실제로는 하루 수천 칸 [팀 추정] — 90일 말기로 충분하다.
- **쓰기 방식(v2.1 확정, 리뷰 C3-4)**: Cloud Run 기본 CPU 할당(요청 처리 중에만)에서는 요청 사이에 타이머가 돌지 않는다는 전제로 설계한다 **[확인 필요]**.
  - **요청 안 flush**: 인스턴스는 칸별 합계를 메모리에 모은다. 요청을 처리하다 **마지막 flush 뒤 10초가 지났으면 그 요청이 응답 전에** `UPSERT … count = count + $n`을 한 번 실행한다(그 요청만 수 ms 늦어진다).
  - 종료 신호(SIGTERM, 축소 때 유예 10초)에서도 flush한다. 요청이 끊긴 인스턴스의 남은 칸은 축소 때 SIGTERM이 거둔다. 강제 종료면 마지막 flush 뒤 분량을 잃는다.
  - CPU 상시 할당(인스턴스 과금)은 비용 때문에 쓰지 않는다. L3가 이 구조를 시험한다(7절).
- **지표 끄기**: 앱 설정에서 끄면 핑·이벤트·비콘 어느 것도 보내지 않는다.
- **링크 퍼널**: 페이지 인라인 스크립트가 `navigator.sendBeacon('/m/{code}/seen')`을 한 번 보낸다(쿠키·식별자 없음, `no-store`, Firebase 경로). 크롤러는 스크립트를 거의 돌리지 않아 자연히 빠진다. 같은 메모리 합산 → `link_daily(view)`. **대시보드 표기는 '고유 방문자'가 아니라 '페이지 로드 수'.** `/get` 302는 원래 Nest를 지난다. `link_daily`는 30일 뒤 코드 없이 말아 둔다(3-1).
- 설치 귀속: Play `utm_*`·App Store `pt`/`ct` 캠페인 링크 **[확인 필요: 콘솔에서 첫 링크로 검증]**.

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
- **TTL을 6시간 → 1시간**으로(기획 6-1의 '6시간'과 다름 — 13절), 그리고 포그라운드 때 캐시가 15분보다 오래됐으면 다시 받는다. 소프트런칭 중 서버 기능을 끄는 손잡이가 6시간 늦으면 늦다. 파일은 1KB 정적이라 비용은 사실상 0.
- **`minBundle`(v2)**: 앱 JS에 OTA마다 1씩 올리는 상수 `BUNDLE_SEQ`가 있다. 플래그가 켜져 있어도 `BUNDLE_SEQ < minBundle[key]`면 끈 것으로 본다. → 버그가 있던 OTA 3을 받은 기기는, 고친 OTA 4가 나온 뒤 `minBundle.cloud = 4`로 올리면 그 기능만 꺼진다(3-11). **`BUNDLE_SEQ`는 바이너리 내장 값과 OTA를 통틀어 하나의 증가 값**이다 — 위젯 스토어 업데이트처럼 새 바이너리가 나가면 그 내장 SEQ는 앞선 마지막 OTA보다 커야 한다. 아니면 새 바이너리에서 기능이 꺼진다(리뷰 S9).
- 우선순위: **`FEATURE_DEFAULTS`(바이너리) < 원격 캐시 < 개발 메뉴**. 비율 배포는 기기 로컬 난수(서버로 안 감). 플래그로 끄는 건 화면·몸짓뿐, 세이브 필드는 늘 쌓는다. 크래시 루프 탈출(직전 실행이 적용 10초 안에 죽었으면 원격 값을 한 번 무시) v1 그대로.

### 3-8. 남용 방지·신고·백업·삭제 [v2.1]

**클라이언트 IP — 어느 값을 믿나(v2.1, 리뷰 C1-4)**
- 경로가 둘이다. ① 앱 API = 클라이언트 → Google 프런트엔드 → Cloud Run(직접) ② `/m/**` = 클라이언트 → Firebase Hosting CDN → Cloud Run. 두 경로 모두 Nest의 `req.ip`는 클라이언트가 아니고, `X-Forwarded-For` 맨 왼쪽 값은 클라이언트가 마음대로 넣을 수 있다.
- 규칙: **신뢰하는 프록시가 붙인 값(오른쪽에서 N번째)만 쓴다.** N이 경로마다 다르므로 Fastify 전역 `trustProxy` 대신 `clientIp(req, routeGroup)` 함수 하나로 고정한다. **B6 첫날** 두 경로에 실제 요청과 가짜 XFF를 보내 N을 측정하고, 그 값을 e2e 고정물로 박는다 **[확인 필요]**.
- 남는 구멍: 공격자가 Firebase를 건너뛰고 `*.run.app/m/…`을 직접 부르면 Firebase용 N이 맞지 않는다. B6 측정에서 두 경로를 구분할 표지(Firebase가 붙이는 헤더 등)가 없으면, `/m/**` 앞단을 **Cloudflare Worker**(DNS가 이미 Cloudflare)로 바꾼다. 그때는 Worker가 붙인 비밀 헤더와 `CF-Connecting-IP`만 믿는다(0.5일).
- **IP 접두**: 레이트 리밋·신고 키에는 IPv4 /32, **IPv6 /64로 접은 값**을 쓴다. IPv6 사용자는 /64를 통째로 받아 주소를 바꾸는 비용이 0이기 때문이다.

**레이트 리밋**(`@nestjs/throttler`, 인스턴스 메모리, 키 = IP 접두 또는 사용자)

| 대상 | 한도 |
|---|---|
| `/ping` | IP 접두당 20/분 |
| `/m/*` 조회(Nest에 닿는 것) | IP 접두당 60/분, '사라진 링크'는 30/분 |
| `/m/*/seen` | IP 접두당 30/분(넘으면 조용히 버림) |
| `PUT /creature/page` | 사용자당 20/일, 파일은 3-5 상한·`image/jpeg`·`video/mp4`만, 서명 URL 1회·5분 |
| `PUT /saves` | 사용자당 60/시간 |
| `/recover` | IP 접두당 5/시간, 글귀당 10/일 |
| `/m/*/report` | IP 접두당 5/시간 |
| Supabase 익명 가입 | 기본 30/시간/IP → CGNAT로 막히면 120 |

- 한계(리뷰 S7): 인스턴스 메모리라 min 0에서는 콜드 스타트마다 초기화되고, 인스턴스 수만큼(최대 3배) 새어 나간다. 소프트런칭에서는 감수하고, L5는 인스턴스 1개 기준으로 본다.
- **알림과 상한을 나눈다(리뷰 S10)**: *알림*(지출을 멈추지 않음) = GCP 예산 30·60·120달러, Firebase 전송량 알림. *상한*(실제로 멈춤) = Cloud Run max-instances 3, 공개 파일 버킷 상한. Supabase Spend cap은 켜 두면 한도를 넘을 때 전송·가입이 제한되어, **입소문이 난 순간에 링크 이미지가 끊길 수 있다** **[확인 필요]** → 소프트런칭에는 켜고, 정식 출시 전에 끄고 알림으로 바꿀지 정한다(리뷰 질문 3).
- **이름 공개**: 금칙어 목록(한·영, 서버 검사, 3-5 순서). 걸리면 웹·OG에서 이름 대신 '몽망이'.

**신고 → 자동 숨김(v2.1 다시 설계, 리뷰 C1)**
1. `POST /m/{code}/report` → 그 대상의 **열린 `reports` 행**을 찾거나 만든다. 새로 만들 때 **그 신고 전용 소금**(32바이트 난수)을 넣고 `window_ends_at = 지금 + 7일`로 둔다.
2. `reporter_key = HMAC-SHA256(reports.salt, IP 접두)`. **User-Agent는 넣지 않는다**(UA만 바꿔 세 번 신고하는 우회를 막는다). `report_hits`의 PK가 `(report_id, reporter_key)`라 같은 사람은 창 안에서 몇 번을 눌러도 1이다. 소금이 날마다 바뀌지 않으므로 '하루 간격 3회'도 1이다.
3. 창 안에서 서로 다른 키 **3개** → 즉시 자동 숨김: `state = quarantined`, 공개 파일을 `quarantine`으로 이동(약 1분 안에 공개에서 사라짐, 3-9), `status = auto_hidden`, **소금과 `report_hits` 행 삭제**.
4. 7일 안에 3에 못 미치면 창 종료: `status = expired`, 소금·`report_hits` 삭제. 다음 신고는 새 행·새 소금으로 시작한다.
   - → **판정 창 = 소금 수명 = 7일.** 소금이 대상마다 다르므로 대상끼리 신고자를 연결할 수 없고, 소금을 지운 뒤에는 IP를 되짚을 수 없다.
   - 소금이 살아 있는 7일 동안은 IPv4 전수 대입으로 되짚을 수 있다. 그래서 처리방침에는 **'신고 대상별로 최대 7일 보관하는 가명 정보'**로 적는다.
   - v2의 비밀값 `REPORT_HMAC_KEY`('소금과 별도의 고정 키')는 쓰지 않는다(공식과 비밀값 불일치 정리).
5. 운영자 확인 **7일 안**(3-12): 복원 / 확정 / 이름 가리기 / 기각. 상태 전이는 3-9. **SLA를 넘겨 격리 30일이 지나면 기본값은 확정**(공개하지 않는 쪽이 안전하다. 주인은 그동안 다시 만들기가 막혀 있다) — 리뷰 질문 2.
- 한계: 실제로 다른 회선·VPN을 쓰는 세 사람이면 숨길 수 있다. 격리라 되돌릴 수 있고, 반복 대상은 `reports` 1년 이력으로 본다. 기획 6-5 문구 수정은 13절.

**백업**: Supabase Pro 일일 백업(보존 7일). PITR은 사지 않는다(앱이 정본). **복원 리허설에서 운영 데이터를 스테이징에 넣지 않는다**(리뷰 S11 — 스테이징은 Free이고 접근 범위가 넓으며, 지운 사용자도 함께 되살아난다). 운영 백업을 **새 임시 프로젝트**에 복원해 확인한 뒤 바로 지우거나, 시드 데이터로 한다. 첫 회는 B7.

**삭제(파기) 절차(v2.1)**
1. **앱 안**: `DELETE /me` → `202`. Nest 트랜잭션에서 `users`를 지우고(CASCADE) 그 코드의 `link_daily` 행도 지운다. 이어서 Storage(`public_pages.path_prefix`·격리본)를 지우고, Auth Admin으로 `auth.users`를 지우고, `deletion_log`에 남긴다. 실패한 단계는 `storage_gc`·재시도 대기열로 넘긴다.
   - **되살아남 막기(리뷰 I1)**: ① `bootstrap` 외 모든 JWT API는 `users` 행이 없으면 `401` ② `bootstrap`은 Auth Admin으로 `auth.users` 존재를 확인한다 — 삭제된 계정의 남은 액세스 토큰(최대 1시간)으로 아웃박스 `PUT`이나 재시도 `bootstrap`이 와도 행이 다시 생기지 않는다 ③ 앱은 `202`를 받으면 세션·아웃박스·`cloud.*` 메타를 바로 비운다. e2e: '삭제 직후 옛 토큰으로 `PUT` → `401`'.
2. **웹 `/delete`**(Play 계정 삭제 정책의 웹 링크): **인장 코드와 되찾기 글귀가 둘 다 맞을 때만** 처리한다(7일 안).
   - 인장 코드는 링크 URL에 공개된 값이라 그것만으로는 본인 확인이 안 된다(리뷰 I5). 그래서 **글귀가 없는 요청은 처리하지 않는다.** 이유와 대안(앱 안 '지우기', 앱을 2년 열지 않으면 자동 정리)을 `/delete`에 적는다. 링크만 켜고 맡겨 두기를 안 켠 사용자는 글귀가 없다 → 리뷰 질문 7.
   - 처리한 뒤 받은 메일(글귀 평문 포함)은 지운다(런북).
3. 백업 속 사본은 7일 뒤 소멸한다.
4. 장기 미사용 — 5-5.
- Apple 5.1.1(v): 익명 자동 계정도 보수적으로 같은 대상으로 본다(앱 안 삭제를 '맡겨 두기'·'링크'와 같은 OTA에).

### 3-9. 링크 끄기·신고 숨김의 캐시 정책 — Q12 [v2.1]

기획 Q12: "앱 안 표시·JSON은 즉시, `/m` HTML·OG 캐시는 최대 1시간(`s-maxage` 3600), 신고 3건 자동 숨김 시 이미지 파일 삭제로 즉시 안 보임". 층마다 무엇이 언제 사라지는지:

| 층 | `Cache-Control` | 링크 끄기(주인) | 신고 자동 숨김 | 다시 만들기 |
|---|---|---|---|---|
| 앱 안 표시(`GET /creature`) | `no-store` | **즉시** | 즉시(주인 앱에 '잠시 가려졌어요 — 확인 중이에요', 문구는 작가 몫) | 즉시 |
| API JSON 전부 | `no-store` | 즉시 | 즉시 | 즉시 |
| `/m/{code}` HTML(살아 있는 링크) | `public, max-age=300, s-maxage=3600` | **최대 1시간** 옛 HTML — 이미지가 이미 없으므로 빈 한지 + '사라진 링크'로 보임 | 같음 | 최대 1시간 옛 판 HTML → 옛 판 파일은 **2시간 유예 뒤** 지워 깨지지 않음 |
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
- 더 빨리 지워야 할 때(법적 요청 등): `firebase hosting` 재배포로 CDN 전체 무효화(약 1분).

### 3-10. 원격 꿈 모티프 배포 형식 [v2]

**어디에**: 기획 6-2는 'Storage 자산'이라 적었지만 v2는 **Firebase Hosting 정적 + Git**으로 둔다(기획과 다름). 까닭: 모티프는 주 1개·수 KB짜리 **데이터**라 PR 리뷰·되돌리기·CI 검증이 Git에서 가장 싸고, DB·Nest를 거치지 않으며, 플래그와 같은 배포 경로(`deploy-static.yml`) 하나로 끝난다.

**매니페스트** `https://mongmang.ink/content/v1.json`(`max-age=3600`)

```json
{ "v": 1, "seq": 31,
  "motifs": [
    { "id": "w2026-53-crane", "kind": "weekly", "from": "2026-12-28", "schema": 1, "minAppBuild": 14,
      "url": "/content/motifs/w2026-53-crane.3f9a1c7e.json", "sha256": "…", "bytes": 9123 },
    { "id": "moon-01", "kind": "moon", "month": 1, "schema": 1, "minAppBuild": 14,
      "url": "/content/motifs/moon-01.a1b2c3d4.json", "sha256": "…", "bytes": 11204 } ],
  "revoked": [] }
```

**모티프 파일**(`immutable` 캐시, 이름에 내용 해시)

```json
{ "schema": 1, "id": "w2026-53-crane",
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
| **소프트런칭(12-22~)** | Supabase Studio + **SQL 함수** `app.restore_page(code)`·`app.confirm_hide(code)`·`app.dismiss_report(id)`(상태 전이와 `admin_actions` 기록을 한 트랜잭션에) + 작은 **CLI 스크립트** `pnpm --filter server ops:quarantine <code> restore\|confirm`(Storage 이동·삭제, service role, 오너 노트북에서만). 격리 파일은 Studio Storage 화면에서 미리 본다 **[확인 필요: 비공개 버킷 미리보기]** — 안 되면 CLI가 5분짜리 서명 URL을 찍어 준다. 웹 삭제 요청은 `ops:delete <code> <글귀>`(글귀 해시 대조 → 3-8 절차). B5 안에서 0.5일 |
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

### 5-2. 데이터 최소화·로그 [v2.1]

- v1 원칙 그대로: 이메일·이름·전화·광고 ID·기기 모델을 받지 않고, IP는 DB에 없으며, 핑에 ID가 없다.
- **로그 위치·보존(리뷰 I3)**: B6에서 **서울(asia-northeast3) 로그 버킷 `mong-logs`를 새로 만들고 보존 7일**로 둔다. `_Default` 싱크를 이 버킷으로 돌리고 `_Default` 버킷 수집은 끈다. 기존 `_Default` 버킷은 global·30일이고 위치를 바꿀 수 없다 **[확인 필요]**. 이 작업 없이는 처리방침의 'IP 7일'이 거짓이 된다. Firebase Hosting의 Cloud Logging 연동은 켜지 않는다.
- **IP와 링크 코드를 같은 로그에 남기지 않는다**: Cloud Run 요청 로그는 IP(`remoteIp`)와 전체 URL을 함께 적는다. 그대로 두면 '어느 IP가 어느 몽망이 링크를 봤나'가 7일 동안 남는다. 그래서 **`/m/` 경로의 Cloud Run 요청 로그는 제외 필터로 수집하지 않는다.** 대신 Nest가 구조화 로그를 남기되, 경로는 템플릿(`/m/:code`)·상태 코드·지연만 쓰고 IP·코드는 넣지 않는다. 앱 API 요청 로그(IP + `/api/v1/…` 경로, 링크 코드 없음)는 7일 보관한다.
- **로그 가림 목록(리뷰 S5)**: `Authorization` 헤더, `/recover`·`/recovery-code`의 본문·응답(글귀), `PUT /saves` 본문, `snapshot`, Storage 서명 URL·토큰. Nest 로거에서 가리고, 예외 로그에 요청 본문을 넣지 않는다.
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
| 650 Industries, Inc.(Expo, 미국) — EAS Update | OTA 배포 | 미국 | 플랫폼·러너 버전·설치 id [확인 필요]·IP | 둘째 실행부터 하루 한 번, TLS | Expo 정책 [확인 필요] |

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
| 공개 사본·포스터·OG·루프·스냅숏 | 링크 켜져 있는 동안. 끄면 즉시 파일 삭제(HTML 캐시 최대 1시간) | 3-9 |
| 미커밋 업로드 | 6시간 | Scheduler |
| 신고 격리본 | 최대 30일(확정이면 즉시 삭제, 30일 경과 기본값 확정) | Scheduler |
| 되찾기 글귀 | 해시만, 되찾으면 회전 | — |
| 옮겨 간 옛 사용자 | 30일 | `pg_cron` |
| 연령 확인 | 판 번호·날짜(계정과 함께 삭제) | — |
| 집계 지표 | 90일 원표 → 월 단위로 말아 보관(식별자 없음) | `pg_cron` |
| **링크 조회(`link_daily`)** | **30일** → 코드 없는 합계로 말기. 계정 삭제 때 즉시 삭제 | `pg_cron` |
| IP | DB 없음, 앱 API 요청 로그 7일(`/m/` 요청 로그는 수집 안 함) | 로그 버킷 |
| 신고 | 1년(목적: 같은 대상 재발 판단). 신고자 가명 값은 **신고 대상별 최대 7일** | `pg_cron` |
| 발자국 방문자 키·밤물 맡김(1.0 직후) | 48시간 | `pg_cron` |
| 백업 속 사본 | 7일 뒤 소멸 | Supabase |
| **장기 미사용 계정** | **앱을 2년 동안 열지 않으면 정리** | 아래 |

**장기 미사용 2년(규칙은 1.0 처리방침, 실행은 1.0.x)**
- '활동' = 인증된 API 호출(세이브 올림·링크 켜기·`/me/touch`). `users.last_active_month`를 **그달 1일로만** 갱신한다(달마다 최대 한 번 UPDATE). 언제 썼는지가 일 단위로 남지 않는다. **이 열은 1.0부터 쌓아야** 1.0.x에 시계가 맞는다.
- 링크만 켠 사람도 앱을 열면 `/me/touch`로 활동이 된다.
- 고지 문구는 **'앱을 2년 동안 열지 않으면 서버에 맡긴 것을 정리합니다'**로 단순화한다(리뷰 질문 10 답). v2의 '23개월에 앱 안 표시'는 앱을 열면 곧 활동이 되어 시계가 다시 돌므로 사실상 아무에게도 보이지 않는다 → 뺀다. 연락 수단이 없으므로 처리방침 사전 고지로 갈음한다 [법률 검토].
- 1.0.x 작업: 매월 1일 Scheduler가 24개월 지난 계정에 3-8 삭제 절차를 실행(`deletion_log(kind=inactive)`).

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

### 6-4. 레지스트리·CI/CD [v2.1]

레지스트리 Artifact Registry(서울), 인증 Workload Identity Federation(v1 그대로).

| 워크플로 | 트리거 | 단계 |
|---|---|---|
| `ci.yml` | 모든 PR | install → typecheck → test(core·mobile·server·web-live) → 서버 e2e(`supabase start`) → OpenAPI diff → **세이브 버전 가드** → `docker build` → 모티프·플래그 JSON 검증(`parseMotif`·플래그 스키마) |
| `deploy-staging.yml` | `main` 푸시(server·core) | 이미지 `:sha` → `migrate deploy`(스테이징) → `mong-api-staging` 배포 → 스모크(`/healthz`, `/m/TESTTEST`, `/config/v1.json`, **관리 라우트 404**) |
| `deploy-prod.yml` | 태그 `server-v*` + 수동 승인 | 같은 이미지 → migrate → deploy → 같은 스모크 → 실패 시 `update-traffic` 이전 리비전 100. 01월부터 `mong-admin`도 같은 이미지로 |
| `deploy-static.yml` | `apps/web-static/**`·`apps/web-live/**`·`content/**` | web-live 빌드(해시 이름) → 검증 → `firebase deploy --only hosting:staging` → (태그 `static-v*` + 승인) `hosting:prod`. 플래그 바꾸기 = 이 PR 하나 |
| `ota-guard`(스크립트) | 사람이 `eas update` 전에 | 운영 `/healthz`의 `saveSchema`·`simSchema` ≥ 앱 core 값인지 확인, 아니면 중단. **`BUNDLE_SEQ`가 지금까지 게시한 최댓값보다 큰지**도 확인(3-7) |

- 비밀:
  - GitHub Environments: **`DIRECT_URL_SESSION_POOLER`** — 이름에 세션 풀러(5432)를 드러낸다. 직접 연결은 IPv6 전용이라 GitHub 호스티드 러너에서 마이그레이션이 실패한다(리뷰 S12).
  - Secret Manager: `DATABASE_URL`(트랜잭션 풀러), `SUPABASE_SERVICE_ROLE_KEY`(새 키 체계 이름은 B1에서 확인), `RECOVERY_PEPPER`(버전 관리 + 오프라인 사본). v2의 `REPORT_HMAC_KEY`는 없앤다(3-8).
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
| **CanvasKit wasm·루프 전송** | Firebase에서 0~1(`webLive` 01-05부터) | **정식 출시 전 Cloudflare R2(전송 무료)로 옮긴 뒤** 약 1(R2 저장) — 옮기지 않으면 Firebase에서 약 23 | R2 약 1~5 — 옮기지 않으면 약 225 |
| Cloud Run | 무료 한도 안(min 0) | 월 약 300만 요청 → 소액 + **min 1 유휴 약 10~20** [확인 필요: 서울 Tier 2] | max 6~10 상향, 약 **60~100** |
| Cloud Scheduler·Logging·Artifact Registry | 0 | 0~2 | 약 5 |
| **EAS Update** | 무료 한도 안일 것 [확인 필요] | **[확인 필요 — 12-01 요금표 확인 뒤 기입]**. v2의 '월 0~200'은 근거가 없어 지웠다(리뷰 I11) | 같음 |
| 도메인 `mongmang.ink` | 월 약 3(연 25~40 [확인 필요]) | 같음 | 같음 |
| **합계(월)** | **약 25~30달러 + 도메인** | **약 45~60달러 + EAS Update** | **약 300~400달러 + EAS Update** |

- v2(10만 75~110, 60만 300~550)보다 줄어든 까닭: wasm·루프를 **정식 출시 전에 R2로 미리 옮기는 것**을 기본으로 바꿨다(리뷰 질문 12 답 — Firebase 전송에는 상한이 없고, 예산 알림은 몇 시간 늦게 오며, 입소문은 그보다 빠르다). 01월 0.5일. 옮길 때 CORS·`application/wasm`·압축 전송을 확인한다.
- **알림과 상한은 다르다**(3-8): GCP 예산은 알림일 뿐 지출을 멈추지 않는다. 실제 상한은 Cloud Run max-instances·버킷 상한뿐이고, Supabase Spend cap은 켜면 서비스가 제한될 수 있다 **[확인 필요]**.
- 서버 종료 약속(기획 6-5): 서버를 닫는 경우 비용은 '90일 공지 + 내보내기' 기간만큼.

---

## 9. 일정·구현 순서·레인 [v2.1]

### 9-1. 구현 순서 B0~B8 (빌드 2 12-10·소프트런칭 12-22 기준)

> 원칙: 바이너리에 박히는 것과 측정 장치가 먼저, 사용자 데이터를 받는 기능은 안전 바닥과 함께. 일수는 [팀 추정].

| 순서 | B | 내용 | 날짜 | 서버 | 웹 | 끝났다는 기준 |
|---|---|---|---|---|---|---|
| 1 | **B1 골격** | Nest + Prisma 7 + 로컬 Supabase + Docker·compose + `/healthz`·`/readyz` + CI + core `tsup`·`exports` + **JWT 검사 항목·로그 가림** + EAS 설치 id 설정 조사 | 11-21~11-23 | 2.0 | — | 로컬 e2e 1개 통과 |
| 2 | **B6 배포** | GCP·Artifact Registry·WIF·Secret Manager·Cloud Run 스테이징/운영·Firebase 두 사이트(**`/m/**`만 rewrite**)·서울 rewrite 확인·Cloudflare DNS + **XFF 위치 측정·`clientIp` 고정** + **서울 로그 버킷 7일·`/m/` 요청 로그 제외** + 업타임·예산 알림 | 11-24~11-25 | 1.5 | — | 스테이징 `/healthz` 200(직접), `/m/TESTTEST` 200(Firebase), XFF 고정물 커밋 |
| 3 | **B0 측정 시계** | `/ping`(차원 3·값 검증·요청 안 flush) + `config/v1.json` + `content/v1.json`(빈 목록) + `/m/*` 임시 정적 + AASA·assetlinks + `/privacy`·`/delete` 자리 | 11-26~11-27 | 1.0 | 0.5 | 운영 도메인에서 `.well-known` 둘·플래그·핑 동작 |
| 4 | **core 함수(v2.1, 서버 레인으로 이관)** | `toPublicSnapshot`·`parsePublicSnapshot`·`parseMotif`·달 위상·보름 창 + 고정물. 앱 레인은 import만 한다 | 11-28~11-29 | **1.25** | — | core 테스트 통과, 앱·서버·웹 뷰어가 같은 함수 사용 |
| 5 | **B3 링크·웹 정적** | `bootstrap`(연령 기록·Auth 확인)·`touch`·`page` PUT(**서버가 snap 씀**)·commit(시그니처·해상도)·DELETE·상태 전이·서명 업로드(미커밋 TTL·불투명 경로)·금칙어·`/m` 템플릿·`/get`·비콘·`storage_gc` | 11-30~12-03 | 2.5 | 1.0 | e2e: 켜기 → HTML 메타 → 끄기 → 파일 0, 격리 중 PUT 409 |
| 6 | **B4 모티프·플래그** | 플래그 키 9 + `minBundle`, 매니페스트·CI 검증, 첫 원격 모티프 1개로 끝까지 | 12-04~12-05 | 0.5 | 1.0 | CI가 나쁜 모티프를 막고 개발 빌드가 받음 |
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
| 5 | **EAS Update 설치 id** 전송 여부·끌 수 있는지·보존 | 3-11·5-4 | B1 조사 11-23, 법률 12-05 | 서버·오너 | 자체 업데이트 서버(**빌드 2 전** 결정) |
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

변경 이력: 2026-11-20 v1 초안(인프라 층) → 2026-11-20 v2(기획 v2.2 2차 반영) → **2026-11-20 v2.1**(서버 v2 독립 리뷰 반영, 상세는 맨 위 표). 다음: PM이 13절 반영 → D-21 확정.
