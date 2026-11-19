import { Canvas, Fill, Group, Oval, Rect, Shader } from '@shopify/react-native-skia';
import { COMB_REST, PALETTE, day7ClumsyRecords, day7Records, grammarOf, selectVisual } from '@mong/core';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { GestureDetector, useTapGesture } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { PARAMS, clamp01, clock, ease } from '../render/clock';
import { NO_GAZE, gazeOffset, type Gaze } from '../render/gaze';
import { blinkAt, breathAt } from '../render/idle';
import { Mongmangi, REST_FRAME, type BodyFrame } from '../render/Mongmangi';
import { nightFx, tideFx } from '../render/shaders';
import { ObjectIcons, ObjectLabels, Paper, SERIF, VerticalTitle, layout, styles as ui } from './ui';

const TIDE_MS = PARAMS.rm ? 400 : 2400;

/**
 * 낮 홈 ↔ 밤 수면. 연적 탭 → 아래에서 조수 2400ms(아트 5절). 몽망이를 물로 끌어다 넣는 조작은 없다.
 * ?screen=night 이면 밤으로 시작(첫 밤 안심 문구 3초 포함).
 */
export function HomeScreen({ day, startNight }: { day: number; startNight: boolean }) {
  const { width, height } = useWindowDimensions();
  const L = layout(width, height);
  const records = useMemo(() => (day >= 7 ? (PARAMS.pose === 'clumsy' ? day7ClumsyRecords : day7Records)(PARAMS.attach) : []), [day]);
  const grammar = useMemo(() => grammarOf(PARAMS.grammar), []);
  const vis = selectVisual({ phase: 'awake', strokes: records });
  const s = vis.coreScale;
  const ox = L.cx;
  const oy = L.oyFor(s);

  const tideAt = useSharedValue(startNight ? -1e9 : 1e12);
  const gaze = useSharedValue<Gaze>(NO_GAZE);
  const ripple = useSharedValue({ x: 0, y: 0, at: -1e9 });
  const [phase, setPhase] = useState<'day' | 'tide' | 'night'>(startNight ? 'night' : 'day');
  const nightAt = useSharedValue(startNight ? 0 : 1e12);

  const level = useDerivedValue(() => (PARAMS.rm ? clamp01((clock.value - tideAt.value) / TIDE_MS) : ease((clock.value - tideAt.value) / TIDE_MS)));
  const nightK = useDerivedValue(() => (PARAMS.rm ? level.value : clamp01((level.value - 0.3) / 0.35)));

  useAnimatedReaction(
    () => level.value >= 1,
    (done, prev) => {
      if (done && !prev) {
        if (nightAt.value > 1e11) nightAt.value = clock.value;
        runOnJS(setPhase)('night');
      }
    },
  );

  const tap = useTapGesture({
    onActivate: (e) => {
      'worklet';
      const t = clock.value;
      if (level.value <= 0 && Math.abs(e.x - width * 0.8) < 34 && Math.abs(e.y - L.objectsY) < 40) {
        tideAt.value = t; // 연적 = 물 한 방울: 물이 몽망이에게 온다
        runOnJS(setPhase)('tide');
        return;
      }
      if (level.value >= 1) {
        ripple.value = { x: e.x, y: e.y, at: t }; // 밤 수면 터치: 잔물결만, 눈은 뜨지 않음
        return;
      }
      gaze.value = { x: e.x, y: e.y, at: t, holdMs: 1500 };
    },
  });

  const frame = useDerivedValue<BodyFrame>(() => {
    const t = clock.value;
    const nk = nightK.value;
    const b = PARAMS.rm ? 0 : breathAt(t, nk > 0.5 ? 4400 : 3200);
    const g = gazeOffset(gaze.value, t, ox, oy, L.wpx);
    const bl = nk > 0.5 ? 0 : blinkAt(t);
    // 밤: 수면 위에 떠서 아주 천천히 오르내림(잠기지 않음)
    const bob = nk * Math.sin(t / 1400) * 0.012;
    return {
      ...REST_FRAME,
      ox,
      oy: oy - bob * L.wpx,
      wpx: L.wpx,
      s,
      combN: records.length,
      comb: { ...COMB_REST, angle: COMB_REST.angle - 18 * nk, wobble0: b * 1.2, wobble1: b * 0.9, wobble2: b * 0.6 },
      sx: 1 - 0.01 * b + 0.04 * nk,
      sy: 1 + 0.02 * b - 0.04 * nk,
      tilt: g.tilt,
      gx: g.gx * (1 - nk),
      gy: g.gy * (1 - nk),
      blink: bl,
      eyeA: 'open',
      eyeB: 'closed',
      eyeMix: nk,
      night: nk,
      ringAlpha: 1 - nk,
      attachK: records.map(() => 1),
      fresh: records.map(() => 0),
    };
  });

  // 조수 마스크: 알파 1 = 아직 한지
  const tideU = useDerivedValue(() => ({ res: [width, height], level: level.value, time: clock.value / 1000 }));
  const dim = useDerivedValue(() => nightK.value);
  const title = day >= 7 ? '몽망이·이레째' : '';

  return (
    <GestureDetector gesture={tap}>
      <View style={[styles.root, { backgroundColor: PALETTE.night.bg }]} testID="home">
        {phase !== 'day' && <NightWater width={width} height={height} cx={ox} cy={oy} />}
        <Canvas style={StyleSheet.absoluteFill}>
          <Group layer>
            <Paper width={width} height={height} />
            {/* 조수: 아래에서 위로 물이 차오른다 */}
            <Rect x={0} y={0} width={width} height={height} blendMode="dstIn">
              <Shader source={tideFx} uniforms={tideU} />
            </Rect>
          </Group>
          {phase !== 'day' && <NightRings frameOx={ox} frameOy={oy} wpx={L.wpx} s={s} nightK={nightK} ripple={ripple} strokes={records.length} />}
          <Mongmangi frame={frame} records={records} mode={PARAMS.body} grammar={grammar} />
          <ObjectIcons width={width} y={L.objectsY} color={PALETTE.day.text} dim={dim} />
        </Canvas>
        {phase === 'day' && <ObjectLabels width={width} y={L.objectsY} color={PALETTE.day.textSub} />}
        {phase === 'day' && title !== '' && <VerticalTitle text={title} color={PALETTE.day.text} />}
        {phase === 'night' && (
          <>
            <Text style={[ui.line, { top: '14%', color: PALETTE.night.text, fontSize: 16 }]} pointerEvents="none">
              {day >= 7 ? '이레째 밤' : '첫 밤'}
            </Text>
            <Soothe since={nightAt} />
          </>
        )}
      </View>
    </GestureDetector>
  );
}

