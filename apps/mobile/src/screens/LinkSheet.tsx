// 링크로 온 몽망이 시트(C11 — architecture 3-5 '딥링크': 앱이 있으면 이름표처럼 카드만 보여 주는 시트). 공통 BottomSheet.
// 갈래 = net/link.ts LinkView 하나: 불러오는 중 / 살아 있는 링크(포스터·이름·보조 줄) / 사라진 링크(꺼짐·신고 격리·운영 숨김 — 구별하지 않음) /
// 못 불러옴 / 알리기(사유 넷 — 웹 폼과 같은 코드, 자유 글 없음) / 알리는 중 / 고마워요 / 알리기 실패.
// 남의 몽망이를 내 세이브에 넣지 않는다(보기만). 스토어·공유 단추 없음(이미 앱 안). 모션은 시트 자체뿐.
import { PALETTE } from '@mong/core';
import { REPORT_REASONS, type ReportReason } from '@mong/contract';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { getLocale, t } from '../i18n';
import type { FetchLike } from '../net/http';
import { loadLinkPage, sendReport, type LinkView } from '../net/link';
import { BottomSheet } from '../ui/BottomSheet';
import { KText, SANS, SERIF, track } from '../ui/type';

const C = PALETTE.day;

export interface LinkActions {
  close: () => void;
  retry: () => void;
  openReport: () => void;
  pick: (r: ReportReason) => void;
  send: () => void;
  cancelReport: () => void;
}

export function LinkSheet({ visible, view, actions }: { visible: boolean; view: LinkView; actions: LinkActions }) {
  const busy = view.v === 'reporting';
  return (
    <BottomSheet visible={visible} onClose={actions.close} title={t('link.title')} theme="day" closable={!busy} contentContainerStyle={styles.content} testID="link">
      <Body view={view} actions={actions} />
    </BottomSheet>
  );
}

function Body({ view, actions }: { view: LinkView; actions: LinkActions }) {
  switch (view.v) {
    case 'loading':
      return (
        <KText style={styles.sub} accessibilityLiveRegion="polite" testID="link-loading">
          {t('link.loading')}
        </KText>
      );
    case 'live':
      return (
        <>
          <Card page={view.page} />
          <Row label={t('link.report')} onPress={actions.openReport} testID="link-report" />
          <Btn label={t('link.close')} onPress={actions.close} primary testID="link-close" />
        </>
      );
    case 'gone':
      return (
        <>
          <KText style={styles.lead} serif="title" testID="link-gone">{t('link.gone.title')}</KText>
          <P>{t('link.gone.body')}</P>
          <Btn label={t('link.close')} onPress={actions.close} primary testID="link-close" />
        </>
      );
    case 'failed':
      return (
        <>
          <P testID="link-failed">{t(view.why === 'offline' ? 'link.failed.offline' : 'link.failed.server')}</P>
          <Btn label={t('link.retry')} onPress={actions.retry} primary testID="link-retry" />
          <Btn label={t('link.close')} onPress={actions.close} testID="link-close" />
        </>
      );
    case 'report':
    case 'reporting':
    case 'reportFailed': {
      const reason = view.reason;
      const sending = view.v === 'reporting';
      return (
        <>
          <KText style={styles.lead} serif="title">{t('link.report.title')}</KText>
          <View accessibilityRole="radiogroup" accessibilityLabel={t('link.report.title')}>
            {REPORT_REASONS.map((r) => {
              const on = reason === r;
              return (
                <Pressable
                  key={r}
                  onPress={() => actions.pick(r)}
                  disabled={sending}
                  style={styles.reason}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on, disabled: sending }}
                  accessibilityLabel={t(`link.report.${r}`)}
                  testID={`link-reason-${r}`}
                >
                  <View style={[styles.radio, on && styles.radioOn]}>{on && <View style={styles.radioDot} />}</View>
                  <KText style={styles.reasonText}>{t(`link.report.${r}`)}</KText>
                </Pressable>
              );
            })}
          </View>
          {view.v === 'reportFailed' && (
            <KText style={styles.error} accessibilityLiveRegion="polite" testID="link-report-failed">
              {t(`link.report.failed.${view.why}`)}
            </KText>
          )}
          <Btn label={t(sending ? 'link.report.sending' : 'link.report.send')} onPress={actions.send} primary disabled={reason === null || sending} testID="link-report-send" />
          <Btn label={t('link.report.cancel')} onPress={actions.cancelReport} disabled={sending} testID="link-report-cancel" />
        </>
      );
    }
    case 'reported':
      return (
        <>
          <KText style={styles.lead} serif="title" testID="link-reported">{t('link.reported.title')}</KText>
          <P>{t('link.reported.body')}</P>
          <Btn label={t('link.close')} onPress={actions.close} primary testID="link-close" />
        </>
      );
  }
}

