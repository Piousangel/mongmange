// 맡겨 두기 화면의 상태 기계(로드맵 C12). 순수 모듈 — React·RN을 부르지 않는다(시험 test/cloud.test.ts).
// 화면은 지금 '보기(View)' 하나만 그린다. 흩어진 boolean 대신 갈래 하나가 화면 전체를 정한다.
// 원칙(DECISIONS B2·D-03, architecture 3-3·3-4, C12 리뷰 반영):
//  - 충돌이면 자동으로 고르지 않는다. 두 판을 나란히 보여 주고, 고른 뒤 한 번 더 확인해야 작업이 돈다.
//  - 되찾기 글귀는 한 번만 받는다. 보여 주기 → '적어 두었어요' → 마지막 네 자 다시 쓰기로 확인. 확인이 끝나면 보기에서 지운다.
//  - 서버에서 지우는 길(DELETE /me)은 '지우기' 화면에서 인장 코드 끝 네 자를 직접 쳐서 확인할 때 하나뿐이다(리뷰 C1 — '지우고 되찾기' 없앰).
//  - 실패는 갈래(오프라인·시간 초과·느림·한도·서버)로 보여 주고, 기기 안 몽망이는 어느 경우에도 그대로다.
//  - 벌·재촉 없음(D-03): '나중에'는 언제나 있고, 고르지 않아도 잃는 것이 없다.
import { normalizeCreatureCode, normalizeRecoveryCode } from '@mong/contract';
import type { sim } from '@mong/core';
import type { Failure } from './api';
import { DELETE_TRIES_BEFORE_EXIT } from './record';

export type Purpose = 'enable' | 'recover';

/** 나란히 고르기의 한 쪽. state = 그릴 수 있는 본(이 앱이 못 읽는 새 판이면 null) */
export interface SaveSide {
  state: sim.State | null;
  dayIndex: number | null;
  strokes: number | null;
  /** 그 본을 기기에서 마지막으로 저장한 시각(ms). 모르면 null */
  savedAt: number | null;
  /**
   * 새 컨셉(v3) 기기가 만난 서버의 옛 세이브(v2) 본(V27b). 이어 갈 수 없으므로(state=null) 서버 쪽은 고를 수 없고,
   * '이 기기'를 고르면 그 본을 기기 보관함에 둔 뒤 맡긴다(덮기 전에 보관 — 옛 v2는 보관만 한다)
   */
  old?: boolean;
  /**
   * 옛 세이브(v2) 기기가 만난 서버의 새 판(v3) 본(V27b 리뷰 L-2). 앱을 업데이트해도 이 기기 판은 바뀌지 않으므로(빌드 종류가 정함)
   * '업데이트하세요'가 아니라 '그 몽망이는 그 기기에서, 이 기기 몽망이는 여기서 계속'을 안내한다. 고르기는 여전히 막는다(덮지 않음)
   */
  otherConcept?: boolean;
}

/** 서버 본을 고를 때 '고른 그 본'인지 다시 확인하는 값 */
export interface ServerPick {
  rev: number;
  sha: string;
  /** parked 칸 id(나란히 고르기 why 'parked'일 때 — 어느 칸과 맞바꿀지) */
  slot?: string;
}

/** 나란히 고르기를 연 까닭: restore = 되찾기 직후, conflict = 다른 기기 본, parked = '이 기기'를 골라 밀려난 서버 본(기기 안 30일 칸) 다시 보기 */
export type Why = 'restore' | 'conflict' | 'parked';
/** 고르기 화면 위 안내: already = 되찾기 대상(인장 코드)과 같은 몽망이가 이미 이 로그인에 있음, hasCreature = 이 로그인에 다른 몽망이가 있어 글귀의 몽망이를 되찾지 못했을 수 있음 */
export type ChooseNote = 'already' | 'hasCreature' | null;

