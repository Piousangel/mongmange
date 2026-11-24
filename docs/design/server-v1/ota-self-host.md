# 자체 OTA 업데이트 서버 v1 (로드맵 V21)

- 작성: DV-3 + DV-5(서버·플랫폼), 2026-11-24. **v1.1(11-25)**: 독립 리뷰 `docs/team/reviews/2026-11-25-v21-ota-review.md`(조건부 통과, 높음 2·중간 5·낮음 7) 반영 + PM 11-25 정정(전제·Firebase 리라이트·채널별 키·OTA 레이트 리밋 그룹).
- 근거: `docs/release/legal-review-v1.md` C-1·B-4, DECISIONS '2026-11-24 법률 1차 검토 뒤 오너 결정 3'·'V21 자체 OTA 구현 결정'·'PM 11-25 정정', D-22 OTA 규칙 + PM 11-24 예외(소프트런칭 중 OTA는 JS·데이터만, 네이티브 변경 0, 플래그 뒤).
- 이 문서는 `architecture.md` 3-11의 **EAS Update 부분을 대체**한다(채널·플래그 순서 규칙·'코드는 OTA, 켜기는 플래그'는 그대로).
- 정본 명세(2026-11-24 확인):
  - Expo Updates v1 — <https://docs.expo.dev/technical-specs/expo-updates-1/> (문서 수정일 2026-08-12)
  - Expo SFV 0 — <https://docs.expo.dev/technical-specs/expo-sfv-0/>
  - SDK 58 `expo-updates` 설정 — <https://docs.expo.dev/versions/v58.0.0/sdk/updates/>
  - 코드 서명 — <https://docs.expo.dev/eas-update/code-signing/>
  - 공식 예시 서버 — <https://github.com/expo/custom-expo-updates-server> (`expo-updates-server/pages/api/manifest.ts`, `common/helpers.ts`)
  - 앱이 실제로 보내는 헤더 — 설치본 `expo-updates` 58.0.22 소스 `android/.../loader/FileDownloader.kt`(매니페스트·에셋 요청 빌더), `ios/EXUpdates/AppLoader/FileDownloader.swift`(`setHTTPHeaderFields`·`setManifestHTTPHeaderFields`)
  - fingerprint — 설치본 `@expo/fingerprint` 0.21.10 `build/sourcer/Expo.js`(expo config 전체 해시)·`build/Config.js`(`fingerprint.config.js`의 `fileHookTransform`)

## 0. 한 줄 요약

앱(expo-updates 58)은 `https://ota.mongmang.ink/api/v1/ota/manifest`(Firebase Hosting 리라이트 → Cloud Run 서울)에 묻고, 서버(apps/server)가 게시 목록에서 (채널·런타임·플랫폼)이 맞는 **가장 큰 판 번호**의 판을 **퍼블리시 CLI가 그 채널 키로 미리 서명해 둔 원문 그대로** multipart로 돌려준다. 에셋은 내용 해시 주소로 같은 서버가 **스트림으로** 내보낸다. 서버에는 개인키가 없고 OTA 표에 쓸 권한도 없다(DB가 강제). 앱은 설치 id 헤더를 **상수로 덮어 보내고**, 서버는 요청 헤더를 고르는 데만 쓰고 버린다 — DB·로그 0.

## 1. 전제와 버린 안

**전제(PM 11-25 정정, 리뷰 H2)**: GCP 앞단은 어느 길이든(Firebase Hosting·부하 분산기·`run.app` 직접) Google 전 세계 엣지(GFE)에서 TLS를 풀고 지난다. 그래서 '요청이 국외 엣지를 지나지 않는다'는 GCP에서 지킬 수 없다. 전제는 **"요청은 수탁자(Google) 인프라를 지나고, 우리는 설치 id를 저장·기록하지 않으며, 가능한 한 앱이 보내지도 않는다"**이다. 그 '보내지도 않는다'는 9절(헤더 상수 덮기)로 이룬다. `ota.mongmang.ink`는 Firebase 리라이트를 쓴다(부하 분산기 비용 없음, 주소 고정).

