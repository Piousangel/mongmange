#!/usr/bin/env node
// 정적 사이트 빌드 + 배포 전 검사(B0). src/ → public/(Firebase Hosting 공개 폴더). firebase.json predeploy가 이 스크립트를 부른다 —
// 여기서 실패하면 `firebase deploy`가 멈춘다.
//
// 주입 값(배포 환경 변수 — 저장소에 두지 않는다. 오너가 계정에서 받아 GitHub Environments에 넣는다, architecture 9-3):
//   APPLE_TEAM_ID        Apple 팀 ID(10자, 대문자·숫자)                         → AASA appIDs
//   ANDROID_CERT_SHA256  서명 인증서 SHA-256 지문, 쉼표로 여러 개(EAS 업로드 키 + Play 앱 서명 키) → assetlinks.json
//   APP_STORE_ID         App Store 앱 id(숫자)                                  → /m 스토어 버튼·Smart App Banner
//   SITE_ORIGIN          (선택) 기본 https://mongmang.ink — og:image 절대 주소
//   SITE_MODE            (선택) prelaunch(기본) | launch — launch면 /privacy가 처리방침 정본 전체(내부 메모·기입 칸이 렌더 HTML에 남으면 실패)
//   API_ORIGIN           앱 API(Cloud Run 서울) 출처 https://… — /delete 페이지가 글귀를 이 주소로만 직접 보낸다(국외 CDN 엣지를 거치지 않게, 2-1)
//   PRIVACY_OFFICER      (선택) 테스터판 방침 11절 보호책임자 '성명(또는 상호)' 칸 값(오너 11-25: 상호). 저장소에 두지 않는다.
//                        없고 방침 md의 칸도 비어 있으면 출시 전 모드도 빌드 실패(README W7) — 오너가 넣기 전에는 배포가 막힌다
// 하나라도 비었거나 형식이 틀리거나 자리표시자 같은 값(0000…·같은 바이트 반복)이면 **실패**한다. 값은 오류 문구에 싣지 않는다.
//
// 검사(그럴듯한 오답 판별, OPERATING 8-1): 남은 {{…}} 0개 · AASA/assetlinks가 app.json의 번들 id·패키지와 같음 ·
// config/v1.json strict 스키마 · content/v1.json 스키마 + 모티프 파일 존재·바이트·sha256·스키마 1 ·
// HTML에 외부 스크립트·분석·비콘·허용 밖 외부 주소 없음(링크 코드가 새지 않게).
//
// 출시 전 판(마케팅 P0): `/`·`/facts`·`/press`·`/privacy`(한·영, `/en/…`)와 sitemap.xml·llms.txt는 scripts/site.mjs가 만든다.
// /privacy: 출시 전 모드 = 빌드 2 테스터판(docs/release/privacy-policy-tester.*.md), 출시 모드 = 정본(privacy-policy.*.md)에서
// '게시 전 삭제' 상자만 빼고 렌더. 검사 ⑦: 색인 정책 표(site.mjs PAGES)·링크 깨짐·그림 예산·JSON-LD(사람 정보 없음, FAQ = 화면 글)·
// 톤(느낌표·이모지)·sitemap·robots·llms.txt·두 모드 모두 [ … ] 메모·작업 메모·K/U/A행 0(W3·W4·W7).
//
// 원격 문서(B4, architecture 3-7-2): config/v1.json·content/v1.json의 서명(RS256)은 공개키 목록 remote-public-keys.json
// (빌드 설정의 자리 — 앱 번들 공개키 목록과 같은 값, C11)으로 검사한다. **출시 모드이거나 공개키가 하나라도 있으면** 두 문서가
// verifyRemoteDocStrict ok이고 expiresAt까지 REMOTE_EXPIRY_WARN_DAYS(7일)보다 많이 남아야 통과(리뷰 M3·M5). 키가 없는 출시 전 모드는 경고만.
// 사전 팩(content/lex): 존재·바이트·sha256·이름 해시 8자·lexPackHeaderSchema·lexPackMatchesEntry, 매니페스트에 없는 팩 파일 금지.
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  contentManifestSchema,
  lexPackHeaderSchema,
  lexPackMatchesEntry,
  motifFileSchema,
  remoteConfigStrictSchema,
  remotePublicKeySchema,
  REMOTE_EXPIRY_WARN_DAYS,
  verifyRemoteDoc,
  verifyRemoteDocStrict,
} from '@mong/contract';
import { buildSync } from 'esbuild';
import { stripInternal } from './markdown.mjs';
import { CONTACT, MODES, OFFICER_SLOT_RE, PAGES, readPrivacy, renderSite } from './site.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, '..');
const APP_JSON = join(ROOT, '../mobile/app.json');

const require = createRequire(import.meta.url);
/** CanvasKit 판(경로 /w/ck/{판}/ — 판마다 새 경로라 immutable) */
export const CK_VERSION = JSON.parse(readFileSync(require.resolve('canvaskit-wasm/package.json'), 'utf8')).version;
/** live.js 예산(gzip). 정본 추정 약 40KB(3-5 2) — 넘으면 빌드 실패 */
export const LIVE_GZIP_BUDGET = 60 * 1024;

/**
 * /w 웹 뷰어(B3, 3-5 '페이지' 2·3): live/live.ts(+ @mong/core)를 한 파일로 묶어 /w/live.<sha256 앞 10자>.js,
 * CanvasKit(canvaskit-wasm 그대로)을 /w/ck/<판>/, 둘의 경로를 /w/manifest.json에 쓴다(페이지 스크립트가 이 파일로 live.js를 찾는다).
 * 크기(바이트·gzip)를 돌려준다 — 보고·예산 검사용
 */
export function buildLive(outDir) {
  const r = buildSync({
    entryPoints: [join(ROOT, 'live/live.ts')],
    bundle: true,
    minify: true,
    format: 'iife',
    target: 'es2020',
    platform: 'browser',
    legalComments: 'none',
    write: false,
    logLevel: 'silent',
  });
  const js = Buffer.from(r.outputFiles[0].contents);
  const live = `/w/live.${createHash('sha256').update(js).digest('hex').slice(0, 10)}.js`;
  mkdirSync(join(outDir, 'w/ck', CK_VERSION), { recursive: true });
  writeFileSync(join(outDir, live.slice(1)), js);
  const ckDir = dirname(require.resolve('canvaskit-wasm/bin/canvaskit.js'));
  for (const f of ['canvaskit.js', 'canvaskit.wasm']) cpSync(join(ckDir, f), join(outDir, 'w/ck', CK_VERSION, f));
  const ck = `/w/ck/${CK_VERSION}/`;
  writeFileSync(join(outDir, 'w/manifest.json'), JSON.stringify({ live, ck }) + '\n');
  return { live, liveBytes: js.length, liveGzip: gzipSync(js, { level: 9 }).length, ...ckSizes(ckDir) };
}

