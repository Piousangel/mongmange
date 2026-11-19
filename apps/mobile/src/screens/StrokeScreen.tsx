import { BlurMask, Canvas, Oval } from '@shopify/react-native-skia';
import {
  COMB_REST,
  PALETTE,
  STROKE,
  attachStroke,
  coreScale,
  day7ClumsyRecords,
  day7Records,
  grammarOf,
  normalizeRaw,
  quantizeRaw,
  serializeSave,
  CURRENT_MESH_VERSION,
  type AttachLevel,
  type RawPoint,
  type StrokeRecord,
} from '@mong/core';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { PARAMS, clamp01, clock, ease, easeOut, springStep } from '../render/clock';
import { NO_GAZE, gazeOffset, type Gaze } from '../render/gaze';
import { blinkAt, breathAt, wobble } from '../render/idle';
import { Mongmangi, REST_FRAME, type BodyFrame } from '../render/Mongmangi';
import { sound } from '../audio/sound';
import { Caption, ObjectIcons, ObjectLabels, Paper, SANS, layout } from './ui';

const RM = PARAMS.rm;
type Pt = { x: number; y: number; t: number };

/** 부착 진행: 180ms 시작(빠르게 60%) → 800ms 정착(아트 8절). Reduce Motion은 즉시 */
function attachProgress(dt: number): number {
  'worklet';
  if (dt < 0) return 0;
  if (RM) return 1;
  if (dt < 180) return 0.6 * easeOut(dt / 180);
  return 0.6 + 0.4 * ease((dt - 180) / 620);
}

/**
 * 긋기 모드(붓을 든 뒤): 손가락을 대고 뗄 때까지가 한 획(최대 6초). 점은 RNGH Pan worklet에서 SharedValue에 쌓이고
 * 그리는 중 리본도 UI 스레드에서 갱신된다(JS 재렌더 없음). 손을 떼면 D-12 부착(회전·이동, L1~L3).
 */
/** 앱 흐름에서 쓸 때: 기록은 sim 상태에서 오고, 받아들일지는 sim이 판정한다(하루 한 획 등) */
export interface StrokeGame {
  records: StrokeRecord[];
  /** 정규화 점열(핵 중심·W 단위) → sim 판정. 받아들여졌으면 붙은 기록, 아니면 null */
  onStroke: (raw: RawPoint[], level: AttachLevel) => StrokeRecord | null;
  /** 화면에 겹쳐 그릴 것(한 줄 문구 등) */
  overlay?: ReactNode;
  /** 붓 사물을 다시 누름 = 붓 내려놓기 */
  onBrushTap: () => void;
  /** 씻기 창(5초) 동안 연적이 숨 쉬고, 누르면 씻기 */
  washOpen: boolean;
  onJarTap: () => void;
  /** 대체 입력(버튼으로 긋기) 표시: 스크린리더 또는 노트 접근성 설정일 때만(리뷰 U2) */
  assist: boolean;
  /** 오늘 아직 안 그었으면 몽망이 둘레에 옅은 젖은 자국(아트 11절 19~24초, 지시문 대신) */
  wetMark: boolean;
}

