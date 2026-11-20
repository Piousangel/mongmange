// 로컬 린트 규칙의 시험(규칙이 잡아야 할 것을 잡고, 고친 꼴은 통과시키는가). 실행: node --test tools/eslint/
// 무효 사례에는 A6 리뷰(docs/team/reviews/2026-11-20-a6-review.md) 탐침에서 미탐이던 꼴을 고정해 두었다(M2·M3·L5·L6).
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { Linter, RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import mong, { classifyComment } from './mong-plugin.mjs';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.afterAll = after;

const languageOptions = { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } };
const tester = new RuleTester({ languageOptions });
const R = mong.rules;

tester.run('no-floating-timer', R['no-floating-timer'], {
  valid: [
    'const id = setTimeout(f, 10); clearTimeout(id);',
    'ref.current = setInterval(f, 10);',
    'const timers = { setTimer: (fn, ms) => setTimeout(fn, ms) };',
    'this.timers.setTimeout(f, 10);',
    'later(() => f(), 10);',
    'const id = on && setTimeout(f, 1);',
    'const id = setTimeout(f, 1) as unknown;',
  ],
  invalid: [
    { code: 'setTimeout(() => f(), 900);', errors: [{ messageId: 'floating' }] },
    { code: 'void setInterval(f, 10);', errors: [{ messageId: 'floating' }] },
    { code: 'window.setTimeout(f, 1);', errors: [{ messageId: 'floating' }] },
    { code: 'const a = <B onPress={() => setTimeout(f, 1)} />;', errors: [{ messageId: 'floating' }] },
    { code: 'p.then(() => requestAnimationFrame(f));', errors: [{ messageId: 'floating' }] },
    // L6: 감싸개를 거쳐도 버려지는 꼴
    { code: 'on && setTimeout(f, 1);', errors: [{ messageId: 'floating' }] },
    { code: 'on ? setTimeout(f, 1) : null;', errors: [{ messageId: 'floating' }] },
    { code: '(setTimeout(f, 1) as unknown);', errors: [{ messageId: 'floating' }] },
  ],
});

tester.run('effect-needs-cleanup', R['effect-needs-cleanup'], {
  valid: [
    'useEffect(() => { const id = setTimeout(f, 1); return () => clearTimeout(id); }, []);',
    'useEffect(() => { const sub = AppState.addEventListener("change", f); return () => sub.remove(); }, []);',
    'useEffect(() => { let alive = true; load().then((v) => { if (alive) set(v); }); return () => { alive = false; }; }, []);',
    'useEffect(() => { if (on) { const t = setTimeout(f, 1); return () => clearTimeout(t); } }, [on]);',
    'useEffect(() => onEffects((e) => { setTimeout(f, 1); }), []);',
    'useEffect(() => { setX(1); }, []);',
    // 안쪽 함수를 선언만 하고 이벤트에 넘기면 effect의 일이 아니다
    'useEffect(() => { const run = async () => { await load(); }; const off = bus.on(run); return () => off(); }, []);',
    // 정리가 있는 async 선언 후 호출(React 문서 꼴)
    'useEffect(() => { let alive = true; const run = async () => { const v = await load(); if (alive) setX(v); }; run(); return () => { alive = false; }; }, []);',
    'useEffect(() => { const unsub = store.subscribe(f); return unsub; }, []);',
  ],
  invalid: [
    { code: 'useEffect(() => { setTimeout(f, 1); }, []);', errors: [{ messageId: 'missing' }] },
    { code: 'useEffect(() => { load().then(setX); }, []);', errors: [{ messageId: 'missing' }] },
    { code: 'useLayoutEffect(() => { window.addEventListener("resize", f); }, []);', errors: [{ messageId: 'missing' }] },
    { code: 'useEffect(async () => { setX(await load()); }, []);', errors: [{ messageId: 'async' }] },
    {
      // 정리 함수가 다른 갈래에만 있으면 비동기 갈래는 정리가 없다(DreamCardPreview 사례)
      code: 'useEffect(() => { if (!x) { const id = setTimeout(f, 1); return () => clearTimeout(id); } load().then(setX); }, [x]);',
      errors: [{ messageId: 'missing' }],
    },
    // M2 ① effect 안에서 async 함수를 선언하고 부른다
    { code: 'useEffect(() => { const run = async () => { const v = await load(); setX(v); }; run(); }, []);', errors: [{ messageId: 'missing' }] },
    { code: 'useEffect(() => { function run() { load().then(setX); } run(); }, []);', errors: [{ messageId: 'missing' }] },
    // M2 ② void로 버린 비동기 호출
    { code: 'useEffect(() => { void loadAndSet(); }, []);', errors: [{ messageId: 'missing' }] },
    { code: 'useEffect(() => void loadAndSet(), []);', errors: [{ messageId: 'missing' }] },
    // M2 ③ return null은 정리가 아니다
    { code: 'useEffect(() => { const id = setTimeout(f, 1); return null; }, []);', errors: [{ messageId: 'missing' }] },
    // M2 ④ 빈 정리 함수
    { code: 'useEffect(() => { const sub = AppState.addEventListener("change", f); return () => {}; }, []);', errors: [{ messageId: 'missing' }] },
    // M2 ⑤ .catch·.finally
    { code: 'useEffect(() => { load().catch(() => setErr(1)); }, []);', errors: [{ messageId: 'missing' }] },
    { code: 'useEffect(() => { load().finally(() => setBusy(false)); }, []);', errors: [{ messageId: 'missing' }] },
  ],
});

