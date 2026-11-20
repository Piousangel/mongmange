// pnpm verify — 저장소 검증 명령 하나(로드맵 A6, OPERATING 7-3). CI(.github/workflows/ci.yml)와 같은 단계를 같은 순서로 돈다.
// 단계는 서로 독립이라 하나가 실패해도 끝까지 돌고, 마지막에 표와 '어디서 실패했나' 한 줄을 낸다(종료 코드 1).
//   pnpm verify                  기본(무거운 렌더 시험 RENDER_HEAVY 제외)
//   pnpm verify --heavy          썸네일 구별 회귀 가드(apps/mobile/test/skia/distinct)까지 — 11-20 측정 시험 단계 20초 → 37초
//   pnpm verify --only lint,test (또는 --only=lint,test) 일부 단계만
// 모르는 인자·단계 이름, 값 없는 --only는 단계 목록을 찍고 종료 코드 2. 실제로 돈 단계가 0개면 실패(종료 코드 1) — '0단계 통과'는 없다(A6 리뷰 M1).
// 완료 관문 훅(.claude/hooks/typecheck-gate.sh)은 매 턴 끝 타입 검사만 하는 빠른 관문이고, 이 명령은 커밋·리뷰 전 전체 검사다.
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

export const STEP_NAMES = ['typecheck', 'lint', 'directives', 'tools', 'test', 'server-bundle', 'static-empty'];

/** 인자 해석. 잘못되면 { error } */
export function parseArgs(argv) {
  let heavy = false;
  let only = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--heavy') heavy = true;
    else if (a === '--only' || a.startsWith('--only=')) {
      const raw = a === '--only' ? argv[++i] : a.slice('--only='.length);
      if (raw === undefined || raw.startsWith('--')) return { error: '--only에 단계 이름이 없다' };
      const names = raw.split(',').map((x) => x.trim()).filter(Boolean);
      if (!names.length) return { error: '--only에 단계 이름이 없다' };
      const unknown = names.filter((n) => !STEP_NAMES.includes(n));
      if (unknown.length) return { error: `모르는 단계: ${unknown.join(', ')}` };
      only = new Set(names);
    } else return { error: `모르는 인자: ${a}` };
  }
  return { heavy, only };
}

/** 최종 판정. 돈 단계가 0개면 실패다 */
export function verdict(results) {
  if (results.length === 0) return { ok: false, reason: '실제로 돈 단계가 0개' };
  const failed = results.filter((r) => !r.ok);
  return failed.length ? { ok: false, failed } : { ok: true };
}

function steps(heavy) {
  return [
    { name: 'typecheck', label: '타입 검사(전 패키지)', cmd: ['pnpm', '-r', '--parallel', 'run', 'typecheck'] },
    { name: 'lint', label: 'ESLint(경고 0)', cmd: ['pnpm', 'exec', 'eslint', '.', '--max-warnings', '0'] },
    { name: 'directives', label: 'eslint 주석 규율(ESLint 밖에서)', cmd: ['node', 'tools/eslint/check-directives.mjs'] },
    { name: 'tools', label: '도구 시험(린트 규칙·주석 검사·verify)', cmd: ['node', '--test', 'tools/eslint/*.test.mjs', 'scripts/verify.test.mjs'] },
    { name: 'test', label: heavy ? '시험(전 패키지, RENDER_HEAVY 포함)' : '시험(전 패키지, RENDER_HEAVY 제외)', cmd: ['pnpm', '-r', '--no-bail', 'run', 'test'], env: heavy ? { RENDER_HEAVY: '1' } : {} },
    { name: 'server-bundle', label: '서버 번들 검사(build + check:bundle)', cmd: ['pnpm', '--filter', 'server', 'run', 'build'], then: ['pnpm', '--filter', 'server', 'run', 'check:bundle'] },
    { name: 'static-empty', label: '정적 빌드: 빈 주입 값이면 실패', fn: staticEmpty },
  ];
}