/** CanvasKit 크기는 판마다 같다 — 한 번만 잰다(7MB gzip이 빌드 시간의 대부분) */
let ckSizeMemo;
function ckSizes(ckDir) {
  if (!ckSizeMemo) {
    const wasm = readFileSync(join(ckDir, 'canvaskit.wasm'));
    ckSizeMemo = {
      ckJsGzip: gzipSync(readFileSync(join(ckDir, 'canvaskit.js')), { level: 9 }).length,
      wasmBytes: wasm.length,
      wasmGzip: gzipSync(wasm, { level: 6 }).length,
    };
  }
  return ckSizeMemo;
}

const FP = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/;
/**
 * 자리표시자 같은 값(B0 리뷰 m5): 같은 문자 반복(0000…), 서로 다른 글자가 너무 적음(AB:AB:… — 지문 64자에 4종 미만),
 * 연속값(1234567890·ABCDEFGHIJ·0123…), 흔한 예시 낱말. 진위는 오프라인에서 알 수 없다 — 배포 뒤 AASA 검증 도구 스모크는 B6.
 */
export function looksPlaceholder(v) {
  const c = v.replace(/:/g, '').toUpperCase();
  const distinct = new Set(c).size;
  if (distinct <= 1 || (c.length >= 32 && distinct < 4)) return true;
  const SEQ = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (c.length >= 6 && (SEQ.includes(c) || '9876543210'.includes(c) || '1234567890'.includes(c))) return true;
  return /^(X+|TEAMID.*|EXAMPLE.*|PLACEHOLDER.*|TODO.*|CHANGEME.*)$/.test(c);
}

export class BuildError extends Error {
  constructor(problems) {
    super(`정적 빌드 실패 — ${problems.length}건\n- ${problems.join('\n- ')}`);
    this.problems = problems;
  }
}

