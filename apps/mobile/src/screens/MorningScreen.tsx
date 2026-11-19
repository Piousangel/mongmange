import { BlurMask, Canvas, Circle, Fill, Group, Oval, Path, RadialGradient, RoundedRect, Skia, vec } from '@shopify/react-native-skia';
import { COMB_REST, PALETTE, grammarOf, selectVisual, sim } from '@mong/core';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { gazeOffset, type Gaze } from '../render/gaze';
import { blinkAt, breathAt } from '../render/idle';
import { Mongmangi, REST_FRAME, type BodyFrame } from '../render/Mongmangi';
import { KText, track } from '../ui/type';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { MOTIF_NAMES, dayName, morningLine } from '../game/text';
import { PARAMS, clamp01, clock, easeOut } from '../render/clock';
import { NightWater } from './HomeScreen';
import { Paper, SANS, SERIF, layout, styles as ui } from './ui';

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
  const cardSt = useAnimatedStyle(() => ({ opacity: cardK.value, transform: [{ translateY: (1 - cardK.value) * 16 }] }));

  const insets = useSafeAreaInsets();
  const L = layout(width, height);
  const sheetW = Math.min(width * 0.5, 240, height * 0.24);
  const sheetH = sheetW * 1.25;
  const sheetTop = insets.top + height * 0.17;
  const cardW = Math.min(width * 0.62, 300, height * 0.34);
  const cardH = cardW * 1.25;
  const text = developed ? morningLine(developed.line, developed.card) : '';
  const motif = developed ? (MOTIF_NAMES[developed.card.motifId] ?? '꿈') : '';

  // 몽망이: 수면 위에서 깨어나 한지를 함께 본다(리뷰 U7). 물이 빠지면 낮 먹색으로
  const grammar = useMemo(() => grammarOf(PARAMS.grammar), []);
  const s = selectVisual({ phase: 'awake', strokes: state.strokes }).coreScale;
  const mongY = height * 0.83;
  const wpx = L.wpx * 0.8;
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
        <KText style={[ui.line, { top: insets.top + height * 0.07, color: PALETTE.night.text, fontSize: 17, letterSpacing: track.serif(17) }]} pointerEvents="none" accessibilityRole="header">
          {dayName(state.dayIndex)} 아침
        </KText>
      )}

      <GestureDetector gesture={pan}>
        <Animated.View
          style={[styles.sheet, { width: sheetW, height: sheetH, left: (width - sheetW) / 2, top: sheetTop }, sheetSt]}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="물 위에 뜬 한지"
          accessibilityHint="위로 쓸어 건져 올리세요"
          accessibilityActions={[{ name: 'increment', label: '건져 올리기' }, { name: 'activate', label: '건져 올리기' }]}
          onAccessibilityAction={lift}
          testID="dream-sheet"
        >
          <WetSheet w={sheetW} h={sheetH} />
        </Animated.View>
      </GestureDetector>

      {!lifted && (
        <>
          <KText style={[ui.line, { top: sheetTop + sheetH + 28, color: PALETTE.night.textSub, fontFamily: SERIF }]} pointerEvents="none">
            물 위의 한지를 위로 건져 올려요
          </KText>
          <Pressable style={[styles.link, { bottom: insets.bottom + 18 }]} onPress={lift} accessibilityRole="button" accessibilityLabel="꿈 꺼내기" testID="develop" hitSlop={8}>
            <KText style={[styles.linkText, { color: PALETTE.night.textSub }]}>꿈 꺼내기</KText>
          </Pressable>
        </>
      )}

      {developed && (
        <Animated.View style={[styles.cardWrap, { paddingTop: insets.top + 28 }, cardSt]} testID="dream-card" pointerEvents="box-none">
          <View accessible accessibilityLabel={`인화 카드, ${motif}. ${text}`}>
            <DreamCardArt card={developed.card} w={cardW} h={cardH} />
            <KText style={[styles.motif, { width: cardW }]}>{motif}</KText>
          </View>
          <KText style={[styles.lineText, { maxWidth: Math.min(width - 32, cardW + 60) }]}>{text}</KText>
          {developed.card.nightsMerged > 1 && <KText style={styles.sub}>긴 잠 · 밤 {developed.card.nightsMerged}개를 한 장에</KText>}
        </Animated.View>
      )}
      {developed && (
        <Pressable style={[styles.link, { bottom: insets.bottom + 18 }]} onPress={onDone} accessibilityRole="button" accessibilityLabel="낮으로, 몽망이와 하루 시작하기" testID="card-done" hitSlop={8}>
          <KText style={styles.linkText}>낮으로</KText>
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

/** 인화 카드(MVP 자리표시 그림): 먹 톤 = inkTone, 물결 = flow, 구도 = composition. 모티프 그림은 아트 작업 대기 */
function DreamCardArt({ card, w, h }: { card: sim.DreamCard; w: number; h: number }) {
  const tone = Math.round(0x6a - 0x4a * card.inkTone);
  const ink = `rgb(${tone},${tone + 2},${tone + 8})`;
  const cx = w * [0.5, 0.36, 0.64][card.composition]!;
  const cy = h * 0.46;
  const waves = useMemo(() => {
    const out: string[] = [];
    const n = card.flow > 0 ? 6 : 3;
    const amp = card.flow > 0 ? 3 : 9;
    const len = card.flow > 0 ? 18 : 60;
    for (let i = 0; i < n; i++) {
      const y = h * (0.66 + (0.26 * i) / n);
      let d = `M 0 ${y.toFixed(1)}`;
      for (let x = 0; x <= w; x += 6) d += ` L ${x} ${(y + Math.sin(x / len + card.flowSeed + i) * amp).toFixed(1)}`;
      out.push(d);
    }
    return out.map((d) => Skia.Path.MakeFromSVGString(d)!);
  }, [card.flow, card.flowSeed, w, h]);
  return (
    <Canvas style={{ width: w, height: h, borderRadius: 4 }}>
      <Fill color="#F2ECE0" />
      <Group>
        <Circle cx={cx} cy={cy} r={w * 0.24}>
          <RadialGradient c={vec(cx, cy)} r={w * 0.24} colors={[ink, 'rgba(120,118,112,0.05)']} />
        </Circle>
        <Oval x={cx - w * 0.3} y={cy + w * 0.2} width={w * 0.6} height={w * 0.08} color={ink} opacity={0.18} />
        {waves.map((p, i) => (
          <Path key={i} path={p} style="stroke" strokeWidth={1} color={ink} opacity={0.35} />
        ))}
      </Group>
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
  cardWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', paddingHorizontal: 16 },
  motif: { position: 'absolute', top: 14, textAlign: 'center', fontFamily: SERIF, fontSize: 13, color: '#6B625A', letterSpacing: 2 },
  lineText: { marginTop: 18, textAlign: 'center', fontFamily: SERIF, fontSize: 16, lineHeight: 26, color: PALETTE.day.text, letterSpacing: track.serif(16) },
  sub: { marginTop: 8, fontFamily: SANS, fontSize: 12, color: PALETTE.day.textSub },
});
