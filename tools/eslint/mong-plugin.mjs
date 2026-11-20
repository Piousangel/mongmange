// 몽망이 로컬 ESLint 규칙(로드맵 A6, OPERATING 7-1·7-2). 리뷰에서 반복된 지적을 '사람 리뷰' 층에서 '정적 분석' 층으로 올린 것.
// 규칙마다 승격 근거(리뷰 문서·지적)는 docs/team/lint-rules.md 표에 있다. 오류 메시지는 '무엇이 틀렸나'보다 '어떻게 고치나'를 말한다.
// 규칙 자체의 시험: tools/eslint/mong-plugin.test.mjs(node --test, pnpm verify에 포함).

const TIMER_FNS = new Set(['setTimeout', 'setInterval', 'requestAnimationFrame']);
const EFFECT_HOOKS = new Set(['useEffect', 'useLayoutEffect']);
const SUBSCRIBE_METHODS = new Set(['addEventListener', 'addListener', 'subscribe']);
const UI_TEXT_ATTRS = new Set(['accessibilityLabel', 'accessibilityHint', 'placeholder', 'title', 'aria-label']);

const isFn = (n) => n && (n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression' || n.type === 'FunctionDeclaration');

/** setTimeout(…) · window.setTimeout(…) · globalThis.setTimeout(…) — 주입 타이머(this.timers.setTimeout)는 해당 없음 */
function timerName(call) {
  const c = call.callee;
  if (c.type === 'Identifier' && TIMER_FNS.has(c.name)) return c.name;
  if (
    c.type === 'MemberExpression' &&
    !c.computed &&
    c.object.type === 'Identifier' &&
    (c.object.name === 'window' || c.object.name === 'globalThis') &&
    TIMER_FNS.has(c.property.name)
  )
    return c.property.name;
  return null;
}

function effectCallback(call) {
  const c = call.callee;
  const name = c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && !c.computed ? c.property.name : null;
  if (!name || !EFFECT_HOOKS.has(name)) return null;
  const cb = call.arguments[0];
  return isFn(cb) ? cb : null;
}

const WRAPPERS = new Set(['TSAsExpression', 'TSNonNullExpression', 'TSSatisfiesExpression', 'TSTypeAssertion', 'ChainExpression']);

/** 값이 그대로 위로 흘러가는 감싸개(형 단언·`a && 타이머`·`c ? 타이머 : x`·void)를 건너뛴 부모 */
function valueParent(node) {
  let n = node;
  let p = n.parent;
  for (;;) {
    if (WRAPPERS.has(p.type) && p.expression === n) {
      n = p;
      p = p.parent;
    } else if (p.type === 'LogicalExpression' && p.right === n) {
      n = p;
      p = p.parent;
    } else if (p.type === 'ConditionalExpression' && (p.consequent === n || p.alternate === n)) {
      n = p;
      p = p.parent;
    } else if (p.type === 'UnaryExpression' && p.operator === 'void') {
      n = p;
      p = p.parent;
    } else return { n, p };
  }
}

/** 타이머 핸들을 버리는 호출인가(문장으로 쓰였거나, 결과를 버리는 콜백의 간결 본문) */
function discarded(call) {
  const { n, p } = valueParent(call);
  if (p.type === 'ExpressionStatement') return true;
  if (p.type === 'SequenceExpression') return true;
  if (p.type === 'ArrowFunctionExpression' && p.body === n) {
    const host = p.parent;
    return host.type === 'JSXExpressionContainer' || (host.type === 'CallExpression' && host.arguments.includes(p));
  }
  return false;
}

const noFloatingTimer = {
  meta: {
    type: 'problem',
    docs: { description: 'setTimeout·setInterval·requestAnimationFrame의 핸들을 버리지 않는다(정리 누락 → 언마운트 뒤 setState·중복 실행)' },
    messages: {
      floating:
        '{{name}} 핸들을 버리고 있습니다. 컴포넌트 안이면 useLater()(src/lib/useLater.ts — 언마운트 때 모두 정리)를 쓰거나, 핸들을 ref·변수에 담아 clear{{kind}}로 정리하세요. 컴포넌트 밖에서 state를 건드리지 않는 일회 지연이면 이유를 적어 비활성화하세요(-- 이유).',
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        const name = timerName(node);
        if (!name || !discarded(node)) return;
        const kind = name === 'setInterval' ? 'Interval' : name === 'setTimeout' ? 'Timeout' : 'AnimationFrame(cancel)';
        context.report({ node, messageId: 'floating', data: { name, kind } });
      },
    };
  },
};