| 안 | 버린 까닭 |
|---|---|
| EAS Update 유지 | C-1: `EAS-Client-ID`·IP를 Expo(미국)가 요청마다 **저장**. 끌 수 없음. 14세 미만 포함 모든 설치자 |
| Firebase Hosting 정적 매니페스트 | 런타임·채널 매칭·'이미 받았나'·롤백 지시·재생 막기가 요청과 DB 상태에 따라 달라 정적 파일로 안 된다 |
| 공식 예시 서버(Next.js) 그대로 | 요청 때 서명(개인키가 서버에)·의존 3개. Nest 서버의 env·로그 가림·레이트 리밋·ObjectStore 틀에 넣는 편이 작다(새 서버 의존성 0) |
| 요청 때 서버가 서명 | 서버가 뚫리면 임의 JS를 모든 기기에 서명해 보낼 수 있다 → **게시 때 CLI가 서명, 서버는 원문 보관만** |

## 2. 프로토콜 v1 — 응답

| 경우 | 상태 | 본문 | 헤더 |
|---|---|---|---|
| 새 판 있음 | 200 | `multipart/mixed` 파트 `manifest` 1개(`content-disposition: form-data; name="manifest"`, `content-type: application/json; charset=utf-8`, `expo-signature: sig="…", keyid="<채널>"`) | 공통 헤더 |
| 롤백 지시가 가장 최근 | 200 | 파트 `directive` 1개 `{"type":"rollBackToEmbedded","parameters":{"commitTime":"…"},"extra":{"seq":"N","channel":"…"}}`(서명) | 공통 헤더 |
| 맞는 판 없음·이미 실행 중·이미 내장 번들·채널 없음·런타임 다름·내보내지 않는 판(3절 4) | **204** | 없음(content-type 없음) | 공통 헤더 |
| accept가 JSON뿐 | 200 | 매니페스트 JSON(`application/expo+json`), `expo-signature`는 응답 헤더 | 공통 헤더 |
| accept가 JSON뿐인데 롤백 | 406 | — | 명세: JSON 꼴은 지시를 못 싣는다 |
| `expo-protocol-version` ≠ 1 / accept 협상 실패 | 406 | `{error:{code}}` | |
| `expo-platform` ≠ ios·android / 런타임 없음·모양 밖 | 400 | `{error:{code}}` | |
| OTA 레이트 리밋 초과 | 429 | `{error:{code}}` | no-store |

- 공통 헤더: `expo-protocol-version: 1`, `expo-sfv-version: 0`, `cache-control: private, max-age=0`(명세 권장). Firebase를 지나도 보존되는지는 B6 실측(PM 11-25 ①).
- **보내지 않는 헤더**: `expo-server-defined-headers`(앱이 저장해 이후 모든 요청에 다시 실어 보낸다 = 식별자 통로, **영구 금지**), `expo-manifest-filters`.
- 매니페스트 꼴: `id`(UUID v4), `createdAt`(ISO, 앞 판보다 늘 늦게), `runtimeVersion`, `launchAsset`(Hermes 번들, `fileExtension` 생략), `assets[]`(`hash` = SHA-256 base64url, `key` = Metro 에셋 MD5, `contentType`, `fileExtension`, `url`), **`metadata: {seq, channel}`**(서명 안에 판 번호·채널을 묶는다 — 3절), `extra.expoClient` = `expo config --type public`.
- 파트 `content-type`에 `; charset=utf-8`을 붙인다(공식 예시와 같음). 명세 값은 `application/json`이라 **빌드 2 리허설에서 iOS·Android 실기기 수신을 확인**한다(8절 체크리스트 6, 리뷰 L5).
- 지원하지 않는 것: 프로토콜 0, bsdiff 패치(앱 `enableBsdiffPatchSupport: false`), `extensions` 파트.

## 3. 고르기 규칙

