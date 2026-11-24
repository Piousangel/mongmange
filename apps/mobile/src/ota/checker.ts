// 앱 OTA 업데이트 확인(로드맵 V24, docs/design/server-v1/ota-self-host.md 8절 체크리스트 4 · 8-1절).
// 네이티브는 시작할 때 스스로 묻지 않는다(app.json `checkAutomatically` NEVER, PM 결정 ③으로 ERROR_RECOVERY_ONLY 전환 예정 — 그래도 평소엔 묻지 않음) → 이 모듈이 묻는다.
//  ① 첫 실행(그 세션 전체)은 묻지 않는다. 둘째 실행부터 기기 현지 날짜로 하루 1회(시도 기준 — 실패해도 그날은 끝).
//  ② 있으면 `fetchUpdateAsync`로 내려받기만 한다. **적용은 다음 콜드 스타트**(expo-updates 기본). `reloadAsync`는 부르지 않는다 —
//     실행 중·백그라운드 재시작은 세이브·의례를 끊고, 백그라운드에서 다시 띄우면 store.boot가 appForeground를 보내 sim이 '앞에 있음'으로
//     정산하고 핑이 '열기'를 센다(관문 지표 오염). 그래서 의례 중 적용은 구조적으로 0이다(UpdatesLike에 reloadAsync 자리가 없다).
//  ③ 모든 실패·시간 초과는 조용히(사용자 문구·로그 0). 결과는 반환값으로만(시험·개발 확인용).
//  ④ 개발 빌드·웹·expo-updates 없는 빌드·OTA 꺼진 바이너리(가드 ready false = isEnabled false)에서는 아무것도 안 한다 — 저장소도 건드리지 않는다.
//  ⑤ 크래시 루프(D-22): expo-updates는 '첫 화면 전' 크래시만 그 판을 실패로 표시하고 이전 판·내장판으로 돌아간다. 이 앱은 진입점 Boot가
//     한지 View를 곧바로 그려 '첫 화면'이 즉시 오므로, 네이티브 되돌리기는 번들 평가 중 오류에만 걸린다. 그 밖의 반복 크래시는
//     네이티브가 못 잡는다 → 백그라운드·inactive를 거치지 않고 끝난 실행이 2번 연달아면 하루 제한을 건너뛰고 바로 묻는다 →
//     서버의 고친 새 판 또는 rollBackToEmbedded 지시를 받아 다음 실행에 벗어난다. 자세한 관계는 ota-self-host.md 8-1절.
// 저장 값(기기 로컬, 키 `mong.ota`): 시각 2개(처음 본 때·마지막 시도) + 앞에 있음 표시 + 연속 비정상 종료 수. 식별자 0.
// 시험: test/ota-check.test.ts(expo-updates 대역·가짜 시계)
import type { KV } from '@mong/core';

export const OTA_KEY = 'mong.ota';
export const CHECK_TIMEOUT_MS = 15_000;
export const FETCH_TIMEOUT_MS = 120_000;
/** 앞에서 끝난(크래시로 보이는) 실행이 이만큼 연달아면 하루 제한 없이 바로 묻는다 */
export const CRASH_LOOP_AT = 2;

/** expo-updates에서 쓰는 것만(reloadAsync는 일부러 없다 — 적용은 다음 콜드 스타트) */
export interface UpdatesLike {
  isEnabled: boolean;
  checkForUpdateAsync(): Promise<{ isAvailable: boolean; isRollBackToEmbedded?: boolean }>;
  fetchUpdateAsync(): Promise<{ isNew: boolean; isRollBackToEmbedded?: boolean }>;
}

export interface OtaTimers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface OtaDeps {
  /** optionalModule(() => require('expo-updates')) — 없으면 null */
  updates: UpdatesLike | null;
  platform: string;
  dev: boolean;
  kv: KV;
  now: () => number;
  timers: OtaTimers;
  /** 하루 경계(기본 기기 현지 날짜) */
  dayOf?: (ms: number) => string;
}

export interface OtaRecord {
  v: 1;
  /** 처음 본 시각(첫 실행 판정) */
  first: number;
  /** 마지막 확인 시도 시각(0 = 아직) */
  last: number;
  /** 지금 앞에 있음(백그라운드로 가면 0). 다음 실행 때 1이면 앞에서 끝났다(크래시·강제 종료) */
  open: 0 | 1;
  /** 앞에서 끝난 실행 연속 수(백그라운드를 거치면 0) */
  crash: number;
}

export type OtaResult =
  | 'off' // 개발·웹·모듈 없음·OTA 꺼짐
  | 'first' // 첫 실행 세션
  | 'later' // 오늘 이미 시도함
  | 'busy' // 확인 중
  | 'none' // 새 판 없음
  | 'fetched' // 새 판 받음 → 다음 실행에 적용
  | 'rollback' // 내장판으로 돌아가라는 지시 받음 → 다음 실행에 내장판
  | 'failed'
  | 'timeout';