const PROMISE_METHODS = new Set(['then', 'catch', 'finally']);

/** 함수 자신의 범위(안쪽 함수 제외)를 도는 방문기 */
function walkOwn(fn, enter) {
  const visit = (n) => {
    if (!n || typeof n.type !== 'string') return;
    if (n !== fn && isFn(n)) {
      enter(n);
      return;
    }
    if (enter(n) === false) return;
    for (const key of Object.keys(n)) {
      if (key === 'parent') continue;
      const v = n[key];
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v.type === 'string') visit(v);
    }
  };
  visit(fn.body);
}

/** effect 본문에서 선언한 이름 있는 함수(`const run = async () => …`, `function run() {}`) */
function localFunctions(cb) {
  const out = new Map();
  walkOwn(cb, (n) => {
    if (n.type === 'FunctionDeclaration' && n.id) out.set(n.id.name, n);
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && isFn(n.init)) out.set(n.id.name, n.init);
  });
  return out;
}

/**
 * fn 자신의 범위에서 정리가 필요한 일을 시작하는 노드들. 안쪽 함수(이벤트 핸들러·then 콜백)는 건너뛰되,
 * effect 안에서 선언하고 **부른** 함수는 그 몸통도 effect의 일로 본다(`const run = async () => {…}; run();`).
 */
function triggersIn(fn, locals, seen = new Set()) {
  const out = [];
  walkOwn(fn, (n) => {
    if (isFn(n) && n !== fn) return;
    if (n.type === 'AwaitExpression') out.push({ node: n, what: 'await' });
    // 팀 관례: 일부러 버리는 약속은 `void p`로 쓴다(no-floating-promises) → effect 안의 `void 호출`은 비동기 작업 시작이다
    if (n.type === 'UnaryExpression' && n.operator === 'void' && n.argument.type === 'CallExpression') {
      out.push({ node: n, what: 'void 비동기 호출' });
      return false;
    }
    if (n.type !== 'CallExpression') return;
    const t = timerName(n);
    if (t) out.push({ node: n, what: t });
    const c = n.callee;
    if (c.type === 'MemberExpression' && !c.computed) {
      if (SUBSCRIBE_METHODS.has(c.property.name)) out.push({ node: n, what: c.property.name });
      if (PROMISE_METHODS.has(c.property.name)) out.push({ node: n, what: `.${c.property.name}` });
    }
    if (c.type === 'Identifier' && locals.has(c.name) && !seen.has(c.name)) {
      const inner = locals.get(c.name);
      seen.add(c.name);
      if (inner.async || triggersIn(inner, locals, seen).length) out.push({ node: n, what: `${c.name}()` });
    }
  });
  return out;
}

/** 정리로 인정하는 return 값: 몸통이 있는 함수, 함수를 담은 이름, 해제 함수를 돌려주는 호출. null·undefined·빈 함수는 아니다 */
function isCleanup(arg) {
  if (!arg) return false;
  if (isFn(arg)) return arg.body.type !== 'BlockStatement' || arg.body.body.length > 0;
  if (arg.type === 'Identifier') return arg.name !== 'undefined';
  return arg.type === 'CallExpression' || arg.type === 'MemberExpression';
}

/** trigger를 품은 블록(또는 그 바깥 블록, 콜백 본문까지)에 trigger 뒤 정리 return이 있나 */
function hasCleanupAfter(trigger, cb) {
  let n = trigger;
  while (n && n !== cb) {
    const p = n.parent;
    const list = p && (p.type === 'BlockStatement' ? p.body : p.type === 'SwitchCase' ? p.consequent : null);
    if (list) {
      const i = list.indexOf(n);
      for (const s of list.slice(i + 1)) if (s.type === 'ReturnStatement' && isCleanup(s.argument)) return true;
    }
    n = p;
  }
  return false;
}

/** 같은 문장에서 여러 트리거가 나와도 한 번만 알린다 */
function statementOf(node) {
  let n = node;
  while (n.parent && !['BlockStatement', 'SwitchCase', 'Program'].includes(n.parent.type)) n = n.parent;
  return n;
}

