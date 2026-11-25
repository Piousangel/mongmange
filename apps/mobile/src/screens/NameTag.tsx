// M2 이름표(C-integrated 2-3, 작업명 '이름표', 공방 노트 행 '우리 몽망이'): 같은 틀, 다른 내용.
// 칸: 세로 이름(+ 작은 날 세기) · 지금 몽망이 · 꼬리표(먹, 결은 M3) · 태어난 때(날짜 + 시진) · 일곱 날 점 줄 · 인장(코드 없음).
// 앱 안 화면이라 이름 공개 설정과 무관(architecture 3-5-2). 공유 PNG(이름표 PNG)는 자르는 순서 4번째 — 이 판에는 화면만.
// 불투명 한지로 덮어 홈의 주사 낙관이 비치지 않는다 → 이 화면의 주사는 인장 하나(아트 4절).
// 아직 없는 칸: '좋아하는 것'(정 4, M4)·'그날 밤 달 모양'·첫 두름 금박 선(아트 판정) — 자리만 비운다.
import { Canvas } from '@shopify/react-native-skia';
import { COMB_REST, PALETTE, coreScale, grammarOf, sim, type MongLook } from '@mong/core';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dayName, formatTag, getLocale, t } from '../i18n';
import { PARAMS } from '../render/clock';
import { Mongmangi, REST_FRAME, type BodyFrame } from '../render/Mongmangi';
import { SealMark } from '../render/SealMark';
import { KText, SANS, SERIF, track, useFontScale } from '../ui/type';
import { verticalName } from './NameTitle';

/** 시진 번호 0..11(자시 = 23~1시) — 현지 시각 기준 */
export function sijinOf(at: number, tzOffsetMin: number): number {
  return Math.floor(((sim.localHour(at, tzOffsetMin) + 1) % 24) / 2);
}

