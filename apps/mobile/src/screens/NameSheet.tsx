// M2 이름 짓기 창(C-integrated 2-2, 시스템 3.8 '부르기'): 한지 한 장에 묻는 한 줄 + 이름 한 줄 + 인장.
// - 규칙은 모두 core: 검사 normalizeName(한글 6·라틴 12·숫자 7 연속 거부), 조합 중 판정 endsWithComposingJamo. 이 화면은 결과를 글로 옮기기만 한다.
// - 확정하면 인장이 '탁' 찍히고(소리는 sim 'named' 효과에서 GameApp이 한 곳에서 낸다) 잠깐 뒤 닫힌다. 모션 줄이기면 찍힘 크기 변화 없이 바로.
// - 불투명 한지로 화면을 덮는다 — 홈의 주사 낙관이 가려져 이 창의 인장이 화면의 유일한 주사다(아트 4절).
// - 접근성(D-08): 모달, 머리글, 입력 라벨·힌트, 오류는 live region, 버튼 44pt, 글자 200%(웹 ?fs=2)에서 스크롤.
import { PALETTE, sim } from '@mong/core';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../i18n';
import { useLater } from '../lib/useLater';
import { PARAMS, clamp01, clock } from '../render/clock';
import { SealMark } from '../render/SealMark';
import { KText, SANS, SERIF, track, useFontScale } from '../ui/type';
import { ERR_KEY, nameInputState } from './nameInput';

const RM = PARAMS.rm;
/** 인장이 찍힌 뒤 창이 닫히기까지(찍힘 160ms + 바라볼 틈) */
const CLOSE_AFTER_MS = RM ? 300 : 900;
export type NameSheetMode = 'ask' | 'rename';

