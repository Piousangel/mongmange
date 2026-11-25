// 맡겨 두기 시트(로드맵 C12). 공통 BottomSheet 안에서 상태 기계의 보기 하나를 그린다 — 화면 갈래는 cloud/model.ts의 View뿐.
// 켜기(연령 확인 → 글귀) · 되찾기(글귀 입력 → 새 글귀 → 나란히 고르기) · 충돌 고르기 · 지우기 · 실패·느림.
// 접근성: 갈래가 바뀌면 그 갈래의 첫 문장을 읽어 주고(announce), 글귀는 글자 하나씩 읽히는 라벨, 고르기는 라디오.
// 모션: 시트 자체(BottomSheet)만 움직이고 이 안에는 애니메이션·스피너가 없다(모션 줄이기와 무관하게 정지).
// 글자 200%: 모든 줄은 감싸 내려가고, 나란히 두 장은 좁으면 위아래로 쌓인다.
import { PALETTE, type sim } from '@mong/core';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import type { Failure } from '../cloud/api';
import { CAN_COPY, copyText } from '../cloud/clipboard';
import { CONFIRM_TAIL, type SaveSide, type Task, type View as CloudView } from '../cloud/model';
import type { CloudRecord } from '../cloud/record';
import { useCloud, type CloudController, type CloudEntry } from '../cloud/useCloud';
import { DELETE_TRIES_BEFORE_EXIT, PARKED_DAYS, readParkedList, readRecord, readUnconfirmedDelete } from '../cloud/record';
import type { TaskDeps } from '../cloud/tasks';
import type { AgeInputError } from '../cloud/ageGate';
import { useMongLook, useStrokeInks } from '../game/look';
import { dayName, formatTag, getLocale, t, type MessageKey } from '../i18n';
import { BottomSheet } from '../ui/BottomSheet';
import { KText, SANS, SERIF, track, useFontScale } from '../ui/type';
import { Portrait } from './NameTag';

const C = PALETTE.day;

/** 기록 밖의 기기 칸 상태(그릴 때마다 읽는다): parked = 다시 고를 수 있는 본들(칸 id·기한), unconfirmed = 확인하지 못한 지우기(인장 코드) */
export type CloudExtra = { parked: { id: string; until: number }[]; unconfirmed: { creature: string | null; abandoned: boolean; reason: 'delete' | 'orphan' } | null };
const NO_EXTRA: CloudExtra = { parked: [], unconfirmed: null };

export function CloudSheet({ visible, onClose, cloud, record, entry, extra = NO_EXTRA }: { visible: boolean; onClose: () => void; cloud: CloudController; record: CloudRecord | null; entry?: CloudEntry; extra?: CloudExtra }) {
  const { view } = cloud;
  const closable = view.v !== 'code';
  const { reopen } = cloud;
  // 닫혀 있다가 열릴 때만 기기 기록에서 처음 자리를 다시 정한다(처음 그릴 때의 initial은 건드리지 않는다)
  const wasVisible = useRef(visible);
  useEffect(() => {
    if (visible && !wasVisible.current) reopen(entry);
    wasVisible.current = visible;
  }, [visible, reopen, entry]);
  useAnnounce(view);
  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('cloud.title')} theme="day" closable={closable} contentContainerStyle={styles.content} testID="cloud">
      <Body cloud={cloud} record={record} onClose={onClose} extra={extra} />
    </BottomSheet>
  );
}

/** 작업 묶음을 받아 상태 기계를 쥐는 겉 컴포넌트(앱·확인판 공통). 기기 기록은 그릴 때마다 읽는다(작업이 기록을 바꾼 뒤 보기도 바뀐다) */
export function CloudSheetHost({ visible, onClose, deps, initial, entry, tzOffsetMin }: { visible: boolean; onClose: () => void; deps: TaskDeps; initial?: CloudView; entry?: CloudEntry; tzOffsetMin: () => number }) {
  const cloud = useCloud(deps, { initial, tzOffsetMin });
  const record = readRecord(deps.kv);
  const extra: CloudExtra = {
    parked: readParkedList(deps.kv, deps.now()).map((p) => ({ id: p.id, until: p.at + PARKED_DAYS * 86_400_000 })),
    unconfirmed: readUnconfirmedDelete(deps.kv),
  };
  return <CloudSheet visible={visible} onClose={onClose} cloud={cloud} record={record} entry={entry} extra={extra} />;
}

/**
 * 공방 노트 행에 쓸 한 낱말 상태. 자동 맡기기가 연결되기 전이라 '맡겨 두는 중'이라고 쓰지 않는다(리뷰 M1):
 * on = 켜짐, paused = 충돌·보류로 멈춤(사실대로), attention = 글귀 확인 전·옮겨 감·지우기 확인 필요
 */
export function cloudRowState(record: ReturnType<typeof readRecord>): 'on' | 'off' | 'paused' | 'attention' {
  if (!record) return 'off';
  if (record.state !== 'on' || !record.codeConfirmed) return 'attention';
  if (record.conflict || record.held !== null) return 'paused';
  return 'on';
}

/** 갈래가 바뀔 때 첫 문장을 읽어 준다(같은 갈래 안의 입력 변화는 읽지 않는다) */
function useAnnounce(view: CloudView) {
  const line = announceLine(view);
  useEffect(() => {
    if (line) AccessibilityInfo.announceForAccessibility(line);
  }, [line]);
}

