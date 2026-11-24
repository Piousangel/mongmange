// ESLint(flat config) — 저장소 하나에 설정 하나(로드맵 A6). 규칙은 최소·의미 있게, 오류만 둔다(경고 0 정책: --max-warnings 0).
// 규칙별 근거·심각도 판단은 docs/team/lint-rules.md. 리뷰에서 같은 지적이 두 번 나오면 여기(또는 테스트)로 올린다(OPERATING 7-1).
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import mong from './tools/eslint/mong-plugin.mjs';

const TS = ['**/*.{ts,tsx,mts,cts}'];
const MOBILE_APP = ['apps/mobile/src/**/*.{ts,tsx}', 'apps/mobile/App.tsx', 'apps/mobile/index.ts'];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.expo/**',
      '**/web-build/**',
      'apps/mobile/public/**',
      'apps/web-static/public/**',
      'apps/mobile/android/**',
      'apps/mobile/ios/**',
      'apps/server/src/generated/**',
      'docs/**',
    ],
  },
  { linterOptions: { reportUnusedDisableDirectives: 'error' } },

  js.configs.recommended,
  ...tseslint.configs.recommended.map((c) => ({ ...c, files: c.files ?? TS })),

  // 기본 환경: 저장소의 .mjs/.js 스크립트는 Node, TS는 타입 검사기가 전역을 본다
  {
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node } },
    plugins: { mong },
    rules: {
      // 언더스코어 접두는 '일부러 안 쓴다'는 표시(콜백 시그니처 맞추기)
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
      'mong/no-excuse-comment': 'error',
      'mong/eslint-comment-discipline': 'error',
    },
  },
  // 캡처 스크립트: page.evaluate 콜백은 브라우저에서 돈다
  { files: ['scripts/**/*.mjs'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  // Expo 설정 플러그인은 CommonJS
  { files: ['apps/mobile/plugins/**/*.js'], languageOptions: { sourceType: 'commonjs' } },

  // 비동기 약속을 흘리지 않는다(타입 정보 필요). 의도한 발사 후 무시는 `void p`로 드러낸다 — 이미 쓰는 관례를 규칙으로 승격
  {
    files: TS,
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
    },
  },

  // 앱(React): 훅 규칙 + 타이머·effect 범주 규칙 + 하드코딩 글 금지
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, __DEV__: 'readonly' } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      // Metro는 에셋(require('x.wav'))과 지연 로드(Skia 뒤 App, 선택 네이티브 모듈 optionalModule)를 require로만 한다
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: MOBILE_APP,
    rules: {
      'mong/no-floating-timer': 'error',
      'mong/effect-needs-cleanup': 'error',
      // 모듈을 불러오는 순간 던지면 앱 전체가 죽는다(리뷰: 꿈 카드 marbleFx·M1 features 쿼리) — 지연 생성 + 폴백
      'no-restricted-syntax': [
        'error',
        { selector: 'Program > ThrowStatement', message: '모듈 최상위에서 던지면 앱이 켜지자마자 죽습니다. 처음 쓸 때 만들고(lazy) 실패하면 폴백하세요.' },
      ],
    },
  },
  {
    files: ['apps/mobile/src/**/*.tsx', 'apps/mobile/App.tsx'],
    ignores: ['apps/mobile/src/i18n/**'],
    rules: { 'mong/no-literal-ui-text': 'error' },
  },

  // 서버: 타이머 핸들 규칙 + console 금지(React 없음)
  // 서버 src: console 금지(V21 리뷰 M1 — Cloud Run은 stdout을 그대로 Cloud Logging에 넣는다. 로그는 pino 화이트리스트(logging.ts)로만, CLI는 process.stdout/stderr.write)
  { files: ['apps/server/src/**/*.ts'], rules: { 'mong/no-floating-timer': 'error', 'no-console': 'error' } },

  // core: 결정성(같은 입력 → 같은 몽망이·카드). 시각·난수는 바깥에서 주입한다(sim 리뷰 확인 항목을 검사로)
  {
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'core는 결정적이어야 합니다. 난수는 시드 기반 rng(인자로 주입)를 쓰세요.' },
        { object: 'Date', property: 'now', message: 'core는 결정적이어야 합니다. 시각은 인자(now·이벤트 시각)로 받으세요.' },
        { object: 'performance', property: 'now', message: 'core는 결정적이어야 합니다. 시각은 인자로 받으세요.' },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: 'core는 결정적이어야 합니다. 현재 시각은 인자로 받으세요.' },
      ],
    },
  },

  // 경계(mentors.md 적용안 1): 패키지 방향은 apps → packages 한쪽. core는 RN worklet·서버 번들 양쪽에서 도는 순수 TS(런타임 의존성 0, check:bundle ②)
  {
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { regex: '^(react|react-dom|react-native|expo|@expo/|@shopify/|react-native-)', message: 'core는 플랫폼 중립이어야 합니다(RN worklet·서버 번들·Vitest가 같은 코드를 씁니다). 화면·네이티브 코드는 apps/mobile에 두고 core에는 순수 함수만 두세요.' },
            { regex: '^node:', message: 'core는 RN·worklet에서도 돕니다. Node 내장 모듈은 테스트·스크립트에서만 쓰세요.' },
            { regex: '^(@mong/contract|zod)', message: 'core는 런타임 의존성 0입니다(서버 check:bundle ②). 원격 계약 스키마는 @mong/contract에 두고 앱·서버에서 이으세요.' },
            { regex: '(^|/)apps/|^(mobile|server|web-static)$', message: 'packages는 apps를 import하지 않습니다(방향: apps → packages).' },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/contract/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { regex: '^(react|react-native|expo|@expo/|@shopify/|@nestjs/|@prisma/)', message: 'contract는 앱·서버·CI가 같이 쓰는 스키마만 둡니다(zod). 프레임워크 코드는 각 앱에 두세요.' },
            { regex: '(^|/)apps/|^(mobile|server|web-static)$', message: 'packages는 apps를 import하지 않습니다(방향: apps → packages).' },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/mobile/**/*.{ts,tsx}', 'apps/web-static/**/*.{js,mjs}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ regex: '(^|/)server(/|$)|^@nestjs/|^@prisma/', message: '앱은 서버 내부를 import하지 않습니다. 공유 타입·스키마는 @mong/core·@mong/contract로 옮기세요.' }] },
      ],
    },
  },

  // 테스트: 타입 우회·빈 함수는 목(mock)에서 흔하다
  {
    files: ['**/test/**/*.{ts,tsx}', '**/*.test.{ts,tsx}'],
    rules: { '@typescript-eslint/no-explicit-any': 'off', '@typescript-eslint/no-empty-function': 'off' },
  },
);