const effectNeedsCleanup = {
  meta: {
    type: 'problem',
    docs: { description: 'useEffect가 타이머·구독·비동기 작업을 시작하면 정리 함수를 돌려준다(경합·언마운트 뒤 setState 방지)' },
    messages: {
      async: 'effect 콜백을 async로 쓰지 마세요(정리 함수를 돌려줄 수 없습니다). 안에서 비동기 함수를 부르고 `let alive = true; … if (alive) setX(v); return () => { alive = false; };`로 경합을 막으세요.',
      missing:
        "이 effect는 {{what}}로 작업을 시작하지만 그 뒤에 정리 함수를 돌려주지 않습니다(null·빈 함수는 정리가 아닙니다). 타이머는 `return () => clearTimeout(id)`, 구독은 `return () => sub.remove()`, 비동기는 `let alive = true; … if (alive) setX(v); return () => { alive = false; };`로 고치세요. 결과를 state에 쓰지 않는 발사 후 무시라면 이유를 적어 비활성화하세요(-- 이유).",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        const cb = effectCallback(node);
        if (!cb) return;
        if (cb.async) {
          context.report({ node: cb, messageId: 'async' });
          return;
        }
        const locals = localFunctions(cb);
        // 간결 본문: 호출 결과(구독 해제 함수)를 돌려주는 꼴은 정리로 본다. 그 밖(`() => void load()`)은 정리 없음
        if (cb.body.type !== 'BlockStatement' && cb.body.type === 'CallExpression') return;
        const reported = new Set();
        for (const t of triggersIn(cb, locals)) {
          const stmt = statementOf(t.node);
          if (reported.has(stmt)) continue;
          if (cb.body.type === 'BlockStatement' && hasCleanupAfter(t.node, cb)) continue;
          reported.add(stmt);
          context.report({ node: t.node, messageId: 'missing', data: { what: t.what } });
        }
      },
    };
  },
};

const EXCUSE = /\b(HACK|XXX|KLUDGE)\b|workaround|땜질|임시\s*(방편|땜빵|처리|코드|해결)|일단\s*(막|돌아가게|넘어가)/i;

const noExcuseComment = {
  meta: {
    type: 'suggestion',
    docs: { description: "땜질을 변명하는 주석('HACK'·'임시 방편'·'땜질'·'workaround') 금지 — OPERATING 7-2" },
    messages: {
      excuse: "땜질을 변명하는 주석입니다('{{word}}'). 원인을 고치거나, 고칠 수 없는 이유는 리뷰·progress에 남기고 코드에는 '왜 이 구조인가'만 적으세요.",
    },
    schema: [],
  },
  create(context) {
    return {
      Program() {
        for (const c of context.sourceCode.getAllComments()) {
          const m = EXCUSE.exec(c.value);
          if (m) context.report({ loc: c.loc, messageId: 'excuse', data: { word: m[0] } });
        }
      },
    };
  },
};

const DISABLE = /^\s*eslint-disable(?:-next-line|-line)?(?=\s|$)/;
// 인라인 설정 주석(블록 주석만 해당 — ESLint가 그렇게 읽는다): 규칙을 파일째 끄거나(`/* eslint 규칙: "off" */`) 전역을 바꾼다.
// 이유 칸이 없고 reportUnusedDisableDirectives도 못 본다. (`eslint-env`는 ESLint 10이 스스로 파싱 오류로 막는다)
const INLINE_CONFIG = /^\s*(eslint|globals?|exported)(?=\s|$)/;

/**
 * 주석 하나의 판정. null = 문제없음. verify의 directives 단계(check-directives.mjs)도 같은 함수를 쓴다 —
 * 인라인 설정 주석은 이 규칙 자신까지 끌 수 있어서, ESLint 밖에서 한 번 더 본다.
 */
export function classifyComment(value, type = 'Block') {
  if (type === 'Block' && INLINE_CONFIG.test(value)) return 'inlineConfig';
  const m = DISABLE.exec(value);
  if (!m) return null;
  const [rulesPart, ...rest] = value.slice(m[0].length).split(/\s--\s/);
  if (!rulesPart.trim()) return 'blanket';
  if (!rest.join(' -- ').trim()) return 'reason';
  return null;
}

