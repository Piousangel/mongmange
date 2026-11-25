// 테스트 전용 전역(코어 src는 DOM·Node 타입 없이 컴파일한다)
declare const console: { info(...args: unknown[]): void; log(...args: unknown[]): void };
declare class TextEncoder {
  encode(input: string): Uint8Array;
}
interface ImportMeta {
  /** Vite/Vitest 정적 glob(빌드 때 펼쳐짐) */
  glob<T = unknown>(pattern: string, opts: { query: string; import: string; eager: true }): Record<string, T>;
}
/** 무거운 시험 스위치(RENDER_HEAVY=1, pnpm verify --heavy)를 읽는 데만 쓴다 */
declare const process: { env: Record<string, string | undefined> };
/** 시험에서 정본 파일 경로를 만들 때만 쓴다(v3-lexicon: 평가기 모듈 동적 import) */
declare class URL {
  constructor(input: string, base?: string);
  readonly href: string;
}
interface ImportMeta {
  readonly url: string;
}