1. 키 = (`expo-channel-name`, `expo-runtime-version`, `expo-platform`). 셋이 같은 행 중 **판 번호(seq)가 가장 큰** 것 하나(업데이트·롤백 구별 없이). seq는 (채널·런타임·플랫폼) 안에서 1부터 1씩, DB UNIQUE. CLI가 `createdAt`도 앞 판보다 늘 늦게 쓴다(앱은 createdAt·commitTime으로 고른다).
2. 업데이트이고 `expo-current-update-id`와 같으면 204.
3. 롤백이고 `current = embedded`(이미 내장 번들)면 204. 아니면 지시. 앱은 `commitTime`이 지금 실행 판보다 늦을 때만 내장 번들로 간다.
4. **내보내지 않는 판(204 + error 로그 한 줄 — 행 id·까닭만)**:
   - `binding_mismatch`: 서명 원문 안의 `seq`·`channel`(매니페스트 metadata, 지시 extra)이 행과 다르다 → 옛 판의 서명 원문을 더 큰 seq 행에 넣어 다시 내미는 **재생**, 다른 채널 원문 끼워 넣기(리뷰 M3).
   - `revoked`: 번들(launchAsset 해시)이 `ota_revoked`에 있다 → 롤백한 나쁜 판을 키를 쥔 쪽이 새로 서명해 넣어도 거른다.
   - `assets_missing`: 판의 에셋 중 하나라도 저장소에 없다(운영 `STORAGE_DRIVER=none` 포함) → 매니페스트만 나가고 에셋이 실패하는 상태를 만들지 않는다(리뷰 L4).
   - `unsigned`: 서명 없는 판 — `OTA_ALLOW_UNSIGNED=true`(개발 전용, 운영 부팅 거부)이고 앱이 서명을 기대하지 않을 때만 내보낸다.
5. 결과(판정 포함)는 인스턴스 메모리에 30초 캐시.

## 4. 런타임 버전·채널·롤백(D-22)

- **런타임 = `fingerprint` 정책**. 네이티브 의존·설정·플러그인 파일이 바뀌면 값이 달라져 맞지 않는 바이너리에 JS가 가지 않는다 — PM 예외 'JS·데이터만'을 값으로 지킨다. 플랫폼마다 값이 다르다 → 플랫폼별로 게시.
- **채널·서명 설정은 런타임 계산에서 뺀다(리뷰 H1)**: `@expo/fingerprint`는 정규화한 expo config 전체를 해시해서, 가드 플러그인이 빌드 프로필마다 넣는 `updates.requestHeaders`·`codeSigningCertificate`·`codeSigningMetadata`·`enabled` 때문에 같은 소스인데 채널마다 값이 갈렸다(리뷰 실측 env 없음 `89d4…`/preview `2403…`/production `632e…`). → `apps/mobile/fingerprint.config.js`의 공식 훅 `fileHookTransform`이 `expoConfig` 내용에서 **그 네 칸만** 지운다. 그 밖의 config·네이티브 모듈·플러그인 파일은 그대로 해시된다. 11-25 실측: 세 env 모두 android `e9bae392…`로 같음.
  - 근거로 고른 까닭: 네 칸은 JS ↔ 네이티브 호환과 무관한 빌드별 값이다. 버린 안 ⓐ 채널 헤더를 네이티브 mod로 직접 쓰기 — 서명·enabled까지 mod로 옮겨 expo-updates 플러그인을 다시 짜게 된다. ⓑ 채널마다 런타임을 다르게 두고 CLI가 채널별 계산 — preview에서 확인한 같은 번들을 production으로 내는 길(republish)이 런타임 불일치로 막힌다.
  - 고정 시험: `apps/mobile/test/ota-config.test.ts` — 실제 `runtimeversion:resolve`를 env 셋(없음·preview·production)으로 돌려 플랫폼별 값이 같은지.
  - 값 얻기: CLI `publish`가 `--runtime-version`이 없으면 `apps/mobile`에서 그 채널 env로 **직접 계산**한다(사람이 값을 옮기지 않는다). 빌드 2 리허설에서 **EAS 빌드 로그 값 = CLI 값**을 대조한다(8절 체크리스트 5).
- **채널**: `preview`(내부·비공개 테스트) / `production`. 빌드 프로필 env `MONG_OTA_CHANNEL` → 가드 플러그인이 `expo-channel-name`으로 박는다. 흐름: `preview` 게시 → 내부 확인 → `republish --from <preview id> --channel production --key <production 키>`(같은 에셋, production 키로 새로 서명, 새로 올리는 파일 0).
- **되돌리기**:
  1. 행동: 원격 플래그 끄기(3-7) — 그대로.
  2. **코드, 1순위 = 고친 새 판 게시**(판 번호가 커서 이긴다. 실행 중인 판보다 늦으므로 옛 판은 기기에서도 진다).
  3. 코드(내장 번들로): `ota-cli rollback` — `rollBackToEmbedded` 지시 + **그때 최신 번들을 `ota_revoked`에 넣는다**. 그 번들은 CLI가 다시 게시·republish하지 않고(거부), 서버도 내보내지 않는다(3절 4).
  4. 코드(이전 판으로): `ota-cli republish --from <옛 id>` — 되돌린 번들이면 거부.
  5. 시작 직후 크래시: expo-updates 내장 오류 복구(`disableAntiBrickingMeasures` 기본 false 유지).