tester.run('no-excuse-comment', R['no-excuse-comment'], {
  valid: ['// 공유 임시 파일 전용 캐시 폴더', '/** 영어 호칭 — 임시. 판정 전까지 */', '// TODO(B3): 렌더 서버로'],
  invalid: [
    { code: '// HACK: 일단 이렇게', errors: [{ messageId: 'excuse' }] },
    { code: '// 임시 방편으로 지연을 준다', errors: [{ messageId: 'excuse' }] },
    { code: '/* workaround for flicker */', errors: [{ messageId: 'excuse' }] },
    { code: '// 땜질', errors: [{ messageId: 'excuse' }] },
  ],
});

tester.run('eslint-comment-discipline', R['eslint-comment-discipline'], {
  valid: [
    '// eslint-disable-next-line no-console -- 개발 로그',
    'x(); // eslint-disable-line no-console -- 이유',
    '/* eslint-disable no-console -- 이 파일은 CLI라 콘솔이 출력이다 */\n/* eslint-enable no-console */',
    '// eslint 설정은 eslint.config.mjs에 있다',
    '// global 상태는 store에 둔다',
  ],
  invalid: [
    { code: '// eslint-disable-next-line no-console\nconsole.log(1);', errors: [{ messageId: 'reason' }] },
    { code: '/* eslint-disable no-console */', errors: [{ messageId: 'reason' }] },
    { code: '// eslint-disable-next-line -- 이유가 있어도 규칙 이름이 없다\nx();', errors: [{ messageId: 'blanket' }] },
    // M3: 인라인 설정 주석은 이유가 있어도 금지
    { code: '/* eslint no-console: "off" */\nconsole.log(1);', errors: [{ messageId: 'inlineConfig' }] },
    { code: '/* eslint no-console: "off" -- 이유 */\nconsole.log(1);', errors: [{ messageId: 'inlineConfig' }] },
    { code: '/* global myGlobal */', errors: [{ messageId: 'inlineConfig' }] },
  ],
});

tester.run('no-literal-ui-text', R['no-literal-ui-text'], {
  valid: [
    'const a = <T>{t("home.title")}</T>;',
    'const a = <T>{n} · {m}</T>;',
    'const a = <B accessibilityLabel={t("x")} />;',
    'const a = <B accessibilityLabel={ok ? t("a") : t("b")} />;',
    'const a = <T>{ok ? n : m}</T>;',
    'const a = <T>raw JSON</T>; // i18n-ignore: 개발 버튼',
    'const a = <B style={{ fontFamily: "serif" }} />;',
    '// i18n-ignore-file 개발 전용\nconst a = <T>Back</T>;',
  ],
  invalid: [
    { code: 'const a = <T>Back to app</T>;', errors: [{ messageId: 'literal' }] },
    { code: 'const a = <T>돌아가기</T>;', errors: [{ messageId: 'literal' }] },
    { code: 'const a = <B accessibilityLabel="Close" />;', errors: [{ messageId: 'literal' }] },
    { code: 'const a = <B accessibilityHint={`Opens ${x}`} />;', errors: [{ messageId: 'literal' }] },
    // L5: 식 컨테이너 안 문자열
    { code: "const a = <T>{'Back to app'}</T>;", errors: [{ messageId: 'literal' }] },
    { code: "const a = <T>{ok ? 'Done' : 'Retry'}</T>;", errors: [{ messageId: 'literal' }] },
    { code: "const a = <B accessibilityLabel={ok ? 'Close' : 'Open'} />;", errors: [{ messageId: 'literal' }] },
    { code: "const a = <T>{err ?? 'Failed'}</T>;", errors: [{ messageId: 'literal' }] },
  ],
});

// M3 우회 탐침: 인라인 설정 주석은 규율 규칙 자신을 끌 수 있다 → ESLint 안에서는 0건, 그래서 verify의 directives 단계가 따로 본다
describe('인라인 설정 주석 우회 탐침', () => {
  const linter = new Linter();
  const config = [{ languageOptions, plugins: { mong }, rules: { 'mong/no-floating-timer': 'error', 'mong/eslint-comment-discipline': 'error' } }];
  it('규칙을 끄는 인라인 설정은 규율 규칙이 잡는다', () => {
    const msgs = linter.verify('/* eslint mong/no-floating-timer: "off" */\nsetTimeout(f, 1);', config);
    assert.deepEqual(
      msgs.map((m) => m.ruleId),
      ['mong/eslint-comment-discipline'],
    );
  });
  it('규율 규칙 자신을 끄면 ESLint 안에서는 아무것도 안 잡힌다(그래서 classifyComment로 한 번 더 본다)', () => {
    const src = '/* eslint mong/eslint-comment-discipline: "off", mong/no-floating-timer: "off" */\nsetTimeout(f, 1);';
    assert.equal(linter.verify(src, config).length, 0);
    assert.equal(classifyComment(' eslint mong/eslint-comment-discipline: "off", mong/no-floating-timer: "off" '), 'inlineConfig');
  });
  it('이유를 단 줄 단위 disable은 계속 쓸 수 있다', () => {
    const msgs = linter.verify('// eslint-disable-next-line mong/no-floating-timer -- 컴포넌트 밖 일회 해제\nsetTimeout(f, 1);', config);
    assert.equal(msgs.length, 0);
  });
});
