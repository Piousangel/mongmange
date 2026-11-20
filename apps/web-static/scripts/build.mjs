#!/usr/bin/env node
// 정적 사이트 빌드 + 배포 전 검사(B0). src/ → public/(Firebase Hosting 공개 폴더). firebase.json predeploy가 이 스크립트를 부른다 —
// 여기서 실패하면 `firebase deploy`가 멈춘다.
//
// 주입 값(배포 환경 변수 — 저장소에 두지 않는다. 오너가 계정에서 받아 GitHub Environments에 넣는다, architecture 9-3):
//   APPLE_TEAM_ID        Apple 팀 ID(10자, 대문자·숫자)                         → AASA appIDs
//   ANDROID_CERT_SHA256  서명 인증서 SHA-256 지문, 쉼표로 여러 개(EAS 업로드 키 + Play 앱 서명 키) → assetlinks.json
//   APP_STORE_ID         App Store 앱 id(숫자)                                  → /m 스토어 버튼·Smart App Banner
//   SITE_ORIGIN          (선택) 기본 https://mongmang.ink — og:image 절대 주소
// 하나라도 비었거나 형식이 틀리거나 자리표시자 같은 값(0000…·같은 바이트 반복)이면 **실패**한다. 값은 오류 문구에 싣지 않는다.
//
// 검사(그럴듯한 오답 판별, OPERATING 8-1): 남은 {{…}} 0개 · AASA/assetlinks가 app.json의 번들 id·패키지와 같음 ·
// config/v1.json strict 스키마 · content/v1.json 스키마 + 모티프 파일 존재·바이트·sha256·스키마 1 ·
// HTML에 외부 스크립트·분석·비콘·허용 밖 외부 주소 없음(링크 코드가 새지 않게).
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentManifestSchema, motifFileSchema, remoteConfigStrictSchema } from '@mong/contract';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, '..');
const APP_JSON = join(ROOT, '../mobile/app.json');

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
  return { problems, values: { team, fps, storeId, origin } };
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const LANG_SCRIPT = "document.documentElement.lang=/^ko\\b/i.test(navigator.language||'')?'ko':'en';";
const TEXT = /\.(html|json|txt)$|apple-app-site-association$/;

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
} = {}) {
  const { problems, values } = readInjected(env);
  const warnings = [];
  const app = JSON.parse(readFileSync(appJsonPath, 'utf8')).expo;
  const iosBundle = app.ios?.bundleIdentifier;
  const androidPackage = app.android?.package;
  if (!iosBundle || !androidPackage) problems.push('apps/mobile/app.json에 ios.bundleIdentifier·android.package가 없다');

  const ogExists = existsSync(join(srcDir, 'og.jpg'));
  if (!ogExists) warnings.push('src/og.jpg가 없어 og:image 없이 만든다(공유 카드 그림은 아트 대기)');
  const tokens = {
    APPLE_TEAM_ID: values.team,
    IOS_BUNDLE_ID: iosBundle,
    ANDROID_PACKAGE: androidPackage,
    ANDROID_CERT_SHA256_JSON: JSON.stringify(values.fps),
    APP_STORE_ID: values.storeId,
    LANG_SCRIPT,
    CSP_SCRIPT_HASH: `sha256-${createHash('sha256').update(LANG_SCRIPT).digest('base64')}`,
    OG_IMAGE_TAGS: ogExists
      ? `<meta property="og:image" content="${values.origin}/og.jpg">\n<meta name="twitter:card" content="summary_large_image">`
      : '<meta name="twitter:card" content="summary">',
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

  try {
    check(outDir, { ...values, iosBundle, androidPackage, firebaseJson: readFirebaseJson(firebaseJsonPath) });
  } catch (e) {
    rmSync(outDir, { recursive: true, force: true });
    throw e;
  }
  return { files: files.sort(), warnings };
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
    }
  }

  // ④ HTML: 외부 스크립트·분석·비콘 없음, 외부 주소는 스토어·자기 도메인만(링크 코드가 새지 않게).
  //    CSP(default-src 'none')와 referrer no-referrer가 **두 겹**으로 있어야 한다(리뷰 m3·m4)
  for (const f of walk(out).filter((p) => p.endsWith('.html'))) {
    const rel = relative(out, f);
    const html = read(out, rel);
    if (/<script[^>]+src\s*=/i.test(html)) problems.push(`${rel}: 외부 스크립트`);
    if (/sendBeacon|XMLHttpRequest|fetch\(|gtag|googletagmanager|analytics|<iframe|<link[^>]+rel=["']?(?:stylesheet|preconnect|dns-prefetch)|\sping\s*=/i.test(html)) {
      problems.push(`${rel}: 분석·통신·외부 자원 흔적`);
    }
    if (!/<meta name="referrer" content="no-referrer">/.test(html)) problems.push(`${rel}: referrer no-referrer가 없다`);
    const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html)?.[1] ?? '';
    if (!/(^|;\s*)default-src 'none'/.test(csp)) problems.push(`${rel}: CSP meta(default-src 'none')가 없다`);
    const allowed = [/^https:\/\/apps\.apple\.com\//, /^https:\/\/play\.google\.com\//, new RegExp(`^${v.origin.replace(/[.]/g, '\\.')}/`)];
    // 속성 이름·따옴표와 무관하게 http(s)://·//(프로토콜 상대) 주소를 모두 본다
    for (const [, url] of html.matchAll(/=\s*["']?((?:https?:)?\/\/[^"'\s>]+)/gi)) {
      if (!allowed.some((re) => re.test(url))) problems.push(`${rel}: 허용 밖 외부 주소 ${url}`);
    }
  }

  // ⑤ 검색(리뷰 I6): robots.txt가 /m/를 막으면 noindex를 못 읽는다. /m/** 응답에 X-Robots-Tag noindex 헤더가 있어야 한다
  const robots = existsSync(join(out, 'robots.txt')) ? read(out, 'robots.txt') : '';
  if (/^\s*Disallow:\s*\/m(\/|\s*$)/im.test(robots)) problems.push('robots.txt가 /m/를 막는다(noindex를 못 읽게 됨)');
  const m = existsSync(join(out, 'm/index.html')) ? read(out, 'm/index.html') : '';
  if (m && !/<meta name="robots" content="noindex">/.test(m)) problems.push('m/index.html: meta robots noindex가 없다');
  if (v.firebaseJson) {
    const fb = v.firebaseJson.hosting ?? {};
    const mh = (fb.headers ?? []).find((h) => h.source === '/m/**')?.headers ?? [];
    if (!mh.some((h) => h.key === 'X-Robots-Tag' && /noindex/.test(h.value))) problems.push('firebase.json: /m/** 응답에 X-Robots-Tag noindex가 없다');
    // ignore에 점 파일 패턴이 있으면 .well-known(AASA·assetlinks)이 배포에서 조용히 빠진다(리뷰 m6)
    const hidesDot = (g) => /(^|\/)\.\*|(^|\/)\.well-known|^\*\*$|^\*$/.test(g);
    if ((fb.ignore ?? []).some(hidesDot)) problems.push('firebase.json: ignore가 점 파일(.well-known)을 뺄 수 있다');
    if (fb.public !== 'public') problems.push('firebase.json: public 폴더가 public이 아니다');
  }
  if (problems.length) throw new BuildError(problems);
}

// CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const { files, warnings } = build();
    for (const w of warnings) console.warn(`경고: ${w}`);
    console.log(`정적 빌드 완료: public/ ${files.length}개 파일 — ${files.join(', ')}`);
  } catch (e) {
    console.error(e instanceof BuildError ? e.message : String(e));
    process.exit(1);
  }
}