function announceLine(view: CloudView): string | null {
  switch (view.v) {
    case 'busy':
      return view.slow ? t('cloud.slow') : t(busyKey(view.task));
    case 'failed':
      return `${t(failKey(view.failure))} ${t('cloud.failed.safe')}`;
    case 'code':
      return view.mismatch ? t('cloud.confirm.mismatch') : view.step === 'show' ? t('cloud.code.title') : t('cloud.confirm.body');
    case 'recoverInput':
      return view.error === 'notFound' ? t('cloud.recover.notFound') : view.error === 'format' ? t('cloud.recover.format') : null;
    case 'ageUnder':
      return t('cloud.under.body');
    case 'deleted':
      return t('cloud.deleted.body');
    case 'moved':
      return t('cloud.moved.body');
    case 'deleteConfirm':
      return view.mismatch ? t('cloud.delete.mismatch') : null;
    case 'deleteCheck':
      return t('cloud.deleteCheck.body');
    case 'already':
      return t('cloud.already.body');
    case 'reverted':
      return t('cloud.reverted.body');
    case 'choose':
      return view.confirming ? t(confirmKey(view)) : t('cloud.choose.title');
    default:
      return null;
  }
}

/** 고른 뒤 확인 문구: 되찾기 맥락에서 '이 기기'를 고르면 맡겨 둔 본이 어디 남는지 분명히(리뷰 재리뷰 M) */
function confirmKey(view: Extract<CloudView, { v: 'choose' }>): 'cloud.choose.confirmLocalRestore' | 'cloud.choose.confirmLocalParked' | 'cloud.choose.confirmLocal' | 'cloud.choose.confirmServer' {
  // 밀려나는 서버 본을 기기 parked 칸에 두는 경우(되찾기·has_creature 맥락)는 같은 문구 — 실제 보관 위치와 맞춘다(재리뷰 3 낮음)
  if (view.picked === 'local') return view.why === 'restore' || view.note !== null ? 'cloud.choose.confirmLocalRestore' : view.why === 'parked' ? 'cloud.choose.confirmLocalParked' : 'cloud.choose.confirmLocal';
  return 'cloud.choose.confirmServer';
}

type BusyKey = Extract<MessageKey, `cloud.busy.${string}`>;
type FailKey = Extract<MessageKey, `cloud.failed.${Failure}`>;

export function busyKey(task: Task): BusyKey {
  switch (task.t) {
    case 'enable':
      return 'cloud.busy.enable';
    case 'recover':
      return 'cloud.busy.recover';
    case 'fetch':
      return 'cloud.busy.fetch';
    case 'keepLocal':
    case 'sync':
      return 'cloud.busy.upload';
    case 'takeServer':
      return 'cloud.busy.takeServer';
    case 'reissue':
      return 'cloud.busy.reissue';
    case 'delete':
      return 'cloud.busy.delete';
    case 'deleteCheck':
    case 'retryForgotten':
      return 'cloud.busy.deleteCheck';
    case 'forget':
      return 'cloud.busy.forget';
    case 'takeParked':
      return 'cloud.busy.takeServer';
    case 'abandonOld':
    case 'dropParked':
      return 'cloud.busy.forget';
    case 'revert':
      return 'cloud.busy.revert';
  }
}

export function failKey(f: Failure): FailKey {
  return `cloud.failed.${f}`;
}