function Card({ page }: { page: Extract<LinkView, { v: 'live' }>['page'] }) {
  const aux = getLocale() === 'ko' ? page.aux.ko : page.aux.en;
  return (
    <View style={styles.card} testID="link-card">
      {page.posterUrl ? (
        <Image source={{ uri: page.posterUrl }} style={styles.poster} resizeMode="cover" accessible accessibilityLabel={t('link.poster')} testID="link-poster" />
      ) : (
        <View style={[styles.poster, styles.posterEmpty]} />
      )}
      {page.title !== null && (
        <KText style={styles.name} serif="title" testID="link-name">
          {page.title}
        </KText>
      )}
      <KText style={styles.aux} testID="link-aux">{aux}</KText>
    </View>
  );
}

function P({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <KText style={styles.p} testID={testID}>
      {children}
    </KText>
  );
}

function Btn({ label, onPress, primary, disabled, testID }: { label: string; onPress: () => void; primary?: boolean; disabled?: boolean; testID?: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={[styles.btn, primary && styles.btnPrimary, disabled && styles.btnDisabled]}
      testID={testID}
    >
      <KText style={[styles.btnText, primary && styles.btnTextPrimary]}>{label}</KText>
    </Pressable>
  );
}

function Row({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable onPress={onPress} style={styles.row} accessibilityRole="button" accessibilityLabel={label} testID={testID}>
      <KText style={styles.rowText}>{label}</KText>
    </Pressable>
  );
}

/** 코드 하나를 받아 불러오기·알리기를 쥐는 겉 컴포넌트(앱·확인판 공통). initial을 주면 불러오지 않고 그 갈래로 시작(확인판) */
export function LinkSheetHost({ code, onClose, fetch, siteBase, initial }: { code: string; onClose: () => void; fetch: FetchLike; siteBase: string; initial?: LinkView }) {
  const [view, setView] = useState<LinkView>(initial ?? { v: 'loading' });
  const [visible, setVisible] = useState(true);
  const load = useCallback(() => {
    setView({ v: 'loading' });
    let live = true;
    void loadLinkPage(fetch, siteBase, code).then((v) => {
      if (live) setView(v);
    });
    return () => {
      live = false;
    };
  }, [fetch, siteBase, code]);
  useEffect(() => (initial ? undefined : load()), [load, initial]);
  const actions: LinkActions = {
    close: () => {
      setVisible(false);
      onClose();
    },
    retry: () => void load(),
    openReport: () => setView((v) => (v.v === 'live' ? { v: 'report', page: v.page, reason: null } : v)),
    pick: (reason) => setView((v) => (v.v === 'report' || v.v === 'reportFailed' ? { v: 'report', page: v.page, reason } : v)),
    cancelReport: () => setView((v) => (v.v === 'report' || v.v === 'reportFailed' ? { v: 'live', page: v.page } : v)),
    send: () => {
      if ((view.v !== 'report' && view.v !== 'reportFailed') || view.reason === null) return;
      const { page, reason } = view;
      setView({ v: 'reporting', page, reason });
      void sendReport(fetch, siteBase, code, reason).then((r) => setView(r === 'ok' ? { v: 'reported' } : { v: 'reportFailed', page, reason, why: r }));
    },
  };
  return <LinkSheet visible={visible} view={view} actions={actions} />;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 28 },
  lead: { marginTop: 6, marginBottom: 6, fontFamily: SERIF, fontSize: 18, lineHeight: 26, color: C.text, letterSpacing: track.serif(18) },
  p: { marginTop: 8, fontFamily: SANS, fontSize: 15, lineHeight: 23, color: C.text },
  sub: { marginTop: 18, fontFamily: SANS, fontSize: 14, lineHeight: 21, color: C.textSub, textAlign: 'center' },
  error: { marginTop: 10, fontFamily: SANS, fontSize: 14, lineHeight: 21, color: C.accent },
  card: { marginTop: 8, alignItems: 'center' },
  poster: { width: '72%', maxWidth: 300, aspectRatio: 4 / 5, borderRadius: 12, backgroundColor: C.bgShade },
  posterEmpty: { borderWidth: 1, borderColor: C.wash },
  name: { marginTop: 14, fontFamily: SERIF, fontSize: 22, lineHeight: 30, color: C.text, textAlign: 'center', letterSpacing: track.serif(22) },
  aux: { marginTop: 6, fontFamily: SANS, fontSize: 14, lineHeight: 21, color: C.textSub, textAlign: 'center' },
  row: { marginTop: 14, minHeight: 48, justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.wash },
  rowText: { fontFamily: SANS, fontSize: 14, lineHeight: 21, color: C.textSub, textAlign: 'center' },
  reason: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.wash },
  reasonText: { flex: 1, fontFamily: SANS, fontSize: 15, lineHeight: 22, color: C.text },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: C.textSub, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: C.text },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.text },
  btn: { marginTop: 10, minHeight: 48, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { marginTop: 18, backgroundColor: C.text },
  btnDisabled: { opacity: 0.4 },
  btnText: { fontFamily: SANS, fontSize: 15, color: C.text, textAlign: 'center', textDecorationLine: 'underline' },
  btnTextPrimary: { color: C.bg, textDecorationLine: 'none' },
});