export function localDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function readRecord(kv: KV): OtaRecord | null {
  let raw: string | undefined;
  try {
    raw = kv.getString(OTA_KEY);
  } catch {
    return null;
  }
  if (raw === undefined) return null;
  try {
    const r = JSON.parse(raw) as Partial<OtaRecord>;
    const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : 0);
    return { v: 1, first: num(r.first), last: num(r.last), open: r.open === 1 ? 1 : 0, crash: Math.min(num(r.crash), 99) };
  } catch {
    // 깨진 값: 첫 실행은 아니다(무엇인가 쓴 적이 있다) → 오늘 확인할 수 있는 상태로
    return { v: 1, first: 0, last: 0, open: 0, crash: 0 };
  }
}

function writeRecord(kv: KV, r: OtaRecord) {
  try {
    kv.set(OTA_KEY, JSON.stringify(r));
  } catch {
    /* 저장 실패: 이번 세션은 메모리 값으로 계속(조용히) */
  }
}

class Timeout extends Error {}

function withTimeout<T>(p: Promise<T>, ms: number, timers: OtaTimers): Promise<T> {
  let h: unknown = null;
  const limit = new Promise<never>((_, reject) => {
    h = timers.set(() => reject(new Timeout()), ms);
  });
  return Promise.race([p, limit]).finally(() => timers.clear(h));
}

export interface OtaChecker {
  /** 콜드 스타트 때 한 번. 크래시 표시를 정리하고, 묻는 날이면 묻는다 */
  start(): Promise<OtaResult>;
  /** AppState 변화: active = 다시 앞(하루 1회 판정), background·inactive = 깨끗한 끝 표시 */
  onAppState(state: string): Promise<OtaResult> | null;
}

export function createOtaChecker(deps: OtaDeps): OtaChecker {
  const { updates, kv, now, timers } = deps;
  const dayOf = deps.dayOf ?? localDay;
  const enabled = !deps.dev && (deps.platform === 'ios' || deps.platform === 'android') && !!updates && updates.isEnabled === true;
  let rec: OtaRecord | null = null;
  let firstSession = false;
  let crashLoop = false;
  let inFlight: Promise<OtaResult> | null = null;

  const due = (t: number) => crashLoop || rec!.last === 0 || dayOf(rec!.last) !== dayOf(t);

  async function run(): Promise<OtaResult> {
    const u = updates!;
    try {
      const c = await withTimeout(u.checkForUpdateAsync(), CHECK_TIMEOUT_MS, timers);
      if (!c.isAvailable && !c.isRollBackToEmbedded) return 'none';
      const f = await withTimeout(u.fetchUpdateAsync(), FETCH_TIMEOUT_MS, timers);
      if (f.isRollBackToEmbedded) return 'rollback';
      return f.isNew ? 'fetched' : 'none';
    } catch (e) {
      return e instanceof Timeout ? 'timeout' : 'failed';
    }
  }

  function maybeCheck(): Promise<OtaResult> {
    if (firstSession) return Promise.resolve('first');
    if (inFlight) return Promise.resolve('busy');
    const t = now();
    if (!due(t)) return Promise.resolve('later');
    // 시도를 먼저 기록한다: 확인 도중 죽거나 실패해도 그날은 다시 묻지 않는다(크래시 루프면 위 due가 건너뜀)
    rec = { ...rec!, last: t };
    crashLoop = false;
    writeRecord(kv, rec);
    inFlight = run().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  return {
    start() {
      if (!enabled) return Promise.resolve('off');
      if (rec) return Promise.resolve('busy'); // 두 번 부름
      const prev = readRecord(kv);
      const t = now();
      if (!prev) {
        firstSession = true;
        rec = { v: 1, first: t, last: 0, open: 1, crash: 0 };
        writeRecord(kv, rec);
        return Promise.resolve('first');
      }
      const crash = prev.open === 1 ? prev.crash + 1 : 0;
      crashLoop = crash >= CRASH_LOOP_AT;
      rec = { ...prev, first: prev.first || t, open: 1, crash };
      writeRecord(kv, rec);
      return maybeCheck();
    },
    onAppState(state) {
      if (!enabled || !rec) return null;
      // inactive도 깨끗한 끝으로 본다: iOS 앱 전환기에서 쓸어 올려 끄면 background 없이 끝날 수 있다(V24 리뷰 L1).
      // 다시 active면 open = 1로 돌아오므로 잃는 것은 'inactive 상태에서 난 크래시를 세지 않음'뿐
      if (state === 'background' || state === 'inactive') {
        rec = { ...rec, open: 0, crash: 0 };
        writeRecord(kv, rec);
        return null;
      }
      if (state === 'active') {
        if (rec.open === 0) {
          rec = { ...rec, open: 1 };
          writeRecord(kv, rec);
        }
        return maybeCheck();
      }
      return null;
    },
  };
}