function Body({ cloud, record, onClose, extra }: { cloud: CloudController; record: CloudRecord | null; onClose: () => void; extra: CloudExtra }) {
  const { view, send } = cloud;
  switch (view.v) {
    case 'intro':
      return (
        <>
          <P>{t('cloud.intro.lead')}</P>
          <P sub>{t('cloud.intro.what')}</P>
          <P sub testID="cloud-word-notice">{t('cloud.intro.word')}</P>
          <P sub>{t('cloud.intro.free')}</P>
          {extra.unconfirmed && <UnconfirmedNote cloud={cloud} code={extra.unconfirmed.creature} canRetry={!extra.unconfirmed.abandoned} orphan={extra.unconfirmed.reason === 'orphan'} />}
          <ParkedRows rows={extra.parked} cloud={cloud} testID="cloud-parked-intro" />
          <Actions>
            <Btn primary label={t('cloud.intro.enable')} onPress={() => cloud.start('enable')} testID="cloud-enable" />
            <Btn label={t('cloud.intro.recover')} onPress={() => cloud.start('recover')} testID="cloud-recover" />
            <Btn label={t('cloud.later')} onPress={onClose} testID="cloud-later" />
          </Actions>
        </>
      );
    case 'age':
      return <AgeForm onSubmit={cloud.submitAge} onBack={() => send({ e: 'back' })} />;
    case 'ageUnder':
      return (
        <>
          <P>{t('cloud.under.body')}</P>
          <Actions>
            <Btn primary label={t('cloud.close')} onPress={onClose} testID="cloud-close-under" />
          </Actions>
        </>
      );
    case 'busy':
      return (
        <View accessibilityLiveRegion="polite" testID="cloud-busy">
          <P>{t(busyKey(view.task))}</P>
          {view.slow && <P sub testID="cloud-slow">{t('cloud.slow')}</P>}
        </View>
      );
    case 'failed':
      return (
        <View testID="cloud-failed">
          <P>{t(failKey(view.failure))}</P>
          <P sub>{t('cloud.failed.safe')}</P>
          <Actions>
            <Btn primary label={t('cloud.retry')} onPress={() => send({ e: 'retry' })} testID="cloud-retry" />
            <Btn label={t('cloud.later')} onPress={() => send({ e: 'back' })} testID="cloud-failed-later" />
          </Actions>
        </View>
      );
    case 'code':
      return view.step === 'show' ? <CodeShow code={view.code} onWritten={() => send({ e: 'codeWritten' })} /> : <CodeConfirm mismatch={view.mismatch} onCheck={(input) => send({ e: 'codeCheck', input })} onAgain={() => send({ e: 'codeAgain' })} />;
    case 'recoverInput':
      return <RecoverForm error={view.error} onSubmit={(input, seal) => send({ e: 'submitCode', input, seal })} onBack={() => send({ e: 'back' })} />;
    case 'already':
    case 'reverted':
      return (
        <>
          <P>{t(view.v === 'already' ? 'cloud.already.body' : 'cloud.reverted.body')}</P>
          <Actions>
            <Btn primary label={t('cloud.continue')} onPress={() => send({ e: 'continue' })} testID="cloud-continue" />
          </Actions>
        </>
      );
    case 'revertConfirm':
      return (
        <>
          <KText style={styles.lead} serif="title">{t('cloud.revert.title')}</KText>
          <P>{t('cloud.revert.body')}</P>
          <View style={styles.sides} testID="cloud-revert-sides">
            {view.before && <SideCard side={view.before} label={t('cloud.revert.before')} picked={false} disabled onPick={() => undefined} testID="cloud-revert-before" />}
            {view.now && <SideCard side={view.now} label={t('cloud.revert.now')} picked={false} disabled onPick={() => undefined} testID="cloud-revert-now" />}
          </View>
          <Actions>
            <Btn primary label={t('cloud.revert.yes')} onPress={() => send({ e: 'confirmRevert' })} testID="cloud-revert-yes" />
            <Btn label={t('cloud.cancel')} onPress={() => send({ e: 'back' })} testID="cloud-revert-no" />
          </Actions>
        </>
      );
    case 'deleteCheck':
      return (
        <View testID="cloud-delete-check">
          <P>{t('cloud.deleteCheck.body')}</P>
          <P sub>{t('cloud.failed.safe')}</P>
          {view.tries >= DELETE_TRIES_BEFORE_EXIT && <P sub testID="cloud-delete-exit-note">{t('cloud.deleteCheck.exitNote')}</P>}
          <Actions>
            <Btn primary label={t('cloud.deleteCheck.retry')} onPress={() => send({ e: 'retry' })} testID="cloud-delete-check-retry" />
            {view.tries >= DELETE_TRIES_BEFORE_EXIT && <Btn label={t('cloud.deleteCheck.exit')} onPress={() => send({ e: 'forget' })} testID="cloud-delete-exit" />}
            <Btn label={t('cloud.later')} onPress={onClose} />
          </Actions>
        </View>
      );
    case 'ended':
    case 'orphaned':
      return (
        <>
          <P testID={`cloud-${view.v}`}>{t(view.v === 'ended' ? 'cloud.ended.body' : 'cloud.orphan.body')}</P>
          <Actions>
            <Btn primary label={t('cloud.continue')} onPress={() => send({ e: 'continue' })} testID="cloud-gone-continue" />
          </Actions>
        </>
      );
    case 'forgotten':
      return (
        <>
          <P>{t('cloud.forgotten.body')}</P>
          <Actions>
            <Btn primary label={t('cloud.continue')} onPress={() => send({ e: 'continue' })} testID="cloud-forgotten-continue" />
          </Actions>
        </>
      );
    case 'choose':
      return <Choose view={view} cloud={cloud} />;
    case 'on':
      return <OnView record={record} cloud={cloud} extra={extra} />;
    case 'parkFull':
      return (
        <>
          <P testID="cloud-park-full">{t('cloud.parkFull.body')}</P>
          {extra.parked.map((r, i) => (
            <Row key={r.id} label={t('cloud.parkFull.drop', { date: savedDay(r.until) })} onPress={() => send({ e: 'askDropParked', slot: r.id })} testID={i === 0 ? 'cloud-park-drop' : `cloud-park-drop-${i}`} />
          ))}
          <Actions>
            <Btn primary label={t('cloud.later')} onPress={() => send({ e: 'continue' })} testID="cloud-park-full-ok" />
          </Actions>
        </>
      );
    case 'dropParkedConfirm':
      return (
        <>
          <P testID="cloud-park-drop-confirm">{t('cloud.parkFull.dropConfirm')}</P>
          <Actions>
            <Btn primary danger label={t('cloud.parkFull.dropYes')} onPress={() => send({ e: 'confirmDropParked' })} testID="cloud-park-drop-yes" />
            <Btn label={t('cloud.cancel')} onPress={() => send({ e: 'back' })} />
          </Actions>
        </>
      );
    case 'dismissOldConfirm':
      return (
        <>
          <P testID="cloud-dismiss-old-confirm">{t('cloud.unconfirmed.dismissConfirm')}</P>
          <Actions>
            <Btn primary label={t('cloud.unconfirmed.dismissYes')} onPress={() => send({ e: 'confirmDismissOld' })} testID="cloud-dismiss-old-yes" />
            <Btn label={t('cloud.cancel')} onPress={() => send({ e: 'back' })} />
          </Actions>
        </>
      );
    case 'oldAccount':
      return (
        <View testID="cloud-old-account">
          <P>{t('cloud.old.body', { code: extra.unconfirmed?.creature ?? t('cloud.choose.unknown') })}</P>
          <P sub>{t('cloud.unconfirmed.webGone')}</P>
          <P sub>{t('cloud.unconfirmed.sweep')}</P>
          <Actions>
            <Btn primary label={t('cloud.old.retry')} onPress={() => send({ e: 'retryOld' })} testID="cloud-old-retry" />
            <Btn label={t('cloud.old.skip')} onPress={() => cloud.afterOld('skipOld')} testID="cloud-old-skip" />
            <Btn label={t('cloud.cancel')} onPress={() => send({ e: 'back' })} testID="cloud-old-cancel" />
          </Actions>
        </View>
      );
    case 'oldCleared':
      return (
        <>
          <P testID="cloud-old-cleared">{t('cloud.old.cleared')}</P>
          <Actions>
            <Btn primary label={t('cloud.continue')} onPress={() => cloud.afterOld('proceedOld')} testID="cloud-old-continue" />
          </Actions>
        </>
      );
    case 'deleteConfirm':
      return <DeleteConfirm token={view.token} mismatch={view.mismatch} onConfirm={(input) => send({ e: 'confirmDelete', input })} onBack={() => send({ e: 'back' })} />;
    case 'deleted':
    case 'moved':
      return (
        <>
          <P>{t(view.v === 'deleted' ? 'cloud.deleted.body' : 'cloud.moved.body')}</P>
          <Actions>
            <Btn primary label={t('cloud.close')} onPress={onClose} testID="cloud-done" />
            <Btn label={t('cloud.again')} onPress={() => send({ e: 'restart' })} testID="cloud-again" />
          </Actions>
        </>
      );
  }
}