- **알려진 남은 위험(리뷰 M3 ⓐ)**: 서명된 매니페스트에는 만료가 없다. 롤백 지시 뒤 내장 번들로 돌아간 기기에, 그 채널 **개인키와 서버(또는 TLS)를 함께 쥔 쪽**이 옛 나쁜 판을 다시 내밀면 앱은 받는다(앱 SelectionPolicy는 '실행 판보다 늦은가'만 본다). 서버·DB 쪽 재생은 3절 4와 롤 권한(7절)으로 막았고, 남는 경우는 키 유출 + 서버 장악이 겹칠 때다 → 그래서 되돌리기 1순위는 '고친 새 판'(옛 판보다 늦은 판을 실행 중이게 한다).
- **세이브 형식 가드**: `publish --server-url <운영 API>`가 `/healthz`의 `saveSchema`·`simSchema`가 이 번들보다 낮으면 멈춘다. `BUNDLE_SEQ` 증가 확인은 후속(13절).

## 5. 에셋 저장·내보내기

- `ObjectStore` 버킷 `ota-assets`(비공개, 서버가 읽어 내보냄). 키 = 내용 해시(SHA-256 base64url 43자) + 선택 `.br`·`.gz`. 내용 주소라 한 번 쓴 키는 바뀌지 않는다(명세 'asset URL은 바뀌거나 사라지면 안 된다'). 다른 버킷과 키 규칙이 섞이지 않는다(`validObjectKey`).
- 압축 판은 CLI가 게시 때 만든다(brotli q11·gzip 9, 10% 이상 줄 때만). 서버는 `accept-encoding`에 맞춰 br > gzip > 원본.
- **무결성 = 게시 때 검증 + 저장된 해시(리뷰 M5, 팀 결정)**: 게시 — 올린 뒤 원본을 다시 읽어 해시를 맞추고 **압축 판은 풀어서** 맞춘다. 행을 쓰기 직전 `insertUpdate`가 매니페스트의 모든 해시(압축 판 포함)를 저장소에서 다시 맞춘다. 하나라도 틀리면 행이 생기지 않는다. 내보내기 — **스트림**(`ObjectStore.openRead` → `reply.send(stream)`, `content-length`), 메모리에 통째로 올리지 않고 해시를 다시 계산하지 않는다. 서명된 매니페스트가 해시를 담고 앱이 받은 파일의 해시를 반드시 검사하므로(명세 MUST) 저장소에서 파일이 바뀌어도 기기에서 실행되지는 않는다(다운로드 실패로 끝난다).
- 크기(11-24 실측): 플랫폼당 Hermes 번들 5.1MB(br 1.69MB) + 에셋 52개, export 전체 24MB.
- 운영 저장소: `STORAGE_DRIVER`는 `none`(운영)·`local`(개발)뿐. 실제 드라이버(Supabase Storage 서울 또는 GCS 서울)는 B6에서 `openRead`(스트림)까지 구현한다. 그 전에는 운영에서 판이 `assets_missing`으로 204다. 에셋 요청에도 `EAS-Client-ID` 자리가 있으므로(9절) 에셋을 제3자 CDN 주소로 직접 내보내지 않고 우리 서버를 거친다.

## 6. 코드 서명 — 채널별 키(리뷰 M3)

