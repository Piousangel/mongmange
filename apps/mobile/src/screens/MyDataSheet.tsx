// '서버에 맡긴 것 보기' 시트(로드맵 C12f — 처리방침 12절 열람 요구). 공방 노트 행에서 연다(cloud 플래그 + 서버 연결 + 켜짐 기록일 때만).
// 갈래 = cloud/myData.ts MyDataView: loading · ready(줄 목록) · offline · unavailable · noAccount · moved. 문구가 갈래마다 하나다.
// 보기만 한다: 기기 기록·세션을 바꾸지 않는다. 지우기는 기존 C12 지우기 확인으로 넘긴다(onDelete → 맡겨 두기 시트 'delete' 입구).
// 접근성: 줄마다 '이름, 값'을 한 덩이로 읽히게(accessible), 갈래가 바뀌면 첫 문장을 알린다. 글자 200%: 이름·값은 감싸 내려간다(잘림 없음).
// 모션 없음(시트 자체만 움직인다). 재촉·공포 문구 없음(D-03).
import { PALETTE } from '@mong/core';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import { loadMyData, myDataRows, type MyDataView } from '../cloud/myData';
import type { TaskDeps } from '../cloud/tasks';
import { getLocale, t } from '../i18n';
import { BottomSheet } from '../ui/BottomSheet';
import { KText, SANS, SERIF, track } from '../ui/type';

const C = PALETTE.day;

export function MyDataSheet({ visible, onClose, onDelete, deps, tzOffsetMin }: { visible: boolean; onClose: () => void; /** 기존 C12 지우기 확인으로 */ onDelete: () => void; deps: Pick<TaskDeps, 'api' | 'auth'>; tzOffsetMin: () => number }) {
  const [view, setView] = useState<MyDataView>({ k: 'loading' });
  const seq = useRef(0);
  const load = useCallback(() => {
    const my = ++seq.current;
    setView({ k: 'loading' });
    void loadMyData(deps).then((v) => {
      if (seq.current === my) setView(v);
    });
  }, [deps]);
  useEffect(() => {
    if (!visible) return;
    load();
    // 닫히거나 사라지면 늦게 온 응답을 버린다(다음 열기의 갈래를 덮지 않게)
    const s = seq;
    return () => {
      s.current++;
    };
  }, [visible, load]);

  const announce = view.k === 'ready' ? t('cloud.view.title') : view.k === 'loading' ? t('cloud.view.loading') : t(`cloud.view.${view.k}`);
  useEffect(() => {
    if (visible) AccessibilityInfo.announceForAccessibility(announce);
  }, [visible, announce]);

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('cloud.view.title')} theme="day" contentContainerStyle={styles.content} testID="mydata">
      {view.k === 'loading' && (
        <P testID="mydata-loading" live>
          {t('cloud.view.loading')}
        </P>
      )}
      {view.k === 'ready' && (
        <View testID="mydata-ready">
          <P>{t('cloud.view.lead')}</P>
          <View style={styles.list}>
            {myDataRows(view.data, getLocale(), tzOffsetMin()).map((r) => (
              <View key={r.id} style={[styles.row, r.id.startsWith('version-') && styles.rowSub]} accessible accessibilityLabel={r.a11y} testID={`mydata-row-${r.id}`}>
                <KText style={styles.rowLabel}>{r.label}</KText>
                <KText style={styles.rowValue}>{r.value}</KText>
              </View>
            ))}
          </View>
          <P sub>{t('cloud.view.device')}</P>
        </View>
      )}
      {view.k === 'offline' && (
        <P testID="mydata-offline" live>
          {t('cloud.view.offline')}
        </P>
      )}
      {view.k === 'unavailable' && (
        <P testID="mydata-unavailable" live>
          {t('cloud.view.unavailable')}
        </P>
      )}
      {view.k === 'noAccount' && (
        <P testID="mydata-noAccount" live>
          {t('cloud.view.noAccount')}
        </P>
      )}
      {view.k === 'moved' && (
        <P testID="mydata-moved" live>
          {t('cloud.view.moved')}
        </P>
      )}
      <View style={styles.actions}>
        {(view.k === 'offline' || view.k === 'unavailable') && <Btn label={t('cloud.view.retry')} onPress={load} primary testID="mydata-retry" />}
        {/* 지우기 길: 서버에 닿을 수 있는(또는 지금만 못 닿는) 갈래에서. 옮겨 감·이 로그인에 없음은 여기서 지울 것이 없다 — 웹 삭제 안내가 본문에 있다 */}
        {(view.k === 'ready' || view.k === 'offline' || view.k === 'unavailable') && (
          <>
            <Btn label={t('cloud.view.delete')} onPress={onDelete} testID="mydata-delete" />
            <P sub>{t('cloud.view.deleteHint')}</P>
          </>
        )}
        <Btn label={t('cloud.view.close')} onPress={onClose} testID="mydata-close" />
      </View>
    </BottomSheet>
  );
}

function P({ children, sub, live, testID }: { children: ReactNode; sub?: boolean; live?: boolean; testID?: string }) {
  return (
    <KText style={sub ? styles.sub : styles.p} accessibilityLiveRegion={live ? 'polite' : undefined} testID={testID}>
      {children}
    </KText>
  );
}

function Btn({ label, onPress, primary, testID }: { label: string; onPress: () => void; primary?: boolean; testID?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={[styles.btn, primary && styles.btnPrimary]} testID={testID}>
      <KText style={[styles.btnText, primary && styles.btnTextPrimary]}>{label}</KText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 28 },
  p: { marginTop: 8, fontFamily: SANS, fontSize: 15, lineHeight: 23, color: C.text },
  sub: { marginTop: 8, fontFamily: SANS, fontSize: 13, lineHeight: 20, color: C.textSub },
  list: { marginTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: C.wash },
  // 이름·값은 한 줄에 나란히, 좁거나 글자가 커지면 감싸 내려간다(글자 200%)
  row: { minHeight: 48, paddingVertical: 10, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 12, rowGap: 2, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.wash },
  rowSub: { paddingLeft: 14, minHeight: 40 },
  rowLabel: { fontFamily: SERIF, fontSize: 15, lineHeight: 22, color: C.text, letterSpacing: track.serif(15), flexShrink: 1 },
  rowValue: { flexGrow: 1, flexShrink: 1, textAlign: 'right', fontFamily: SANS, fontSize: 14, lineHeight: 21, color: C.textSub },
  actions: { marginTop: 18, gap: 8 },
  btn: { minHeight: 48, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: C.text },
  btnText: { fontFamily: SANS, fontSize: 15, color: C.text, textAlign: 'center', textDecorationLine: 'underline' },
  btnTextPrimary: { color: C.bg, textDecorationLine: 'none' },
});