// ── 지우기 확인: 인장 코드 끝 네 자를 직접 친다(리뷰 C1 — 서버에서 지우는 유일한 길) ──

function DeleteConfirm({ token, mismatch, onConfirm, onBack }: { token: string; mismatch: boolean; onConfirm: (s: string) => void; onBack: () => void }) {
  const [input, setInput] = useState('');
  const fs = useFontScale();
  return (
    <>
      <P>{t('cloud.delete.body')}</P>
      <P testID="cloud-delete-token">{t('cloud.delete.type', { token })}</P>
      <KText style={styles.label}>{t('cloud.delete.label')}</KText>
      <TextInput
        value={input}
        onChangeText={(v) => setInput(v.slice(0, CONFIRM_TAIL + 1))}
        onSubmitEditing={() => onConfirm(input)}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        maxLength={CONFIRM_TAIL + 1}
        accessibilityLabel={t('cloud.delete.label')}
        style={[styles.input, styles.codeInput, { fontSize: 20 * Math.min(fs, 1.5), minHeight: 52 * Math.min(fs, 2) }]}
        testID="cloud-delete-input"
      />
      {mismatch && (
        <KText style={styles.error} accessibilityLiveRegion="polite" testID="cloud-delete-mismatch">
          {t('cloud.delete.mismatch')}
        </KText>
      )}
      <Actions>
        <Btn primary danger label={t('cloud.delete.yes')} onPress={() => onConfirm(input)} disabled={input.replace(/[\s-]/g, '').length !== CONFIRM_TAIL} testID="cloud-delete-yes" />
        <Btn label={t('cloud.cancel')} onPress={onBack} testID="cloud-delete-no" />
      </Actions>
    </>
  );
}

// ── 연령 확인 ──

