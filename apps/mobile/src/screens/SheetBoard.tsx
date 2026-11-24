// 공통 바텀시트 확인판(웹 ?screen=sheet, 캡처 scripts/sheet-capture.mjs): 밤 테마 · 스냅 두 개(35%·85%) · 긴 스크롤.
// 제품 화면이 아니다 — 공방 노트가 쓰지 않는 갈래(여러 스냅·밤 팔레트)를 실제 제스처로 확인하는 자리다.
import { PALETTE } from '@mong/core';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { t } from '../i18n';
import { BottomSheet } from '../ui/BottomSheet';
import { KText } from '../ui/type';
import { SANS } from './ui';

const SNAPS = ['35%', '85%'] as const;
const ROWS = Array.from({ length: 30 }, (_, i) => i + 1);

export function SheetBoard() {
  const [open, setOpen] = useState(true);
  return (
    <View style={styles.fill} testID="sheet-board">
      <Pressable style={styles.open} onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={t('note.title')} testID="board-open">
        <KText style={styles.openText}>{t('note.title')}</KText>
      </Pressable>
      <BottomSheet visible={open} onClose={() => setOpen(false)} theme="night" snapPoints={SNAPS} initialSnap={0} title={t('note.title')} testID="board-sheet">
        {ROWS.map((n) => (
          <View key={n} style={styles.row} testID={`board-row-${n}`}>
            <KText style={styles.rowText}>{n}</KText>
          </View>
        ))}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: PALETTE.night.bg },
  open: { marginTop: 80, alignSelf: 'center', minHeight: 44, paddingHorizontal: 20, justifyContent: 'center' },
  openText: { fontFamily: SANS, fontSize: 15, color: PALETTE.night.text },
  row: { minHeight: 52, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: PALETTE.night.wash },
  rowText: { fontFamily: SANS, fontSize: 15, color: PALETTE.night.text },
});
