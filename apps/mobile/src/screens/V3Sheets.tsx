// 새 컨셉 v3 세로 조각의 시트 둘(플래그 conceptV3).
// ① 한 마디 시트(C′-키보드 갈래, v0-5-amendments 03 #8 '한 마디' 행): 붓 탭 → 키보드 칸에 낱말 하나(≤ 그날 먹 양 1~6) → '붓으로 한 획'.
//    손글씨 인식(V2·V3 인식부)은 11-30 뒤에 붙는다. 그때까지 이 칸이 같은 자리를 맡는다(버릴 것 없음).
//    R8: 자동 고침·맞춤법 끔. 쓴 글자는 이 화면 밖으로 나가지 않는다 — 판정(core interpretWord) 직후 버리고 말결만 넘긴다.
// ② 벼루 하위 시트(D-27 · care-rituals 2-1): 먹 갈기 안내 / 한 숟갈(먹을 한 칸 이상 갈았을 때) / 작은 것. 숫자·게이지 없음(QA-3 R7).
import { PALETTE, v3 } from '@mong/core';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { t, getLocale } from '../i18n';
import { BottomSheet } from '../ui/BottomSheet';
import { KText, SANS, SERIF, track } from '../ui/type';

export interface WordPick {
  interpretation: v3.Interpretation;
  chars: number;
}

/** 한 마디 시트. 확정하면 판정 결과(말결)와 글자 수만 돌려준다 */
export function WordSheet({ visible, ink, names, onPick, onClose }: { visible: boolean; ink: number; names: string[]; onPick: (p: WordPick) => void; onClose: () => void }) {
  const [raw, setRaw] = useState('');
  const chars = v3.wordChars(raw);
  const over = chars > ink;
  const ok = chars >= 1 && !over;
  const close = () => {
    setRaw('');
    onClose();
  };
  const confirm = () => {
    if (!ok) return;
    const interpretation = v3.interpretWord(raw, getLocale(), names);
    setRaw(''); // 글자는 여기서 버린다(R8)
    onPick({ interpretation, chars });
  };
  return (
    <BottomSheet visible={visible} onClose={close} title={t('v3.word.title')} theme="day" contentContainerStyle={styles.content} testID="v3-word-sheet">
      <View style={styles.cells} accessible accessibilityLabel={t('v3.word.ink', { n: ink })} testID="v3-ink-cells">
        {Array.from({ length: v3.WORD_MAX_CHARS }, (_, i) => (
          <View key={i} style={[styles.cell, i < ink ? styles.cellInk : styles.cellDry, i < chars && i < ink && styles.cellUsed]} />
        ))}
      </View>
      <KText style={styles.sub}>{t('v3.word.ink', { n: ink })}</KText>
      <View style={styles.inputRow}>
        <TextInput
          value={raw}
          onChangeText={setRaw}
          onSubmitEditing={confirm}
          autoFocus={visible}
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="none"
          returnKeyType="done"
          maxLength={24}
          style={styles.input}
          accessibilityLabel={t('v3.word.input.a11y')}
          accessibilityHint={t('v3.word.hint')}
          testID="v3-word-input"
        />
      </View>
      <KText style={[styles.sub, over && styles.warn]} accessibilityLiveRegion="polite" testID="v3-word-note">
        {over ? t('v3.word.tooLong', { n: ink }) : t('v3.word.hint')}
      </KText>
      <View style={styles.actions}>
        <Pressable onPress={confirm} style={[styles.btn, styles.primary, !ok && styles.dim]} accessibilityRole="button" accessibilityState={{ disabled: !ok }} accessibilityLabel={t('v3.word.next')} testID="v3-word-next">
          <KText style={[styles.btnText, { color: PALETTE.day.bg }]}>{t('v3.word.next')}</KText>
        </Pressable>
        <Pressable onPress={close} style={styles.btn} accessibilityRole="button" accessibilityLabel={t('v3.word.cancel')} testID="v3-word-cancel">
          <KText style={styles.btnText}>{t('v3.word.cancel')}</KText>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

/** 벼루 하위 시트(밥 1·간식 1 최소판) */
export function InkstoneSheet({
  visible,
  sheet,
  onGrind,
  onSpoon,
  onTreat,
  onClose,
}: {
  visible: boolean;
  sheet: { spoon: 'ok' | 'noInk' | 'cap'; treat: 'ok' | 'cap' };
  onGrind: () => void;
  onSpoon: () => void;
  onTreat: () => void;
  onClose: () => void;
}) {
  const spoonNote = sheet.spoon === 'noInk' ? t('v3.inkstone.spoonNoInk') : sheet.spoon === 'cap' ? t('v3.inkstone.again') : '';
  const treatNote = sheet.treat === 'cap' ? t('v3.inkstone.treatAgain') : '';
  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('v3.inkstone.title')} theme="day" contentContainerStyle={styles.content} testID="v3-inkstone-sheet">
      <Row label={t('v3.inkstone.grind')} note={t('v3.inkstone.grindHint')} onPress={onGrind} testID="v3-sheet-grind" />
      <Row label={`${t('v3.inkstone.spoon')} · ${t('v3.item.clear')}`} note={spoonNote} disabled={sheet.spoon !== 'ok'} onPress={onSpoon} testID="v3-sheet-spoon" dot="clear" />
      <Row label={`${t('v3.inkstone.treat')} · ${t('v3.item.pattern')}`} note={treatNote} disabled={sheet.treat !== 'ok'} onPress={onTreat} testID="v3-sheet-treat" dot="pattern" />
    </BottomSheet>
  );
}

