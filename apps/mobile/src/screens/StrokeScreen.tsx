import { Canvas } from '@shopify/react-native-skia';
import {
  COMB_REST,
  PALETTE,
  STROKE,
  attachStroke,
  coreScale,
  day7Records,
  normalizeRaw,
  quantizeRaw,
  serializeSave,
  CURRENT_MESH_VERSION,
  type AttachLevel,
  type StrokeRecord,
} from '@mong/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { runOnJS, useAnimatedReaction, useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { PARAMS, clamp01, clock, ease, easeOut, springStep } from '../render/clock';
import { NO_GAZE, gazeOffset, type Gaze } from '../render/gaze';
import { blinkAt, breathAt, wobble } from '../render/idle';
import { Mongmangi, REST_FRAME, type BodyFrame } from '../render/Mongmangi';
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
export function StrokeScreen({ initial }: { initial: number }) {
  const { width, height } = useWindowDimensions();
  const L = layout(width, height);
  const [level, setLevel] = useState<AttachLevel>(PARAMS.attach);
  const [records, setRecords] = useState<StrokeRecord[]>(() => day7Records(PARAMS.attach).slice(0, initial));
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

  const commit = (pts: Pt[]) => {
    const n0 = nRef.current;
    const s0 = coreScale(n0);
    if (pts.length < 2) {
      live.value = [];
      return;
    }
    // 정본: 그을 때의 핵 중심·W 단위(D-13)
    const raw = quantizeRaw(normalizeRaw(pts, L.cx, L.oyFor(s0), L.wpx));
    const lv = levelRef.current;
    const attach = attachStroke(raw, s0, lv, n0);
    const rec: StrokeRecord = { raw, attach, drawnAtCoreScale: s0, meshVersion: CURRENT_MESH_VERSION };
    const now = clock.value;
    attachedAt.value = [...attachedAt.value, now];
    lastAttach.value = { at: now, side: Math.sin(attach.theta) >= 0 ? 1 : -1 };
    gaze.value = { x: L.cx + Math.sin(attach.theta) * L.wpx, y: L.oyFor(s0) - Math.cos(attach.theta) * L.wpx * 0.6, at: now, holdMs: 1200 };
    setRecords((r) => [...r, rec]);
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

  const pan = usePanGesture({
    minDistance: 0,
    onBegin: (e) => {
      'worklet';
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
    },
    onFinalize: () => {
      'worklet';
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
            <Mongmangi frame={frame} records={records} live={live} mode={PARAMS.body} />
            <ObjectIcons width={width} y={L.objectsY} color={PALETTE.day.text} dim={halfDim} />
          </Canvas>
          <ObjectLabels width={width} y={L.objectsY} color={PALETTE.day.textSub} labels={labels} />
          <Caption text={caption} color={PALETTE.day.textSub} />
        </View>
      </GestureDetector>
      {!clean && (
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
      {!clean && info !== '' && (
        <Text style={styles.info} pointerEvents="none">
          {info}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  dev: { position: 'absolute', top: 8, left: 8, flexDirection: 'row', gap: 4 },
  btn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.25)' },
  on: { backgroundColor: 'rgba(0,0,0,0.6)' },
  btnText: { color: '#fff', fontSize: 11 },
  info: { position: 'absolute', top: 40, left: 10, right: 10, fontSize: 10, color: '#7a7066', fontFamily: SANS },
  study: { position: 'absolute', top: 14, right: 16, fontSize: 11, color: '#8a8076', fontFamily: SANS, letterSpacing: 1 },
});