export function StrokeScreen({ initial, game }: { initial: number; game?: StrokeGame }) {
  const { width, height } = useWindowDimensions();
  const L = layout(width, height);
  const insets = useSafeAreaInsets();
  const [level, setLevel] = useState<AttachLevel>(PARAMS.attach);
  const [localRecords, setRecords] = useState<StrokeRecord[]>(() => (game ? [] : (PARAMS.pose === 'clumsy' ? day7ClumsyRecords : day7Records)(PARAMS.attach).slice(0, initial)));
  const records = game ? game.records : localRecords;
  const gameRef = useRef(game);
  gameRef.current = game;
  const [assist, setAssist] = useState<{ a: Pt | null; b: Pt | null; bend: number } | null>(null);
  const grammar = useMemo(() => grammarOf(PARAMS.grammar), []);
  const [info, setInfo] = useState('');
  const attachedAt = useSharedValue<number[]>(records.map(() => -1e9));
  const live = useSharedValue<Pt[]>([]);
  const drawing = useSharedValue(false);
  const startT = useSharedValue(0);
  const gaze = useSharedValue<Gaze>(NO_GAZE);
  const lastAttach = useSharedValue({ at: -1e9, side: 0 });
  const [caption, setCaption] = useState('');
  const n = records.length;
  const nRef = useRef(n);
  nRef.current = n;
  const levelRef = useRef(level);
  levelRef.current = level;
  const sNow = coreScale(n);
  const sPrev = coreScale(Math.max(n - 1, 0));

  const commit = (input: Pt[]) => {
    let pts = input;
    const n0 = nRef.current;
    const s0 = coreScale(n0);
    if (pts.length < 2 && !gameRef.current) {
      live.value = [];
      return;
    }
    // 앱 흐름: 점 하나(탭)도 sim에 보내 '짧음' 판정을 sim이 내린다
    if (pts.length === 1) pts = [pts[0]!, { ...pts[0]!, t: pts[0]!.t + 16 }];
    // 정본: 그을 때의 핵 중심·W 단위(D-13)
    const lv = levelRef.current;
    let rec: StrokeRecord;
    const game0 = gameRef.current;
    if (game0) {
      const got = game0.onStroke(normalizeRaw(pts, L.cx, L.oyFor(s0), L.wpx), lv);
      if (!got) {
        live.value = [];
        return;
      }
      rec = got;
    } else {
      const q = quantizeRaw(normalizeRaw(pts, L.cx, L.oyFor(s0), L.wpx));
      rec = { raw: q, attach: attachStroke(q, s0, lv, n0), drawnAtCoreScale: s0, meshVersion: CURRENT_MESH_VERSION };
    }
    const { raw, attach } = rec;
    const now = clock.value;
    attachedAt.value = [...attachedAt.value, now];
    lastAttach.value = { at: now, side: Math.sin(attach.theta) >= 0 ? 1 : -1 };
    gaze.value = { x: L.cx + Math.sin(attach.theta) * L.wpx, y: L.oyFor(s0) - Math.cos(attach.theta) * L.wpx * 0.6, at: now, holdMs: 1200 };
    if (!game0) setRecords((r) => [...r, rec]);
    setInfo(
      `L${lv} · ${raw.length}점 · ${(raw.at(-1)!.t / 1000).toFixed(2)}s · θ ${((attach.theta * 180) / Math.PI).toFixed(0)}° · 회전 ${((attach.rot * 180) / Math.PI).toFixed(0)}° · 축소 ${attach.scale.toFixed(2)} · 휨 ${attach.bend}`,
    );
    const g = globalThis as unknown as { __strokes?: unknown[] };
    (g.__strokes ??= []).push({ raw, attach, drawnAtCoreScale: s0 });
  };
  // 새 기록이 그려진 다음 프레임에 손획 레이어를 비운다(한 프레임 깜빡임 방지)
  useEffect(() => {
    live.value = [];
  }, [records.length, live]);

  const lastSpeedAt = useSharedValue(0);
  const brushOn = () => sound.play('brushStroke');
  const brushOff = () => sound.stop('brushStroke');
  const brushSpeed = (v: number) => sound.setBrushSpeed(v);

  // 접근성 대체 입력(D-08): 눌러 시작점, 다시 눌러 끝점 → 곡률 손잡이 하나 → 긋기
  const assistPts = (a: Pt, b: Pt, bend: number): Pt[] => {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const cx = mx - dy * bend;
    const cy = my + dx * bend;
    const out: Pt[] = [];
    for (let i = 0; i <= 40; i++) {
      const u = i / 40;
      const e = u * u * (3 - 2 * u);
      out.push({ x: (1 - e) * (1 - e) * a.x + 2 * (1 - e) * e * cx + e * e * b.x, y: (1 - e) * (1 - e) * a.y + 2 * (1 - e) * e * cy + e * e * b.y, t: Math.round(u * 900) });
    }
    return out;
  };
  const assistPress = (x: number, y: number) => {
    setAssist((st) => {
      if (!st) return st;
      const p = { x, y, t: 0 };
      const next = !st.a || st.b ? { a: p, b: null, bend: 0 } : { ...st, b: p };
      live.value = next.a && next.b ? assistPts(next.a, next.b, next.bend) : next.a ? [next.a, { ...next.a, x: next.a.x + 1 }] : [];
      return next;
    });
  };
  const assistBend = (d: number) => {
    setAssist((st) => {
      if (!st?.a || !st.b) return st;
      const next = { ...st, bend: Math.max(-0.6, Math.min(0.6, st.bend + d)) };
      live.value = assistPts(next.a!, next.b!, next.bend);
      return next;
    });
  };
  const assistCommit = () => {
    if (!assist?.a || !assist.b) return;
    const pts = assistPts(assist.a, assist.b, assist.bend);
    setAssist({ a: null, b: null, bend: 0 });
    commit(pts);
  };

  const pan = usePanGesture({
    minDistance: 0,
    onBegin: (e) => {
      'worklet';
      runOnJS(brushOn)();
      drawing.value = true;
      startT.value = clock.value;
      live.value = [{ x: e.x, y: e.y, t: clock.value }];
    },
    onUpdate: (e) => {
      'worklet';
      if (!drawing.value) return;
      const t = clock.value;
      if (t - startT.value > STROKE.maxMs) return; // 한 획 최대 6초
      const pts = live.value;
      const last = pts[pts.length - 1];
      // 거리 1px 미만 이동은 버린다(120Hz 터치에서 점 수를 줄임)
      if (last && Math.hypot(last.x - e.x, last.y - e.y) < 1) return;
      // 제자리 push(리뷰 2-5: 매 이벤트 배열 전체 복사 O(n²) 제거)
      live.modify((arr) => {
        'worklet';
        arr.push({ x: e.x, y: e.y, t });
        return arr;
      });
      gaze.value = { x: e.x, y: e.y, at: t - 200, holdMs: 1e9 };
      // 붓 소리 속도 연동: 50ms마다 한 번 JS로
      if (last && t - lastSpeedAt.value > 50) {
        const dt = Math.max(1, t - last.t);
        lastSpeedAt.value = t;
        runOnJS(brushSpeed)((Math.hypot(last.x - e.x, last.y - e.y) / dt) * 1000);
      }
    },
    onFinalize: () => {
      'worklet';
      runOnJS(brushOff)();
      if (!drawing.value) return;
      drawing.value = false;
      gaze.value = { ...gaze.value, at: clock.value - 200, holdMs: 0 };
      runOnJS(commit)(live.value.slice());
    },
  });

  const light = useDerivedValue(() => 1.02);
  const halfDim = useDerivedValue(() => 0.5);
  const frame = useDerivedValue<BodyFrame>(() => {
    const t = clock.value;
    const at = attachedAt.value;
    const la = lastAttach.value;
    const dLast = t - la.at;
    // 핵 성장: 부착 정착 뒤 800ms
    const sg = n > 0 ? (RM ? 1 : ease((t - (at[n - 1] ?? -1e9) - 600) / 800)) : 1;
    const s = sPrev + (sNow - sPrev) * sg;
    const b = RM ? 0 : breathAt(t, 3200);
    const g = gazeOffset(gaze.value, t, L.cx, L.oyFor(s), L.wpx);
    // 받는 쪽으로 6° 기욺(200~1400ms)
    const lean = RM ? 0 : la.side * ((6 * Math.PI) / 180) * Math.sin(clamp01((dLast - 150) / 1300) * Math.PI);
    // 기쁨(정착 뒤): 눈 ^ ^, 작은 튐, 빗 2회 튕김(+120ms)
    const jd = dLast - 900;
    let eyeMix = 0;
    let sy = 1 + 0.02 * b;
    let sx = 1 - 0.01 * b;
    let hop = 0;
    let ang = COMB_REST.angle;
    let w0 = b * 1.2;
    let w1 = b;
    let w2 = b * 0.8;
    if (jd >= 0 && jd < 2000) {
      eyeMix = jd < 120 ? jd / 120 : jd < 1600 ? 1 : 1 - (jd - 1600) / 400;
      if (!RM) {
        const rel = jd >= 120 ? springStep(jd - 120, 10, 260) : 0;
        const sq = jd < 120 ? 1 - 0.12 * (jd / 120) : 0.88 + 0.12 * rel;
        sy *= sq;
        sx *= 1 + (1 - sq) * 0.6;
        const hk = (jd - 160) / 480;
        hop = hk > 0 && hk < 1 ? 0.07 * 4 * hk * (1 - hk) : 0;
        const fl = wobble(jd - 120, 3.2, 2.2);
        ang += 20 * Math.max(fl, 0) + 6 * fl;
        w0 += 8 * fl;
        w1 += 8 * wobble(jd - 150, 3.2, 2.2);
        w2 += 8 * wobble(jd - 180, 3.2, 2.2);
      }
    }
    const attachK: number[] = [];
    const fresh: number[] = [];
    for (let i = 0; i < n; i++) {
      const d = t - (at[i] ?? -1e9);
      attachK.push(attachProgress(d));
      fresh.push(RM ? Math.max(0, 1 - d / 200) : Math.max(0, 1 - d / 1200));
    }
    return {
      ...REST_FRAME,
      ox: L.cx,
      oy: L.oyFor(s),
      wpx: L.wpx,
      s,
      combN: n,
      comb: { ...COMB_REST, angle: ang, wobble0: w0, wobble1: w1, wobble2: w2 },
      sx,
      sy,
      hop,
      tilt: lean + g.tilt * 0.5,
      gx: g.gx,
      gy: g.gy,
      blink: drawing.value ? 0 : blinkAt(t),
      eyeA: 'open',
      eyeB: 'joy',
      eyeMix,
      hint: n === 0 ? 1 : Math.max(0, 1 - (t - (at[0] ?? 0)) / 800),
      attachK,
      fresh,
    };
  });

  useAnimatedReaction(
    () => {
      const d = clock.value - lastAttach.value.at;
      if (drawing.value) return '붓 마찰음(속도 연동)';
      if (d >= 0 && d < 900) return "light 햅틱 · 낮은 허밍 '음—'";
      if (d >= 900 && d < 2300) return 'light 햅틱 ×2';
      return '';
    },
    (c, p) => {
      if (c !== p) runOnJS(setCaption)(c);
    },
  );

  const exportJson = () => {
    const json = serializeSave({ schemaVersion: 2, strokes: records });
    const rawLog = JSON.stringify(records.map((r) => ({ raw: r.raw, attach: r.attach, drawnAtCoreScale: r.drawnAtCoreScale })));
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([rawLog], { type: 'application/json' }));
      a.download = `mong-strokes-${Date.now()}.json`;
      a.click();
    } else {
      void Share.share({ message: rawLog });
    }
    setInfo(`내보냄: 획 ${records.length}개 · 세이브 ${json.length}B`);
  };

  const clean = PARAMS.clean;
  const labels = useMemo(() => ['한 획', '먹 갈기', '물 한 방울'], []);
  return (
    <View style={styles.root}>
      <GestureDetector gesture={pan}>
        <View style={StyleSheet.absoluteFill} testID="stroke-surface">
          <Canvas style={StyleSheet.absoluteFill} opaque>
            <Paper width={width} height={height} light={light} />
            {game?.wetMark && (
              <Oval x={L.cx - 1.6 * L.wpx} y={L.groundY - 0.75 * L.wpx * sNow} width={3.2 * L.wpx} height={1.1 * L.wpx * sNow} color={PALETTE.day.wash} opacity={0.12}>
                <BlurMask blur={14} style="normal" />
              </Oval>
            )}
            <Mongmangi frame={frame} records={records} live={live} mode={PARAMS.body} grammar={grammar} />
            <ObjectIcons width={width} y={L.objectsY} color={PALETTE.day.text} dim={halfDim} />
          </Canvas>
          <ObjectLabels width={width} y={L.objectsY} color={PALETTE.day.textSub} labels={labels} />
          {!game && <Caption text={caption} color={PALETTE.day.textSub} />}
        </View>
      </GestureDetector>
      {assist !== null && (
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityLabel="획 시작점과 끝점 고르기"
          accessibilityHint="한 번 눌러 시작점, 다시 눌러 끝점을 고릅니다"
          onPress={(e) => assistPress(e.nativeEvent.locationX, e.nativeEvent.locationY)}
        />
      )}
      {game && (
        <>
          <Pressable
            testID="brush-down"
            style={[styles.objHit, { left: width * 0.2 - 40, top: L.objectsY - 32 }]}
            onPress={game.onBrushTap}
            accessibilityRole="button"
            accessibilityLabel="붓 내려놓기"
          />
          <Pressable
            testID="wash"
            disabled={!game.washOpen}
            style={[styles.objHit, { left: width * 0.8 - 40, top: L.objectsY - 32 }]}
            onPress={game.onJarTap}
            accessibilityRole="button"
            accessibilityLabel={game.washOpen ? '연적, 물로 씻기, 방금 그은 획을 지웁니다' : '연적'}
            accessibilityState={{ disabled: !game.washOpen }}
          >
            {game.washOpen && <JarBreath />}
          </Pressable>
        </>
      )}
      {game?.assist && (
        <View style={[styles.assistBar, { top: insets.top + 12 }]} pointerEvents="box-none">
          {assist === null ? (
            <Pressable onPress={() => setAssist({ a: null, b: null, bend: 0 })} style={styles.assistBtn} accessibilityRole="button" accessibilityLabel="버튼으로 긋기">
              <Text style={styles.assistText}>버튼으로 긋기</Text>
            </Pressable>
          ) : (
            <>
              <Pressable onPress={() => assistBend(-0.15)} style={styles.assistBtn} accessibilityRole="button" accessibilityLabel="왼쪽으로 휘기">
                <Text style={styles.assistText}>휘기 ◀</Text>
              </Pressable>
              <Pressable onPress={() => assistBend(0.15)} style={styles.assistBtn} accessibilityRole="button" accessibilityLabel="오른쪽으로 휘기">
                <Text style={styles.assistText}>▶ 휘기</Text>
              </Pressable>
              <Pressable
                onPress={assistCommit}
                disabled={!assist.a || !assist.b}
                style={[styles.assistBtn, !(assist.a && assist.b) && { opacity: 0.4 }]}
                accessibilityRole="button"
                accessibilityLabel="이 획으로 긋기"
              >
                <Text style={styles.assistText}>긋기</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setAssist(null);
                  live.value = [];
                }}
                style={styles.assistBtn}
                accessibilityRole="button"
                accessibilityLabel="손으로 긋기로 돌아가기"
              >
                <Text style={styles.assistText}>손으로</Text>
              </Pressable>
            </>
          )}
        </View>
      )}
      {game?.overlay}
      {!clean && !game && (
        <View style={styles.dev}>
          {([1, 2, 3] as const).map((l) => (
            <Pressable key={l} onPress={() => setLevel(l)} style={[styles.btn, level === l && styles.on]}>
              <Text style={styles.btnText}>L{l}</Text>
            </Pressable>
          ))}
          <Pressable onPress={exportJson} style={styles.btn}>
            <Text style={styles.btnText}>raw JSON</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setRecords([]);
              attachedAt.value = [];
            }}
            style={styles.btn}
          >
            <Text style={styles.btnText}>비우기</Text>
          </Pressable>
        </View>
      )}
      {PARAMS.study !== '' && (
        <Text style={styles.study} pointerEvents="none">
          L{level}
        </Text>
      )}
      {!clean && !game && info !== '' && (
        <Text style={styles.info} pointerEvents="none">
          {info}
        </Text>
      )}
    </View>
  );
}