export function NameSheet({
  mode,
  sealSeed,
  initial,
  onConfirm,
  onClose,
}: {
  mode: NameSheetMode;
  sealSeed: number;
  /** 바꾸기면 지금 이름 */
  initial?: string;
  /** 검사를 통과한 이름(정리된 값) — 인장이 찍히는 순간 한 번 */
  onConfirm: (text: string) => void;
  /** 창이 닫힘: named = 이름을 지어 인장이 찍힌 뒤(잠깐 뒤), false = 건너뛰기·그대로 두기 */
  onClose: (named: boolean) => void;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const fs = useFontScale();
  const later = useLater();
  const [raw, setRaw] = useState(initial ?? '');
  const [stamped, setStamped] = useState(false);
  const lock = useRef(false);
  const st = nameInputState(raw);
  const unchanged = mode === 'rename' && st.text === initial;
  // iOS VoiceOver는 accessibilityLiveRegion(Android 전용)을 읽지 않는다 → 오류가 새로 뜰 때마다 직접 읽어 준다(리뷰 L-4)
  const errMsg = st.message;
  useEffect(() => {
    if (Platform.OS === 'ios' && errMsg) AccessibilityInfo.announceForAccessibility(t(errMsg));
  }, [errMsg]);
  const canConfirm = st.ok && !unchanged && !stamped;
  const stampAt = useSharedValue(-1e9);
  const sealSt = useAnimatedStyle(() => {
    const d = clock.value - stampAt.value;
    if (d < 0) return { opacity: 0.35, transform: [{ scale: 1 }] };
    const k = RM ? 1 : clamp01(d / 160);
    return { opacity: 0.35 + 0.65 * k, transform: [{ scale: RM ? 1 : 1.35 - 0.35 * k }] };
  });

  const confirm = () => {
    if (lock.current) return;
    if (!st.ok || !st.text) {
      const r = sim.normalizeName(raw);
      if (!r.ok) AccessibilityInfo.announceForAccessibility(t(ERR_KEY[r.reason]));
      return;
    }
    if (unchanged) return;
    lock.current = true;
    const text = st.text;
    setStamped(true);
    stampAt.value = clock.value;
    AccessibilityInfo.announceForAccessibility(t('name.stamped.a11y', { name: text }));
    onConfirm(text);
    later(() => onClose(true), CLOSE_AFTER_MS);
  };

  const inputW = Math.min(300, width - 48);
  const inputSize = 24 * Math.min(Platform.OS === 'web' ? fs : 1, 2);
  return (
    <View style={[StyleSheet.absoluteFill, styles.root]} accessibilityViewIsModal testID="name-sheet">
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
          <KText style={styles.ask} serif="title" accessibilityRole="header">
            {t(mode === 'ask' ? 'name.ask' : 'name.ask.rename')}
          </KText>
          <View style={[styles.inputRow, { width: inputW }]}>
            <TextInput
              value={raw}
              onChangeText={(v) => !stamped && setRaw(v)}
              onSubmitEditing={confirm}
              editable={!stamped}
              autoFocus
              autoCorrect={false}
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="words"
              returnKeyType="done"
              maxLength={24}
              style={[styles.input, { fontSize: inputSize, lineHeight: inputSize * 1.35 }]}
              accessibilityLabel={t('name.input.a11y')}
              accessibilityHint={t('name.input.hint')}
              testID="name-input"
            />
          </View>
          <KText style={[styles.note, st.message && styles.err]} accessibilityLiveRegion="polite" testID="name-note">
            {st.message ? t(st.message) : t('name.input.hint')}
          </KText>
          {st.fallback && (
            <KText style={styles.note} accessibilityLiveRegion="polite" testID="name-fallback">
              {t('name.fallbackGlyph')}
            </KText>
          )}
          <Animated.View style={[styles.seal, sealSt]} testID={stamped ? 'name-sealed' : 'name-seal'}>
            <SealMark sealSeed={sealSeed} size={48} />
          </Animated.View>
          <View style={styles.actions}>
            <Pressable
              onPress={confirm}
              style={[styles.btn, styles.primary, !canConfirm && styles.dim]}
              accessibilityRole="button"
              accessibilityLabel={st.text ? t('name.confirm.a11y', { name: st.text }) : t('name.confirm')}
              accessibilityState={{ disabled: !canConfirm }}
              testID="name-confirm"
            >
              <KText style={[styles.btnText, { color: PALETTE.day.bg }]} maxFontSizeMultiplier={2}>
                {t('name.confirm')}
              </KText>
            </Pressable>
            <Pressable onPress={() => !stamped && onClose(false)} style={styles.btn} accessibilityRole="button" accessibilityLabel={t(mode === 'ask' ? 'name.skip' : 'name.keep')} testID="name-cancel">
              <KText style={styles.btnText} maxFontSizeMultiplier={2}>
                {t(mode === 'ask' ? 'name.skip' : 'name.keep')}
              </KText>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: PALETTE.day.bg, zIndex: 20 },
  fill: { flex: 1 },
  content: { alignItems: 'center', paddingHorizontal: 24, gap: 14 },
  ask: { fontFamily: SERIF, fontSize: 19, lineHeight: 28, color: PALETTE.day.text, textAlign: 'center', letterSpacing: track.serif(19) },
  inputRow: { marginTop: 18, borderBottomWidth: 1, borderColor: PALETTE.day.textSub },
  input: { fontFamily: SERIF, color: PALETTE.day.text, textAlign: 'center', paddingVertical: 8, minHeight: 48 },
  note: { fontFamily: SANS, fontSize: 13, lineHeight: 19, color: PALETTE.day.textSub, textAlign: 'center', maxWidth: 320 },
  err: { color: PALETTE.day.text },
  seal: { marginTop: 10 },
  actions: { marginTop: 18, alignItems: 'center', gap: 6 },
  btn: { minHeight: 48, minWidth: 180, paddingHorizontal: 20, justifyContent: 'center', alignItems: 'center', borderRadius: 24 },
  primary: { backgroundColor: PALETTE.day.text },
  dim: { opacity: 0.35 },
  btnText: { fontFamily: SANS, fontSize: 15, color: PALETTE.day.textSub, textAlign: 'center' },
});
