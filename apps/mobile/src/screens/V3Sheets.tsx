// 새 컨셉 v3 세로 조각의 시트 둘(플래그 conceptV3).
// ① 한 마디 시트(C′-키보드 갈래, v0-5-amendments 03 #8 '한 마디' 행): 붓 탭 → 키보드 칸에 낱말 하나(≤ 그날 먹 양 1~6) → '붓으로 한 획'.
//    손글씨 인식(V2·V3 인식부)은 11-30 뒤에 붙는다. 그때까지 이 칸이 같은 자리를 맡는다(버릴 것 없음).
//    R8: 자동 고침·맞춤법 끔. 쓴 글자는 이 화면 밖으로 나가지 않는다 — 판정(core interpretWord) 직후 버리고 말결만 넘긴다.
// ② 벼루 하위 시트(D-27 · care-rituals 2-1): 먹 갈기 / 한 숟갈(먹을 한 칸 이상 갈았을 때) / 작은 것. 숫자·게이지 없음(QA-3 R7).
//    '먹 갈기'는 스크린리더면 한 번에 6칸(H1), 그 밖에는 눌러 시작·눌러 멈춤으로 길게 누르기와 같은 속도로 칸이 차오른다(리뷰 2차 L-d).
import { PALETTE, v3 } from '@mong/core';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type ViewStyle } from 'react-native';
import { t, getLocale } from '../i18n';
import { BottomSheet } from '../ui/BottomSheet';
import { KText, SANS, SERIF, track } from '../ui/type';

export interface WordPick {
  interpretation: v3.Interpretation;
  chars: number;
}

/** 한 마디 시트. 확정하면 판정 결과(말결)와 글자 수만 돌려준다. `covered`면 시트(Modal) 안에 가림막(앱 전환 스냅숏, 리뷰 2차 L-b) */
export function WordSheet({
  visible,
  covered,
  ink,
  names,
  onPick,
  onClose,
}: {
  visible: boolean;
  covered: boolean;
  ink: number;
  names: string[];
  onPick: (p: WordPick) => void;
  onClose: () => void;
}) {
  const [raw, setRaw] = useState('');
  // 시트가 숨겨지면(닫기·잠·아침·앱 전환) 확정하지 않은 글자를 바로 버린다(리뷰 H2)
  useEffect(() => {
    if (!visible) setRaw('');
  }, [visible]);
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
    <BottomSheet
      visible={visible}
      onClose={close}
      title={t('v3.word.title')}
      theme="day"
      contentContainerStyle={styles.content}
      // 시트는 앱 화면 위 창(Modal)이라 앱 쪽 가림막이 덮지 못한다 — 같은 창 안에 덮는다. 덮인 동안 스크린리더·뒤로 가기는 가림막이 받는다
      overlay={covered ? <View style={[StyleSheet.absoluteFill, styles.cover]} testID="v3-word-cover" /> : undefined}
      onOverlayBack={noop}
      testID="v3-word-sheet"
    >
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

/** 벼루 하위 시트(V27: 공방에 열린 종류마다 한 줄 — 정식 시트 UI는 V28). 시트 갈기 상태·멈춤 규칙은 앱이 쥔다(앱 상태로도 멈춰야 해서, v3Flow `sheetGrindOn`) */
export function InkstoneSheet({
  visible,
  sheet,
  grindMode,
  grinding,
  grindCells,
  onGrindRow,
  onSpoon,
  onTreat,
  onClose,
}: {
  visible: boolean;
  sheet: v3.MealSheet;
  /** 'all' = 한 번에 6칸(스크린리더), 'flow' = 눌러 시작·눌러 멈춤 */
  grindMode: 'all' | 'flow';
  /** 시트 갈기 중인가('flow'에서만) */
  grinding: boolean;
  /** 갈기 중 보이는 칸 수(이미 간 양 + 지금까지) */
  grindCells: number;
  onGrindRow: () => void;
  onSpoon: (item: v3.MealItem) => void;
  onTreat: (item: v3.TreatItem) => void;
  onClose: () => void;
}) {
  const spoonNote = sheet.spoon === 'noInk' ? t('v3.inkstone.spoonNoInk') : sheet.spoon === 'cap' ? t('v3.inkstone.again') : '';
  const treatNote = sheet.treat === 'cap' ? t('v3.inkstone.treatAgain') : '';
  const grindNote = grindMode === 'all' ? t('v3.inkstone.grindHint') : grinding ? t('v3.inkstone.grinding') : t('v3.inkstone.grindTap');
  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('v3.inkstone.title')} theme="day" contentContainerStyle={styles.content} testID="v3-inkstone-sheet">
      <Row label={grinding ? t('v3.inkstone.grindStop') : t('v3.inkstone.grind')} note={grindNote} onPress={onGrindRow} testID="v3-sheet-grind" />
      {grinding && (
        <View style={styles.cells} accessible accessibilityLabel={t('v3.word.ink', { n: grindCells })} accessibilityLiveRegion="polite" testID="v3-sheet-grind-cells">
          {Array.from({ length: v3.WORD_MAX_CHARS }, (_, i) => (
            <View key={i} style={[styles.cell, i < grindCells ? styles.cellInk : styles.cellDry]} />
          ))}
        </View>
      )}
      {sheet.meals.map((item) => (
        <Row key={item} label={`${t('v3.inkstone.spoon')} · ${t(`v3.item.${item}`)}`} note={spoonNote} disabled={grinding || sheet.spoon !== 'ok'} onPress={() => onSpoon(item)} testID={item === 'clear' ? 'v3-sheet-spoon' : `v3-sheet-spoon-${item}`} dot={item} />
      ))}
      {sheet.treats.map((item) => (
        <Row key={item} label={`${t('v3.inkstone.treat')} · ${t(`v3.item.${item}`)}`} note={treatNote} disabled={grinding || sheet.treat !== 'ok'} onPress={() => onTreat(item)} testID={item === 'pattern' ? 'v3-sheet-treat' : `v3-sheet-treat-${item}`} dot={item} />
      ))}
    </BottomSheet>
  );
}