/** 첫 밤 안심 문구 3초(아트 5절) — 조수가 다 찬 뒤부터 시계 기준 */
function Soothe({ since }: { since: { value: number } }) {
  const st = useAnimatedStyle(() => {
    const dt = clock.value - since.value;
    return { opacity: dt < 0 ? 0 : dt < 400 ? dt / 400 : dt < 3000 ? 1 : Math.max(0, 1 - (dt - 3000) / 400) };
  });
  return (
    <Animated.Text style={[ui.line, { bottom: '25%', color: PALETTE.night.textSub, fontFamily: SERIF }, st]} pointerEvents="none">
      물에 풀린 먹은 아침이면 다시 몸으로 돌아와요
    </Animated.Text>
  );
}

/** 밤 수면: 화면 nres(기본 0.5 → 픽셀 1/4) 해상도 별도 캔버스를 늘려 붙인다(D-11 기본값) */
export function NightWater({ width, height, cx, cy }: { width: number; height: number; cx: number; cy: number }) {
  const k = PARAMS.nres;
  const w = Math.ceil(width * k);
  const h = Math.ceil(height * k);
  const u = useDerivedValue(() => ({ res: [w, h], time: clock.value / 1000, center: [cx * k, cy * k], octaves: PARAMS.octaves }));
  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} pointerEvents="none">
      <View style={{ width: w, height: h, transform: [{ translateX: (width - w) / 2 }, { translateY: (height - h) / 2 }, { scale: 1 / k }] }}>
        <Canvas style={{ width: w, height: h }} opaque>
          <Fill>
            <Shader source={nightFx} uniforms={u} />
          </Fill>
        </Canvas>
      </View>
    </View>
  );
}

/** 몸 둘레 물결 고리(6초 주기, 그날 획 수만큼 최대 3개) + 터치 잔물결 */
export function NightRings({
  frameOx,
  frameOy,
  wpx,
  s,
  nightK,
  ripple,
  strokes,
}: {
  frameOx: number;
  frameOy: number;
  wpx: number;
  s: number;
  nightK: { value: number };
  ripple: { value: { x: number; y: number; at: number } };
  strokes: number;
}) {
  const n = Math.max(1, Math.min(3, strokes || 1));
  const groundY = frameOy + 0.4 * s * wpx;
  const rings = Array.from({ length: n }, (_, i) => i);
  return (
    <Group>
      {rings.map((i) => (
        <Ring key={i} i={i} n={n} cx={frameOx} cy={groundY - 0.05 * wpx} wpx={wpx * s} nightK={nightK} gold={i === 0} />
      ))}
      <TouchRipple ripple={ripple} wpx={wpx} />
    </Group>
  );
}

function Ring({ i, n, cx, cy, wpx, nightK, gold }: { i: number; n: number; cx: number; cy: number; wpx: number; nightK: { value: number }; gold: boolean }) {
  const ph = useDerivedValue(() => (((clock.value / 6000 + i / n) % 1) + 1) % 1);
  const rect = useDerivedValue(() => {
    const r = (0.75 + 1.3 * ph.value) * wpx;
    return { x: cx - r, y: cy - r * 0.26, width: r * 2, height: r * 0.52 };
  });
  const op = useDerivedValue(() => nightK.value * Math.sin(ph.value * Math.PI) * (gold ? 0.55 : 0.7));
  return <Oval rect={rect} style="stroke" strokeWidth={gold ? 0.8 : 1} color={gold ? PALETTE.night.gold : '#5A6282'} opacity={op} />;
}

function TouchRipple({ ripple, wpx }: { ripple: { value: { x: number; y: number; at: number } }; wpx: number }) {
  const rect = useDerivedValue(() => {
    const k = clamp01((clock.value - ripple.value.at) / 1400);
    const r = (0.1 + 0.9 * k) * wpx;
    return { x: ripple.value.x - r, y: ripple.value.y - r * 0.3, width: r * 2, height: r * 0.6 };
  });
  const op = useDerivedValue(() => {
    const k = clamp01((clock.value - ripple.value.at) / 1400);
    return k >= 1 ? 0 : (1 - k) * 0.7;
  });
  return <Oval rect={rect} style="stroke" strokeWidth={1} color="#6A7294" opacity={op} />;
}

const styles = StyleSheet.create({ root: { flex: 1 } });
