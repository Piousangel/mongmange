// 키·변수 타입. 키의 정본은 ko.ts. en.ts가 키 하나라도 빠지거나 더 있으면 typecheck에서 실패한다.
import type { KoMessages } from './ko';

export type Locale = 'ko' | 'en';
/** 공방 노트의 언어 고르기: 기기 따름 / 한국어 / English */
export type LanguagePref = 'system' | Locale;

export type MessageKey = keyof KoMessages;
export type Messages = { readonly [K in MessageKey]: string };

// ── 메시지 문자열에서 변수 이름 뽑기(타입 수준) ──
// '{' 바로 뒤의 영문 식별자 + ('}' 또는 ',')만 변수로 본다. 가지 본문({첫날}, {# nights})은 식별자가 아니라 빠진다.
type IdentChar =
  | 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'i' | 'j' | 'k' | 'l' | 'm' | 'n' | 'o' | 'p' | 'q' | 'r' | 's' | 't' | 'u' | 'v' | 'w' | 'x' | 'y' | 'z'
  | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'M' | 'N' | 'O' | 'P' | 'Q' | 'R' | 'S' | 'T' | 'U' | 'V' | 'W' | 'X' | 'Y' | 'Z'
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '_';
type IsIdent<S extends string> = S extends `${infer C}${infer R}` ? (C extends IdentChar ? (R extends '' ? true : IsIdent<R>) : false) : false;
type Trim<S extends string> = S extends ` ${infer R}` ? Trim<R> : S extends `${infer R} ` ? Trim<R> : S;
type Head<R extends string> = R extends `${infer N}}${string}` ? (N extends `${infer A},${string}` ? Trim<A> : Trim<N>) : never;
type AsIdent<S extends string> = IsIdent<S> extends true ? S : never;
export type ArgNames<S extends string> = S extends `${string}{${infer R}` ? AsIdent<Head<R>> | ArgNames<R> : never;

export type ParamsOf<K extends MessageKey> = { [P in ArgNames<KoMessages[K]>]: string | number };
/** 변수 없는 키는 인자 없이, 있는 키는 그 변수를 모두 받는다 */
export type TArgs<K extends MessageKey> = [ArgNames<KoMessages[K]>] extends [never] ? [] : [params: ParamsOf<K>];
