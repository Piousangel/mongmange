import { BlurMask, Canvas, Oval, RoundedRect } from '@shopify/react-native-skia';
import { COMB_REST, PALETTE, grammarOf, selectVisual, sim } from '@mong/core';
import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { gazeOffset, type Gaze } from '../render/gaze';
import { blinkAt, breathAt } from '../render/idle';
import { Mongmangi, REST_FRAME, type BodyFrame } from '../render/Mongmangi';
import { KText, track, useFontScale } from '../ui/type';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { morningLine } from '../game/text';
import { dayName, t } from '../i18n';
import { PARAMS, clamp01, clock, easeOut } from '../render/clock';
import { NightWater } from './HomeScreen';
import { Paper, SANS, SERIF, layout, styles as ui } from './ui';
import { DreamCard } from '../render/dreamCard/DreamCard';
import { strokesForCard } from '../render/dreamCard/DreamCardThumb';
import { cardLabels, cardA11y, ShareBar } from './cardText';

const RM = PARAMS.rm;
/** 물 빠짐 1600ms + 카드 800ms(아트 5·8절). Reduce Motion은 페이드 300ms */
const DRAIN_MS = RM ? 300 : 1600;
const CARD_MS = RM ? 0 : 800;
const LIFT_PX = 120;

/**
 * 아침 현상: 수면 위에 한지 한 장이 떠 있다 → 위로 끌어 건져 올림(버튼 대체 "꿈 꺼내기", D-08) → sim developCard
 * → 물이 빠지고 인화 카드 + 아침 문장. 카드·문장은 sim의 cardDeveloped 효과에서 온다.
 */