function Row({ label, note, disabled, onPress, testID, dot }: { label: string; note: string; disabled?: boolean; onPress: () => void; testID: string; dot?: 'clear' | 'pattern' }) {
  return (
    <Pressable
      onPress={() => !disabled && onPress()}
      style={[styles.row, disabled && styles.dim]}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      accessibilityLabel={note ? `${label}. ${note}` : label}
      testID={testID}
    >
      <View style={styles.rowIcon}>{dot === 'clear' ? <View style={styles.dotClear} /> : dot === 'pattern' ? <View style={styles.dotPattern} /> : <View style={styles.dotStone} />}</View>
      <View style={styles.rowText}>
        <KText style={styles.rowLabel}>{label}</KText>
        {note !== '' && <KText style={styles.sub}>{note}</KText>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 12, gap: 10 },
  cells: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 4 },
  cell: { width: 22, height: 22, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(43,42,40,0.25)' },
  cellInk: { backgroundColor: 'rgba(43,42,40,0.28)' },
  cellDry: { backgroundColor: 'transparent' },
  cellUsed: { backgroundColor: PALETTE.day.text },
  inputRow: { alignSelf: 'center', width: 240, borderBottomWidth: 1, borderColor: PALETTE.day.textSub },
  input: { fontFamily: SERIF, fontSize: 26, lineHeight: 36, color: PALETTE.day.text, textAlign: 'center', paddingVertical: 8, minHeight: 52 },
  sub: { fontFamily: SANS, fontSize: 13, lineHeight: 19, color: PALETTE.day.textSub, textAlign: 'center' },
  warn: { color: PALETTE.day.text },
  actions: { marginTop: 6, alignItems: 'center', gap: 4 },
  btn: { minHeight: 48, minWidth: 180, paddingHorizontal: 20, justifyContent: 'center', alignItems: 'center', borderRadius: 24 },
  primary: { backgroundColor: PALETTE.day.text },
  dim: { opacity: 0.4 },
  btnText: { fontFamily: SANS, fontSize: 15, color: PALETTE.day.textSub, textAlign: 'center', letterSpacing: track.sans },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: 14, paddingVertical: 6 },
  rowIcon: { width: 36, alignItems: 'center' },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontFamily: SERIF, fontSize: 16, color: PALETTE.day.text, letterSpacing: track.serif(16) },
  dotStone: { width: 28, height: 18, borderRadius: 9, backgroundColor: 'rgba(43,42,40,0.75)' },
  dotClear: { width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(43,42,40,0.35)' },
  dotPattern: { width: 18, height: 18, borderRadius: 3, backgroundColor: 'rgba(43,42,40,0.7)', transform: [{ rotate: '45deg' }] },
});
