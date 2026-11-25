import { Canvas, Circle, Group, Path, Rect, Shader } from '@shopify/react-native-skia';
import { BASE_LOOK, COMB_REST, EYE, PALETTE, grammarOf, selectVisual, sim, type MongLook } from '@mong/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PARAMS, clamp01, clock, ease, easeOut, springStep } from '../render/clock';
import { NO_GAZE, gazeOffset, type Gaze } from '../render/gaze';
import { blinkAt, breathAt, wobble } from '../render/idle';
import { Mongmangi, REST_FRAME, type BodyFrame } from '../render/Mongmangi';
import { tideFx } from '../render/shaders';
import { SEAL_GLYPH, dayName, nightName, t, wakeClock } from '../i18n';
import { KText, track, useFontScale } from '../ui/type';
import { NightRings, NightWater } from './HomeScreen';
import { ObjectIcons, Paper, SANS, SERIF, VerticalTitle, inkPool, layout, styles as ui } from './ui';
import { InkList, InkSticks, KeptStick } from './InkSticks';
import { NameTitle } from './NameTitle';
import { inkPickerOpen } from '../game/look';
import { DRINK_MS, NO_CUE, answerPose, type CueValue } from '../render/answer';

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
  /** M1 먹 고르기: 네 자루 중 하나를 집음 */
  onChooseInk?: (ink: sim.InkId) => void;
  /** 먹 자루를 길게 누름 = 이름 한 줄 */
  onInkName?: (ink: sim.InkId) => void;
}