export function MorningScreen({
  state,
  developed,
  onDevelop,
  onDone,
}: {
  state: sim.State;
  /** 현상된 카드(sim 효과). null이면 아직 물 위 */
  developed: { card: sim.DreamCard; line: sim.MorningLine } | null;
  onDevelop: () => void;
  onDone: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const drag = useSharedValue(0);
  const liftAt = useSharedValue(developed ? -1e9 : 1e12);
  const [lifted, setLifted] = useState(!!developed);
  // 라이브 카드(마블링 셰이더 2~3개 + makeDreamArt)는 물 빠짐 연출이 끝난 뒤에 마운트한다 — 셰이더 컴파일이 물 빠짐 프레임을 잡지 않게(v1.2 리뷰 ①)
  const [cardLive, setCardLive] = useState(!!developed);
  useEffect(() => {
    if (!developed || cardLive) return;
    const id = setTimeout(() => setCardLive(true), DRAIN_MS);
    return () => clearTimeout(id);
  }, [developed, cardLive]);

  const lift = () => {
    if (lifted) return;
    setLifted(true);
    liftAt.value = clock.value;
    onDevelop();
  };

  const pan = usePanGesture({
    onUpdate: (e) => {
      'worklet';
      if (liftAt.value < 1e11) return;
      drag.value = Math.min(0, e.translationY);
    },
    onFinalize: () => {
      'worklet';
      if (liftAt.value < 1e11) return;
      if (drag.value < -LIFT_PX) runOnJS(lift)();
      else drag.value = 0;
    },
  });

  const k = useDerivedValue(() => clamp01((clock.value - liftAt.value) / DRAIN_MS));
  const cardK = useDerivedValue(() => (CARD_MS === 0 ? (k.value >= 1 ? 1 : 0) : easeOut((clock.value - liftAt.value - DRAIN_MS) / CARD_MS)));
  const waterSt = useAnimatedStyle(() => ({ opacity: 1 - easeOut(k.value) }));
  const sheetSt = useAnimatedStyle(() => {
    const bob = RM ? 0 : Math.sin(clock.value / 1300) * 4;
    const up = liftAt.value < 1e11 ? -height * 0.08 * easeOut(k.value) : drag.value;
    return { transform: [{ translateY: bob * (1 - k.value) + up }], opacity: 1 - cardK.value };
  });

  const insets = useSafeAreaInsets();
  const L = layout(width, height);
  const sheetW = Math.min(width * 0.5, 240, height * 0.24);
  const sheetH = sheetW * 1.25;
  const sheetTop = insets.top + height * 0.17;
  // 인화 카드(4:5): 문장·버튼 자리(약 150pt)를 남기고 가장 크게
  const cardTop = insets.top + 20;
  // 카드 아래 글 덩이(문장·긴 잠·보내기)의 실제 높이를 재서 카드 크기를 정한다 — 글자 200%·영어에서 문장이 3줄이 되면
  // 카드를 줄이고, 남은 띠(글 덩이 아래 ~ '낮으로' 위)에 몽망이를 맞춰 앉힌다(리뷰 P1-3: 320×568·200% 겹침)
  const fs = Math.min(useFontScale(), 1.5);
  const [textH, setTextH] = useState(110 + (fs - 1) * 120);
  const linkTop = height - insets.bottom - 18 - 44;
  const MONG_BAND = 64;
  const cardW = Math.max(140, Math.min(width - 40, 360, (linkTop - cardTop - 14 - textH - MONG_BAND) / 1.25));
  const cardH = cardW * 1.25;
  const text = developed ? morningLine(developed.line, developed.card) : '';
  const cardStrokes = useMemo(() => (developed ? strokesForCard(state.strokes, developed.card) : []), [developed, state.strokes]);
  const labels = useMemo(() => (developed ? cardLabels(developed.card, text) : undefined), [developed, text]);
  // 건져 올린 한지가 그대로 인화 카드가 된다: 물 빠짐 끝의 한지 자리·크기에서 카드 자리로 커지며 옮겨 간다(크로스페이드)
  const sheetEndCy = sheetTop + sheetH / 2 - height * 0.08;
  const cardCy = cardTop + cardH / 2;
  const s0 = sheetW / cardW;
  const cardSt = useAnimatedStyle(() => {
    const c = cardK.value;
    return { opacity: Math.min(1, c * 1.6), transform: [{ translateY: (sheetEndCy - cardCy) * (1 - c) }, { scale: s0 + (1 - s0) * c }] };
  });
  const textSt = useAnimatedStyle(() => ({ opacity: clamp01((cardK.value - 0.55) / 0.45) }));
  // 스크린리더: 카드가 다 놓이면 모티프·아침 문장을 한 번 읽어 준다(건져 올리기 동작 결과 알림)
  useEffect(() => {
    if (!developed) return;
    const id = setTimeout(() => AccessibilityInfo.announceForAccessibility(cardA11y(developed.card, text)), DRAIN_MS + CARD_MS);
    return () => clearTimeout(id);
  }, [developed, text]);

  // 몽망이: 수면 위에서 깨어나 한지를 함께 본다(리뷰 U7). 물이 빠지면 낮 먹색으로
  const grammar = useMemo(() => grammarOf(PARAMS.grammar), []);
  const s = selectVisual({ phase: 'awake', strokes: state.strokes }).coreScale;
  const textBottom = cardTop + cardH + 14 + textH;
  const free = linkTop - textBottom;
  // 현상 뒤: 글 덩이와 '낮으로' 사이 띠에 맞춘다(넉넉하면 원래 자리·크기 그대로)
  const fitK = developed ? Math.max(0.4, Math.min(1, free / (1.5 * L.wpx * 0.8))) : 1;
  const mongY = developed ? Math.min(height * 0.83, textBottom + Math.max(free, 0) * 0.58) : height * 0.83;
  const wpx = L.wpx * 0.8 * fitK;
  const mountAt = useSharedValue(clock.value);
  const gaze = useDerivedValue<Gaze>(() => ({ x: width / 2, y: developed ? insets.top + cardH * 0.5 : sheetTop + sheetH / 2, at: mountAt.value + 1200, holdMs: 1e9 }));
  const frame = useDerivedValue<BodyFrame>(() => {
    const t = clock.value;
    const dk = k.value;
    const night = liftAt.value > 1e11 ? 1 : 1 - easeOut(dk);
    const b = RM ? 0 : breathAt(t, 3400);
    const g = gazeOffset(gaze.value, t, width / 2, mongY, wpx);
    const wake = t - mountAt.value;
    const blink = RM ? (wake < 200 ? 1 : 0) : Math.max(wake < 900 ? 1 - easeOut(wake / 900) : 0, blinkAt(t));
    return {
      ...REST_FRAME,
      ox: width / 2,
      oy: mongY - Math.sin(t / 1400) * 0.012 * wpx * night,
      wpx,
      s,
      combN: state.strokes.length,
      comb: { ...COMB_REST, wobble0: b * 1.2, wobble1: b, wobble2: b * 0.8 },
      sx: 1 - 0.01 * b,
      sy: 1 + 0.02 * b,
      tilt: g.tilt,
      gx: g.gx,
      gy: g.gy,
      blink,
      night,
      ringAlpha: 1 - night,
      attachK: state.strokes.map(() => 1),
      fresh: state.strokes.map(() => 0),
    };
  });

  return (
    <View style={[styles.root, { backgroundColor: PALETTE.day.bg }]} testID="morning">
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <Paper width={width} height={height} />
      </Canvas>
      <Animated.View style={[StyleSheet.absoluteFill, waterSt]} pointerEvents="none">
        <NightWater width={width} height={height} cx={width / 2} cy={mongY} />
      </Animated.View>
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <Mongmangi frame={frame} records={state.strokes} mode={PARAMS.body} grammar={grammar} />
      </Canvas>

      {!developed && (
        <KText style={[ui.line, { top: insets.top + height * 0.07, color: PALETTE.night.text, fontSize: 17, letterSpacing: track.serif(17) }]} pointerEvents="none" accessibilityRole="header" serif="title">
          {t('morning.title', { day: dayName(state.dayIndex) })}
        </KText>
      )}

      <GestureDetector gesture={pan}>
        <Animated.View
          style={[styles.sheet, { width: sheetW, height: sheetH, left: (width - sheetW) / 2, top: sheetTop }, sheetSt]}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={t('morning.sheet.a11y')}
          accessibilityHint={t('morning.sheet.hint')}
          accessibilityActions={[{ name: 'increment', label: t('morning.sheet.action') }, { name: 'activate', label: t('morning.sheet.action') }]}
          onAccessibilityAction={lift}
          testID="dream-sheet"
        >
          <WetSheet w={sheetW} h={sheetH} />
        </Animated.View>
      </GestureDetector>

      {!lifted && (
        <>
          <KText style={[ui.line, { top: sheetTop + sheetH + 28, color: PALETTE.night.textSub, fontFamily: SERIF }]} pointerEvents="none">
            {t('morning.lift')}
          </KText>
          <Pressable style={[styles.link, { bottom: insets.bottom + 18 }]} onPress={lift} accessibilityRole="button" accessibilityLabel={t('morning.develop')} testID="develop" hitSlop={8}>
            <KText style={[styles.linkText, { color: PALETTE.night.textSub }]}>{t('morning.develop')}</KText>
          </Pressable>
        </>
      )}

      {developed && (
        <Animated.View style={[styles.card, { top: cardTop, left: (width - cardW) / 2, width: cardW, height: cardH }, cardSt]} testID="dream-card">
          {cardLive && <DreamCard card={developed.card} strokes={cardStrokes} labels={labels} width={cardW} a11yLabel={cardA11y(developed.card, text)} />}
        </Animated.View>
      )}
      {developed && (
        <Animated.View style={[styles.cardText, { top: cardTop + cardH + 14 }, textSt]} pointerEvents="box-none" onLayout={(e) => setTextH(Math.ceil(e.nativeEvent.layout.height))}>
          {/* 카드 위 글은 인화(공유용)라 작다. 읽는 글은 여기 — 스크린리더는 카드 설명에서 같은 문장을 읽으므로 숨긴다 */}
          <KText style={[styles.lineText, { maxWidth: Math.min(width - 32, cardW + 40) }]} maxFontSizeMultiplier={1.5} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            {text}
          </KText>
          {developed.card.nightsMerged > 1 && <KText style={styles.sub}>{t('morning.merged', { n: developed.card.nightsMerged })}</KText>}
          {labels && <ShareBar input={{ card: developed.card, strokes: cardStrokes, labels }} ireState={developed.line.kind === 'seven-day' ? state : null} />}
        </Animated.View>
      )}
      {developed && (
        <Pressable style={[styles.link, { bottom: insets.bottom + 18 }]} onPress={onDone} accessibilityRole="button" accessibilityLabel={t('morning.done.a11y')} testID="card-done" hitSlop={8}>
          <KText style={styles.linkText}>{t('morning.done')}</KText>
        </Pressable>
      )}
    </View>
  );
}

/** 물 위의 젖은 한지: 한지 셰이더 + 젖어 어두운 가장자리 + 물 반사 한 줄(평평한 사각형 대신, 리뷰 U7) */
function WetSheet({ w, h }: { w: number; h: number }) {
  return (
    <Canvas style={{ width: w, height: h }}>
      <Paper width={w} height={h} />
      <RoundedRect x={1} y={1} width={w - 2} height={h - 2} r={3} style="stroke" strokeWidth={7} color="#8F8676" opacity={0.45}>
        <BlurMask blur={6} style="normal" />
      </RoundedRect>
      <Oval x={w * 0.1} y={h * 0.08} width={w * 0.5} height={h * 0.05} color="#FFFFFF" opacity={0.18}>
        <BlurMask blur={5} style="normal" />
      </Oval>
    </Canvas>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  sheet: { position: 'absolute', borderRadius: 3, overflow: 'hidden' },
  link: { position: 'absolute', alignSelf: 'center', minHeight: 44, minWidth: 88, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center' },
  linkText: { fontFamily: SANS, fontSize: 14, color: PALETTE.day.textSub, textDecorationLine: 'underline' },
  btn: {
    position: 'absolute',
    bottom: 56,
    alignSelf: 'center',
    minHeight: 48,
    minWidth: 140,
    paddingHorizontal: 20,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(233,226,210,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(233,226,210,0.5)',
  },
  btnInline: { position: 'relative', bottom: 0, marginTop: 20, backgroundColor: 'rgba(43,42,40,0.06)', borderColor: 'rgba(43,42,40,0.25)' },
  btnText: { fontFamily: SANS, fontSize: 15, color: PALETTE.day.textSub, letterSpacing: 1 },
  card: { position: 'absolute', borderRadius: 3, overflow: 'hidden' },
  cardText: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 16 },
  lineText: { marginTop: 0, textAlign: 'center', fontFamily: SERIF, fontSize: 16, lineHeight: 26, color: PALETTE.day.text, letterSpacing: track.serif(16) },
  sub: { marginTop: 8, fontFamily: SANS, fontSize: 12, color: PALETTE.day.textSub },
});
