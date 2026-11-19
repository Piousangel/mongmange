// ICU MessageFormat(1) 부분 구현 — 번들을 가볍게 두려고 직접 쓴다(intl-messageformat 약 40KB+ 대신 약 3KB).
// 지원: {name} 변수, {n, plural, =0 {…} one {…} other {…}} + '#', {k, select, a {…} other {…}}, {name, josa, 을/를} (한국어 조사).
// 지원하지 않음: 작은따옴표 이스케이프(' 는 늘 글자 그대로 — 영어 아포스트로피가 편하도록), offset, selectordinal, 날짜·숫자 스타일.
import { isJosaStyle, josa } from './josa';

export type Node =
  | string
  | { k: 'arg'; name: string }
  | { k: 'plural' | 'select'; name: string; branches: Record<string, Node[]> }
  | { k: 'josa'; name: string; style: string }
  | { k: 'hash' };

export type Params = Record<string, string | number>;

/** 복수 범주(CLDR 기본 규칙 중 지금 쓰는 두 언어만). Hermes Intl.PluralRules에 기대지 않는다 */
export type PluralRule = (n: number) => 'one' | 'other';
export const PLURAL: Record<'ko' | 'en', PluralRule> = {
  ko: () => 'other',
  en: (n) => (n === 1 ? 'one' : 'other'),
};

class Reader {
  i = 0;
  constructor(readonly s: string) {}
  peek() {
    return this.s[this.i];
  }
  fail(msg: string): never {
    throw new Error(`ICU parse: ${msg} @${this.i} in "${this.s}"`);
  }
  skipWs() {
    while (this.i < this.s.length && /\s/.test(this.s[this.i]!)) this.i++;
  }
  /** 쉼표·닫는 괄호·공백 전까지 */
  word(): string {
    this.skipWs();
    const st = this.i;
    while (this.i < this.s.length && !/[\s,{}]/.test(this.s[this.i]!)) this.i++;
    return this.s.slice(st, this.i);
  }
}

export function parse(src: string): Node[] {
  const r = new Reader(src);
  const out = parseMessage(r, false);
  if (r.i < src.length) r.fail('unexpected }');
  return out;
}

function parseMessage(r: Reader, inPlural: boolean): Node[] {
  const out: Node[] = [];
  let buf = '';
  const flush = () => {
    if (buf) out.push(buf);
    buf = '';
  };
  while (r.i < r.s.length) {
    const c = r.s[r.i]!;
    if (c === '}') break;
    if (c === '{') {
      flush();
      r.i++;
      out.push(parseArg(r, inPlural));
      continue;
    }
    if (c === '#' && inPlural) {
      flush();
      out.push({ k: 'hash' });
      r.i++;
      continue;
    }
    buf += c;
    r.i++;
  }
  flush();
  return out;
}

function parseArg(r: Reader, inPlural: boolean): Node {
  const name = r.word();
  if (!/^[A-Za-z_]\w*$/.test(name)) r.fail(`bad argument name "${name}"`);
  r.skipWs();
  if (r.peek() === '}') {
    r.i++;
    return { k: 'arg', name };
  }
  if (r.peek() !== ',') r.fail('expected , or }');
  r.i++;
  const type = r.word();
  r.skipWs();
  if (type === 'josa') {
    if (r.peek() !== ',') r.fail('josa needs a style');
    r.i++;
    const st = r.i;
    while (r.i < r.s.length && r.s[r.i] !== '}') r.i++;
    const style = r.s.slice(st, r.i).trim();
    if (!isJosaStyle(style)) r.fail(`unsupported josa style "${style}"`);
    r.i++;
    return { k: 'josa', name, style };
  }
  if (type !== 'plural' && type !== 'select') r.fail(`unsupported type "${type}"`);
  if (r.peek() !== ',') r.fail('expected , after type');
  r.i++;
  const branches: Record<string, Node[]> = {};
  for (;;) {
    r.skipWs();
    if (r.peek() === '}') {
      r.i++;
      break;
    }
    const key = r.word();
    if (!key) r.fail('expected branch key');
    r.skipWs();
    if (r.peek() !== '{') r.fail(`expected { after "${key}"`);
    r.i++;
    // plural 안에 중첩된 select 가지에서도 #은 바깥 plural의 수다(ICU 표준)
    branches[key] = parseMessage(r, type === 'plural' || inPlural);
    if (r.peek() !== '}') r.fail('unclosed branch');
    r.i++;
  }
  if (!branches.other) r.fail(`${type} needs an "other" branch`);
  return { k: type, name, branches };
}

/** 메시지에 쓰인 변수 이름(가지 안 포함) */
export function argNames(nodes: Node[], into = new Set<string>()): Set<string> {
  for (const n of nodes) {
    if (typeof n === 'string' || n.k === 'hash') continue;
    into.add(n.name);
    if (n.k === 'plural' || n.k === 'select') for (const b of Object.values(n.branches)) argNames(b, into);
  }
  return into;
}

export function format(nodes: Node[], params: Params, plural: PluralRule, num: number | null = null): string {
  let s = '';
  for (const n of nodes) {
    if (typeof n === 'string') {
      s += n;
      continue;
    }
    if (n.k === 'hash') {
      s += num === null ? '#' : String(num);
      continue;
    }
    const v = params[n.name];
    if (v === undefined) {
      s += `{${n.name}}`;
      continue;
    }
    if (n.k === 'arg') s += String(v);
    else if (n.k === 'josa') s += josa(String(v), n.style);
    else if (n.k === 'select') s += format(n.branches[String(v)] ?? n.branches.other!, params, plural, num);
    else {
      const x = Number(v);
      const b = n.branches[`=${x}`] ?? n.branches[plural(x)] ?? n.branches.other!;
      s += format(b, params, plural, x);
    }
  }
  return s;
}
