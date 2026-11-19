import { Canvas, Group, Path, Rect, Shader } from '@shopify/react-native-skia';
import { COMB_REST, PALETTE, grammarOf, selectVisual, sim } from '@mong/core';
import { useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PARAMS, clamp01, clock, ease, easeOut, springStep } from '../render/clock';
import { NO_GAZE, gazeOffset, type Gaze } from '../render/gaze';
import { blinkAt, breathAt, wobble } from '../render/idle';
import { Mongmangi, REST_FRAME, type BodyFrame } from '../render/Mongmangi';
import { tideFx } from '../render/shaders';
import { dayName, wakeClock } from '../game/text';
import { KText, track, useFontScale } from '../ui/type';
import { NightRings, NightWater } from './HomeScreen';
import { ObjectIcons, Paper, SANS, SERIF, VerticalTitle, inkPool, layout, styles as ui } from './ui';

const RM = PARAMS.rm;
const TIDE_MS = RM ? 400 : 2400;
const HOLD_MIN_MS = sim.LEDGER.holdMinMs;

export interface HomeActions {
  onBrush: () => void;
  /** 붓이 막혀 있을 때(오늘 이미 그음) — 긋기 모드에 들어가지 않는다(리뷰 U5) */
  onBrushBlocked: () => void;
  onGrindStart: () => void;
  onGrindEnd: (ms: number) => void;
  onSleep: () => void;
  /** 몽망이 탭(holdMs < holdMinMs) 또는 문지르기. moveSpeed = 누르는 동안 미세 이동 W/s(리뷰 C5) */
  onPet: (x: number, y: number, holdMs: number, moveSpeed: number) => void;
  onRubStart: () => void;
  onPaper: (x: number, y: number) => void;
  onNote: () => void;
}

/** 첫 30초 뒤 사물이 차례로 나온다(아트 11절, 리뷰 U6): 'first' = 첫 획 전(붓만), 'all' = 그 뒤 */
export type RevealStage = 'first' | 'all';

/**
 * 낮 홈 ↔ 밤(앱 흐름판). 보이는 것은 모두 sim 상태에서 읽는다: 획 = state.strokes, 낮/밤 = state.phase,
 * 붓 = sim.strokeBlock, 벼루 먹물 = sim.grindLevel, 연적 졸림 = sim.canPutToSleep. 규칙 판정은 sim이 한다.
 */