export type Task =
  | { t: 'enable' }
  /** target = 사용자가 함께 넣은 인장 코드(모르면 null). has_creature가 났을 때 이 값과 같아야만 '이미 되찾음'(리뷰 R1) */
  | { t: 'recover'; code: string; target: string | null }
  /** 나란히 보려고 서버 본을 받는다 */
  | { t: 'fetch'; why: Why; slot?: string }
  /** 이 기기 본을 맡긴다(덮이는 서버 본은 서버 conflict 칸 30일 — 되찾기 맥락이면 그 행을 기록해 공방 노트에서 다시 고르게 한다) */
  | { t: 'keepLocal'; server: ServerPick; why: Why; /** 밀려나는 서버 본을 기기 parked 칸에 30일 둔다(되찾기·has_creature 맥락) */ park: boolean }
  /** parked 칸의 본으로 이어 간다 = 맞바꾸기(지금 본은 같은 parked 칸으로) */
  | { t: 'takeParked'; slot: string }
  /** 지우기 결과를 끝내 모를 때 '이 기기에서 맡겨 두기 끄기'(서버에 남았을 수 있다는 표시를 남김) */
  | { t: 'forget' }
  /** 끈 뒤 소개 화면에서 '다시 지우기' — 남아 있던 로그인으로 DELETE를 다시 보낸다 */
  | { t: 'retryForgotten'; then?: Purpose }
  /** 확인하지 못한 지우기 안내를 닫는다 = 옛 로그인 버리기('두고 새로 시작'과 같은 동작, 재리뷰 4 S1) */
  | { t: 'abandonOld' }
  /** parked 칸 하나 비우기(재리뷰 4 S4) — 자동 삭제가 없으므로 사용자가 직접(재리뷰 5) */
  | { t: 'dropParked'; slot: string }
  /** 바꾸기 전 몽망이 칸 비우기(사용자가 직접) */
  | { t: 'dropPre' }
  /** 서버에서 만난 예전 판(v2) 보관함에서 가장 오래된 것 하나 비우기(사용자가 직접, V27b 리뷰 M-2) */
  | { t: 'dropArchive' }
  /** 서버 본으로 이어 간다(이 기기 본은 서버 conflict 칸 30일 + 기기 preRestore 칸) */
  | { t: 'takeServer'; server: ServerPick }
  | { t: 'sync' }
  | { t: 'reissue' }
  /** 서버에서 지우기(확인 끝 네 자를 친 뒤에만). 끊기면 지웠는지 확인한다 */
  | { t: 'delete' }
  /** 지우기 결과를 모를 때 서버에 다시 확인만 한다 */
  | { t: 'deleteCheck' }
  /** 바꾸기 전 몽망이로 되돌리기(기기 preRestore 칸, 30일) */
  | { t: 'revert' };

export type TaskResult =
  | { r: 'enabled'; code: string }
  | { r: 'recovered'; code: string; then: 'restore' | 'on' }
  | { r: 'badCode' }
  /** 409 has_creature이고 이 로그인의 몽망이 인장 코드 = 되찾기 대상 → 이미 되찾아짐, 고를 것도 없음(새 글귀는 다시 받는다) */
  | { r: 'already' }
  | { r: 'compare'; why: Why; local: SaveSide; server: SaveSide; pick: ServerPick; note?: ChooseNote }
  | { r: 'synced' }
  | { r: 'conflict' }
  /** 고른 뒤 서버 본이 바뀌었다 / 이 기기 본이 바뀌었다 → 다시 나란히 */
  | { r: 'serverChanged'; why: Why }
  | { r: 'localChanged'; why: Why }
  | { r: 'reissued'; code: string }
  | { r: 'deleted' }
  /** 지우기 결과를 확인하지 못했다(기기 기록은 'deleting'으로 남는다). tries = 지금까지 모른 횟수 */
  | { r: 'deleteUnknown'; tries: number }
  /** 인장 칸에 이 기기 몽망이의 코드를 넣었다(되찾을 대상이 아님) */
  | { r: 'ownSeal' }
  | { r: 'forgotten' }
  /** parked 칸이 다 차 '이 기기'를 고를 수 없다(앞선 칸을 덮지 않는다 — 재리뷰 3 Q1) */
  | { r: 'parkFull' }
  /** 예전 판(v2) 보관함이 가득이라 '이 기기'를 고를 수 없다(덮지 않음 — 비우면 이어서 고를 수 있다, V27b 리뷰 M-2) */
  | { r: 'archiveFull' }
  | { r: 'abandoned' }
  /** 서버에 이 로그인의 맡겨 두기가 없다(기록의 sub와 같음) → 기록을 비웠다 */
  | { r: 'ended' }
  /** 기록의 로그인과 지금 로그인이 달라 서버의 맡겨 두기에 닿을 수 없다(복원 폰) → 기록을 비우고 '예전 계정' 안내로 */
  | { r: 'orphaned' }
  | { r: 'parkedDropped' }
  | { r: 'reverted' }
  | { r: 'moved' }
  | { r: 'failed'; failure: Failure };