/** 정적 빌드는 주입 값이 비면 '값이 비었다'로 멈춰야 한다(배포 사고 방지 — 옛 static-ci와 같은 단언) */
async function staticEmpty() {
  const env = { ...process.env };
  for (const k of ['APPLE_TEAM_ID', 'ANDROID_CERT_SHA256', 'APP_STORE_ID']) delete env[k];
  const r = await run('node', ['apps/web-static/scripts/build.mjs'], { env, quiet: true });
  const want = ['APPLE_TEAM_ID가 비어 있다', 'ANDROID_CERT_SHA256이 비어 있다', 'APP_STORE_ID가 비어 있다'];
  const missing = want.filter((w) => !r.out.includes(w));
  if (r.code === 1 && missing.length === 0) return { ok: true, out: r.out };
  return { ok: false, out: `${r.out}\n기대: 종료 코드 1 + 세 값 모두 '비어 있다'(실제 코드 ${r.code}, 빠진 문구 ${missing.join(', ') || '없음'})` };
}

function run(cmd, argv, { env = process.env, quiet = false } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, argv, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const take = (b) => {
      out += b;
      if (!quiet && process.env.VERIFY_VERBOSE) process.stdout.write(b);
    };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    child.on('close', (code) => resolve({ code, out }));
  });
}

/** 실패 출력에서 사람이 먼저 볼 줄만(오류·FAIL 줄과 ESLint 파일 머리 줄, 없으면 끝 30줄) */
function excerpt(out) {
  const lines = out.split('\n');
  const hits = lines.filter((l) => /error|FAIL|✖|×|::error::|not ok|AssertionError|Expected|기대/i.test(l) || /^\/\S+\.[cm]?[jt]sx?$/.test(l));
  return (hits.length ? hits.slice(0, 40) : lines.slice(-30)).join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    console.error(`verify: ${args.error}\n쓸 수 있는 단계: ${STEP_NAMES.join(', ')}\n사용: pnpm verify [--heavy] [--only 단계,단계]`);
    process.exit(2);
  }
  const { heavy, only } = args;
  const results = [];
  const t0 = performance.now();
  for (const s of steps(heavy)) {
    if (only && !only.has(s.name)) continue;
    process.stdout.write(`▶ ${s.label} … `);
    const st = performance.now();
    let ok;
    let out;
    if (s.fn) ({ ok, out } = await s.fn());
    else {
      let r = await run(s.cmd[0], s.cmd.slice(1), { env: { ...process.env, ...s.env } });
      if (r.code === 0 && s.then) {
        const r2 = await run(s.then[0], s.then.slice(1));
        r = { code: r2.code, out: r.out + r2.out };
      }
      ok = r.code === 0;
      out = r.out;
    }
    const sec = (performance.now() - st) / 1000;
    results.push({ ...s, ok, sec, out });
    console.log(`${ok ? '통과' : '실패'} (${sec.toFixed(1)}초)`);
    if (!ok) console.log(`── ${s.name} 출력 발췌 ──\n${excerpt(out)}\n──`);
  }

  const total = (performance.now() - t0) / 1000;
  const v = verdict(results);
  console.log('\n단계'.padEnd(16) + '결과   시간');
  for (const r of results) console.log(`${r.name.padEnd(15)}${r.ok ? '통과' : '실패'}   ${r.sec.toFixed(1)}초`);
  if (!v.ok && !v.failed) {
    console.log(`\nverify 실패: ${v.reason}`);
    process.exit(1);
  }
  if (!v.ok) {
    console.log(`\nverify 실패: ${v.failed.map((r) => `${r.name}(${r.label})`).join(', ')} — 총 ${total.toFixed(1)}초. 전체 출력은 VERIFY_VERBOSE=1 pnpm verify --only ${v.failed.map((r) => r.name).join(',')}`);
    process.exit(1);
  }
  console.log(`\nverify 통과: ${results.length}단계, 총 ${total.toFixed(1)}초${heavy ? ' (RENDER_HEAVY 포함)' : ''}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
