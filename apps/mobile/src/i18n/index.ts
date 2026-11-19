// 다국어(D-06·D-17): 기기 언어 감지(JS만 — 네이티브 모듈 없음), 언어 고르기, t(), 날짜·시각 표기.
// React·RN을 불러오지 않는 순수 모듈이다(테스트·sim 쪽에서도 쓴다). 화면 갱신 훅은 ./react.ts.
import { en } from './en';
import { PLURAL, format, parse, type Node } from './icu';
import { ko } from './ko';
import type { LanguagePref, Locale, MessageKey, Messages, TArgs } from './types';

export type { LanguagePref, Locale, MessageKey } from './types';
export { LANGUAGE_NAMES, MONG_EN, SEAL_GLYPH } from './brand';

export const LOCALES: readonly Locale[] = ['ko', 'en'];
const TABLES: Record<Locale, Messages> = { ko, en };

/** 언어 태그 → 지원 언어. 한국어가 아니면 영어(D-06: 두 언어로 출시) */
export function localeFromTag(tag: string | null | undefined): Locale {
  return tag && /^ko\b/i.test(tag) ? 'ko' : 'en';
}

/**
 * 기기 언어 태그. 네이티브(Hermes)는 Intl의 기본 로캘이 OS 언어를 따른다(iOS는 Info.plist CFBundleLocalizations에 ko·en이
 * 있어야 앱 언어가 ko로 풀린다 — app.json). 웹은 navigator.languages. 품질 관문 캡처용으로 웹에서만 ?lang=en|ko를 먼저 본다.
 */
export function deviceTag(): string {
  const g = globalThis as { location?: { search?: string }; navigator?: { languages?: readonly string[]; language?: string } };
  try {
    const q = g.location?.search ? new URLSearchParams(g.location.search).get('lang') : null;
    if (q) return q;
  } catch {
    /* 쿼리 없음 */
  }
  try {
    const tag = Intl.DateTimeFormat().resolvedOptions().locale;
    if (tag) return tag;
  } catch {
    /* Intl 없음 */
  }
  return g.navigator?.languages?.[0] ?? g.navigator?.language ?? 'en';
}

let pref: LanguagePref = 'system';
let device: string | null = null;
let current: Locale = 'en';
let resolved = false;
const listeners = new Set<() => void>();

function resolve(): Locale {
  if (pref !== 'system') return pref;
  device ??= deviceTag();
  return localeFromTag(device);
}

export function getLocale(): Locale {
  if (!resolved) {
    current = resolve();
    resolved = true;
  }
  return current;
}

export function getLanguagePref(): LanguagePref {
  return pref;
}

/** 공방 노트에서 고른 값(메타에 저장)을 반영. 바뀌면 구독자(화면)에 알린다 */
export function setLanguagePref(p: LanguagePref): void {
  pref = p === 'ko' || p === 'en' ? p : 'system';
  const next = resolve();
  const changed = !resolved || next !== current;
  current = next;
  resolved = true;
  // 알림은 다음 마이크로태스크로 미룬다: 부팅(GameApp 렌더 중 메타 복원)에서 불려도 다른 컴포넌트를 렌더 중에 갱신하지 않게
  if (changed) queueMicrotask(() => {
    for (const fn of listeners) fn();
  });
}

export function subscribeLocale(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 테스트용: 감지 결과를 고정 */
export function __setDeviceTagForTest(tag: string | null) {
  device = tag;
  resolved = false;
}

const cache: Record<Locale, Map<MessageKey, Node[]>> = { ko: new Map(), en: new Map() };
function compiled(loc: Locale, key: MessageKey): Node[] {
  let n = cache[loc].get(key);
  if (!n) {
    n = parse(TABLES[loc][key]);
    cache[loc].set(key, n);
  }
  return n;
}

/** 현재 언어로 문구 하나. 변수가 있는 키는 변수를 모두 넘겨야 typecheck가 통과한다 */
export function t<K extends MessageKey>(key: K, ...args: TArgs<K>): string {
  return tIn(getLocale(), key, ...args);
}

/** 언어를 지정해 문구 하나(테스트·두 언어 비교용) */
export function tIn<K extends MessageKey>(loc: Locale, key: K, ...args: TArgs<K>): string {
  return format(compiled(loc, key), (args[0] ?? {}) as Record<string, string | number>, PLURAL[loc]);
}

/** 원문 테이블(테스트용) */
export function messages(loc: Locale): Messages {
  return TABLES[loc];
}

// ── 날짜·시각 ──

/** 표기용 BCP-47 태그: 기기 태그가 같은 언어면 그대로(en-GB의 24시간제 등), 아니면 기본 지역 */
export function formatTag(loc: Locale = getLocale()): string {
  device ??= deviceTag();
  return localeFromTag(device) === loc && /^[a-z]{2}(-[A-Za-z0-9]+)*$/.test(device) ? device : loc === 'ko' ? 'ko-KR' : 'en-US';
}

/** 현지 분(0~1439) → 시각 표기("오후 11:00", "11:00 PM"). Intl이 없거나 실패하면 24시간제 HH:MM */
export function clockTime(localMin: number, loc: Locale = getLocale()): string {
  const h = Math.floor(localMin / 60) % 24;
  const m = localMin % 60;
  try {
    return new Intl.DateTimeFormat(formatTag(loc), { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(Date.UTC(2000, 0, 1, h, m));
  } catch {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}

/** dayIndex(깸 횟수, 0 = 첫날) → 날 이름. 한국어는 고유어 날 세기, 영어는 "Day 7"(아트 6절) */
export function dayName(dayIndex: number): string {
  return t('day.name', { n: dayIndex + 1 });
}

/** 밤 이름: dayIndex 그날의 밤(0 = 첫 밤) */
export function nightName(dayIndex: number): string {
  return t('night.name', { n: dayIndex + 1, day: dayName(dayIndex) });
}

/** 깨는 시각(현지) → "아침 6시쯤" / "around 6 a.m." — 30분 단위로 반올림한 대략의 시각 */
export function wakeClock(at: number, tzOffsetMin: number): string {
  const d = new Date(at + tzOffsetMin * 60_000);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const half = m >= 15 && m < 45 ? 'yes' : 'no';
  const hh = m >= 45 ? (h + 1) % 24 : h;
  const part = hh < 5 ? 'dawn' : hh < 9 ? 'morning' : hh < 12 ? 'am' : hh < 18 ? 'pm' : 'evening';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  // 0시·12시 정각 근처는 자정·정오로(12 a.m./p.m.은 영어 화자도 헷갈린다 — 리뷰 P1-2)
  const exact = half === 'no' && (hh === 0 || hh === 12);
  return t('time.wake', { part: exact ? (hh === 0 ? 'midnight' : 'noon') : part, h: h12, half });
}