/** 씻기 창 동안 연적이 숨 쉼(1.2초 주기, 담묵 고리) */
function JarBreath() {
  const st = useAnimatedStyle(() => ({ opacity: PARAMS.rm ? 0.5 : 0.25 + 0.35 * (0.5 + 0.5 * Math.sin((clock.value / 1200) * Math.PI * 2)) }));
  return <Animated.View pointerEvents="none" style={[styles.jarRing, st]} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  objHit: { position: 'absolute', width: 80, height: 72, alignItems: 'center' },
  jarRing: { marginTop: 6, width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, borderColor: PALETTE.day.textSub },
  dev: { position: 'absolute', top: 8, left: 8, flexDirection: 'row', gap: 4 },
  btn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.25)' },
  on: { backgroundColor: 'rgba(0,0,0,0.6)' },
  btnText: { color: '#fff', fontSize: 11 },
  info: { position: 'absolute', top: 40, left: 10, right: 10, fontSize: 10, color: '#7a7066', fontFamily: SANS },
  assistBar: { position: 'absolute', top: 54, right: 12, flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '70%' },
  assistBtn: { minHeight: 44, minWidth: 44, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 22, backgroundColor: 'rgba(43,42,40,0.08)' },
  assistText: { fontFamily: SANS, fontSize: 13, color: PALETTE.day.textSub },
  study: { position: 'absolute', top: 14, right: 16, fontSize: 11, color: '#8a8076', fontFamily: SANS, letterSpacing: 1 },
});