export type View =
  | { v: 'intro' }
  | { v: 'age'; purpose: Purpose }
  | { v: 'ageUnder' }
  | { v: 'recoverInput'; error: 'format' | 'seal' | 'ownSeal' | 'notFound' | null }
  | { v: 'busy'; task: Task; slow: boolean }
  | { v: 'failed'; task: Task; failure: Failure }
  | { v: 'code'; code: string; step: 'show' | 'confirm'; then: 'on' | 'restore'; mismatch: boolean }
  | { v: 'already' }
  | { v: 'choose'; why: Why; local: SaveSide; server: SaveSide; pick: ServerPick; picked: 'local' | 'server' | null; confirming: boolean; note: ChooseNote }
  | { v: 'on' }
  | { v: 'deleteConfirm'; token: string; mismatch: boolean }
  | { v: 'deleteCheck'; tries: number }
  | { v: 'forgotten' }
  | { v: 'parkFull' }
  | { v: 'archiveFull' }
  | { v: 'dropArchiveConfirm'; back: 'archiveFull' | 'on' }
  | { v: 'ended' }
  | { v: 'orphaned' }
  | { v: 'dismissOldConfirm'; back: 'intro' | 'on' }
  | { v: 'dropParkedConfirm'; slot: string; back: 'parkFull' | 'on' }
  | { v: 'dropPreConfirm'; back: 'on' | 'intro' }
  /** 확인하지 못한 지우기가 남은 채 켜기·되찾기를 시작함 → 먼저 묻는다(재리뷰 3 Q3·Q6) */
  | { v: 'oldAccount'; purpose: Purpose }
  | { v: 'oldCleared'; purpose: Purpose }
  | { v: 'deleted' }
  /** 맞바꾸기 확인: 지금 몽망이와 바꾸기 전 몽망이를 나란히 보인다(리뷰 R3) */
  | { v: 'revertConfirm'; back: 'on' | 'intro'; now: SaveSide | null; before: SaveSide | null }
  | { v: 'reverted' }
  | { v: 'moved' };

export type CloudEvent =
  /** unconfirmed = 확인하지 못한 지우기 표시가 있음 */
  | { e: 'start'; purpose: Purpose; unconfirmed?: boolean }
  | { e: 'retryOld' }
  | { e: 'askDismissOld' }
  | { e: 'confirmDismissOld' }
  | { e: 'askDropParked'; slot: string }
  | { e: 'askDropPre' }
  | { e: 'askDropArchive' }
  | { e: 'confirmDropArchive' }
  | { e: 'confirmDropPre' }
  | { e: 'confirmDropParked' }
  | { e: 'skipOld' }
  | { e: 'proceedOld' }
  /** 연령 확인 결과(ok=false면 미달) */
  | { e: 'age'; ok: boolean }
  /** seal = 함께 넣은 인장 코드(선택) */
  | { e: 'submitCode'; input: string; seal?: string }
  | { e: 'slow' }
  | { e: 'done'; result: TaskResult }
  | { e: 'retry' }
  | { e: 'back' }
  | { e: 'codeWritten' }
  | { e: 'codeCheck'; input: string }
  | { e: 'codeAgain' }
  | { e: 'pick'; side: 'local' | 'server' }
  | { e: 'confirmPick' }
  | { e: 'resolve' }
  | { e: 'syncNow' }
  | { e: 'reissue' }
  /** token = 인장 코드 끝 네 자(훅이 기기 기록에서 꺼낸다) */
  | { e: 'askDelete'; token: string }
  | { e: 'confirmDelete'; input: string }
  | { e: 'askRevert'; now?: SaveSide | null; before?: SaveSide | null }
  | { e: 'confirmRevert' }
  | { e: 'continue' }
  /** 공방 노트 '되찾은 몽망이 다시 고르기'(30일 칸) */
  | { e: 'openParked'; slot: string }
  | { e: 'forget' }
  | { e: 'retryForgotten' }
  | { e: 'restart' };

/** 확인에 다시 쓰게 하는 끝 글자 수(한 묶음) */
export const CONFIRM_TAIL = 4;

const crockford = (s: string) => s.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');

/** 글귀 끝 네 자 확인: Crockford 읽기(대소문자·I/L/O)로 비교한다. 길이가 다르면(빈 입력 포함) 늘 거짓 */
export function tailMatches(code: string, input: string): boolean {
  const want = normalizeRecoveryCode(code);
  const raw = crockford(input);
  return want !== null && raw.length === CONFIRM_TAIL && want.endsWith(raw);
}