- 알고리즘 RSA-SHA256(PKCS#1 v1.5). 서명 = 매니페스트(또는 지시) JSON **원문 UTF-8 바이트**의 base64. 매니페스트가 에셋 해시를 담으므로 에셋까지 서명된다.
- **채널마다 키·인증서가 다르다**: `apps/mobile/certs/ota-preview.pem`·`ota-production.pem`(공개, 커밋), keyid = 채널 이름. 가드 플러그인이 빌드 채널의 인증서만 바이너리에 넣는다(`codeSigningMetadata: {keyid: <채널>, alg: rsa-v1_5-sha256}`) → **preview 키로 서명한 판은 production 기기에서 검증에 실패한다**(같은 런타임이어도 — 4절에서 채널 간 런타임을 같게 만들었으므로 이 분리가 필요하다).
- CLI: 채널 C에는 keyid C의 키로만 서명(다르면 거부). 서명 뒤 **그 채널 인증서로 되검증**하고, 인증서 파일이 없으면 **게시를 거부**한다(리뷰 L2 — 경고만 하고 넘어가지 않음).
- 키 만들기(B6 때 오너와 함께, PM 11-25 ③): 채널마다 `cd apps/mobile && npx expo-updates codesigning:generate --key-output-directory <저장소 밖>/<채널> --certificate-output-directory <임시> --certificate-validity-duration-years 10 --certificate-common-name "mongmangE OTA <채널>"` → 인증서를 `certs/ota-<채널>.pem`으로.
- **개인키 자리**: 오너 비밀번호 관리자 + 오프라인 사본 1(PM 11-25 ③). 서버·Cloud Run·CI 비밀값에는 두지 않는다. CLI는 키 경로를 **realpath로 풀어 저장소 뿌리(CLI 파일 위치에서 찾음 — 어디서 실행해도 같음)** 안이면 거부한다(리뷰 L1, 저장소 밖 심볼릭 링크 포함). `.gitignore`에 `private-key.pem` 류.
- 회전·만료: 인증서가 만료된 바이너리는 새 업데이트를 받지 못한다. 10년. 키를 잃으면 그 채널 바이너리에는 새 OTA를 낼 수 없다(스토어 업데이트로만).

## 7. 퍼블리시 도구·DB 권한(관리 API 없음)

```sh
pnpm --filter server build                                     # CLI = apps/server/dist/ota-cli.js
cd apps/mobile && npx expo export --platform android --platform ios --output-dir /tmp/ota-export
npx expo config --type public --json > /tmp/expo-public.json
# 게시(플랫폼마다, 런타임은 CLI가 그 채널 env로 직접 계산). DB = 게시 롤, 저장소 = B6 전에는 local
OTA_DATABASE_URL=postgresql://ota_publisher:…@…:5432/… STORAGE_DRIVER=local STORAGE_LOCAL_DIR=… \
  node apps/server/dist/ota-cli.js publish --dist /tmp/ota-export --platform android --channel preview \
  --asset-base-url https://ota.mongmang.ink/api/v1/ota/assets --key ~/<저장소 밖>/preview/private-key.pem \
  --expo-config /tmp/expo-public.json --server-url <운영 API>
node apps/server/dist/ota-cli.js list --channel preview
node apps/server/dist/ota-cli.js republish --from <preview id> --channel production --key ~/<…>/production/private-key.pem
node apps/server/dist/ota-cli.js rollback --platform android --channel production --runtime-version <값> --key … [--reason …]
```

- **롤 분리(리뷰 M4, DB가 강제)**: 게시 롤 `ota_publisher` = `ota_releases`·`ota_revoked`에 SELECT·INSERT만(수정·삭제 권한 없음, 다른 표는 읽지도 못함). 서버 런타임 롤 = 두 표 SELECT만 — 표 소유자라 RLS를 그냥 지나가므로 **FORCE ROW LEVEL SECURITY + 정책**(SELECT: 서버·게시 롤, INSERT: 게시 롤)으로 소유자에게도 건다. 수정·삭제 정책은 없다(덧붙이기만). 서버 롤은 게시 롤의 멤버가 아니다(SET ROLE로 빌릴 수 없음). CLI는 `OTA_DATABASE_URL`(게시 롤)만 받고 마이그레이션 롤(`DIRECT_URL`)은 쓰지 않는다.
- 남은 한계: 표 소유자(서버 롤)는 DDL로 FORCE를 끌 수 있다 — 소유자 분리는 B6 Supabase 롤 설계에서. 로컬·CI 롤은 `prisma/local/00-roles.sql`, 운영은 B6에서 같은 이름으로 만들고(비밀번호 = 오너 보관) 마이그레이션의 GRANT·정책 블록을 다시 돌린다.
- 고정 시험: `ota.db.test.ts` '롤 권한'(서버 롤 INSERT → RLS 거부, UPDATE·DELETE → 0행 / 게시 롤 UPDATE·DELETE·users·saves → permission denied / 멤버십 0), `db.db.test.ts`(정책은 OTA 두 표에만, FORCE 두 표).

## 8. 앱 설정(빌드 2 묶음)과 `ready: true` 체크리스트

바꾼 것(빌드는 하지 않음 — 빌드 2에서 PM):
- `expo-updates ~58.0.22`(MIT, 네이티브 모듈).
- app.json: `runtimeVersion: {policy: fingerprint}`, `updates.url = https://ota.mongmang.ink/api/v1/ota/manifest`(자리 — 도메인 연결 전), `checkAutomatically: NEVER`, `fallbackToCacheTimeout: 0`, `enableBsdiffPatchSupport: false`. 서명 설정은 app.json에 두지 않는다(채널별로 플러그인이 넣는다).
- `fingerprint.config.js`(4절).
- 가드 플러그인 `plugins/withSelfHostedUpdates.js` `{ ready: false }`:
  1. 주소는 https `*.mongmang.ink`만.
  2. 채널 = env `MONG_OTA_CHANNEL`(eas.json preview·production) → `expo-channel-name`.
  3. 채널별 인증서 `./certs/ota-<채널>.pem` + keyid = 채널.
  4. **fail-closed(리뷰 M2)**: ready·채널·그 채널 인증서가 모두 있을 때만 `updates.enabled = true`. 하나라도 빠지면 `enabled = false`로 OTA 자체를 끈다. EAS든 로컬(Xcode Archive·`gradlew bundleRelease`·`expo run --variant release`)이든 어떤 출시 구성도 '서명 없이 OTA를 받는 바이너리'가 되지 않는다. EAS 출시 빌드(development 밖)는 조건이 빠지면 빌드를 멈춘다.
  5. 설치 id 헤더 상수 덮기(9절).
- `expo config --type introspect`(MONG_OTA_CHANNEL=preview, ready false) 11-25 확인: Expo.plist `EXUpdatesEnabled false`·`EXUpdatesRequestHeaders {EAS-Client-ID: 0000…, Expo-Fatal-Error: -, Expo-Recent-Failed-Update-IDs: "", expo-channel-name: preview}`, AndroidManifest 같은 값.

`ready: true` 전 조건(리뷰 7절 + PM): **H1·H2·M2·M3 해결(이번 반영) 뒤 PM이 바꾼다.** 그 전 체크리스트:
1. `ota.mongmang.ink` Firebase 리라이트 → Cloud Run 연결, 실제 TLS 응답, `cache-control: private, max-age=0` 보존 실측(B6).
2. 운영 에셋 저장소 드라이버(`openRead` 스트림 포함)·운영 DB에 마이그레이션 + `ota_publisher` 롤(B6).
3. 채널별 서명 키 생성(오너, B6)·오프라인 사본·`certs/ota-preview.pem`·`ota-production.pem` 커밋.
4. **앱 JS의 '둘째 실행부터 하루 1회' `checkForUpdateAsync`/`fetchUpdateAsync` 코드가 빌드 2 바이너리에 있음**(PM 11-25 ⑤, 앱 레인). 없으면 그 바이너리는 OTA를 영영 받지 못한다.
5. 리허설: preview 빌드 → **EAS 빌드 로그의 런타임 = CLI가 계산한 값** 대조(기계적으로: 빌드 로그 값과 `ota-cli publish`가 찍는 `rv=`를 비교) → preview 게시 → 실기기에서 받기·서명 검증·롤백 1회.
6. 리허설에서 iOS·Android가 파트 `content-type: application/json; charset=utf-8`·빈 `Expo-Recent-Failed-Update-IDs` 덮기를 문제없이 처리하는지(리뷰 L5).

## 9. 개인정보 — 보내지 않게, 받아도 남기지 않게

**앱이 보내지 않게(리뷰 H2 확인)**: expo-updates에는 `EAS-Client-ID`를 끄는 설정이 없다(설치본 58.0.22: Android `FileDownloader.kt`가 매니페스트·에셋 요청마다 `.header("EAS-Client-ID", easClientID)`, iOS `FileDownloader.swift`가 `request.setValue(EASClientID.uuid()…)`, 조건 없음). 그러나 **두 플랫폼 모두 그 뒤에 `config.requestHeaders`를 같은 이름 덮어쓰기로 넣는다**(OkHttp `Request.Builder.header()`, `URLRequest.setValue` — 둘 다 같은 이름을 바꿔 씀, 이름 대소문자 무관). 그래서 가드 플러그인이 `updates.requestHeaders`에 상수를 넣어 덮는다: `EAS-Client-ID: 00000000-0000-0000-0000-000000000000`(모든 설치 같은 값), `Expo-Fatal-Error: -`(PM 11-25 ④ 크래시 텍스트를 받지 않음 — 보내지도 않게), `Expo-Recent-Failed-Update-IDs: ""`. 판이 올라가 순서가 바뀌면 `apps/mobile/test/ota-config.test.ts`가 설치본 소스를 읽어 실패한다(덮기 순서 고정 시험). 앱 내부의 설치 id(NSUserDefaults·SharedPreferences)는 기기에 남지만 밖으로 나가지 않는다.

받는 헤더와 서버 처리:

| 헤더 | 내용 | 앱이 보내는 값 | 서버가 쓰는가 | DB | 로그 |
|---|---|---|---|---|---|
| `EAS-Client-ID` | 설치마다 영속 무작위 id | **상수(덮음)** | 아니오 | 0 | 0 |
| `Expo-Fatal-Error` | 앱을 멈춘 오류 텍스트 | **`-`(덮음)** | 아니오 | 0 | 0 |
| `Expo-Recent-Failed-Update-IDs` | 실패한 판 id | **빈 값(덮음)** | 아니오 | 0 | 0 |
| `Expo-Current-Update-ID` / `Expo-Embedded-Update-ID` | 지금 실행·내장 판 id(같은 판의 모든 설치가 같은 값) | 그대로 | '이미 받았나' 비교에만, 메모리에서 버림 | 0 | 0 |
| `Expo-Platform`·`Expo-Runtime-Version`·`expo-channel-name` | 고르는 키 | 그대로 | 예(메모리) | 0 | 0 |
| `Expo-Protocol-Version`·`Expo-API-Version`·`Expo-Updates-Environment`·`Expo-JSON-Error`·`accept`·`expo-expect-signature` | 형식 | 그대로 | 예(메모리) | 0 | 0 |
| `Expo-Extra-Params` | JS `setExtraParamAsync` 값 | 우리 앱은 쓰지 않음(정적 시험 — 리뷰 L6) | 아니오 | 0 | 0 |
| IP·`User-Agent`·`X-Forwarded-For` | — | — | IP 접두 = OTA 레이트 리밋 메모리 키(1분 창)뿐 | 0 | 0 |

- 고정 검사: `ota.e2e.test.ts`(pino 로그 + **stdout·console 가로채기**, 리뷰 M1), 서버 린트 `no-console`(lint-rules 승격 표 7), `ota.db.test.ts`(app 스키마 모든 표 모든 행, 열 목록 고정), `log-redaction.test.ts`.
- **우리 코드 밖의 기록(수탁자)**: Firebase Hosting·Cloud Run 플랫폼 요청 로그는 IP·UA·URL을 남길 수 있다 [확인 필요: B6에서 실제 로그 항목 대조 — 사용자 정의 요청 헤더가 남는지 포함]. 앱이 설치 id를 상수로 보내므로 수탁자 로그에도 설치 식별자는 없다.
- 레이트 리밋 IP 판정: `/api/v1/ota/**`는 경로 그룹 `ota`(Firebase → Cloud Run, `TRUSTED_PROXY_HOPS_OTA`, 비우면 `TRUSTED_PROXY_HOPS_WEB` 값 — 같은 길). XFF 왼쪽 위조로 키를 새로 만들 수 없음을 e2e가 고정. 실제 hops 값은 B6 실측.

### 9-1. release 담당에게 넘길 처리방침·스토어 반영 목록(이 작업 범위 밖 — `docs/release/**`)

1. 전제 문구: '요청은 수탁자(Google — Firebase Hosting·Cloud Run) 인프라를 지나고, 우리는 설치 식별자를 저장·기록하지 않는다'. '국외 엣지를 지나지 않는다'는 표현은 쓰지 않는다.
2. 업데이트 확인 항목: 보내는 값 = 플랫폼·런타임 버전·채널·현재/내장 업데이트 id(모든 설치 공통 값). **설치 식별자·오류 내용·실패 업데이트 id는 앱이 보내지 않는다**(상수로 덮음). IP는 수탁자 인프라 로그 [B6 보존 기간 확인 후 기입].
3. 처리위탁·국외 이전 표: Expo(650 Industries) 행 삭제. Google(Firebase·Cloud Run) 행에 '업데이트 확인·파일 내려받기' 목적 추가(국외 이전 여부는 Google 엣지 경유를 기준으로 법률 검토 C-1 회신과 맞춤).
4. 스토어 선언: EAS 이유로 넣으려던 Device ID·Crash Data(Expo 권고)는 **필요 없음**(설치 id·크래시 텍스트를 보내지 않음). 7-1·7-2 근거 문구를 고친다.
5. 법률 검토 C-1·B-4: '자체 서버 + 설치 id 미전송(상수)'으로 회신 질문을 갱신.

## 10. 캐시·레이트 리밋

- 매니페스트·204: `cache-control: private, max-age=0`. 에셋: `public, max-age=31536000, immutable` + `vary: accept-encoding` + `content-length`. 오류·429: `no-store`.
- 레이트 리밋(architecture 3-8 표에 더함): 전역 IP 카운터(분당 120)에서 빼고 **OTA 전용 카운터**(리뷰 L3 — 같은 CGNAT 뒤 다른 API 호출이 OTA를 밀어내지 않게): 매니페스트 IP 접두당 분당 60, 에셋 분당 600.

## 11. 증거

| 무엇 | 명령 | 결과(11-25) |
|---|---|---|
| 프로토콜·게시 준비·바인딩·realpath | `pnpm --filter server test`(`ota-protocol.test.ts`) | 통과 |
| e2e(명세 꼴·채널 키 분리·재생 거부·롤백+되돌린 번들·스트림 32MB·에셋 없음 204·XFF 위조·로그·stdout 0) | 같은 명령(`ota.e2e.test.ts` 16) | 통과 |
| 경로 그룹·hops env | `client-ip.test.ts`·`env.test.ts` | 통과 |
| 실제 DB(게시 롤로 게시→받기·롤백·republish 거부·seq UNIQUE·불일치 거부·**롤 권한**·DB 전체·로그 0·열 고정) | `DATABASE_URL=…54329 pnpm --filter server test:db`(`ota.db.test.ts` 9, `db.db.test.ts` 정책·FORCE) | 통과 |
| 앱 설정·가드·fail-closed·헤더 덮기 순서·fingerprint 채널 불변·Extra-Params 0 | `pnpm --filter mobile test`(`ota-config.test.ts` 13) | 통과 |
| 스키마 ↔ 마이그레이션 | `prisma migrate diff --exit-code` | 차이 0 |

## 12. 로컬 스모크(실제 expo export)

11-24(v1, compose 운영 이미지): 실제 `expo export`(android·ios) → CLI 게시 → 매니페스트 200·openssl 서명 `Verified OK`·에셋 53/53 해시 일치(번들 br 5.1MB → 1.69MB)·로그 식별 값 0. 11-25 v1.1 재스모크 결과는 작업 보고에 적는다.

## 13. 남은 결정·후속

- 결정 완료(PM 11-25): 도메인 = Firebase 리라이트, 저장소 = B6, 키 = 오너 보관·B6 생성, 크래시 텍스트 = 받지 않음(이제 보내지도 않음), 앱 확인 코드 = 앱 레인 빌드 2 전.
- 후속(B6·앱 레인): 운영 저장소 드라이버(`openRead` 스트림), Firebase 경유 hops·캐시 헤더·플랫폼 로그 실측, 소유자 분리(FORCE를 끌 수 없게), `BUNDLE_SEQ` 증가 가드, 오래된 에셋 정리(명세상 URL은 지우면 안 되므로 런타임이 더는 쓰이지 않을 때만), 에셋 송신 비용 실측.