export function GameHome({
  state,
  now,
  actions,
  line,
  listView,
  soothe,
  reveal,
  animateReveal,
}: {
  state: sim.State;
  now: number;
  actions: HomeActions;
  /** 잠깐 보이는 한 줄(안내·반응). 빈 문자열이면 없음 */
  line: string;
  listView: boolean;
  /** 첫 밤 안심 문구를 보일까(systems 3.7) */
  soothe: boolean;
  reveal: RevealStage;
  /** 이 단계에 처음 들어왔으면 차례로 나타나는 연출 */
  animateReveal: boolean;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const fs = useFontScale();
  const L = layout(width, height);
  const asleep = state.phase === 'asleep';
  const records = state.strokes;
  const grammar = useMemo(() => grammarOf(PARAMS.grammar), []);
  const vis = selectVisual({ phase: state.phase, strokes: records });
  const s = vis.coreScale;
  const ox = L.cx;
  const oy = L.oyFor(s);

  // 조수: 마운트 때 이미 자고 있으면 다 찬 상태, 낮 → 밤으로 바뀌면 그때부터 2400ms
  const tideAt = useSharedValue(asleep ? -1e9 : 1e12);
  const nightAt = useSharedValue(asleep ? clock.value : 1e12);
  const wasAsleep = useRef(asleep);
  useEffect(() => {
    if (asleep && !wasAsleep.current) {
      tideAt.value = clock.value;
      nightAt.value = clock.value + TIDE_MS;
    }
    if (!asleep) {
      tideAt.value = 1e12;
      nightAt.value = 1e12;
    }
    wasAsleep.current = asleep;
  }, [asleep, tideAt, nightAt]);

  const gaze = useSharedValue<Gaze>(NO_GAZE);
  const petAt = useSharedValue(-1e9);
  const shakeAt = useSharedValue(-1e9);
  const rubbing = useSharedValue(0);
  const ripple = useSharedValue({ x: 0, y: 0, at: -1e9 });
  const mountAt = useSharedValue(animateReveal ? clock.value : -1e9);

  const level = useDerivedValue(() => (RM ? clamp01((clock.value - tideAt.value) / TIDE_MS) : ease((clock.value - tideAt.value) / TIDE_MS)));
  const nightK = useDerivedValue(() => (RM ? level.value : clamp01((level.value - 0.3) / 0.35)));

  const frame = useDerivedValue<BodyFrame>(() => {
    const t = clock.value;
    const nk = nightK.value;
    const b = RM ? 0 : breathAt(t, nk > 0.5 ? 4400 : 3200);
    const g = gazeOffset(gaze.value, t, ox, oy, L.wpx);
    const bl = nk > 0.5 ? 0 : blinkAt(t);
    const bob = nk * Math.sin(t / 1400) * 0.012;
    let sx = 1 - 0.01 * b + 0.04 * nk;
    let sy = 1 + 0.02 * b - 0.04 * nk;
    // 쓰다듬기: 눌림 0.9 · 100ms → 복원(아트 8절)
    const pd = t - petAt.value;
    if (pd >= 0 && pd < 900) {
      const pk = pd < 100 ? pd / 100 : 1 - springStep(pd - 100);
      sy *= 1 - (RM ? 0.06 : 0.1) * pk;
      sx *= 1 + (RM ? 0.03 : 0.05) * pk;
    }
    // 붓이 막혔을 때: 붓 쪽을 보고 작게 고개를 젓는다(700ms)
    const sd = t - shakeAt.value;
    const shake = !RM && sd >= 0 && sd < 700 ? 0.07 * wobble(sd, 3, 4) : 0;
    // 문지르기: 번짐이 1.2초 주기로 숨 쉼, 눈은 기쁨 호
    const rub = rubbing.value;
    const bleed = 1 + rub * (RM ? 0.15 : 0.15 + 0.15 * Math.sin((t / 1200) * Math.PI * 2));
    return {
      ...REST_FRAME,
      ox,
      oy: oy - bob * L.wpx,
      wpx: L.wpx,
      s,
      combN: records.length,
      comb: { ...COMB_REST, angle: COMB_REST.angle - 18 * nk, wobble0: b * 1.2, wobble1: b * 0.9, wobble2: b * 0.6 },
      sx,
      sy,
      tilt: g.tilt + shake,
      gx: g.gx * (1 - nk),
      gy: g.gy * (1 - nk),
      blink: bl,
      eyeA: 'open',
      eyeB: nk > 0 ? 'closed' : 'joy',
      eyeMix: nk > 0 ? nk : rub,
      night: nk,
      bleed,
      ringAlpha: 1 - nk,
      attachK: records.map(() => 1),
      fresh: records.map(() => 0),
    };
  });

  // 등장 순서(첫 획 전: 붓만 / 그 뒤: 낙관 '탁' → 제목 → 벼루 → 연적). 등장이 끝나기 전에는 누를 수 없다
  const DELAYS = reveal === 'first' ? [300, Infinity, Infinity] : [0, 1200, 2000];
  const shown = [0, 1, 2].map((i) => DELAYS[i]! !== Infinity);
  const blocked = sim.strokeBlock(state) !== null;
  const alpha = useDerivedValue(() => {
    const t = clock.value - mountAt.value;
    return DELAYS.map((d, i) => {
      if (d === Infinity) return 0;
      const k = RM ? (t >= d ? 1 : 0) : easeOut((t - d) / 600);
      // 오늘 획을 그었으면 붓은 옅게(라벨 글자 대신 상태를 그림으로)
      return k * (i === 0 && blocked ? 0.45 : 1);
    });
  });
  const sealSt = useAnimatedStyle(() => {
    const d = clock.value - mountAt.value - 400;
    const k = RM ? (d >= 0 ? 1 : 0) : clamp01(d / 160);
    return { opacity: reveal === 'first' ? 0 : k, transform: [{ scale: reveal === 'first' ? 1 : 1.35 - 0.35 * k }] };
  });
  const titleSt = useAnimatedStyle(() => ({ opacity: reveal === 'first' ? 0 : RM ? 1 : easeOut((clock.value - mountAt.value - 600) / 600) }));

  const tideU = useDerivedValue(() => ({ res: [width, height], level: level.value, time: clock.value / 1000 }));
  const dim = useDerivedValue(() => nightK.value);
  const grindK = sim.grindLevel(state);
  const xs = [width * 0.2, width * 0.5, width * 0.8];
  // 사물 중심 간격 = 폭 30% → 터치 영역이 겹치지 않게(폭 320에서 92)
  const objW = Math.min(116, width * 0.3 - 4);
  const sleepy = !asleep && sim.canPutToSleep(state, now);
  const title = reveal === 'all' ? `몽망이·${dayName(state.dayIndex)}` : '';
  const bodyR = 0.75 * s * L.wpx;

  const look = (x: number, y: number, holdMs = 1500) => {
    gaze.value = { x, y, at: clock.value, holdMs };
  };
  const grindT = useRef(0);
  // 몽망이 누르기: 응답자 이벤트로 누른 시간과 미세 이동을 잰다(Pressable은 이동을 주지 않는다)
  const press = useRef<{ t0: number; x: number; y: number; dist: number; rub: boolean; timer: ReturnType<typeof setTimeout> | null } | null>(null);
  const onBodyGrant = (e: GestureResponderEvent) => {
    const { pageX: x, pageY: y } = e.nativeEvent;
    const p = { t0: Date.now(), x, y, dist: 0, rub: false, timer: null as ReturnType<typeof setTimeout> | null };
    p.timer = setTimeout(() => {
      if (asleep) return;
      p.rub = true;
      rubbing.value = 1;
      actions.onRubStart();
    }, HOLD_MIN_MS);
    press.current = p;
  };
  const onBodyMove = (e: GestureResponderEvent) => {
    const p = press.current;
    if (!p) return;
    const { pageX: x, pageY: y } = e.nativeEvent;
    p.dist += Math.hypot(x - p.x, y - p.y);
    p.x = x;
    p.y = y;
  };
  const onBodyRelease = () => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    if (p.timer) clearTimeout(p.timer);
    rubbing.value = 0;
    const hold = Date.now() - p.t0;
    if (asleep) {
      ripple.value = { x: p.x, y: p.y, at: clock.value };
      actions.onPaper(p.x, p.y);
      return;
    }
    if (hold < HOLD_MIN_MS) {
      petAt.value = clock.value;
      look(p.x, p.y, 800);
    }
    const moveSpeed = hold > 0 ? p.dist / L.wpx / (hold / 1000) : 0;
    actions.onPet(p.x, p.y, hold, moveSpeed);
  };

  const onBrushPress = () => {
    if (blocked) {
      look(xs[0]!, L.objectsY, 900);
      shakeAt.value = clock.value + 150;
      actions.onBrushBlocked();
    } else actions.onBrush();
  };

  const objs = [
    { name: '붓', label: '한 획', a11y: blocked ? '붓, 오늘의 한 획은 그었어요' : '붓, 오늘의 한 획 긋기' },
    { name: '벼루', label: '먹 갈기', a11y: '벼루, 먹 갈기. 누르고 있는 동안 먹을 갑니다' },
    { name: '연적', label: '물 한 방울', a11y: sleepy ? '연적, 물 한 방울, 몽망이가 졸려 해요' : '연적, 물 한 방울, 재우기' },
  ];
  const grindHandlers = {
    onPressIn: () => {
      grindT.current = Date.now();
      look(xs[1]!, L.objectsY, 1e9);
      actions.onGrindStart();
    },
    onPressOut: () => {
      look(xs[1]!, L.objectsY, 600);
      actions.onGrindEnd(Date.now() - grindT.current);
    },
  };

  const soothSt = useAnimatedStyle(() => {
    const dt = clock.value - nightAt.value;
    return { opacity: !soothe || dt < 0 ? 0 : dt < 400 ? dt / 400 : dt < 3000 ? 1 : Math.max(0, 1 - (dt - 3000) / 400) };
  });
  const wakeSt = useAnimatedStyle(() => {
    const dt = clock.value - nightAt.value - (soothe ? 3600 : 0);
    return { opacity: RM ? (dt >= 0 ? 1 : 0) : clamp01(dt / 600) };
  });
  const objTop = L.objectsY - 32;
  const bigText = fs >= 1.5;

  return (
    <View style={[styles.root, { backgroundColor: PALETTE.night.bg }]} testID="game-home">
      {asleep && <NightWater width={width} height={height} cx={ox} cy={oy} />}
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <Group layer>
          <Paper width={width} height={height} />
          <Rect x={0} y={0} width={width} height={height} blendMode="dstIn">
            <Shader source={tideFx} uniforms={tideU} />
          </Rect>
        </Group>
        {asleep && <NightRings frameOx={ox} frameOy={oy} wpx={L.wpx} s={s} nightK={nightK} ripple={ripple} strokes={records.length} />}
        <Mongmangi frame={frame} records={records} mode={PARAMS.body} grammar={grammar} />
        {!listView && <ObjectIcons width={width} y={L.objectsY} color={PALETTE.day.text} dim={dim} alpha={alpha} />}
        {!listView && !asleep && grindK > 0 && shown[1] && (
          <Group transform={[{ translateX: xs[1]! - 18 }, { translateY: L.objectsY - 18 }]}>
            <Path path={inkPool} color={PALETTE.day.body} opacity={0.15 + 0.7 * grindK} />
          </Group>
        )}
      </Canvas>

      {/* 종이(바탕) 탭 = 그쪽을 봄. 밤에는 잔물결만 */}
      <Pressable
        style={StyleSheet.absoluteFill}
        accessible={false}
        onPress={(e) => {
          const { locationX: x, locationY: y } = e.nativeEvent;
          if (asleep) ripple.value = { x, y, at: clock.value };
          else look(x, y);
          actions.onPaper(x, y);
        }}
      />

      {/* 몽망이: 탭 = 쓰다듬기, 길게 누르기 = 문지르기(sim holdMinMs) */}
      <View
        testID="mong-body"
        style={{ position: 'absolute', left: ox - bodyR * 1.3, top: oy - bodyR, width: bodyR * 2.6, height: bodyR * 2 }}
        accessible
        accessibilityRole="button"
        accessibilityLabel={`몽망이, ${dayName(state.dayIndex)}, ${asleep ? '자는 중' : sleepy ? '졸림' : '깨어 있음'}`}
        accessibilityHint={asleep ? '자고 있어요. 건드리면 잔물결만 일어요' : '두 번 눌러 쓰다듬기'}
        accessibilityActions={[
          { name: 'activate', label: '쓰다듬기' },
          { name: 'longpress', label: '문지르기' },
        ]}
        onAccessibilityAction={(e) => {
          if (asleep) return;
          if (e.nativeEvent.actionName === 'longpress') actions.onPet(ox, oy, HOLD_MIN_MS * 2, 0);
          else {
            petAt.value = clock.value;
            actions.onPet(ox, oy, 0, 0);
          }
        }}
        onStartShouldSetResponder={() => true}
        onResponderGrant={onBodyGrant}
        onResponderMove={onBodyMove}
        onResponderRelease={onBodyRelease}
        onResponderTerminate={onBodyRelease}
      />

      {/* 사물 3개(D-08). 밤에는 흐릿하게 잠김. 라벨은 한 줄, 상태는 그림과 스크린리더 문구로 */}
      {!listView &&
        objs.map((o, i) =>
          shown[i] ? (
            <Pressable
              key={o.name}
              testID={`obj-${o.name}`}
              disabled={asleep}
              style={[styles.obj, { width: objW, left: xs[i]! - objW / 2, top: objTop }]}
              accessibilityRole="button"
              accessibilityLabel={o.a11y}
              accessibilityState={{ disabled: asleep }}
              {...(i === 1 ? grindHandlers : {})}
              onPress={() => {
                if (i === 0) onBrushPress();
                if (i === 2) actions.onSleep();
              }}
            >
              <View style={{ height: 64, alignItems: 'center', justifyContent: 'center' }}>{i === 2 && sleepy && <Breath />}</View>
              <ObjLabel text={o.label} i={i} alpha={alpha} asleep={asleep} small={bigText} />
            </Pressable>
          ) : null,
        )}

      {/* 목록으로 보기(D-08): 사물 UI 대신 평범한 버튼 */}
      {listView && !asleep && (
        <View style={[styles.list, { bottom: insets.bottom + 24 }]}>
          {objs.map((o, i) => (
            <Pressable
              key={o.name}
              style={styles.listBtn}
              accessibilityRole="button"
              accessibilityLabel={o.a11y}
              {...(i === 1 ? grindHandlers : {})}
              onPress={() => {
                if (i === 0) onBrushPress();
                if (i === 2) actions.onSleep();
              }}
            >
              <KText style={styles.listText}>
                {o.name} · {o.label}
                {i === 1 ? ' (누르고 있기)' : ''}
              </KText>
            </Pressable>
          ))}
        </View>
      )}

      {!asleep && title !== '' && (
        <Animated.View style={[StyleSheet.absoluteFill, titleSt]} pointerEvents="none">
          <VerticalTitle text={title} color={PALETTE.day.text} seal={false} top={insets.top + height * 0.1} />
        </Animated.View>
      )}
      {/* 공방 노트 입구 = 주사 낙관(첫 획 뒤 '탁' 찍힘) */}
      {reveal === 'all' && (
        <Animated.View style={[styles.seal, { top: insets.top + 14 }, sealSt, asleep && { opacity: 0.55 }]}>
          <Pressable onPress={actions.onNote} style={styles.sealHit} accessibilityRole="button" accessibilityLabel="공방 노트" testID="seal" hitSlop={10}>
            <KText style={ui.sealText} maxFontSizeMultiplier={1}>
              몽
            </KText>
          </Pressable>
        </Animated.View>
      )}

      {asleep && (
        <>
          <KText style={[ui.line, { top: insets.top + height * 0.1, color: PALETTE.night.text, fontSize: 17, letterSpacing: track.serif(17) }]} pointerEvents="none" accessibilityRole="header">
            {state.dayIndex === 0 ? '첫 밤' : `${dayName(state.dayIndex)} 밤`}
          </KText>
          <Animated.View style={[styles.nightLine, soothSt]} pointerEvents="none">
            <KText style={[ui.line, styles.nightText]}>물에 풀린 먹은 아침이면 다시 몸으로 돌아와요</KText>
          </Animated.View>
          <Animated.View style={[styles.nightLine, wakeSt]} pointerEvents="none">
            <KText style={[ui.line, styles.nightText]}>몽망이는 아직 자고 있어요 · {wakeClock(sim.wakeableAt(state), state.clock.tzOffsetMin)} 깨요</KText>
          </Animated.View>
        </>
      )}
      {line !== '' && (
        <KText style={[ui.line, styles.line, { color: asleep ? PALETTE.night.textSub : PALETTE.day.textSub }]} accessibilityLiveRegion="polite" testID="home-line">
          {line}
        </KText>
      )}
    </View>
  );
}