/** 지우기 확인 낱말 비교(같은 Crockford 읽기, 정확히 네 자) */
export function tokenMatches(token: string, input: string): boolean {
  const raw = crockford(input);
  return raw.length === CONFIRM_TAIL && raw === crockford(token);
}

/** 지우기 확인 낱말: 인장 코드 끝 네 자. 모르면(옛 기록) 서버 sha 앞 네 자, 그것도 없으면 고정 낱말 */
export function deleteToken(rec: { creature: string | null; sha: string | null } | null): string {
  if (rec?.creature && rec.creature.length >= CONFIRM_TAIL) return rec.creature.slice(-CONFIRM_TAIL).toUpperCase();
  if (rec?.sha) return rec.sha.slice(0, CONFIRM_TAIL).toUpperCase();
  return 'MONG';
}

/** 실패에서 '나중에'를 누르면 돌아갈 안전한 자리 */
export function fallbackOf(task: Task): View {
  switch (task.t) {
    case 'enable':
      return { v: 'intro' };
    case 'recover':
      return { v: 'recoverInput', error: null };
    case 'delete':
    case 'deleteCheck':
      return { v: 'deleteCheck', tries: 0 };
    case 'retryForgotten':
      return task.then ? { v: 'oldAccount', purpose: task.then } : { v: 'intro' };
    case 'forget':
      return { v: 'intro' };
    default:
      return { v: 'on' };
  }
}

/** 보기를 열 때 처음 자리: 기기 기록에서 정한다 */
export function initialView(rec: { state: 'on' | 'moved' | 'deleting'; deleteTries?: number } | null): View {
  if (!rec) return { v: 'intro' };
  if (rec.state === 'deleting') return { v: 'deleteCheck', tries: rec.deleteTries ?? 0 };
  return rec.state === 'moved' ? { v: 'moved' } : { v: 'on' };
}

/** 시트를 끌어 닫을 수 있나: 글귀를 보여 주는 동안만 막는다(한 번만 받는 값을 실수로 잃지 않게) */
export function closable(view: View): boolean {
  return view.v !== 'code';
}

const busy = (task: Task): View => ({ v: 'busy', task, slow: false });

function onResult(view: Extract<View, { v: 'busy' }>, res: TaskResult): View {
  switch (res.r) {
    case 'enabled':
    case 'reissued':
      return { v: 'code', code: res.code, step: 'show', then: 'on', mismatch: false };
    case 'recovered':
      return { v: 'code', code: res.code, step: 'show', then: res.then, mismatch: false };
    case 'badCode':
      return { v: 'recoverInput', error: 'notFound' };
    case 'already':
      return { v: 'already' };
    case 'compare':
      return { v: 'choose', why: res.why, local: res.local, server: res.server, pick: res.pick, picked: null, confirming: false, note: res.note ?? null };
    case 'synced':
      return { v: 'on' };
    case 'conflict':
      return busy({ t: 'fetch', why: 'conflict' });
    case 'serverChanged':
    case 'localChanged':
      return busy({ t: 'fetch', why: res.why });
    case 'deleted':
      return view.task.t === 'retryForgotten' && view.task.then ? { v: 'oldCleared', purpose: view.task.then } : { v: 'deleted' };
    case 'parkFull':
      return { v: 'parkFull' };
    case 'archiveFull':
      return { v: 'archiveFull' };
    case 'abandoned':
    case 'parkedDropped':
      return { v: 'on' };
    case 'ended':
      return { v: 'ended' };
    case 'orphaned':
      return { v: 'orphaned' };
    case 'deleteUnknown':
      return { v: 'deleteCheck', tries: res.tries };
    case 'ownSeal':
      return { v: 'recoverInput', error: 'ownSeal' };
    case 'forgotten':
      return { v: 'forgotten' };
    case 'reverted':
      return { v: 'reverted' };
    case 'moved':
      return { v: 'moved' };
    case 'failed':
      return { v: 'failed', task: view.task, failure: res.failure };
  }
}

