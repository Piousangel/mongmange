// 테스트 전용 전역(코어 src는 DOM·Node 타입 없이 컴파일한다)
declare const console: { info(...args: unknown[]): void; log(...args: unknown[]): void };
declare class TextEncoder {
  encode(input: string): Uint8Array;
}
interface ImportMeta {
  /** Vite/Vitest 정적 glob(빌드 때 펼쳐짐) */
  glob<T = unknown>(pattern: string, opts: { query: string; import: string; eager: true }): Record<string, T>;
}