/** 새 컨셉 v3 홈(플래그 conceptV3): 'n번째 밤' 제목, 먹 양, 마시고 대답, 벼루 탭 = 벼루 시트 */
export interface V3Home {
  /** 1~28 */
  night: number;
  /** 이레 밤(7·14·21·28)이면 그 이레 번호 */
  ire: number | null;
  complete: boolean;
  /** 먹 양 0~6 */
  ink: number;
  /** 대답 신호(key가 바뀔 때마다 한 번) */
  cue: (Omit<CueValue, 'at'> & { key: number }) | null;
  /** 벼루 탭(300ms 미만) */
  onInkstoneTap: () => void;
}
/** 벼루 탭 판정(care-rituals 2-1: 300ms 미만) */
const INKSTONE_TAP_MS = 300;

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
  look: mong = BASE_LOOK,
  inkChoice = false,
  inkChanging = false,
  strokeInks,
  naming = null,
  v3 = null,
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
  /** M1 그 아이(체형·빗 모양·고른 먹). 없으면 기본형 */
  look?: MongLook;
  /** M1 먹 고르기 플래그 */
  inkChoice?: boolean;
  /** 공방 노트 '먹 바꾸기'로 네 자루를 연 상태(첫 밤 뒤, 새 획에만) */
  inkChanging?: boolean;
  /** 획마다 먹(useStrokeInks) */
  strokeInks?: readonly (sim.InkId | null)[];
  /**
   * M2 이름(플래그 naming). 있으면 세로 제목이 부르기 단추가 된다. name = 지은 이름(null = 아직),
   * onCall = 대답 종류(core callReply)를 돌려준다 — 고개 돌림은 늘, 가락이면 빗 튕김(+120ms)
   */
  naming?: { name: string | null; onCall: () => 'turn' | 'melody' } | null;
  v3?: V3Home | null;
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
  // 목록으로 보기: 버튼 목록이 길어지면(글자 200%·영어) 몽망이가 목록 위로 비켜 앉는다(리뷰 P1-3, 320×568에서 첫 버튼을 덮었음)
  const [listTop, setListTop] = useState<number | null>(null);
  const baseOy = L.oyFor(s, mong.shape.core.h);
  const bodyBottom = baseOy + 0.75 * s * L.wpx;
  const lift = listView && !asleep && listTop !== null ? Math.max(0, bodyBottom + 14 - listTop) : 0;
  const oy = Math.max(insets.top + height * 0.2, baseOy - lift);

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
  // 첫날 먹을 고른 순간(다시 스밈 번짐). 첫 밤 뒤 바꾸기는 새 획에만이라 번짐 없음
  const soakAt = useSharedValue(-1e9);
  // M2 부르기 대답의 빗 튕김 시각(가락일 때만)
  const flickAt = useSharedValue(-1e9);
  // v3 마시고 대답(V7 최소판): 신호가 올 때마다 시작 시각을 잡는다
  const cue = useSharedValue<CueValue>(NO_CUE);
  const cueKey = v3?.cue?.key ?? -1;
  useEffect(() => {
    const c = v3?.cue;
    if (c) cue.value = { ...c, at: clock.value };
  }, [cueKey]); // eslint-disable-line react-hooks/exhaustive-deps -- key가 바뀔 때만 한 번(같은 신호로 다시 그릴 때 재생하지 않는다)
  const soakKey = state.dayIndex === 0 && state.ink.id !== null && !state.ink.seeded ? `${state.ink.id}|${state.ink.chosenAt}` : '';
  const prevSoak = useRef(soakKey);
  useEffect(() => {
    if (soakKey !== '' && soakKey !== prevSoak.current) soakAt.value = clock.value;
    prevSoak.current = soakKey;
  }, [soakKey, soakAt]);

  const level = useDerivedValue(() => (RM ? clamp01((clock.value - tideAt.value) / TIDE_MS) : ease((clock.value - tideAt.value) / TIDE_MS)));
  const nightK = useDerivedValue(() => (RM ? level.value : clamp01((level.value - 0.3) / 0.35)));

  const frame = useDerivedValue<BodyFrame>(() => {
    const t = clock.value;
    const sd0 = t - soakAt.value;
    const soakK = RM || sd0 < 0 || sd0 > 1200 ? 0 : sd0 < 150 ? sd0 / 150 : 1 - (sd0 - 150) / 1050;
    const nk = nightK.value;
    const ap = answerPose(cue.value, t - cue.value.at, RM);
    const b = RM ? 0 : breathAt(t, ap.breathMs > 0 ? ap.breathMs : nk > 0.5 ? 4400 : 3200);
    const g = gazeOffset(gaze.value, t, ox, oy, L.wpx);
    // 대답 시선은 gazeMax 비율(몸 크기·비율은 건드리지 않는다 — QA-3 R8·R9)
    const agx = Math.max(-1, Math.min(1, ap.gx)) * EYE.gazeMax;
    const agy = Math.max(-1, Math.min(1, ap.gy)) * EYE.gazeMax;
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
    // 부르기 대답(가락): 빗 튕김 +120ms(아트 8절). 모션 줄이기도 빗은 움직인다('눈·빗만')
    const fd = t - flickAt.value - 120;
    const fl = fd >= 0 && fd < 1400 ? wobble(fd, 3.2, 2.2) : 0;
    const answering = ap.eyeMix > 0 && nk === 0 && rub === 0;
    return {
      ...REST_FRAME,
      ox,
      oy: oy - bob * L.wpx + ap.settle * L.wpx,
      wpx: L.wpx,
      s,
      combN: records.length,
      comb: {
        ...COMB_REST,
        angle: COMB_REST.angle - 18 * nk + 14 * Math.max(fl, 0) + ap.combAngle,
        wobble0: b * 1.2 + 8 * fl + ap.combWobble,
        wobble1: b * 0.9 + 8 * (fd >= 30 ? wobble(fd - 30, 3.2, 2.2) : 0) + ap.combWobble * 0.8,
        wobble2: b * 0.6 + 8 * (fd >= 60 ? wobble(fd - 60, 3.2, 2.2) : 0) + ap.combWobble * 0.6,
      },
      sx,
      sy,
      hop: ap.hop,
      tilt: g.tilt + shake + ap.tilt,
      gx: Math.max(-EYE.gazeMax, Math.min(EYE.gazeMax, g.gx + agx)) * (1 - nk),
      gy: Math.max(-EYE.gazeMax, Math.min(EYE.gazeMax, g.gy + agy)) * (1 - nk),
      blink: answering ? 0 : bl,
      eyeA: 'open',
      eyeB: nk > 0 ? 'closed' : answering ? ap.eyeB : 'joy',
      eyeMix: nk > 0 ? nk : answering ? ap.eyeMix : rub,
      night: nk,
      bleed: bleed * ap.bleed,
      ringAlpha: 1 - nk,
      attachK: records.map(() => 1),
      // 첫날 먹 고르기 = 이미 그은 획이 고른 먹으로 다시 스민다: 짧은 번짐 1200ms 한 번(아트 판정 항목, 모션 줄이기면 없음)
      fresh: records.map(() => soakK),
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
  const grindK = v3 ? v3.ink / 6 : sim.grindLevel(state);
  const xs = [width * 0.2, width * 0.5, width * 0.8];
  // 사물 중심 간격 = 폭 30% → 터치 영역이 겹치지 않게(폭 320에서 92)
  const objW = Math.min(116, width * 0.3 - 4);
  const sleepy = !asleep && sim.canPutToSleep(state, now);
  const v3Label = v3 ? (v3.complete ? t('v3.complete') : v3.ire ? `${t('v3.night', { n: v3.night })} · ${t('v3.ire', { n: v3.ire })}` : t('v3.night', { n: v3.night })) : null;
  const title = v3 ? (v3.complete ? v3Label! : t('day.title', { day: v3Label! })) : (reveal === 'all' ? t('day.title', { day: dayName(state.dayIndex) }) : '');
  const bodyR = 0.75 * s * L.wpx;

  const look = (x: number, y: number, holdMs = 1500) => {
    gaze.value = { x, y, at: clock.value, holdMs };
  };
  const grindT = useRef(0);
  // 세로 이름 자리(바라보기 대상). 레이아웃 전에는 제목이 놓이는 대략의 자리
  const titleAt = useRef({ x: width / 2, y: insets.top + height * 0.16 });
  // 이름을 지은 순간: 몽망이가 세로 이름 쪽으로 고개를 돌려 바라본다(2-2 '부르기와 발견')
  const namedKey = naming?.name ? `${naming.name}|${state.name?.at ?? 0}` : '';
  const prevNamed = useRef(namedKey);
  useEffect(() => {
    if (namedKey !== '' && namedKey !== prevNamed.current) gaze.value = { x: titleAt.current.x, y: titleAt.current.y, at: clock.value + 300, holdMs: 1800 };
    prevNamed.current = namedKey;
  }, [namedKey, gaze]);
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

  const objs = v3
    ? [
        { id: 'brush', name: t('obj.brush'), label: t('v3.brush.label'), a11y: blocked ? t('v3.brush.a11yDone') : t('v3.brush.a11y') },
        { id: 'inkstone', name: t('obj.inkstone'), label: t('v3.inkstone.label'), a11y: t('v3.inkstone.a11y') },
        { id: 'dropper', name: t('obj.dropper'), label: t('v3.dropper.label'), a11y: sleepy ? t('obj.dropper.a11ySleepy') : t('obj.dropper.a11y') },
      ]
    : [
        { id: 'brush', name: t('obj.brush'), label: t('obj.brush.label'), a11y: blocked ? t('obj.brush.a11yDone') : t('obj.brush.a11y') },
        { id: 'inkstone', name: t('obj.inkstone'), label: t('obj.inkstone.label'), a11y: t('obj.inkstone.a11y') },
        { id: 'dropper', name: t('obj.dropper'), label: t('obj.dropper.label'), a11y: sleepy ? t('obj.dropper.a11ySleepy') : t('obj.dropper.a11y') },
      ];
  const grindHandlers = {
    onPressIn: () => {
      grindT.current = Date.now();
      look(xs[1]!, L.objectsY, 1e9);
      actions.onGrindStart();
    },
    onPressOut: () => {
      look(xs[1]!, L.objectsY, 600);
      const ms = Date.now() - grindT.current;
      // v3: 짧게 누름(300ms 미만) = 벼루 시트(갈기·한 숟갈·작은 것). 갈기는 길게 누를 때만(D-27 PM 결정)
      if (v3 && ms < INKSTONE_TAP_MS) {
        actions.onGrindEnd(0);
        v3.onInkstoneTap();
        return;
      }
      actions.onGrindEnd(ms);
    },
  };
  // 마시기: 먹 방울이 사물(붓·벼루)에서 몸으로 빨려 든다(1.2초)
  const drop = useDerivedValue(() => {
    const c = cue.value;
    const dt = clock.value - c.at;
    if (c.kind === 0 || dt < 0 || dt >= DRINK_MS) return { x: -99, y: -99, r: 0, o: 0 };
    const e = ease(dt / DRINK_MS);
    return { x: c.fromX + (ox - c.fromX) * e, y: c.fromY + (oy - c.fromY) * e - Math.sin(Math.PI * e) * L.wpx * 0.6, r: 9 * (1 - 0.65 * e), o: 0.85 * (1 - 0.3 * e) };
  });
  const dropX = useDerivedValue(() => drop.value.x);
  const dropY = useDerivedValue(() => drop.value.y);
  const dropR = useDerivedValue(() => drop.value.r);
  const dropO = useDerivedValue(() => drop.value.o);

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
  // M1 먹 고르기(아트 11절 v1.3): 첫 획 뒤 사물이 다 나온 낮, 아직 유저가 고르지 않았으면(씨앗 먹이어도 = '바꾸기') 벼루 옆에 네 자루
  // M1 먹 고르기(H2): 첫날(첫 밤 전) 아직 안 골랐으면 벼루 옆에 네 자루, 그 뒤에는 공방 노트 '먹 바꾸기'로 연 때만
  const pickInk = reveal === 'all' && shown[1] && !!actions.onChooseInk && inkPickerOpen(state, { flag: inkChoice, changing: inkChanging });
  const currentInk = sim.currentInk(state.ink);
  const keptInk = inkChoice && !asleep && reveal === 'all' && !pickInk ? currentInk : null;
  const sticksAt = useMemo(() => clock.value + (animateReveal ? 2400 : 0), [pickInk, animateReveal]); // eslint-disable-line react-hooks/exhaustive-deps -- clock.value는 공유값(렌더 의존 아님): 먹 자루가 나타나는 순간의 시각만 잡는다

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
        <Mongmangi frame={frame} records={records} mode={PARAMS.body} grammar={grammar} look={mong} strokeInks={strokeInks} />
        {v3 && <Circle cx={dropX} cy={dropY} r={dropR} color={PALETTE.day.body} opacity={dropO} />}
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
        accessibilityLabel={t('home.mong.a11y', { day: v3Label ?? dayName(state.dayIndex), state: asleep ? 'asleep' : sleepy ? 'sleepy' : 'awake' })}
        accessibilityHint={asleep ? t('home.mong.hintAsleep') : t('home.mong.hint')}
        accessibilityActions={[
          { name: 'activate', label: t('home.mong.pet') },
          { name: 'longpress', label: t('home.mong.rub') },
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
              key={o.id}
              testID={`obj-${o.id}`}
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

      {pickInk && !listView && (
        <InkSticks cx={xs[1]!} top={objTop - 56} shownAt={sticksAt} current={currentInk} onChoose={actions.onChooseInk!} onName={(ink) => actions.onInkName?.(ink)} />
      )}
      {keptInk && !listView && <KeptStick ink={keptInk} x={xs[1]! + Math.min(objW / 2, 40)} y={objTop + 8} />}

      {/* 목록으로 보기(D-08): 사물 UI 대신 평범한 버튼 */}
      {listView && !asleep && (
        <View style={[styles.list, { bottom: insets.bottom + 24 }]} onLayout={(e) => setListTop(e.nativeEvent.layout.y)}>
          {pickInk && <InkList current={currentInk} onChoose={actions.onChooseInk!} />}
          {objs.map((o, i) => (
            <Pressable
              key={o.id}
              style={styles.listBtn}
              accessibilityRole="button"
              accessibilityLabel={o.a11y}
              {...(i === 1 ? grindHandlers : {})}
              onPress={() => {
                if (i === 0) onBrushPress();
                if (i === 2) actions.onSleep();
              }}
            >
              <KText style={styles.listText}>{t(i === 1 ? 'obj.list.hold' : 'obj.list', { name: o.name, label: o.label })}</KText>
            </Pressable>
          ))}
        </View>
      )}

      {!asleep && title !== '' && !naming && (
        <Animated.View style={[StyleSheet.absoluteFill, titleSt]} pointerEvents="none">
          <VerticalTitle text={title} color={PALETTE.day.text} seal={false} top={insets.top + height * 0.1} />
        </Animated.View>
      )}
      {/* M2: 세로 이름 = 부르기(탭 대상 추가, 새 제스처 없음 — C 3-1) */}
      {!asleep && reveal === 'all' && naming && (
        <Animated.View style={[StyleSheet.absoluteFill, titleSt]} pointerEvents="box-none">
          <NameTitle
            name={naming.name}
            day={v3Label ?? dayName(state.dayIndex)}
            color={PALETTE.day.text}
            top={insets.top + height * 0.1}
            onLayoutCenter={(x, y) => {
              titleAt.current = { x, y };
            }}
            onCall={() => {
              const reply = naming.onCall();
              const c = titleAt.current;
              look(c.x, c.y, 1500);
              if (reply === 'melody') flickAt.value = clock.value;
            }}
          />
        </Animated.View>
      )}
      {/* 공방 노트 입구 = 주사 낙관(첫 획 뒤 '탁' 찍힘) */}
      {reveal === 'all' && (
        <Animated.View style={[styles.seal, { top: insets.top + 14 }, sealSt, asleep && { opacity: 0.55 }]}>
          <Pressable onPress={actions.onNote} style={styles.sealHit} accessibilityRole="button" accessibilityLabel={t('home.seal.a11y')} testID="seal" hitSlop={10}>
            <KText style={ui.sealText} maxFontSizeMultiplier={1} serif="title">
              {SEAL_GLYPH}
            </KText>
          </Pressable>
        </Animated.View>
      )}

      {asleep && (
        <>
          <KText style={[ui.line, { top: insets.top + height * 0.1, color: PALETTE.night.text, fontSize: 17, letterSpacing: track.serif(17) }]} pointerEvents="none" accessibilityRole="header" serif="title">
            {v3Label ?? nightName(state.dayIndex)}
          </KText>
          <Animated.View style={[styles.nightLine, soothSt]} pointerEvents="none">
            <KText style={[ui.line, styles.nightText]}>{t('night.soothe')}</KText>
          </Animated.View>
          <Animated.View style={[styles.nightLine, wakeSt]} pointerEvents="none">
            <KText style={[ui.line, styles.nightText]}>{t('night.stillAsleep', { time: wakeClock(sim.wakeableAt(state), state.clock.tzOffsetMin) })}</KText>
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
      {/* 라벨은 한 줄(리뷰 P2: 'Grind ink'가 두 줄로 꺾여 화면 아래 끝·홈 인디케이터에 닿음). 큰 글자는 150%에서 멈추고 넘치면 줄인다 */}
      <KText
        style={[styles.objLabel, { color: asleep ? PALETTE.night.textSub : PALETTE.day.textSub }, small && { fontSize: 12 }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        maxFontSizeMultiplier={1.5}
      >
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