/** 상태 전이. 보기에 맞지 않는 사건은 무시한다(같은 보기를 돌려준다) */
export function reduce(view: View, ev: CloudEvent): View {
  switch (ev.e) {
    case 'start':
      if (view.v !== 'intro') return view;
      return ev.unconfirmed ? { v: 'oldAccount', purpose: ev.purpose } : { v: 'age', purpose: ev.purpose };
    case 'askDismissOld':
      return view.v === 'intro' || view.v === 'on' ? { v: 'dismissOldConfirm', back: view.v } : view;
    case 'confirmDismissOld':
      return view.v === 'dismissOldConfirm' ? busy({ t: 'abandonOld' }) : view;
    case 'askDropParked':
      if (view.v === 'parkFull') return { v: 'dropParkedConfirm', slot: ev.slot, back: 'parkFull' };
      // 나란히 보던 parked 칸을 그 자리에서 비운다(만료된 칸 포함)
      if (view.v === 'choose' && view.why === 'parked' && !view.confirming) return { v: 'dropParkedConfirm', slot: ev.slot, back: 'on' };
      return view;
    case 'askDropPre':
      return view.v === 'revertConfirm' ? { v: 'dropPreConfirm', back: view.back } : view;
    case 'askDropArchive':
      return view.v === 'archiveFull' || view.v === 'on' ? { v: 'dropArchiveConfirm', back: view.v } : view;
    case 'confirmDropArchive':
      return view.v === 'dropArchiveConfirm' ? busy({ t: 'dropArchive' }) : view;
    case 'confirmDropPre':
      return view.v === 'dropPreConfirm' ? busy({ t: 'dropPre' }) : view;
    case 'confirmDropParked':
      return view.v === 'dropParkedConfirm' ? busy({ t: 'dropParked', slot: view.slot }) : view;
    case 'retryOld':
      return view.v === 'oldAccount' ? busy({ t: 'retryForgotten', then: view.purpose }) : view;
    case 'skipOld':
      return view.v === 'oldAccount' ? { v: 'age', purpose: view.purpose } : view;
    case 'proceedOld':
      return view.v === 'oldCleared' ? { v: 'age', purpose: view.purpose } : view;
    case 'age':
      if (view.v !== 'age') return view;
      if (!ev.ok) return { v: 'ageUnder' };
      return view.purpose === 'enable' ? busy({ t: 'enable' }) : { v: 'recoverInput', error: null };
    case 'submitCode': {
      if (view.v !== 'recoverInput') return view;
      const code = normalizeRecoveryCode(ev.input);
      if (code === null) return { v: 'recoverInput', error: 'format' };
      const seal = ev.seal?.trim() ? normalizeCreatureCode(ev.seal) : null;
      if (ev.seal?.trim() && seal === null) return { v: 'recoverInput', error: 'seal' };
      return busy({ t: 'recover', code, target: seal });
    }
    case 'slow':
      return view.v === 'busy' ? { ...view, slow: true } : view;
    case 'done':
      return view.v === 'busy' ? onResult(view, ev.result) : view;
    case 'retry':
      if (view.v === 'failed') return busy(view.task);
      if (view.v === 'deleteCheck') return busy({ t: 'deleteCheck' });
      return view;
    case 'back':
      switch (view.v) {
        case 'failed':
          return fallbackOf(view.task);
        case 'age':
        case 'ageUnder':
        case 'recoverInput':
        case 'oldAccount':
          return { v: 'intro' };
        case 'code':
          // 확인 단계에서만 '글귀 다시 보기'로 돌아간다. 보여 주는 단계에는 뒤가 없다(받은 글귀를 버리는 길이 없게)
          return view.step === 'confirm' ? { ...view, step: 'show', mismatch: false } : view;
        case 'choose':
          // 고르지 않고 나가도 잃는 것이 없다: 기기 기록의 '충돌' 표시가 남아 올리기를 멈추고, 켜짐 화면에서 다시 고를 수 있다
          return view.confirming ? { ...view, confirming: false } : { v: 'on' };
        case 'deleteConfirm':
          return { v: 'on' };
        case 'dismissOldConfirm':
          return { v: view.back };
        case 'dropParkedConfirm':
          return { v: view.back };
        case 'dropPreConfirm':
          return { v: view.back };
        case 'dropArchiveConfirm':
          return { v: view.back };
        case 'revertConfirm':
          return { v: view.back };
        default:
          return view;
      }
    case 'codeWritten':
      return view.v === 'code' && view.step === 'show' ? { ...view, step: 'confirm', mismatch: false } : view;
    case 'codeAgain':
      return view.v === 'code' && view.step === 'confirm' ? { ...view, step: 'show', mismatch: false } : view;
    case 'codeCheck':
      if (view.v !== 'code' || view.step !== 'confirm') return view;
      if (!tailMatches(view.code, ev.input)) return { ...view, mismatch: true };
      return view.then === 'restore' ? busy({ t: 'fetch', why: 'restore' }) : { v: 'on' };
    case 'pick':
      if (view.v !== 'choose' || view.confirming) return view;
      // 이 앱이 못 읽는 서버 본(새 판)이면 어느 쪽도 고르지 않는다: 서버 본은 그리지도 검증하지도 못했고,
      // 이 기기 본을 고르면 그 새 판이 conflict 칸에서 30일 뒤 사라질 수 있다 → 앱을 업데이트한 뒤 고른다
      // 단, 서버 본이 옛 세이브(v2, old)면 '이 기기'만 고를 수 있다(그 본은 기기 보관함에 둔 뒤 맡긴다 — V27b)
      if (view.server.state === null && !(view.server.old === true && ev.side === 'local')) return view;
      return { ...view, picked: ev.side };
    case 'confirmPick':
      if (view.v !== 'choose' || view.picked === null) return view;
      if (!view.confirming) return { ...view, confirming: true };
      if (view.why === 'parked') return view.picked === 'local' || !view.pick.slot ? { v: 'on' } : busy({ t: 'takeParked', slot: view.pick.slot });
      return busy(view.picked === 'local' ? { t: 'keepLocal', server: view.pick, why: view.why, park: view.why === 'restore' || view.note !== null } : { t: 'takeServer', server: view.pick });
    case 'resolve':
      return view.v === 'on' ? busy({ t: 'fetch', why: 'conflict' }) : view;
    case 'syncNow':
      return view.v === 'on' ? busy({ t: 'sync' }) : view;
    case 'reissue':
      return view.v === 'on' ? busy({ t: 'reissue' }) : view;
    case 'askDelete':
      return view.v === 'on' ? { v: 'deleteConfirm', token: ev.token, mismatch: false } : view;
    case 'confirmDelete':
      if (view.v !== 'deleteConfirm') return view;
      return tokenMatches(view.token, ev.input) ? busy({ t: 'delete' }) : { ...view, mismatch: true };
    case 'askRevert': {
      const sides = { now: ev.now ?? null, before: ev.before ?? null };
      if (view.v === 'on') return { v: 'revertConfirm', back: 'on', ...sides };
      if (view.v === 'intro' || view.v === 'deleted' || view.v === 'moved') return { v: 'revertConfirm', back: 'intro', ...sides };
      return view;
    }
    case 'openParked':
      return view.v === 'on' || view.v === 'intro' ? busy({ t: 'fetch', why: 'parked', slot: ev.slot }) : view;
    case 'forget':
      return view.v === 'deleteCheck' && view.tries >= DELETE_TRIES_BEFORE_EXIT ? busy({ t: 'forget' }) : view;
    case 'retryForgotten':
      return view.v === 'intro' ? busy({ t: 'retryForgotten' }) : view;
    case 'confirmRevert':
      return view.v === 'revertConfirm' ? busy({ t: 'revert' }) : view;
    case 'continue':
      if (view.v === 'forgotten' || view.v === 'ended' || view.v === 'orphaned') return { v: 'intro' };
      if (view.v === 'parkFull' || view.v === 'archiveFull') return { v: 'on' };
      return view.v === 'already' || view.v === 'reverted' ? { v: 'on' } : view;
    case 'restart':
      return view.v === 'moved' || view.v === 'deleted' ? { v: 'intro' } : view;
  }
}