function AgeForm({ onSubmit, onBack }: { onSubmit: (i: { year: number | null; month: number | null }) => AgeInputError | null; onBack: () => void }) {
  const [year, setYear] = useState('');
  const [month, setMonth] = useState<number | null>(null);
  const [err, setErr] = useState<AgeInputError | null>(null);
  const fs = useFontScale();
  const months = useMemo(() => monthNames(), []);
  const submit = () => {
    const y = /^\d{4}$/.test(year) ? Number(year) : null;
    setErr(onSubmit({ year: y, month }));
  };
  return (
    <>
      <KText style={styles.lead} serif="title">{t('cloud.age.title')}</KText>
      <P sub>{t('cloud.age.why')}</P>
      <KText style={styles.label} nativeID="cloud-year-label">{t('cloud.age.year')}</KText>
      <TextInput
        value={year}
        onChangeText={(v) => {
          setYear(v.replace(/\D/g, '').slice(0, 4));
          setErr(null);
        }}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={4}
        placeholder={t('cloud.age.yearHint')}
        placeholderTextColor={C.textSub}
        accessibilityLabel={t('cloud.age.year')}
        accessibilityLabelledBy="cloud-year-label"
        autoComplete="off"
        style={[styles.input, { fontSize: 17 * Math.min(fs, 2), minHeight: 48 * Math.min(fs, 2) }]}
        testID="cloud-year"
      />
      <KText style={styles.label}>{t('cloud.age.month')}</KText>
      <View style={styles.months} accessibilityRole="radiogroup" accessibilityLabel={t('cloud.age.month')}>
        {months.map((name, i) => {
          const on = month === i + 1;
          return (
            <Pressable
              key={i}
              onPress={() => {
                setMonth(i + 1);
                setErr(null);
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={name}
              style={[styles.month, on && styles.monthOn]}
              testID={`cloud-month-${i + 1}`}
            >
              <KText style={[styles.monthText, on && styles.monthTextOn]}>{name}</KText>
            </Pressable>
          );
        })}
      </View>
      {err && (
        <KText style={styles.error} accessibilityLiveRegion="polite" testID="cloud-age-error">
          {t('cloud.age.range')}
        </KText>
      )}
      <Actions>
        <Btn primary label={t('cloud.age.next')} onPress={submit} disabled={year.length !== 4 || month === null} testID="cloud-age-next" />
        <Btn label={t('cloud.cancel')} onPress={onBack} testID="cloud-age-back" />
      </Actions>
    </>
  );
}

/** 달 이름(언어별 짧은 꼴, 예 '9월'·'Sep'). Intl이 없으면 숫자 */
function monthNames(): string[] {
  const loc = getLocale();
  return Array.from({ length: 12 }, (_, i) => {
    try {
      return new Intl.DateTimeFormat(formatTag(loc), { month: 'short', timeZone: 'UTC' }).format(Date.UTC(2000, i, 1));
    } catch {
      return String(i + 1);
    }
  });
}

// ── 글귀 ──

/** 스크린리더용: 글자를 하나씩, 묶음 사이는 쉼표 */
export function spellCode(code: string): string {
  return code
    .split('-')
    .map((g) => g.split('').join(' '))
    .join(', ');
}

function CodeShow({ code, onWritten }: { code: string; onWritten: () => void }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  return (
    <>
      <KText style={styles.lead} serif="title">{t('cloud.code.title')}</KText>
      <P>{t('cloud.code.body')}</P>
      <View style={styles.codeBox} accessible accessibilityRole="text" accessibilityLabel={t('cloud.code.a11y', { chars: spellCode(code) })} testID="cloud-code">
        {code.split('-').map((g, i) => (
          <KText key={i} style={styles.codeGroup} selectable maxFontSizeMultiplier={2}>
            {g}
          </KText>
        ))}
      </View>
      {CAN_COPY ? (
        <Btn label={copied ? t('cloud.code.copied') : t('cloud.code.copy')} onPress={() => void copyText(code).then(setCopied)} testID="cloud-copy" />
      ) : (
        <P sub>{t('cloud.code.copyHint')}</P>
      )}
      <P sub>{t('cloud.code.private')}</P>
      <Actions>
        <Btn primary label={t('cloud.code.written')} onPress={onWritten} testID="cloud-written" />
      </Actions>
    </>
  );
}

function CodeConfirm({ mismatch, onCheck, onAgain }: { mismatch: boolean; onCheck: (s: string) => void; onAgain: () => void }) {
  const [input, setInput] = useState('');
  const fs = useFontScale();
  return (
    <>
      <P>{t('cloud.confirm.body')}</P>
      <KText style={styles.label}>{t('cloud.confirm.label')}</KText>
      <TextInput
        value={input}
        onChangeText={(v) => setInput(v.slice(0, CONFIRM_TAIL + 1))}
        onSubmitEditing={() => onCheck(input)}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        maxLength={CONFIRM_TAIL + 1}
        accessibilityLabel={t('cloud.confirm.label')}
        style={[styles.input, styles.codeInput, { fontSize: 20 * Math.min(fs, 1.5), minHeight: 52 * Math.min(fs, 2) }]}
        testID="cloud-confirm-input"
      />
      {mismatch && (
        <KText style={styles.error} accessibilityLiveRegion="polite" testID="cloud-mismatch">
          {t('cloud.confirm.mismatch')}
        </KText>
      )}
      <Actions>
        <Btn primary label={t('cloud.confirm.ok')} onPress={() => onCheck(input)} disabled={input.replace(/[\s-]/g, '').length !== CONFIRM_TAIL} testID="cloud-confirm" />
        <Btn label={t('cloud.confirm.again')} onPress={onAgain} testID="cloud-code-again" />
      </Actions>
    </>
  );
}

function RecoverForm({ error, onSubmit, onBack }: { error: 'format' | 'seal' | 'ownSeal' | 'notFound' | null; onSubmit: (s: string, seal: string) => void; onBack: () => void }) {
  const [input, setInput] = useState('');
  const [seal, setSeal] = useState('');
  // 인장 코드 칸은 접어 둔다(글귀와 헷갈리지 않게 — 리뷰 재리뷰 2 낮음). 인장 관련 오류면 펼친다
  const [sealOpen, setSealOpen] = useState(false);
  const showSeal = sealOpen || error === 'seal' || error === 'ownSeal';
  const fs = useFontScale();
  const { width } = useWindowDimensions();
  // 글귀 19자(대시 포함)가 칸 안에 다 보이는 크기까지만 키운다(좁은 폭·200%에서 자리표시가 잘리지 않게 — 리뷰 L6)
  const inputSize = Math.min(18 * Math.min(fs, 1.5), (Math.min(width, 560) - 40 - 60) / (19 * 0.72));
  return (
    <>
      <P>{t('cloud.recover.body')}</P>
      <KText style={styles.label}>{t('cloud.recover.label')}</KText>
      <TextInput
        value={input}
        onChangeText={setInput}
        onSubmitEditing={() => onSubmit(input, seal)}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        maxLength={40}
        placeholder="XXXX-XXXX-XXXX-XXXX" /* i18n-ignore: 글귀 꼴 자리표시(언어와 무관한 기호) */
        placeholderTextColor={C.textSub}
        accessibilityLabel={t('cloud.recover.label')}
        style={[styles.input, styles.codeInput, { fontSize: inputSize, minHeight: 52 * Math.min(fs, 2) }]}
        testID="cloud-recover-input"
      />
      {showSeal ? (
        <>
        <KText style={styles.label}>{t('cloud.recover.seal')}</KText>
        <TextInput
          value={seal}
          onChangeText={setSeal}
          onSubmitEditing={() => onSubmit(input, seal)}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          maxLength={16}
          accessibilityLabel={t('cloud.recover.seal')}
          accessibilityHint={t('cloud.recover.sealHint')}
          style={[styles.input, styles.codeInput, { fontSize: inputSize, minHeight: 52 * Math.min(fs, 2) }]}
          testID="cloud-recover-seal"
        />
        <P sub>{t('cloud.recover.sealHint')}</P>
        </>
      ) : (
        <Btn label={t('cloud.recover.sealToggle')} onPress={() => setSealOpen(true)} testID="cloud-recover-seal-toggle" />
      )}
      {error && (
        <KText style={styles.error} accessibilityLiveRegion="polite" testID="cloud-recover-error">
          {t(error === 'format' ? 'cloud.recover.format' : error === 'seal' ? 'cloud.recover.sealFormat' : error === 'ownSeal' ? 'cloud.recover.ownSeal' : 'cloud.recover.notFound')}
        </KText>
      )}
      <P sub>{t('cloud.recover.rotate')}</P>
      <Actions>
        <Btn primary label={t('cloud.recover.submit')} onPress={() => onSubmit(input, seal)} disabled={input.trim().length === 0} testID="cloud-recover-submit" />
        <Btn label={t('cloud.cancel')} onPress={onBack} testID="cloud-recover-back" />
      </Actions>
    </>
  );
}

// ── 나란히 고르기 ──

function savedWhen(ms: number | null): string {
  if (ms === null) return t('cloud.choose.unknown');
  try {
    return new Intl.DateTimeFormat(formatTag(getLocale()), { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(ms);
  } catch {
    return new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
  }
}

function sideDetail(s: SaveSide): string {
  const day = s.dayIndex === null ? t('cloud.choose.unknown') : dayName(s.dayIndex);
  return t('cloud.choose.detail', { day, n: s.strokes ?? 0 });
}

function Choose({ view, cloud }: { view: Extract<CloudView, { v: 'choose' }>; cloud: CloudController }) {
  const { send } = cloud;
  const { width } = useWindowDimensions();
  const fs = useFontScale();
  const unreadable = view.server.state === null;
  // 좁거나 글자가 크면 위아래로 쌓는다(카드 하나 최소 폭 150 × 글자 배율)
  const stacked = Math.min(width, 560) - 40 < 2 * 150 * Math.min(fs, 2) + 12;
  const sides: { key: 'local' | 'server'; side: SaveSide; label: string }[] = [
    { key: 'server', side: view.server, label: t('cloud.choose.server') },
    { key: 'local', side: view.local, label: t('cloud.choose.local') },
  ];
  return (
    <>
      <KText style={styles.lead} serif="title">{t('cloud.choose.title')}</KText>
      {view.note && <P testID="cloud-choose-note">{t(view.note === 'already' ? 'cloud.already.body' : 'cloud.has.body')}</P>}
      <P>{t(view.why === 'conflict' ? 'cloud.choose.conflict' : view.why === 'parked' ? 'cloud.choose.parked' : 'cloud.choose.restore')}</P>
      <P sub>{t('cloud.choose.keep')}</P>
      <View style={[styles.sides, stacked && styles.sidesStacked]} accessibilityRole="radiogroup" accessibilityLabel={t('cloud.choose.title')} testID="cloud-sides">
        {sides.map(({ key, side, label }) => (
          <SideCard
            key={key}
            side={side}
            label={label}
            picked={view.picked === key}
            disabled={unreadable || view.confirming}
            onPick={() => send({ e: 'pick', side: key })}
            testID={`cloud-side-${key}`}
          />
        ))}
      </View>
      {unreadable && (
        <KText style={styles.note} testID="cloud-unreadable">
          {t('cloud.choose.unreadable')}
        </KText>
      )}
      {view.confirming ? (
        <View testID="cloud-choose-confirm">
          <P>{t(confirmKey(view))}</P>
          <Actions>
            <Btn primary label={t('cloud.choose.yes')} onPress={() => send({ e: 'confirmPick' })} testID="cloud-choose-yes" />
            <Btn label={t('cloud.choose.again')} onPress={() => send({ e: 'back' })} testID="cloud-choose-again" />
          </Actions>
        </View>
      ) : (
        <Actions>
          <Btn primary label={t('cloud.choose.next')} onPress={() => send({ e: 'confirmPick' })} disabled={view.picked === null} testID="cloud-choose-next" />
          <Btn label={t('cloud.choose.later')} onPress={() => send({ e: 'back' })} testID="cloud-choose-later" />
        </Actions>
      )}
    </>
  );
}

function SideCard({ side, label, picked, disabled, onPick, testID }: { side: SaveSide; label: string; picked: boolean; disabled: boolean; onPick: () => void; testID: string }) {
  const detail = sideDetail(side);
  const saved = t('cloud.choose.saved', { when: savedWhen(side.savedAt) });
  return (
    <Pressable
      onPress={onPick}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: picked, disabled }}
      accessibilityLabel={t('cloud.choose.side.a11y', { side: label, detail, saved })}
      style={[styles.side, picked && styles.sidePicked]}
      testID={testID}
    >
      <View style={styles.portrait} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {side.state ? <SidePortrait state={side.state} /> : <View style={styles.portraitEmpty} />}
      </View>
      <KText style={styles.sideLabel} serif="title" importantForAccessibility="no">{label}</KText>
      <KText style={styles.sideText} importantForAccessibility="no">{detail}</KText>
      <KText style={styles.sideSub} importantForAccessibility="no">{saved}</KText>
      {/* 고를 수 없는 카드(되돌리기 비교·못 읽는 판)에는 라디오 동그라미를 그리지 않는다 */}
      {!disabled && <View style={[styles.radio, picked && styles.radioOn]}>{picked && <View style={styles.radioDot} />}</View>}
    </Pressable>
  );
}

function SidePortrait({ state }: { state: sim.State }) {
  const look = useMongLook(state);
  const inks = useStrokeInks(state);
  return <Portrait state={state} look={look} strokeInks={inks} size={112} />;
}

// ── 켜짐 ──

function OnView({ record, cloud, extra }: { record: CloudRecord | null; cloud: CloudController; extra: CloudExtra }) {
  const { send } = cloud;
  const held = record?.held ?? null;
  return (
    <>
      <KText style={styles.lead} serif="title" testID="cloud-status">
        {t(record?.conflict ? 'cloud.on.paused' : held ? 'cloud.on.held' : 'cloud.on.status')}
      </KText>
      {!record?.conflict && !held && <P sub>{t('cloud.on.manual')}</P>}
      <P sub testID="cloud-last">{record?.syncedAt ? t('cloud.on.last', { when: savedWhen(record.syncedAt) }) : t('cloud.on.never')}</P>
      {held && <P sub testID="cloud-held">{t(held === 'tooLarge' ? 'cloud.on.held.tooLarge' : held === 'quota' ? 'cloud.on.held.quota' : 'cloud.on.held.shape')}</P>}
      {record?.conflict && <Row label={t('cloud.on.conflict')} onPress={() => send({ e: 'resolve' })} strong testID="cloud-resolve" />}
      <ParkedRows rows={extra.parked} cloud={cloud} testID="cloud-parked" />
      {extra.unconfirmed && <UnconfirmedNote cloud={cloud} code={extra.unconfirmed.creature} canRetry={false} orphan={extra.unconfirmed.reason === 'orphan'} />}
      {record && !record.codeConfirmed && <Row label={t('cloud.on.codePending')} onPress={() => send({ e: 'reissue' })} strong testID="cloud-code-pending" />}
      {!record?.conflict && <Row label={t('cloud.on.sync')} onPress={() => send({ e: 'syncNow' })} testID="cloud-sync" />}
      {record?.codeConfirmed !== false && <Row label={t('cloud.on.reissue')} hint={t('cloud.on.reissueHint')} onPress={() => send({ e: 'reissue' })} testID="cloud-reissue" />}
      <Row label={t('cloud.on.delete')} onPress={cloud.askDelete} testID="cloud-delete" />
    </>
  );
}

/** 다시 고를 수 있는 parked 칸들(칸마다 한 줄, 기한 날짜) */
function ParkedRows({ rows, cloud, testID }: { rows: CloudExtra['parked']; cloud: CloudController; testID: string }) {
  return (
    <>
      {rows.map((r, i) => (
        <Row key={r.id} label={t('cloud.on.parkedUntil', { date: savedDay(r.until) })} hint={t('cloud.parked.deviceOnly')} onPress={() => cloud.send({ e: 'openParked', slot: r.id })} strong testID={i === 0 ? testID : `${testID}-${i}`} />
      ))}
    </>
  );
}

/** '서버에 남았을 수 있음' 안내. canRetry = 이 기기에 그 로그인이 남아 있을 수 있는 자리(소개)에서만 다시 지우기를 보인다 */
/**
 * '서버에 남았을 수 있음' 안내. canRetry = 옛 로그인이 아직 남은 자리(버리기 전)에서만 다시 지우기·닫기를 보인다.
 * 닫기 = 옛 로그인 버리기(확인 한 번, '두고 새로 시작'과 같은 동작 — 재리뷰 4 S1). 버린 뒤에는 웹 삭제 안내만 남는다.
 */
function UnconfirmedNote({ cloud, code, canRetry, orphan = false }: { cloud: CloudController; code: string | null; canRetry: boolean; orphan?: boolean }) {
  return (
    <View testID="cloud-unconfirmed">
      <P>{t(orphan ? 'cloud.orphan.note' : canRetry ? 'cloud.unconfirmed.body' : 'cloud.unconfirmed.bodyOn', { code: code ?? t('cloud.choose.unknown') })}</P>
      <P sub>{t('cloud.unconfirmed.webGone')}</P>
      <P sub>{t('cloud.unconfirmed.sweep')}</P>
      {canRetry && <Btn label={t('cloud.unconfirmed.retry')} onPress={() => cloud.send({ e: 'retryForgotten' })} testID="cloud-unconfirmed-retry" />}
      {canRetry && <Btn label={t('cloud.unconfirmed.dismiss')} onPress={() => cloud.send({ e: 'askDismissOld' })} testID="cloud-unconfirmed-dismiss" />}
    </View>
  );
}

function savedDay(ms: number): string {
  try {
    return new Intl.DateTimeFormat(formatTag(getLocale()), { month: 'short', day: 'numeric' }).format(ms);
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

// ── 공통 부품 ──

function P({ children, sub, testID }: { children: ReactNode; sub?: boolean; testID?: string }) {
  return (
    <KText style={sub ? styles.sub : styles.p} testID={testID}>
      {children}
    </KText>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return <View style={styles.actions}>{children}</View>;
}

function Btn({ label, onPress, primary, danger, disabled, testID }: { label: string; onPress: () => void; primary?: boolean; danger?: boolean; disabled?: boolean; testID?: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={[styles.btn, primary && styles.btnPrimary, primary && danger && styles.btnDanger, disabled && styles.btnDisabled]}
      testID={testID}
    >
      <KText style={[styles.btnText, primary && styles.btnTextPrimary]}>{label}</KText>
    </Pressable>
  );
}

function Row({ label, hint, onPress, strong, testID }: { label: string; hint?: string; onPress: () => void; strong?: boolean; testID?: string }) {
  return (
    <Pressable onPress={onPress} style={styles.row} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint} testID={testID}>
      <KText style={[styles.rowText, strong && styles.rowStrong]}>{label}</KText>
      {hint && <KText style={styles.rowHint}>{hint}</KText>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 28 },
  lead: { marginTop: 6, marginBottom: 6, fontFamily: SERIF, fontSize: 18, lineHeight: 26, color: C.text, letterSpacing: track.serif(18) },
  p: { marginTop: 8, fontFamily: SANS, fontSize: 15, lineHeight: 23, color: C.text },
  sub: { marginTop: 8, fontFamily: SANS, fontSize: 13, lineHeight: 20, color: C.textSub },
  label: { marginTop: 16, marginBottom: 6, fontFamily: SANS, fontSize: 13, color: C.textSub },
  error: { marginTop: 10, fontFamily: SANS, fontSize: 14, lineHeight: 21, color: C.accent },
  input: { borderWidth: 1, borderColor: C.textSub, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, fontFamily: SANS, color: C.text, backgroundColor: C.bg },
  codeInput: { letterSpacing: 1, fontVariant: ['tabular-nums'] },
  note: { marginTop: 10, fontFamily: SANS, fontSize: 14, lineHeight: 21, color: C.text },
  months: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  month: { minWidth: 64, minHeight: 44, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: C.wash, alignItems: 'center', justifyContent: 'center' },
  monthOn: { backgroundColor: C.text, borderColor: C.text },
  monthText: { fontFamily: SANS, fontSize: 14, color: C.text },
  monthTextOn: { color: C.bg },
  codeBox: { marginTop: 14, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12, backgroundColor: C.bgShade, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 14, rowGap: 6 },
  codeGroup: { fontFamily: SANS, fontSize: 24, lineHeight: 32, color: C.text, letterSpacing: 3, fontVariant: ['tabular-nums'] },
  actions: { marginTop: 18, gap: 8 },
  btn: { minHeight: 48, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: C.text },
  btnDanger: { backgroundColor: '#7A2E20' },
  btnDisabled: { opacity: 0.4 },
  btnText: { fontFamily: SANS, fontSize: 15, color: C.text, textAlign: 'center', textDecorationLine: 'underline' },
  btnTextPrimary: { color: C.bg, textDecorationLine: 'none' },
  sides: { marginTop: 14, flexDirection: 'row', gap: 12 },
  sidesStacked: { flexDirection: 'column' },
  side: { flex: 1, minWidth: 150, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: C.wash, backgroundColor: C.bg, alignItems: 'center' },
  sidePicked: { borderColor: C.text, borderWidth: 2, backgroundColor: C.bgShade },
  portrait: { width: 112, height: 112, alignItems: 'center', justifyContent: 'center' },
  portraitEmpty: { width: 56, height: 56, borderRadius: 28, borderWidth: 1, borderStyle: 'dashed', borderColor: C.textSub },
  sideLabel: { marginTop: 6, fontFamily: SERIF, fontSize: 15, color: C.text, textAlign: 'center', letterSpacing: track.serif(15) },
  sideText: { marginTop: 4, fontFamily: SANS, fontSize: 13, lineHeight: 19, color: C.text, textAlign: 'center' },
  sideSub: { marginTop: 2, fontFamily: SANS, fontSize: 12, lineHeight: 17, color: C.textSub, textAlign: 'center' },
  radio: { marginTop: 10, width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: C.textSub, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: C.text },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.text },
  row: { minHeight: 52, paddingVertical: 10, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.wash },
  rowText: { fontFamily: SANS, fontSize: 15, lineHeight: 22, color: C.text },
  // 살펴볼 것(충돌·글귀 확인 전)은 굵게만 — 붉은 경고색을 쓰지 않는다(D-03 재촉 없음)
  rowStrong: { fontWeight: '600' },
  rowHint: { marginTop: 2, fontFamily: SANS, fontSize: 12, lineHeight: 17, color: C.textSub },
});