function ObjLabel({ text, i, alpha, asleep, small }: { text: string; i: number; alpha: { value: number[] }; asleep: boolean; small: boolean }) {
  const st = useAnimatedStyle(() => ({ opacity: Math.min(alpha.value[i] ?? 1, 1) * (asleep ? 0.4 : 1) }));
  return (
    <Animated.View style={st}>
      <KText style={[styles.objLabel, { color: asleep ? PALETTE.night.textSub : PALETTE.day.textSub }, small && { fontSize: 12 }]} numberOfLines={2}>
        {text}
      </KText>
    </Animated.View>
  );
}

/** 졸릴 때 연적이 숨 쉬듯 밝아짐(2.4초) */
function Breath() {
  const st = useAnimatedStyle(() => ({ opacity: RM ? 0.4 : 0.15 + 0.3 * (0.5 + 0.5 * Math.sin((clock.value / 2400) * Math.PI * 2)) }));
  return <Animated.View pointerEvents="none" style={[styles.breath, st]} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  obj: { position: 'absolute', minHeight: 88, alignItems: 'center' },
  objLabel: { fontFamily: SANS, fontSize: 13, letterSpacing: track.sans, textAlign: 'center' },
  breath: { width: 52, height: 52, borderRadius: 26, backgroundColor: PALETTE.day.wash },
  list: { position: 'absolute', left: 16, right: 16, gap: 8 },
  listBtn: { minHeight: 52, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 10, backgroundColor: 'rgba(43,42,40,0.07)' },
  listText: { fontFamily: SANS, fontSize: 15, color: PALETTE.day.text },
  seal: { position: 'absolute', right: 22, width: 30, height: 30, backgroundColor: PALETTE.day.accent, borderRadius: 3 },
  sealHit: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  line: { top: '30%' },
  nightLine: { position: 'absolute', left: 0, right: 0, top: '21%' },
  nightText: { position: 'relative', color: PALETTE.night.textSub, fontFamily: SERIF },
});