/** 태어난 날(현지) 표기 */
export function bornDate(at: number, tzOffsetMin: number, loc = getLocale()): string {
  const d = at + tzOffsetMin * 60_000;
  try {
    return new Intl.DateTimeFormat(formatTag(loc), { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(d);
  } catch {
    return new Date(d).toISOString().slice(0, 10);
  }
}

export function Portrait({ state, look, strokeInks, size }: { state: sim.State; look: MongLook; strokeInks?: readonly (sim.InkId | null)[]; size: number }) {
  const grammar = useMemo(() => grammarOf(PARAMS.grammar), []);
  const records = state.strokes;
  const s = coreScale(records.length);
  const wpx = size * 0.34;
  const frame = useSharedValue<BodyFrame>({
    ...REST_FRAME,
    ox: size / 2,
    oy: size * 0.55,
    wpx,
    s,
    combN: records.length,
    comb: COMB_REST,
    eyeA: 'open',
    eyeB: 'joy',
    eyeMix: 0,
    attachK: records.map(() => 1),
    fresh: records.map(() => 0),
  });
  return (
    <Canvas style={{ width: size, height: size }}>
      <Mongmangi frame={frame} records={records} mode={PARAMS.body} grammar={grammar} look={look} strokeInks={strokeInks} />
    </Canvas>
  );
}

export function NameTag({
  state,
  name,
  look,
  strokeInks,
  onClose,
}: {
  state: sim.State;
  /** 앱 안 이름(displayName). null = 아직 */
  name: string | null;
  look: MongLook;
  strokeInks?: readonly (sim.InkId | null)[];
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const fs = useFontScale();
  const [code, setCode] = useState(false);
  const main = name ?? t('name.default');
  const day = dayName(state.dayIndex);
  const vertical = verticalName(main, fs);
  const tz = state.clock.tzOffsetMin;
  const born = t('tag.bornValue', { date: bornDate(state.birth.at, tz), sijin: sijinOf(state.birth.at, tz) });
  const ink = state.ink.id ? t('ink.name', { ink: state.ink.id }) : null;
  const filled = Math.min(7, state.dayIndex + 1);
  const art = Math.min(220, width - 96);
  return (
    <View style={[StyleSheet.absoluteFill, styles.root]} accessibilityViewIsModal testID="name-tag">
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.card} accessible accessibilityRole="summary" accessibilityLabel={t('tag.a11y', { name: main, ink: ink ?? '', born })}>
          <View style={styles.top}>
            {vertical ? (
              <View style={styles.vName}>
                <View style={styles.col}>
                  {Array.from(main).map((ch, i) => (
                    <Text key={i} style={styles.vChar} maxFontSizeMultiplier={1.4}>
                      {ch}
                    </Text>
                  ))}
                </View>
                <View style={[styles.col, { marginTop: 6 }]}>
                  {Array.from(day).map((ch, i) => (
                    <Text key={i} style={styles.vSub} maxFontSizeMultiplier={1.4}>
                      {ch}
                    </Text>
                  ))}
                </View>
              </View>
            ) : (
              <View style={styles.hName}>
                <KText style={styles.hMain} serif="title">
                  {main}
                </KText>
                <KText style={styles.hSub}>{day}</KText>
              </View>
            )}
            <Portrait state={state} look={look} strokeInks={strokeInks} size={art} />
          </View>
          {ink && (
            <View style={styles.row}>
              <KText style={styles.label}>{t('tag.ink')}</KText>
              <KText style={styles.value}>{ink}</KText>
            </View>
          )}
          <View style={styles.row}>
            <KText style={styles.label}>{t('tag.born')}</KText>
            <KText style={styles.value}>{born}</KText>
          </View>
          <View style={styles.row}>
            <KText style={styles.label}>{t('tag.days')}</KText>
            <View style={styles.dots} accessibilityLabel={t('tag.days.a11y', { n: filled })}>
              {Array.from({ length: 7 }, (_, i) => (
                <View key={i} style={[styles.dot, i < filled ? styles.dotOn : styles.dotOff]} />
              ))}
            </View>
          </View>
          <Pressable
            style={styles.sealRow}
            onLongPress={() => setCode((v) => !v)}
            delayLongPress={450}
            accessibilityRole="button"
            accessibilityLabel={t('tag.seal.a11y')}
            accessibilityActions={[{ name: 'longpress', label: t('tag.seal.a11y') }]}
            onAccessibilityAction={() => setCode((v) => !v)}
            testID="tag-seal"
          >
            <SealMark sealSeed={state.birth.sealSeed} size={56} />
          </Pressable>
          {code && (
            <KText style={styles.code} testID="tag-seal-code">
              {t('tag.seal.code', { code: sim.sealDisplayCode(state.birth.sealSeed) })}
            </KText>
          )}
        </View>
        <Pressable onPress={onClose} style={styles.back} accessibilityRole="button" accessibilityLabel={t('tag.back.a11y')} testID="tag-back">
          <KText style={styles.backText}>{t('tag.back')}</KText>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: PALETTE.day.bg, zIndex: 10 },
  content: { alignItems: 'center', paddingHorizontal: 20 },
  card: { width: '100%', maxWidth: 400, paddingVertical: 18, paddingHorizontal: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: PALETTE.day.wash, backgroundColor: PALETTE.day.bg },
  top: { flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  vName: { flexDirection: 'row-reverse', gap: 6, paddingTop: 6 },
  col: { alignItems: 'center' },
  vChar: { fontFamily: SERIF, fontSize: 24, lineHeight: 30, color: PALETTE.day.text },
  vSub: { fontFamily: SERIF, fontSize: 12, lineHeight: 16, color: PALETTE.day.textSub },
  hName: { width: '100%', alignItems: 'center', gap: 2 },
  hMain: { fontFamily: SERIF, fontSize: 22, color: PALETTE.day.text, letterSpacing: track.serif(22), textAlign: 'center' },
  hSub: { fontFamily: SANS, fontSize: 13, color: PALETTE.day.textSub },
  row: { minHeight: 44, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderColor: PALETTE.day.wash, paddingVertical: 6 },
  label: { fontFamily: SANS, fontSize: 13, color: PALETTE.day.textSub },
  value: { fontFamily: SERIF, fontSize: 15, color: PALETTE.day.text, flexShrink: 1, textAlign: 'right' },
  dots: { flexDirection: 'row', gap: 7 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  dotOn: { backgroundColor: PALETTE.day.body },
  dotOff: { borderWidth: 1, borderColor: PALETTE.day.inkFaded },
  sealRow: { alignSelf: 'flex-end', marginTop: 14, minWidth: 56, minHeight: 56 },
  code: { alignSelf: 'flex-end', marginTop: 6, fontFamily: SANS, fontSize: 12, color: PALETTE.day.textSub, fontVariant: ['tabular-nums'] },
  back: { minHeight: 48, minWidth: 120, justifyContent: 'center', alignItems: 'center', marginTop: 14 },
  backText: { fontFamily: SANS, fontSize: 15, color: PALETTE.day.textSub, textDecorationLine: 'underline' },
});