const noop = () => {};

function Row({ label, note, disabled, onPress, testID, dot }: { label: string; note: string; disabled?: boolean; onPress: () => void; testID: string; dot?: v3.PantryItem }) {
  return (
    <Pressable
      onPress={() => !disabled && onPress()}
      style={[styles.row, disabled && styles.dim]}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      accessibilityLabel={note ? `${label}. ${note}` : label}
      testID={testID}
    >
      <View style={styles.rowIcon}>{dot ? <View style={ITEM_DOT[dot]} /> : <View style={styles.dotStone} />}</View>
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
  cover: { backgroundColor: PALETTE.day.bg },
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
  // 임시 점(V30 아트 전). 갈기 줄(dotStone)과 겹치지 않게 종류마다 모양을 다르게 둔다(V27 리뷰 L1)
  dotPine: { width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(43,42,40,0.35)', borderWidth: 3, borderColor: 'rgba(214,170,60,0.85)' },
  dotDew: { width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(43,42,40,0.15)', borderWidth: 1, borderColor: 'rgba(43,42,40,0.45)' },
  dotRibbon: { width: 26, height: 6, borderRadius: 3, backgroundColor: 'rgba(43,42,40,0.7)' },
  dotDewdrop: { width: 12, height: 16, borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, backgroundColor: 'rgba(120,150,170,0.55)' },
});

/** 종류별 임시 점 — 공방에 열릴 수 있는 여섯 가지 전부(빠지면 타입 오류) */
const ITEM_DOT: Record<v3.PantryItem, ViewStyle> = {
  clear: styles.dotClear,
  pattern: styles.dotPattern,
  pine: styles.dotPine,
  dew: styles.dotDew,
  ribbon: styles.dotRibbon,
  dewdrop: styles.dotDewdrop,
};