const COMMENT_MESSAGES = {
  reason: 'eslint-disable에 이유가 없습니다. `// eslint-disable-next-line <규칙> -- <왜 이 경우는 예외인가>`로 적으세요.',
  blanket: '규칙 이름 없는 eslint-disable은 모든 규칙(이 검사 포함)을 끕니다. 끌 규칙을 이름으로 적고 이유를 다세요: `// eslint-disable-next-line <규칙> -- <이유>`.',
  inlineConfig:
    '인라인 설정 주석(`/* eslint 규칙: … */`·`/* global … */`·`eslint-env`)은 쓰지 않습니다 — 규칙을 파일째 바꾸고 이유를 남길 자리가 없습니다. 설정은 eslint.config.mjs에서, 예외는 줄 단위 `eslint-disable-next-line <규칙> -- <이유>`로.',
};

const eslintCommentDiscipline = {
  meta: {
    type: 'problem',
    docs: { description: 'eslint 주석 규율: disable에는 규칙 이름과 `-- 이유`, 인라인 설정 주석 금지' },
    messages: COMMENT_MESSAGES,
    schema: [],
  },
  create(context) {
    return {
      Program() {
        for (const c of context.sourceCode.getAllComments()) {
          const kind = classifyComment(c.value, c.type);
          if (kind) context.report({ loc: c.loc, messageId: kind });
        }
      },
    };
  },
};

const LETTER = /\p{L}/u;
const PASS_THROUGH = new Set(['TSAsExpression', 'TSNonNullExpression', 'TSSatisfiesExpression']);

/** 식이 그대로 화면에 낼 수 있는 문자열 조각들(문자열·템플릿·조건식 두 갈래·논리식 양쪽) */
function literalTexts(e) {
  if (!e) return [];
  if (e.type === 'Literal' && typeof e.value === 'string') return [e.value];
  if (e.type === 'TemplateLiteral') return [e.quasis.map((q) => q.value.cooked ?? '').join('…')];
  if (e.type === 'ConditionalExpression') return [...literalTexts(e.consequent), ...literalTexts(e.alternate)];
  if (e.type === 'LogicalExpression') return [...literalTexts(e.left), ...literalTexts(e.right)];
  if (PASS_THROUGH.has(e.type)) return literalTexts(e.expression);
  return [];
}

const noLiteralUiText = {
  meta: {
    type: 'problem',
    docs: { description: 'JSX 글·접근성 속성에 문자열을 직접 쓰지 않는다(D-17 하드코딩 0, 라틴 문자 포함)' },
    messages: {
      literal: "사용자에게 보이는 글 '{{text}}'이 코드에 직접 있습니다. src/i18n 언어 파일에 키를 만들고 t('…')로 쓰세요. 개발 전용 화면이면 같은 줄에 `i18n-ignore`, 파일 전체면 첫 줄에 `i18n-ignore-file`.",
    },
    schema: [],
  },
  create(context) {
    const sc = context.sourceCode;
    const first = sc.lines[0] ?? '';
    if (first.includes('i18n-ignore-file')) return {};
    const ignored = (node) => {
      const line = sc.lines[node.loc.start.line - 1] ?? '';
      const end = sc.lines[node.loc.end.line - 1] ?? '';
      return line.includes('i18n-ignore') || end.includes('i18n-ignore');
    };
    const report = (node, text) => {
      if (ignored(node)) return;
      context.report({ node, messageId: 'literal', data: { text: text.trim().slice(0, 40) } });
    };
    const check = (node, expr) => {
      const hit = literalTexts(expr).find((t) => LETTER.test(t));
      if (hit !== undefined) report(node, hit);
    };
    return {
      JSXText(node) {
        if (LETTER.test(node.value)) report(node, node.value);
      },
      // 자식 자리의 `{'글'}`·`{ok ? 'Done' : 'Retry'}`
      JSXExpressionContainer(node) {
        if (node.parent.type === 'JSXElement' || node.parent.type === 'JSXFragment') check(node, node.expression);
      },
      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier' || !UI_TEXT_ATTRS.has(node.name.name) || !node.value) return;
        check(node, node.value.type === 'JSXExpressionContainer' ? node.value.expression : node.value);
      },
    };
  },
};

export default {
  meta: { name: 'eslint-plugin-mong', version: '0.2.0' },
  rules: {
    'no-floating-timer': noFloatingTimer,
    'effect-needs-cleanup': effectNeedsCleanup,
    'no-excuse-comment': noExcuseComment,
    'eslint-comment-discipline': eslintCommentDiscipline,
    'no-literal-ui-text': noLiteralUiText,
  },
};