/**
 * 켜기·되찾기 시작 사건들(훅 useCloud.start가 그대로 보낸다 — 리뷰 M8: 훅 안 판단을 순수 함수로 꺼내 시험한다).
 * 통과 기록이 지금 판이면 연령을 다시 묻지 않고, 오늘 미달 기록이 있으면 묻지 않고 바로 '쉼'으로 간다.
 */
export function startEvents(purpose: Purpose, age: { kind: 'ask' | 'passed' | 'wait' }, unconfirmed = false): CloudEvent[] {
  // 확인하지 못한 지우기가 남았으면 연령 확인보다 먼저 묻는다(재리뷰 3 Q3·Q6). 답한 뒤 ageEvents로 이어 간다
  if (unconfirmed) return [{ e: 'start', purpose, unconfirmed: true }];
  return [{ e: 'start', purpose }, ...ageEvents(age)];
}

/** 연령 확인 기록에 따른 사건(통과면 묻지 않고 다음, 오늘 미달이면 쉼, 없으면 묻는다) */
export function ageEvents(age: { kind: 'ask' | 'passed' | 'wait' }): CloudEvent[] {
  if (age.kind === 'passed') return [{ e: 'age', ok: true }];
  if (age.kind === 'wait') return [{ e: 'age', ok: false }];
  return [];
}
