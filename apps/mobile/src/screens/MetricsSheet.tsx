// '이용 통계 보내기' 시트(C11 — 처리방침 1·3-1·4, K1·K25). 공방 노트 행에서 연다.
// 갈래 = net/gate.ts MetricsSetting: needAge(연령 확인 화면 — 맡겨 두기와 같은 AgeForm·같은 기록) / under(켤 수 없음) / off·on(토글).
// 토글은 지금 판 연령 확인 통과자에게만 보이고 기본 꺼짐이다. 끄면 기기에 모아 둔 통계도 지운다(gate.setMetricsOn).
// 공방 노트에 이 행을 거는 것은 METRICS_SETTING_CONNECTED(지금 false — PM 결정)가 정한다. 확인판: ?screen=net(NetBoard).
import { PALETTE } from '@mong/core';
import type { KV } from '@mong/core';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { checkAgeInput, judgeAge, recordAge, type AgeInput, type AgeInputError } from '../cloud/ageGate';
import { t } from '../i18n';
import { metricsSetting, setMetricsOn, type MetricsSetting } from '../net/gate';
import { BottomSheet } from '../ui/BottomSheet';
import { KText, SANS, SERIF, track } from '../ui/type';
import { AgeForm } from './CloudSheet';
import { InkToggle } from './NoteSheet';

const C = PALETTE.day;

export function MetricsSheet({
  visible,
  onClose,
  kv,
  now = Date.now,
  tzOffsetMin = () => -new Date().getTimezoneOffset(),
  onChange,
}: {
  visible: boolean;
  onClose: () => void;
  kv: KV;
  now?: () => number;
  tzOffsetMin?: () => number;
  /** 켜짐·꺼짐이 바뀐 뒤(노트 행 다시 그리기) */
  onChange?: () => void;
}) {
  const [, bump] = useState(0);
  const setting: MetricsSetting = metricsSetting(kv, now(), tzOffsetMin());
  const refresh = () => {
    bump((n) => n + 1);
    onChange?.();
  };
  const submitAge = (input: AgeInput): AgeInputError | null => {
    const at = now();
    const tz = tzOffsetMin();
    const err = checkAgeInput(input, at, tz);
    if (err) return err;
    recordAge(kv, judgeAge(input, at, tz)!, at, tz);
    refresh();
    return null;
  };
  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('metrics.title')} theme="day" contentContainerStyle={styles.content} testID="metrics">
      {setting.kind === 'needAge' ? (
        <>
          <P>{t('metrics.ageLead')}</P>
          <AgeForm onSubmit={submitAge} onBack={onClose} />
        </>
      ) : (
        <>
          <P>{t('metrics.what')}</P>
          <P sub>{t('metrics.never')}</P>
          <P sub>{t('metrics.default')}</P>
          {setting.kind === 'under' ? (
            <KText style={styles.under} accessibilityLiveRegion="polite" testID="metrics-under">
              {t('metrics.under')}
            </KText>
          ) : (
            <View style={styles.row} testID="metrics-toggle-row">
              <KText style={styles.rowText}>{t('metrics.title')}</KText>
              <InkToggle
                value={setting.kind === 'on'}
                onChange={(v) => {
                  setMetricsOn(kv, v);
                  refresh();
                }}
                label={t('metrics.title')}
              />
            </View>
          )}
          <Pressable onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel={t('metrics.close')} testID="metrics-close">
            <KText style={styles.closeText}>{t('metrics.close')}</KText>
          </Pressable>
        </>
      )}
    </BottomSheet>
  );
}

function P({ children, sub }: { children: ReactNode; sub?: boolean }) {
  return <KText style={sub ? styles.sub : styles.p}>{children}</KText>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 28 },
  p: { marginTop: 10, fontFamily: SANS, fontSize: 15, lineHeight: 23, color: C.text },
  sub: { marginTop: 8, fontFamily: SANS, fontSize: 13, lineHeight: 20, color: C.textSub },
  under: { marginTop: 18, fontFamily: SERIF, fontSize: 16, lineHeight: 24, color: C.text, letterSpacing: track.serif(16) },
  row: { marginTop: 14, minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.wash },
  rowText: { fontFamily: SANS, fontSize: 15, color: C.text, flexShrink: 1 },
  close: { marginTop: 14, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontFamily: SANS, fontSize: 15, color: C.text, textDecorationLine: 'underline' },
});