/** 환경 변수 → 주입 값. 문제는 이름과 이유만(값은 싣지 않음) */
export function readInjected(env) {
  const problems = [];
  const team = (env.APPLE_TEAM_ID ?? '').trim();
  if (!team) problems.push('APPLE_TEAM_ID가 비어 있다(오너: Apple Developer 계정 → Membership)');
  else if (!/^[A-Z0-9]{10}$/.test(team) || looksPlaceholder(team)) problems.push('APPLE_TEAM_ID 형식이 아니다(대문자·숫자 10자)');

  const fps = (env.ANDROID_CERT_SHA256 ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (!fps.length) problems.push('ANDROID_CERT_SHA256이 비어 있다(EAS 업로드 키·Play 앱 서명 키 SHA-256, 쉼표로)');
  for (const [i, f] of fps.entries()) {
    if (!FP.test(f) || looksPlaceholder(f)) problems.push(`ANDROID_CERT_SHA256 ${i + 1}번째 값이 SHA-256 지문 형식이 아니다(AA:BB:… 32바이트)`);
  }
  if (new Set(fps).size !== fps.length) problems.push('ANDROID_CERT_SHA256에 같은 지문이 두 번 있다');

  const storeId = (env.APP_STORE_ID ?? '').trim();
  if (!storeId) problems.push('APP_STORE_ID가 비어 있다(App Store Connect 앱 id, 숫자)');
  else if (!/^\d{6,12}$/.test(storeId) || looksPlaceholder(storeId)) problems.push('APP_STORE_ID 형식이 아니다(숫자 6~12자)');

  const origin = (env.SITE_ORIGIN ?? 'https://mongmang.ink').trim().replace(/\/+$/, '');
  if (!/^https:\/\/[a-z0-9.-]+$/.test(origin)) problems.push('SITE_ORIGIN은 https://호스트 형식이어야 한다');

  const apiOrigin = (env.API_ORIGIN ?? '').trim().replace(/\/+$/, '');
  if (!apiOrigin) problems.push('API_ORIGIN이 비어 있다(Cloud Run mong-api 주소 https://…, B6 배포 뒤)');
  else if (!/^https:\/\/[a-z0-9.-]+$/.test(apiOrigin) || /example|placeholder|localhost/i.test(apiOrigin)) problems.push('API_ORIGIN은 https://호스트 형식이어야 한다');
  const mode = (env.SITE_MODE ?? 'prelaunch').trim() || 'prelaunch';
  if (!MODES.includes(mode)) problems.push(`SITE_MODE는 ${MODES.join('·')} 중 하나여야 한다`);
  // 보호책임자 상호(선택, W7). 정규화(NFC·제어/서식 문자 제거·공백 접기) 뒤 검사 — '채운 듯 보이지만 빈' 값을 막는다(리뷰 R1)
  const officer = normalizeOfficer(env.PRIVACY_OFFICER ?? '');
  if ((env.PRIVACY_OFFICER ?? '').trim() && !officerOk(officer)) {
    problems.push('PRIVACY_OFFICER 형식이 아니다(실제 성명 또는 상호: 의미 있는 글자 2자 이상·80자 이하, 괄호 [ ]·［ ］·【 】 등·| < >·자리표시자 낱말 없이)');
  }
  return { problems, values: { team, fps, storeId, origin, apiOrigin, mode, officer } };
}

/** PRIVACY_OFFICER 정규화: NFC, 서식(Cf — 제로폭·방향 제어) 문자 제거, 제어(Cc)는 공백으로, 공백 접기·앞뒤 공백 제거 */
export const normalizeOfficer = (v) => String(v).normalize('NFC').replace(/\p{Cf}/gu, '').replace(/\p{Cc}/gu, ' ').replace(/\s+/gu, ' ').trim();
/** 괄호류(ASCII·전각·CJK). 둥근 괄호 ( )는 '(주)' 같은 상호에 쓰여 허용 */
const OFFICER_BRACKETS = /[[\]{}［］｛｝【】〔〕〖〗〘〙〚〛《》〈〉「」『』|<>＜＞｜]/u;
/** 값 전체가 이것이면 자리표시자 */
const OFFICER_WHOLE = new Set(['상호', '성명', '이름', '없음', '미정', 'name', 'na', 'n/a', 'none', 'null', 'tbd', 'tba', 'todo', 'x', 'xx', 'xxx', '-', '—']);
/** 값 어디에 있어도 자리표시자 */
const OFFICER_PART = /미정|오너\s*기입|기입\s*예정|성명\s*또는\s*상호|\btbd\b|\bn\/a\b|\bto\s*fill\b|\bowner\b|\bplaceholder\b|\btodo\b|\bchangeme\b/iu;
/** 정규화된 보호책임자 값이 실제 값처럼 보이는가 */
export function officerOk(v) {
  if (!v || v.length > 80) return false;
  if ((v.match(/[\p{L}\p{N}]/gu) ?? []).length < 2) return false;
  if (OFFICER_BRACKETS.test(v) || OFFICER_PART.test(v)) return false;
  if (OFFICER_WHOLE.has(v.toLowerCase().replace(/\s+/g, ''))) return false;
  return !looksPlaceholder(v.replace(/\s+/g, ''));
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/**
 * /delete 폼 스크립트(3-8 ② 앱 없이 지우기). 인장 코드 + 되찾기 글귀를 API_ORIGIN의 `POST /api/v1/deletion/web`으로만 보낸다.
 * 쿠키·리퍼러 없이, 결과는 textContent로만(innerHTML 없음). 빌드가 해시를 계산해 CSP script-src에 하나만 허용한다.
 */
export function deleteScript(apiOrigin) {
  return `(function(){var d=document,h=d.documentElement;h.lang=/^ko\\b/i.test(navigator.language||'')?'ko':'en';
var T={ko:{busy:'지우는 중이에요…',ok:'지웠어요. 남은 정리는 24시간 안에 끝나요. 영수증: ',nf:'코드와 글귀가 같은 몽망이를 가리키지 않아요. 다시 확인해 주세요.',bad:'코드 8자와 글귀 16자를 모두 넣어 주세요.',rl:'시도가 너무 잦아요. 한 시간 뒤에 다시 해 주세요.',err:'지금은 처리할 수 없어요. 잠시 뒤에 다시 해 주세요.'},
en:{busy:'Deleting…',ok:'Deleted. Remaining cleanup finishes within 24 hours. Receipt: ',nf:'The code and phrase do not point to the same Mongmangi. Please check them.',bad:'Enter both the 8-character code and the 16-character phrase.',rl:'Too many tries. Please try again in an hour.',err:'We cannot process this right now. Please try again later.'}};
var f=d.getElementById('del'),o=d.getElementById('out'),b=d.getElementById('go');
f.addEventListener('submit',function(e){e.preventDefault();var t=T[h.lang]||T.en;o.textContent=t.busy;b.disabled=true;
fetch('${apiOrigin}/api/v1/deletion/web',{method:'POST',headers:{'content-type':'application/json'},credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',
body:JSON.stringify({code:f.elements.code.value,phrase:f.elements.phrase.value})})
.then(function(r){if(r.status===202)return r.json().then(function(j){o.textContent=t.ok+j.receipt;f.reset();});
o.textContent=r.status===404?t.nf:r.status===400?t.bad:r.status===429?t.rl:t.err;})
.catch(function(){o.textContent=t.err;}).then(function(){b.disabled=false;});});})();`;
}
const TEXT = /\.(html|json|txt|xml)$|apple-app-site-association$/;

/** 공개키 자리(B4): 앱 번들의 원격 문서 공개키 목록과 같은 값을 둔다(C11). 비어 있으면 '아직 키 없음' */
export const REMOTE_KEYS_PATH = join(ROOT, 'remote-public-keys.json');
/**
 * 앱 번들 공개키 목록 자리(리뷰 R3, C11이 만든다). 있으면 remote-public-keys.json과 kid·n·e가 같아야 한다 —
 * 다른 키로 서명한 배포는 빌드를 통과해도 앱이 unknown_kid로 버리기 때문. 없으면(C11 전) 경고 없이 넘어가고,
 * 공개키를 넣었는데 앱 목록이 없으면 경고.
 */
export const APP_KEYS_PATH = join(ROOT, '../mobile/src/net/remote-public-keys.json');
/** 두 키 목록이 같은가(순서 무관, kid·n·e) */
export function sameKeys(a, b) {
  const key = (k) => `${k.kid}.${k.n}.${k.e}`;
  const x = a.map(key).sort();
  const y = b.map(key).sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
}
/** 공개키 목록 파일 → { keys, problems } (모양이 틀린 키는 문제로) */
export function readRemoteKeys(path) {
  const problems = [];
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    return { keys: [], problems: [`remote-public-keys.json을 읽지 못했다(${e.message})`] };
  }
  const list = Array.isArray(raw?.keys) ? raw.keys : null;
  if (!list) return { keys: [], problems: ['remote-public-keys.json: keys 배열이 없다'] };
  const keys = [];
  for (const [i, k] of list.entries()) {
    const r = remotePublicKeySchema.safeParse(k);
    if (!r.success) problems.push(`remote-public-keys.json ${i + 1}번째 키 모양이 틀렸다(${r.error.issues.map((x) => x.path.join('.')).join(', ')})`);
    else keys.push(r.data);
  }
  if (new Set(keys.map((k) => k.kid)).size !== keys.length) problems.push('remote-public-keys.json: 같은 kid가 두 번 있다');
  return { keys, problems };
}
const DAY_MS = 86_400_000;

/** 이미지 예산(SE-2): 한 장 160KB, 한 페이지가 부르는 그림 합 400KB(320px 폰·느린 망에서 첫 화면 1초대) */
export const IMAGE_BYTES_BUDGET = 160 * 1024;
export const PAGE_IMAGE_BUDGET = 400 * 1024;
/** /privacy만 방침(정본·테스터판)에 적힌 외부 문서 주소 두 곳을 링크로 연다(그 밖은 글자로만) */
const PRIVACY_EXTERNAL = [/^https:\/\/developers\.google\.com\/ml-kit\/android-data-disclosure$/, /^https:\/\/support\.google\.com\/policies\?p=privpol_privts$/];

/**
 * src → out. 문제가 있으면 BuildError(out은 지우고 남기지 않는다 — 반쯤 만든 폴더가 배포되지 않게).
 * @returns {{ files: string[], warnings: string[] }}
 */
export function build({
  srcDir = join(ROOT, 'src'),
  outDir = join(ROOT, 'public'),
  env = process.env,
  appJsonPath = APP_JSON,
  firebaseJsonPath = join(ROOT, 'firebase.json'),
  docsDir = join(ROOT, '../../docs/release'),
  remoteKeysPath = REMOTE_KEYS_PATH,
  appKeysPath = APP_KEYS_PATH,
  now = Date.now(),
} = {}) {
  const { problems, values } = readInjected(env);
  const warnings = [];
  const remote = readRemoteKeys(remoteKeysPath);
  problems.push(...remote.problems);
  if (existsSync(appKeysPath)) {
    const app = readRemoteKeys(appKeysPath);
    problems.push(...app.problems.map((p) => `앱 번들 키 목록: ${p}`));
    if (!app.problems.length && !sameKeys(remote.keys, app.keys)) problems.push('remote-public-keys.json과 앱 번들 공개키 목록(apps/mobile/src/net/remote-public-keys.json)이 다르다 — 앱이 이 배포를 unknown_kid로 버린다');
  } else if (remote.keys.length) {
    warnings.push('앱 번들 공개키 목록(apps/mobile/src/net/remote-public-keys.json)이 없어 remote-public-keys.json과 대조하지 못했다(C11)');
  }
  const app = JSON.parse(readFileSync(appJsonPath, 'utf8')).expo;
  const iosBundle = app.ios?.bundleIdentifier;
  const androidPackage = app.android?.package;
  if (!iosBundle || !androidPackage) problems.push('apps/mobile/app.json에 ios.bundleIdentifier·android.package가 없다');

  const tokens = {
    APPLE_TEAM_ID: values.team,
    IOS_BUNDLE_ID: iosBundle,
    ANDROID_PACKAGE: androidPackage,
    ANDROID_CERT_SHA256_JSON: JSON.stringify(values.fps),
    APP_STORE_ID: values.storeId,
    API_ORIGIN: values.apiOrigin,
    SITE_ORIGIN: values.origin,
    DELETE_SCRIPT: deleteScript(values.apiOrigin),
    CSP_DELETE_SCRIPT_HASH: `sha256-${createHash('sha256').update(deleteScript(values.apiOrigin)).digest('base64')}`,
  };
  if (problems.length) throw new BuildError(problems);

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const files = [];
  for (const src of walk(srcDir)) {
    const rel = relative(srcDir, src);
    if (rel.endsWith('.gitkeep') || rel.endsWith('.DS_Store')) continue;
    const dest = join(outDir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    if (TEXT.test(rel)) {
      const text = readFileSync(src, 'utf8').replace(/\{\{([A-Z0-9_]+)\}\}/g, (m, k) => (k in tokens ? tokens[k] : m));
      writeFileSync(dest, text);
    } else cpSync(src, dest);
    files.push(rel);
  }
  // 출시 전 판 페이지·sitemap·llms.txt(scripts/site.mjs). 처리방침은 정본 md에서 그대로 만든다
  const privacyMd = readPrivacy(docsDir, { officer: values.officer });
  if (values.officer && !['ko', 'en'].some((l) => readPrivacy(docsDir).tester[l].match(OFFICER_SLOT_RE))) {
    warnings.push('PRIVACY_OFFICER를 넣었지만 테스터판 방침에 채울 보호책임자 칸이 없다(이미 채워졌거나 문구가 바뀜)');
  }
  const pages = renderSite({ origin: values.origin, privacyMd, mode: values.mode });
  // 출시 전 모드: 정본은 게시하지 않으니 정본의 내부 메모·기입 칸은 경고만(게시되는 테스터판은 렌더 HTML 검사 ⑦이 실패시킨다, W7).
  // 출시 모드는 정본 렌더 HTML을 ⑦이 실패시킨다(K32)
  if (values.mode === 'prelaunch') {
    const memos = ['ko', 'en'].reduce((n, l) => n + (stripInternal(privacyMd[l]).match(/\[[^\]\n]+\]/g) ?? []).length, 0);
    if (memos) warnings.push(`처리방침 정본에 [ ] 내부 메모·오너 기입 칸 ${memos}곳 — 출시 모드(SITE_MODE=launch)는 이대로면 빌드 실패(K32)`);
  }
  for (const [rel, text] of Object.entries(pages)) {
    if (files.includes(rel)) {
      rmSync(outDir, { recursive: true, force: true });
      throw new BuildError([`${rel}: src/에 같은 파일이 있다 — 생성 페이지와 겹친다`]);
    }
    mkdirSync(dirname(join(outDir, rel)), { recursive: true });
    writeFileSync(join(outDir, rel), text);
    files.push(rel);
  }

  let live;
  try {
    live = buildLive(outDir);
    check(outDir, { ...values, iosBundle, androidPackage, firebaseJson: readFirebaseJson(firebaseJsonPath), live, remoteKeys: remote.keys, now, warnings });
  } catch (e) {
    rmSync(outDir, { recursive: true, force: true });
    throw e;
  }
  return { files: files.sort(), warnings, live };
}

const read = (out, rel) => readFileSync(join(out, rel), 'utf8');
export const readFirebaseJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** 만들어진 public/ 검사. 실패하면 BuildError */
export function check(out, v) {
  const problems = [];
  const json = (rel) => {
    try {
      return JSON.parse(read(out, rel));
    } catch (e) {
      problems.push(`${rel}: JSON이 아니다(${e.message})`);
      return null;
    }
  };

  // ① 채워지지 않은 자리
  for (const f of walk(out)) {
    const rel = relative(out, f);
    if (TEXT.test(rel) && /\{\{[A-Z0-9_]+\}\}/.test(read(out, rel))) problems.push(`${rel}: 채워지지 않은 {{…}} 자리가 남았다`);
  }

  // ② 딥링크 파일
  const aasa = json('.well-known/apple-app-site-association');
  const ids = aasa?.applinks?.details?.flatMap((d) => d.appIDs ?? []) ?? [];
  if (aasa && (ids.length !== 1 || ids[0] !== `${v.team}.${v.iosBundle}`)) problems.push('AASA appIDs가 팀 ID.번들 id 하나가 아니다');
  const paths = aasa?.applinks?.details?.flatMap((d) => (d.components ?? []).map((c) => c['/'])) ?? [];
  if (aasa && JSON.stringify(paths) !== JSON.stringify(['/m/*'])) problems.push('AASA는 /m/* 하나만 앱으로 열어야 한다');
  const al = json('.well-known/assetlinks.json');
  const t = al?.[0]?.target;
  if (al && (t?.package_name !== v.androidPackage || !Array.isArray(t?.sha256_cert_fingerprints) || !t.sha256_cert_fingerprints.length || !t.sha256_cert_fingerprints.every((f) => FP.test(f)))) {
    problems.push('assetlinks.json의 패키지·지문이 맞지 않다');
  }

  // ③ 원격 설정·콘텐츠
  const cfg = json('config/v1.json');
  if (cfg) {
    const r = remoteConfigStrictSchema.safeParse(cfg);
    if (!r.success) problems.push(`config/v1.json 스키마: ${r.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
  }
  const man = json('content/v1.json');
  if (man) {
    const r = contentManifestSchema.safeParse(man);
    if (!r.success) problems.push(`content/v1.json 스키마: ${r.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
    else {
      for (const m of r.data.motifs) {
        const rel = m.url.slice(1);
        if (!existsSync(join(out, rel))) {
          problems.push(`${m.id}: 파일 ${m.url}이 없다`);
          continue;
        }
        const buf = readFileSync(join(out, rel));
        if (buf.length !== m.bytes) problems.push(`${m.id}: bytes ${m.bytes} ≠ 실제 ${buf.length}`);
        if (createHash('sha256').update(buf).digest('hex') !== m.sha256) problems.push(`${m.id}: sha256이 다르다`);
        if (!rel.includes(createHash('sha256').update(buf).digest('hex').slice(0, 8))) problems.push(`${m.id}: 파일 이름의 해시가 내용과 다르다`);
        let file;
        try {
          file = JSON.parse(buf.toString('utf8'));
        } catch {
          problems.push(`${m.id}: 모티프 파일이 JSON이 아니다`);
          continue;
        }
        const f = motifFileSchema.safeParse(file);
        if (!f.success) problems.push(`${m.id}: 모티프 스키마 1 — ${f.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
        else if (f.data.id !== m.id) problems.push(`${m.id}: 파일 안 id(${f.data.id})가 다르다`);
      }
      checkLexPacks(out, r.data.lex, problems);
      checkOrphans(out, 'content/motifs', new Set(r.data.motifs.map((m) => m.url.slice(1))), '모티프', problems);
    }
  }
  checkRemoteSigs({ cfg, man }, v, problems);

  // ④ HTML: 외부 스크립트·분석·비콘 없음, 외부 주소는 스토어·자기 도메인만(링크 코드가 새지 않게).
  //    CSP(default-src 'none')와 referrer no-referrer가 **두 겹**으로 있어야 한다(리뷰 m3·m4)
  //    예외 하나: /delete 폼은 fetch로 API_ORIGIN 한 곳에만 보낸다 — CSP connect-src가 정확히 그 출처 하나일 때만 허용(B2)
  for (const f of walk(out).filter((p) => p.endsWith('.html'))) {
    const rel = relative(out, f);
    const html = read(out, rel);
    const isDelete = rel === 'delete/index.html';
    if (/<script[^>]+src\s*=/i.test(html)) problems.push(`${rel}: 외부 스크립트`);
    // 통신·분석 흔적은 '코드'에서만 찾는다(태그·주석·스크립트 본문). 처리방침 본문의 낱말(예: 'usage analytics')은 코드가 아니다
    const code = codeOf(html);
    const comms = isDelete ? /sendBeacon|XMLHttpRequest|gtag|googletagmanager|analytics|<iframe|<link[^>]+rel=["']?(?:stylesheet|preconnect|dns-prefetch)|\sping\s*=|innerHTML/i : /sendBeacon|XMLHttpRequest|fetch\(|gtag|googletagmanager|analytics|<iframe|<link[^>]+rel=["']?(?:stylesheet|preconnect|dns-prefetch)|\sping\s*=/i;
    if (comms.test(code)) problems.push(`${rel}: 분석·통신·외부 자원 흔적`);
    if (!/<meta name="referrer" content="no-referrer">/.test(html)) problems.push(`${rel}: referrer no-referrer가 없다`);
    const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html)?.[1] ?? '';
    if (!/(^|;\s*)default-src 'none'/.test(csp)) problems.push(`${rel}: CSP meta(default-src 'none')가 없다`);
    if (isDelete) {
      const connect = /(?:^|;\s*)connect-src ([^;]+)/.exec(csp)?.[1]?.trim();
      if (connect !== v.apiOrigin) problems.push(`${rel}: CSP connect-src는 API_ORIGIN 하나여야 한다`);
      if (/fetch\(/.test(html) && [...html.matchAll(/fetch\('([^']+)'/g)].some(([, u]) => !u.startsWith(`${v.apiOrigin}/api/v1/deletion/web`))) {
        problems.push(`${rel}: fetch가 삭제 API 밖으로 간다`);
      }
      if (!/href="\/privacy"/.test(html)) problems.push(`${rel}: 처리방침(/privacy) 링크가 없다`);
    }
    const allowed = [/^https:\/\/apps\.apple\.com\//, /^https:\/\/play\.google\.com\//, new RegExp(`^${v.origin.replace(/[.]/g, '\\.')}/`)];
    if (isDelete && v.apiOrigin) allowed.push(new RegExp(`^${v.apiOrigin.replace(/[.]/g, '\\.')}/api/v1/deletion/web$`));
    if (rel === 'privacy/index.html' || rel === 'en/privacy/index.html') allowed.push(...PRIVACY_EXTERNAL);
    // 위험한 스킴(javascript:·data:·vbscript:) 링크·자원 금지(리뷰 L4)
    for (const [, attr, url] of html.matchAll(/\s(href|src|action|formaction|srcset|poster)\s*=\s*["']?\s*((?:javascript|data|vbscript)\s*:[^"'\s>]*)/gi)) {
      problems.push(`${rel}: 위험한 스킴 ${attr}="${url.slice(0, 20)}"`);
    }
    // 속성 이름·따옴표와 무관하게 http(s)://·//(프로토콜 상대) 주소를 모두 본다
    for (const [, url] of html.matchAll(/=\s*["']?((?:https?:)?\/\/[^"'\s>]+)/gi)) {
      if (!allowed.some((re) => re.test(url))) problems.push(`${rel}: 허용 밖 외부 주소 ${url}`);
    }
  }

  // ⑤ 검색(리뷰 I6): robots.txt가 /m/를 막으면 noindex를 못 읽는다. /m/** 응답에 X-Robots-Tag noindex 헤더가 있어야 한다
  const robots = existsSync(join(out, 'robots.txt')) ? read(out, 'robots.txt') : '';
  if (/^\s*Disallow:\s*\/m(\/|\s*$)/im.test(robots)) problems.push('robots.txt가 /m/를 막는다(noindex를 못 읽게 됨)');
  if (existsSync(join(out, 'm'))) problems.push('m/: /m/**는 Cloud Run(mong-api)이 답한다 — 정적 /m 파일을 두지 않는다(B3)');
  if (v.firebaseJson) {
    const fb = v.firebaseJson.hosting ?? {};
    // B3: /m/** → Cloud Run 서울 mong-api(맨 앞 rewrite)
    const mr = (fb.rewrites ?? []).find((r) => r.source === '/m/**');
    if (mr?.run?.serviceId !== 'mong-api' || mr?.run?.region !== 'asia-northeast3') problems.push('firebase.json: /m/**는 Cloud Run mong-api(asia-northeast3)로 rewrite해야 한다');
    if ((fb.rewrites ?? []).findIndex((r) => r.source === '/m/**') !== 0) problems.push('firebase.json: /m/** rewrite가 맨 앞이 아니다');
    const mh = (fb.headers ?? []).find((h) => h.source === '/m/*')?.headers ?? [];
    if (!mh.some((h) => h.key === 'X-Robots-Tag' && /noindex/.test(h.value))) problems.push('firebase.json: /m/* 응답에 X-Robots-Tag noindex가 없다');
    // 캐시의 정본은 서버 응답 헤더 하나(B3 리뷰 I3): live 300·사라진 링크 60·503·429 no-store. Hosting 헤더가 rewrite 응답을 덮으면
    // 429·503이 5분 캐시되어 한 IP가 링크를 모두에게 막을 수 있다 → firebase.json `/m/*`에는 Cache-Control을 두지 않는다
    if (mh.some((h) => /^cache-control$/i.test(h.key))) problems.push('firebase.json: /m/*에 Cache-Control을 두지 않는다(서버가 상태별로 정한다)');
    if ((fb.headers ?? []).some((h) => h.source === '/m/**')) problems.push('firebase.json: /m/** 헤더는 /m/{code}/get·seen(no-store)까지 덮는다 — /m/*만');
    // ignore에 점 파일 패턴이 있으면 .well-known(AASA·assetlinks)이 배포에서 조용히 빠진다(리뷰 m6)
    const hidesDot = (g) => /(^|\/)\.\*|(^|\/)\.well-known|^\*\*$|^\*$/.test(g);
    if ((fb.ignore ?? []).some(hidesDot)) problems.push('firebase.json: ignore가 점 파일(.well-known)을 뺄 수 있다');
    if (fb.public !== 'public') problems.push('firebase.json: public 폴더가 public이 아니다');
    // B4 캐시(architecture 3-7-2 표): config·매니페스트는 5분(끄는 손잡이가 5분 안에 닿게), 사전 팩·모티프는 내용 해시 이름이라 immutable
    for (const [src, want] of [
      ['/config/v1.json', 'public, max-age=300'],
      ['/content/v1.json', 'public, max-age=300'],
      ['/content/lex/**', 'public, max-age=31536000, immutable'],
      ['/content/motifs/**', 'public, max-age=31536000, immutable'],
    ]) {
      const cc = (fb.headers ?? []).find((h) => h.source === src)?.headers?.find((h) => /^cache-control$/i.test(h.key))?.value;
      if (cc !== want) problems.push(`firebase.json: ${src} 캐시는 ${want}이어야 한다`);
    }
  }
  // ⑥ 웹 뷰어(B3): manifest → live.<hash>.js(이름의 해시 = 내용) + CanvasKit, 예산
  if (v.live) {
    const mf = json('w/manifest.json');
    if (mf) {
      if (!/^\/w\/live\.[0-9a-f]{10}\.js$/.test(mf.live ?? '') || !existsSync(join(out, mf.live.slice(1)))) problems.push('w/manifest.json: live 경로가 없다');
      else if (!mf.live.includes(createHash('sha256').update(readFileSync(join(out, mf.live.slice(1)))).digest('hex').slice(0, 10))) problems.push('w/live.*.js: 이름의 해시가 내용과 다르다');
      for (const f of ['canvaskit.js', 'canvaskit.wasm']) if (!existsSync(join(out, (mf.ck ?? '').slice(1), f))) problems.push(`w/ck: ${f}가 없다`);
    }
    if (v.live.liveGzip > LIVE_GZIP_BUDGET) problems.push(`live.js gzip ${v.live.liveGzip}B가 예산 ${LIVE_GZIP_BUDGET}B를 넘는다`);
    const js = readFileSync(join(out, v.live.live.slice(1)), 'utf8');
    if (/innerHTML|document\.write|sendBeacon|localStorage|document\.cookie/.test(js)) problems.push('w/live.*.js: 금지 API(innerHTML·write·비콘·저장소·쿠키)');
  }
  checkPages(out, v, problems);
  if (problems.length) throw new BuildError(problems);
}

/**
 * 사전 팩(B4 3절 2, D-26): 매니페스트 lex 항목마다 파일 존재·바이트·sha256·이름의 해시 8자·머리 스키마·머리 언어·판 = 항목.
 * public/content/lex에 매니페스트가 가리키지 않는 파일이 있으면 실패(immutable 1년 캐시라 잘못 나간 파일은 되돌릴 수 없다).
 */
function checkLexPacks(out, lex, problems) {
  const listed = new Set();
  for (const e of lex) {
    const k = `${e.lang}-${e.lexVer}`;
    const rel = e.url.slice(1);
    listed.add(rel);
    if (!existsSync(join(out, rel))) {
      problems.push(`${k}: 파일 ${e.url}이 없다`);
      continue;
    }
    const buf = readFileSync(join(out, rel));
    const hex = createHash('sha256').update(buf).digest('hex');
    if (buf.length !== e.bytes) problems.push(`${k}: bytes ${e.bytes} ≠ 실제 ${buf.length}`);
    if (hex !== e.sha256) problems.push(`${k}: sha256이 다르다`);
    if (!rel.endsWith(`.${hex.slice(0, 8)}.json`)) problems.push(`${k}: 파일 이름의 해시가 내용과 다르다`);
    let head;
    try {
      head = JSON.parse(buf.toString('utf8'));
    } catch {
      problems.push(`${k}: 사전 팩 파일이 JSON이 아니다`);
      continue;
    }
    const h = lexPackHeaderSchema.safeParse(head);
    if (!h.success) problems.push(`${k}: 사전 팩 머리 스키마 — ${h.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
    else if (!lexPackMatchesEntry(h.data, e)) problems.push(`${k}: 팩 머리(${h.data.lang}-${h.data.lexVer})가 매니페스트 항목과 다르다`);
  }
  checkOrphans(out, 'content/lex', listed, '사전 팩', problems);
}

/** immutable 폴더(content/lex·content/motifs)에 매니페스트가 가리키지 않는 파일이 있으면 실패(리뷰 R6) */
function checkOrphans(out, sub, listed, what, problems) {
  const dir = join(out, sub);
  if (!existsSync(dir)) return;
  for (const f of walk(dir)) {
    const rel = relative(out, f);
    if (!listed.has(rel)) problems.push(`${rel}: 매니페스트에 없는 ${what} 파일(immutable 캐시에 고아로 남는다)`);
  }
}

/**
 * 원격 문서 서명·만료(B4 3절 3, 리뷰 M3·M5). 엄격(출시 모드 또는 공개키가 있는 빌드): verifyRemoteDocStrict ok + 만료까지 7일 초과.
 * 서명 없는 배포가 나가면 키가 든 앱 빌드는 끄는 손잡이를 받지 못하고, 만료가 가까운 배포는 며칠 뒤 모든 기기에서 서버 기능을 끈다.
 * 느슨(키가 없는 출시 전 모드): 서명이 없으면 경고, 서명이 있으면 검사할 키가 없다고 경고.
 */
function checkRemoteSigs(docs, v, problems) {
  const keys = v.remoteKeys ?? [];
  const now = v.now ?? Date.now();
  const warnings = v.warnings ?? [];
  const strict = (v.mode ?? 'prelaunch') === 'launch' || keys.length > 0;
  if (strict && !keys.length) problems.push('공개키 목록(remote-public-keys.json)이 비어 있다 — 출시 모드는 원격 문서 서명을 검사할 키가 있어야 한다');
  for (const [rel, kind, doc] of [['config/v1.json', 'config/v1', docs.cfg], ['content/v1.json', 'content/v1', docs.man]]) {
    if (!doc) continue;
    if (strict) {
      const r = verifyRemoteDocStrict(kind, doc, keys, { nowMs: now });
      if (!r.ok) problems.push(`${rel}: 원격 문서 검사 ${r.reason} — remote-cli sign으로 서명하고 expiresAt을 넣는다(B4)`);
      else if (r.expiresAtMs - now <= REMOTE_EXPIRY_WARN_DAYS * DAY_MS) problems.push(`${rel}: expiresAt까지 ${REMOTE_EXPIRY_WARN_DAYS}일 안 — 다시 서명한다(주 1회 재서명 루틴)`);
    } else if (!Object.prototype.hasOwnProperty.call(doc, 'sig')) {
      warnings.push(`${rel}: 서명이 없다 — 출시 모드(SITE_MODE=launch)나 공개키를 넣은 빌드는 이대로면 실패(B4)`);
    } else {
      const s = verifyRemoteDoc(kind, doc, keys);
      warnings.push(`${rel}: 서명이 있지만 공개키 목록이 비어 있어 검사하지 못했다(${s})`);
    }
  }
}

/** 태그(속성 포함)·주석·스크립트 본문만 — 보이는 글자는 뺀다 */
export function codeOf(html) {
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const tags = html.match(/<!--[\s\S]*?-->|<[^>]+>/g) ?? [];
  return [...tags, ...scripts].join('\n');
}

/** 보이는 글자(스크립트·스타일·태그 제거) */
export function visibleText(html) {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/g, ' ');
}

/**
 * ⑦ 출시 전 판 페이지(SE-2·GE-1): 색인 정책 표 · sitemap · robots · llms.txt · JSON-LD · 링크 깨짐 · 이미지 예산 ·
 * 톤(느낌표·이모지) · 처리방침 내부 상자 제거. 기준은 scripts/site.mjs PAGES 한 곳
 */
function checkPages(out, v, problems) {
  const origin = v.origin ?? 'https://mongmang.ink';
  const has = (rel) => existsSync(join(out, rel)) && statSync(join(out, rel)).isFile();
  const htmlFiles = walk(out).filter((f) => f.endsWith('.html')).map((f) => relative(out, f));
  const byFile = new Map(PAGES.map((pg) => [pg.file, pg]));
  for (const rel of htmlFiles) if (!byFile.has(rel)) problems.push(`${rel}: 색인 정책 표(PAGES)에 없는 페이지 — index/noindex를 정하고 넣는다`);
  for (const pg of PAGES) if (!has(pg.file)) problems.push(`${pg.path}: 정책 표에 있는데 ${pg.file}이 없다`);

  // Firebase: 경로마다 rewrite(trailingSlash false라 /press → /press/index.html을 명시)
  const rewrites = v.firebaseJson?.hosting?.rewrites ?? [];
  const routes = new Map(rewrites.filter((r) => r.destination).map((r) => [r.source, r.destination]));
  if (v.firebaseJson) {
    for (const pg of PAGES) {
      if (pg.path === '/') continue;
      if (routes.get(pg.path) !== `/${pg.file}`) problems.push(`firebase.json: ${pg.path} → /${pg.file} rewrite가 없다`);
    }
  }
  // 생성 페이지는 firebase.json 헤더로 frame-ancestors 'none'(meta CSP로는 걸 수 없다, 리뷰 L5)
  if (v.firebaseJson) {
    const headers = v.firebaseJson.hosting?.headers ?? [];
    for (const pg of PAGES.filter((q) => !q.handwritten)) {
      const hs = headers.find((h) => h.source === pg.path)?.headers ?? [];
      if (!hs.some((h) => h.key === 'Content-Security-Policy' && /frame-ancestors 'none'/.test(h.value))) problems.push(`firebase.json: ${pg.path}에 frame-ancestors 'none' 헤더가 없다`);
    }
  }
  /** 사이트 안 주소 → 파일(없으면 null) */
  const resolve = (url) => {
    const path = decodeURI(url.replace(/[?#].*$/, '')) || '/';
    if (path === '/') return 'index.html';
    if (routes.has(path)) return routes.get(path).slice(1);
    return has(path.slice(1)) ? path.slice(1) : null;
  };

  for (const rel of htmlFiles) {
    const pg = byFile.get(rel);
    if (!pg) continue;
    const html = read(out, rel);
    const robots = /<meta name="robots" content="([^"]+)">/.exec(html)?.[1] ?? '';
    if (pg.index && /noindex/i.test(robots)) problems.push(`${rel}: 정책은 index인데 noindex가 있다`);
    if (!pg.index && !/noindex/i.test(robots)) problems.push(`${rel}: 정책은 noindex인데 robots meta가 없다`);

    // 링크 깨짐: 사이트 안 href·src는 파일 또는 rewrite로 이어져야 하고, #조각은 대상 페이지에 id가 있어야 한다
    for (const [, attr, url] of html.matchAll(/\s(href|src)="([^"]*)"/g)) {
      if (/^(?:https?:)?\/\//.test(url) || url.startsWith('mailto:')) continue;
      if (url.startsWith('#')) {
        if (url.length > 1 && !html.includes(`id="${url.slice(1)}"`)) problems.push(`${rel}: 같은 페이지 조각 ${url}이 없다`);
        continue;
      }
      if (!url.startsWith('/')) {
        problems.push(`${rel}: 상대 주소 ${attr}="${url}" — /로 시작하는 주소만(trailingSlash false라 상대 주소가 어긋난다)`);
        continue;
      }
      const target = resolve(url);
      if (!target) problems.push(`${rel}: 깨진 링크 ${url}`);
      else if (url.includes('#') && target.endsWith('.html') && !read(out, target).includes(`id="${url.split('#')[1]}"`)) problems.push(`${rel}: ${url}의 조각이 대상에 없다`);
    }

    // 이미지: alt·크기 속성, 한 장·페이지 예산
    const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
    let pageBytes = 0;
    const seen = new Set();
    for (const tag of imgs) {
      const src = /\ssrc="([^"]+)"/.exec(tag)?.[1] ?? '';
      if (!/\salt="[^"]+"/.test(tag)) problems.push(`${rel}: 대체 글(alt)이 없는 그림 ${src}`);
      if (!/\swidth="\d+"/.test(tag) || !/\sheight="\d+"/.test(tag)) problems.push(`${rel}: 그림 ${src}에 width·height가 없다(밀림 방지)`);
      const file = src.startsWith('/') ? resolve(src) : null;
      if (!file) continue;
      if (!seen.has(file)) {
        seen.add(file);
        pageBytes += statSync(join(out, file)).size;
      }
    }
    if (pageBytes > PAGE_IMAGE_BUDGET) problems.push(`${rel}: 그림 합 ${pageBytes}B가 페이지 예산 ${PAGE_IMAGE_BUDGET}B를 넘는다`);

    if (pg.handwritten) continue;
    // 생성 페이지: 스크립트는 JSON-LD 데이터 블록만, canonical·hreflang, JSON-LD에 사람 정보 없음, 톤
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    for (const [, attrs, body] of scripts) {
      if (!/type="application\/ld\+json"/.test(attrs)) {
        problems.push(`${rel}: 실행되는 스크립트가 있다(생성 페이지는 스크립트 0)`);
        continue;
      }
      let ld;
      try {
        ld = JSON.parse(body);
      } catch {
        problems.push(`${rel}: JSON-LD가 JSON이 아니다`);
        continue;
      }
      const s = JSON.stringify(ld);
      if (/"@type":"Person"|"telephone"|"address"|"founder"|"author"|"employee"/.test(s)) problems.push(`${rel}: JSON-LD에 사람·연락 정보 칸(Person·telephone·address 등)이 있다`);
      for (const [mail] of s.matchAll(/[\w.+-]+@[\w.-]+\.[a-z]+/gi)) if (mail !== CONTACT) problems.push(`${rel}: JSON-LD에 ${CONTACT} 밖의 메일`);
      const types = (ld['@graph'] ?? []).map((n) => n['@type']);
      if (!types.includes('SoftwareApplication') || !types.includes('Organization')) problems.push(`${rel}: JSON-LD에 SoftwareApplication·Organization이 없다`);
      // FAQ 구조화 데이터 = 보이는 질문·답과 같은 글(Google: 마크업은 보이는 내용과 같아야)
      for (const faq of (ld['@graph'] ?? []).filter((n) => n['@type'] === 'FAQPage')) {
        for (const q of faq.mainEntity ?? []) {
          const vis = visibleText(html).replace(/\s+/g, ' ');
          if (!vis.includes(q.name) || !vis.includes(q.acceptedAnswer?.text)) problems.push(`${rel}: FAQ 구조화 데이터 '${q.name}'가 화면 글과 다르다`);
        }
      }
    }
    if (!html.includes(`<link rel="canonical" href="${origin}${pg.path}">`)) problems.push(`${rel}: canonical이 ${origin}${pg.path}가 아니다`);
    if (!/hreflang="ko"/.test(html) || !/hreflang="en"/.test(html)) problems.push(`${rel}: hreflang 한·영 짝이 없다`);
    const text = visibleText(html);
    if (!/\/privacy$/.test(pg.path)) {
      if (/[!！]/.test(text)) problems.push(`${rel}: 느낌표(몽망이 톤)`);
      if (/\p{Extended_Pictographic}/u.test(text)) problems.push(`${rel}: 이모지(몽망이 톤)`);
    }
    // 내부 메모 0(리뷰 B2·I1, W7): 렌더된 HTML의 보이는 글자에서 [ … ] 꼴 메모·기입 칸 — 두 모드 모두(출시 전 모드의 테스터판 포함)
    const memos = [...text.matchAll(/[[［【〔][^\]］】〕\n]{1,300}[\]］】〕]/gu)].map((m) => m[0]);
    if (memos.length) {
      const officer = /\/privacy$/.test(pg.path) && memos.some((m) => /오너 기입|owner to fill/.test(m)) ? ' — 보호책임자 등 오너 기입 칸: 배포 환경 변수 PRIVACY_OFFICER(상호)를 넣거나 방침을 채우기 전에는 배포할 수 없다(README W7)' : '';
      problems.push(`${rel}: 내부 메모·기입 칸 ${memos.length}곳(예: ${memos[0].slice(0, 40)})${officer}`);
    }
    // 체크리스트 행(법률 리뷰 L4, W4): K\d+(구현 확인)·U\d+(개정 목록)·A\d+(도입 시 개정 목록) — 표 칸이든 글자든
    if (/<t[dh][^>]*>\s*[KUA]\d+\s*<\/t[dh]>/.test(html) || /(^|[^\w-])[KUA]\d+(?![\w-])/.test(text)) problems.push(`${rel}: 처리방침 체크리스트(K행)가 새었다`);
    if (/구현 확인 체크리스트|게시 전 삭제|Remove before publishing|implementation checklist/.test(text)) problems.push(`${rel}: 처리방침의 내부용 체크리스트 표식이 남았다`);
    if (/\/privacy$/.test(pg.path)) {
      // 판 이력·작업 메모(초안·법률 검토·독립 리뷰·P1~P19 등)가 공개본에 남으면 실패 — 정본·테스터판 모두(W3)
      const draft = /초안|법률 검토|확인 필요|도입 시 추가|독립 리뷰|P1~P19|\bdraft\b|legal (?:first-pass )?review|independent review|P1–P19|To verify/i.exec(text);
      if (draft) problems.push(`${rel}: 처리방침에 작업 메모('${draft[0]}')가 남았다`);
      if ((v.mode ?? 'prelaunch') === 'launch') {
        if (!/id="s-17"/.test(html)) problems.push(`${rel}: 처리방침 17절(보호책임자)이 렌더되지 않았다`);
      } else {
        // 출시 전 모드 = 빌드 2 테스터판(13절까지, W1·W2). 절 id는 허용, 전체 정본(17절 이상)이 렌더되면 실패
        if (!/<h1>[^<]*(?:테스트 빌드|Test Build)[^<]*<\/h1>/.test(html)) problems.push(`${rel}: 출시 전 모드 /privacy가 테스터판 방침이 아니다(제목에 '테스트 빌드'·'Test Build' 없음)`);
        if (/id="s-(?:1[7-9]|[2-9]\d)[-"]/.test(html)) problems.push(`${rel}: 출시 전 모드인데 전체 처리방침 정본(17절 이상)이 렌더됐다`);
        if (!text.includes(CONTACT) || !/30일|30 days/.test(text)) problems.push(`${rel}: 출시 전 개인정보 안내에 문의처·'출시 30일 뒤 삭제'가 없다`);
      }
    }
  }

  // 그림 파일 한 장 예산
  if (existsSync(join(out, 'img'))) {
    for (const f of walk(join(out, 'img'))) {
      const size = statSync(f).size;
      if (size > IMAGE_BYTES_BUDGET) problems.push(`${relative(out, f)}: ${size}B가 그림 한 장 예산 ${IMAGE_BYTES_BUDGET}B를 넘는다`);
    }
  }

  // sitemap = 정책 표의 index 페이지 전부, 그 밖 없음
  const want = PAGES.filter((pg) => pg.index).map((pg) => `${origin}${pg.path}`).sort();
  const sm = has('sitemap.xml') ? read(out, 'sitemap.xml') : '';
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).sort();
  if (JSON.stringify(locs) !== JSON.stringify(want)) problems.push(`sitemap.xml: 색인 페이지 목록과 다르다(있어야 ${want.length}, 있음 ${locs.length})`);

  // robots.txt: 색인 페이지를 막지 않고, sitemap 주소를 알린다
  const robotsTxt = has('robots.txt') ? read(out, 'robots.txt') : '';
  const disallow = [...robotsTxt.matchAll(/^\s*Disallow:\s*(\S+)/gim)].map((m) => m[1]);
  for (const pg of PAGES.filter((q) => q.index)) if (disallow.some((d) => pg.path.startsWith(d) || `${pg.path}/`.startsWith(d))) problems.push(`robots.txt가 색인 페이지 ${pg.path}를 막는다`);
  if (!robotsTxt.includes(`Sitemap: ${origin}/sitemap.xml`)) problems.push('robots.txt에 Sitemap 줄이 없다');

  // llms.txt: H1 + 요약, 링크는 모두 색인 페이지
  const lt = has('llms.txt') ? read(out, 'llms.txt') : '';
  if (!/^# \S/.test(lt) || !/^> \S/m.test(lt)) problems.push('llms.txt: H1과 > 요약 줄이 없다');
  for (const [, url] of lt.matchAll(/\]\(([^)]+)\)/g)) {
    const ok = PAGES.some((pg) => pg.index && `${origin}${pg.path}` === url);
    if (!ok) problems.push(`llms.txt: 색인 페이지가 아닌 링크 ${url}`);
  }
}

// CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const { files, warnings, live } = build();
    for (const w of warnings) console.warn(`경고: ${w}`);
    console.log(`정적 빌드 완료: public/ ${files.length}개 원본 파일 — ${files.join(', ')}`);
    console.log(`웹 뷰어: ${live.live} ${live.liveBytes}B (gzip ${live.liveGzip}B), CanvasKit ${CK_VERSION} js gzip ${live.ckJsGzip}B · wasm ${live.wasmBytes}B (gzip ${live.wasmGzip}B)`);
  } catch (e) {
    console.error(e instanceof BuildError ? e.message : String(e));
    process.exit(1);
  }
}
