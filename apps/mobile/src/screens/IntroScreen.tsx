import { Canvas } from '@shopify/react-native-skia';
import { COMB_REST, PALETTE, grammarOf } from '@mong/core';
import { useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { GestureDetector, useTapGesture } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { PARAMS, clamp01, clock, ease, easeOut, springStep } from '../render/clock';
import { NO_GAZE, gazeOffset, type Gaze } from '../render/gaze';
import { blinkAt, blinkShape, breathAt, wobble } from '../render/idle';
import { Mongmangi, REST_FRAME, type BodyFrame } from '../render/Mongmangi';
import { Caption, Paper, SERIF, layout, styles as ui } from './ui';

const RM = PARAMS.rm;
const GRAMMAR = grammarOf(PARAMS.grammar);
const NEVER = 1e12;

/**
 * 첫 30초 중 0~16초(아트 11절): 빈 한지 → 방울 낙하 → 숨 → 빗 돋음 → "만져 볼래요?" → 첫 탭에 눈이 처음 열림
 * → 깜빡 → 탭한 자리 보기 → 정면 → 기쁨. 인터럽트 규칙: 첫 탭이 오면 그 순간이 0이 된다(리뷰 I9).
 */
export function IntroScreen() {
  const { width, height } = useWindowDimensions();
  const L = layout(width, height);
  const oy = L.oyFor(1);
  const t0 = useSharedValue(-1);
  const dropAt = useSharedValue(NEVER);
  const dropX = useSharedValue(L.cx);
  const openAt = useSharedValue(NEVER);
  const lastTap = useSharedValue({ x: L.cx, y: oy, at: -NEVER });
  const petAt = useSharedValue(-NEVER);
  const gaze = useSharedValue<Gaze>(NO_GAZE);
  const [caption, setCaption] = useState('');

  // 시작 시각 고정 + 기본 일정(탭이 없을 때)
  useAnimatedReaction(
    () => clock.value,
    (t) => {
      if (t0.value < 0) {
        t0.value = t;
        dropAt.value = t + 2000;
      }
    },
  );

  const landAt = useDerivedValue(() => dropAt.value + (RM ? 300 : 400));

  const tap = useTapGesture({
    onActivate: (e) => {
      'worklet';
      const t = clock.value;
      lastTap.value = { x: e.x, y: e.y, at: t };
      if (openAt.value < NEVER) {
        // 눈 열림 뒤 연타: 비트를 앞당기지 않고 쓰다듬기 반응 + 그쪽 보기만
        petAt.value = t;
        gaze.value = { x: e.x, y: e.y, at: t, holdMs: 1500 };
        return;
      }
      if (t < dropAt.value) {
        // 빈 한지에 탭: 탭한 자리 위에서 바로 떨어진다(가로 가운데 ±20%로 보정)
        dropAt.value = t;
        dropX.value = Math.min(Math.max(e.x, width * 0.3), width * 0.7);
      }
      openAt.value = Math.max(t, dropAt.value + (RM ? 300 : 400));
    },
  });

  const frame = useDerivedValue<BodyFrame>(() => {
    const t = clock.value;
    const land = landAt.value;
    const open = openAt.value;
    // 낙하(400ms, 가속) — 화면 위쪽에서
    let y = oy;
    let sx = 1;
    let sy = 1;
    let ink = 1;
    if (t < dropAt.value) ink = 0;
    else if (t < land) {
      const k = (t - dropAt.value) / 400;
      if (RM) {
        ink = clamp01((t - dropAt.value) / 300);
      } else {
        y = -0.1 * height + (oy + 0.1 * height) * k * k;
        sx = 0.82;
        sy = 1.18;
      }
    } else if (!RM) {
      // 착지: 눌렸다가 감쇠하며 돌아옴
      const d = t - land;
      const sq = Math.exp(-d / 140) * Math.cos(d / 55);
      sx = 1 + 0.16 * sq;
      sy = 1 - 0.2 * sq;
    }
    const alive = t >= land;
    const b = alive && !RM ? breathAt(t - land, 2800) : 0;
    sx *= 1 - 0.01 * b;
    sy *= 1 + 0.02 * b;
    // 기다림 떨림(6초, 9초): 진폭 0.02W, 짧게
    if (!RM && open >= NEVER) {
      const w6 = wobble(t - t0.value - 6000, 9, 5) + wobble(t - t0.value - 9000, 9, 5);
      sx += 0.02 * w6;
    }
    // 쓰다듬기 눌림 0.9 · 100ms → 복원
    const pd = t - petAt.value;
    if (pd >= 0 && pd < 900) {
      const pk = pd < 100 ? pd / 100 : 1 - springStep(pd - 100);
      sy *= 1 - (RM ? 0.06 : 0.1) * pk;
      sx *= 1 + (RM ? 0.03 : 0.05) * pk;
    }
    // 빗: 착지 0.8초 뒤 0.6초에 걸쳐 돋음
    const combStart = Math.max(land + 800, t0.value + 3200);
    const grow = RM ? (t >= combStart ? 1 : 0) : ease((t - combStart) / 600);
    // 눈: 처음엔 먹이 덮고 있다. 열림 = 먹이 갈라지는 시작 120ms + 완성 900ms
    let blink = 1;
    if (t >= open) {
      const d = t - open;
      blink = RM ? 1 - clamp01(d / 200) : 1 - (d < 120 ? 0.25 * easeOut(d / 120) : 0.25 + 0.75 * easeOut((d - 120) / 900));
      // 열린 뒤 한 번 깜빡(80/40/120) → 그다음은 아이들 깜빡임
      blink = Math.max(blink, blinkShape(d - 1150));
      if (d > 6000) blink = Math.max(blink, blinkAt(t, open + 3500));
    }
    // 시선: 열림 뒤 깜빡 다음, 방금 탭한 지점을 본다(200ms 지연) → 1.5초 뒤 정면
    let g = gaze.value;
    if (open < NEVER && g.at < open) g = { x: lastTap.value.x, y: lastTap.value.y, at: open + 1300, holdMs: 1500 };
    const go = gazeOffset(g, t, dropX.value, y, L.wpx);
    // 기쁨: 열림 + 5초(14초 비트), 눈 ^ ^, 눌림 0.85 → 1.08 → 1.0, 0.1W 뜸, 빗 2회 튕김(+120ms)
    const joyAt = open + 5000;
    const jd = t - joyAt;
    let eyeMix = 0;
    let hop = 0;
    let combAngle = COMB_REST.angle;
    let w0 = b * 1.2;
    let w1 = b;
    let w2 = b * 0.8;
    if (jd >= 0 && jd < 2200) {
      eyeMix = jd < 120 ? jd / 120 : jd < 1800 ? 1 : 1 - (jd - 1800) / 400;
      if (!RM) {
        const press = jd < 120 ? jd / 120 : 0;
        const rel = jd >= 120 ? springStep(jd - 120, 10, 260) : 0;
        const squash = jd < 120 ? 1 - 0.15 * press : 0.85 + 0.15 * rel + 0.08 * Math.sin(Math.min((jd - 120) / 450, 1) * Math.PI);
        sy *= squash;
        sx *= 1 + (1 - squash) * 0.6;
        const hk = (jd - 160) / 520;
        hop = hk > 0 && hk < 1 ? 0.1 * 4 * hk * (1 - hk) : 0;
        const cd = jd - 120;
        const flick = wobble(cd, 3.2, 2.2);
        combAngle += 20 * Math.max(flick, 0) + 6 * flick;
        w0 += 8 * wobble(cd, 3.2, 2.2);
        w1 += 8 * wobble(cd - 30, 3.2, 2.2);
        w2 += 8 * wobble(cd - 60, 3.2, 2.2);
      }
    }
    // 번짐 고리: 착지 800ms 퍼짐, 눈 열림 1400ms 한 번 더
    let ringScale = alive ? (RM ? 1 : 0.35 + 0.65 * easeOut((t - land) / 800)) : 0.3;
    if (t >= open && !RM) ringScale *= 1 + 0.22 * Math.sin(clamp01((t - open) / 1400) * Math.PI);
    if (hop > 0) ringScale *= 1 - hop * 1.5;
    return {
      ...REST_FRAME,
      ox: dropX.value,
      oy: y,
      wpx: L.wpx,
      s: 1,
      combN: 0,
      comb: { ...COMB_REST, grow, angle: combAngle, wobble0: w0, wobble1: w1, wobble2: w2 },
      sx,
      sy,
      hop,
      tilt: go.tilt,
      gx: go.gx,
      gy: go.gy,
      blink,
      eyeA: 'open',
      eyeB: 'joy',
      eyeMix,
      ink,
      ringScale,
      ringAlpha: alive ? 1 : 0,
    };
  });

  // 자막(소리·햅틱 타이밍) — 시계 기준으로 고른다
  useAnimatedReaction(
    () => {
      const t = clock.value;
      const land = landAt.value;
      const open = openAt.value;
      const t00 = t0.value;
      if (t >= open + 5000 && t < open + 6400) return "light 햅틱 ×2 · 허밍 3도 위";
      if (t >= open + 1300 && t < open + 2400) return "허밍 '응'";
      if (t >= open && t < open + 1300) return "soft 햅틱 · 허밍 '응?'";
      if (open >= NEVER && t >= t00 + 6000) return "낮은 허밍 '음…'";
      const combStart = Math.max(land + 800, t00 + 3200);
      if (t >= combStart && t < combStart + 900) return "아주 작은 '스—'";
      if (t >= land && t < land + 900) return "물방울 '톡' · soft 햅틱";
      if (t < (dropAt.value > t00 ? dropAt.value : t00 + 2000)) return '종이 위 공기음';
      return '';
    },
    (c, prev) => {
      if (c !== prev) runOnJS(setCaption)(c);
    },
  );

  const askStyle = useAnimatedStyle(() => {
    const t = clock.value;
    const show = openAt.value >= NEVER && t >= t0.value + 6000 ? clamp01((t - t0.value - 6000) / 400) : 0;
    return { opacity: show, top: oy - L.wpx * 0.95 };
  });

  return (
    <GestureDetector gesture={tap}>
      <View style={styles.root} testID="intro">
        <Canvas style={StyleSheet.absoluteFill} opaque>
          <Paper width={width} height={height} />
          <Mongmangi frame={frame} records={[]} mode={PARAMS.body} grammar={GRAMMAR} />
        </Canvas>
        <Animated.Text style={[ui.line, { color: PALETTE.day.textSub, fontFamily: SERIF, fontSize: 13 }, askStyle]} pointerEvents="none">
          만져 볼래요?
        </Animated.Text>
        <Caption text={caption} color={PALETTE.day.textSub} />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
