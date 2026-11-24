// M1 타고남 + 먹 캡처 보드(아트 판정·블라인드 자극물용). 하나의 Canvas에 여러 마리(웹 WebGL 컨텍스트 수 제한).
//  ?screen=m1&view=grid&night=0|1&n=0|7   48칸(열 = 체형 3 × 빗 모양 4, 행 = 먹 4)
//  ?screen=m1&view=ink&n=7                먹 4 비교(같은 타고남, 낮·밤 두 줄)
//  ?screen=m1&view=thumb&night=0|1         48칸 썸네일 크기(블라인드 '썸네일' 조건: 몸 폭 약 22px)
//  ?screen=m1&view=traits&n=0|7            타고남 12(먹 기본형) 크게 — 실루엣 판정
//  ?screen=m1&view=a7                     A7 썸네일 비교: 사람마다 다른 손 12마리 × (몸 폭 36·22pt) × (현행 / LOD)
//  ?screen=m1&view=v12a&night=0|1          V12a 몸 빛: 행 = 빛 끔 + 확산 세기 후보 3, 열 = 체형 3 × 몸 폭 120·64·36pt
//  ?screen=m1&view=v12aperf&light=0|1&cells=24   V12a 성능: 120pt 몽망이 여러 마리를 매 프레임 흔들어 다시 그린다(프레임 간격은 캡처 스크립트가 잰다)
import { Canvas, Fill, Group } from '@shopify/react-native-skia';
import {
  BODY_ASPECTS,
  BODY_LIGHT_LEVELS,
  COMB_REST,
  COMB_IDS,
  COMB_SHAPES,
  PALETTE,
  coreScale,
  day7Records,
  handRecords,
  grammarOf,
  inkLook,
  sim,
  shapeOf,
  type MongLook,
  type StrokeRecord,
  BASE_INK_LOOK,
  type Traits,
} from '@mong/core';
import { useMemo } from 'react';
import { Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { PARAMS } from '../render/clock';
import { Mongmangi, REST_FRAME, type BodyFrame } from '../render/Mongmangi';
import { Paper } from './ui';

function q(name: string, def: string): string {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return def;
  return new URLSearchParams(window.location.search).get(name) ?? def;
}

const TRAITS: Traits[] = [];
for (let b = 0; b < 3; b++) for (let c = 0; c < 4; c++) TRAITS.push({ body: b as 0, comb: c as 0, ring: 1 });
/** 빗 모양 라벨은 코드 이름(층진·고른·가운데 긴·끝 긴) — 화면 문구가 아니라 개발 캡처 보드 표기 */
const COMB_NAME = COMB_IDS;

function Cell({ ox, oy, wpx, look, records, night, lod, light, wobble }: { ox: number; oy: number; wpx: number; look: MongLook; records: StrokeRecord[]; night: number; lod?: boolean; light?: number; wobble?: boolean }) {
  const grammar = useMemo(() => grammarOf(PARAMS.grammar), []);
  const s = coreScale(records.length);
  const frame = useSharedValue<BodyFrame>({
    ...REST_FRAME,
    ox,
    oy: oy - (look.shape.core.h / 2) * s * wpx,
    wpx,
    s,
    combN: records.length,
    comb: { ...COMB_REST, angle: COMB_REST.angle - 18 * night },
    eyeA: 'open',
    eyeB: 'closed',
    eyeMix: night,
    night,
    ringAlpha: 1 - night,
    attachK: records.map(() => 1),
    fresh: records.map(() => 0),
  });
  // 성능 보드: 매 프레임 기울기·눌림을 바꿔 몸 전체를 다시 그리게 한다(빛 켬·끔 프레임 비용 비교)
  useFrameCallback((f) => {
    const t = f.timeSinceFirstFrame / 1000;
    frame.value = { ...frame.value, tilt: 0.06 * Math.sin(t * 5 + ox * 0.01), sy: 1 + 0.03 * Math.sin(t * 7 + oy * 0.01) };
  }, !!wobble);
  return <Mongmangi frame={frame} records={records} mode={PARAMS.body} grammar={grammar} look={look} lod={lod} light={light ?? 0} />;
}

export function M1Board() {
  const { width, height } = useWindowDimensions();
  const view = q('view', 'grid');
  const night = q('night', '0') === '1' ? 1 : 0;
  const n = Number(q('n', view === 'thumb' ? '7' : '7'));
  // 획은 체형마다 그 체형으로 부착(D-12 개정 ①) — 같은 손획 7개
  const a7Hands = useMemo(() => Array.from({ length: 12 }, (_, i) => handRecords(i + 1, 7, shapeOf({ body: (i % 3) as 0, comb: ((i * 7) % 4) as 0, ring: 1 }))), []);
  const v12Hands = useMemo(() => [0, 1, 2].map((b) => handRecords(3 + b * 4, 7, shapeOf({ body: b as 0, comb: b as 0, ring: 1 }))), []);
  const recsByBody = useMemo(() => [0, 1, 2].map((b) => (n > 0 ? day7Records(2, shapeOf({ body: b as 0, comb: 0, ring: 1 })).slice(0, n) : [])), [n]);

  const cells: { key: string; ox: number; oy: number; wpx: number; look: MongLook; recs: StrokeRecord[]; night: number; lod?: boolean; light?: number; wobble?: boolean }[] = [];
  const labels: { key: string; x: number; y: number; text: string; color: string; w: number }[] = [];
  const top = 34;
  const left = 70;
  const txt = night ? PALETTE.night.textSub : PALETTE.day.textSub;
  if (view === 'grid' || view === 'thumb') {
    const cw = (width - left - 8) / 12;
    const ch = view === 'thumb' ? cw * 0.95 : cw * 1.25;
    const wpx = view === 'thumb' ? Math.min(22, cw * 0.36) : cw * 0.42;
    TRAITS.forEach((tr, i) => {
      labels.push({ key: `c${i}`, x: left + i * cw, y: 6, text: `${BODY_ASPECTS[tr.body]}\n${COMB_NAME[tr.comb]}`, color: txt, w: cw });
      sim.INK_IDS.forEach((ink, r) => {
        cells.push({ key: `${i}-${ink}`, ox: left + (i + 0.5) * cw, oy: top + 20 + (r + 0.78) * ch, wpx, look: { traits: tr, shape: shapeOf(tr), ink: inkLook(ink) }, recs: recsByBody[tr.body]!, night });
      });
    });
    sim.INK_IDS.forEach((ink, r) => labels.push({ key: `r${r}`, x: 4, y: top + 20 + (r + 0.45) * ch, text: ink, color: txt, w: left - 6 }));
  } else if (view === 'a7') {
    // 사람마다 다른 손·타고남·먹(시드 1..12). 같은 열 = 같은 몽망이
    const N = 12;
    const cw = (width - 150) / N;
    const rows: [number, boolean, string][] = [
      [36, false, '36pt current'],
      [36, true, '36pt LOD'],
      [22, false, '22pt current'],
      [22, true, '22pt LOD'],
    ];
    const rh = (height - top - 10) / rows.length;
    rows.forEach(([wpx, lod, name], r) => {
      labels.push({ key: `r${r}`, x: 4, y: top + r * rh + rh * 0.4, text: name, color: txt, w: 140 });
      for (let i = 0; i < N; i++) {
        const tr: Traits = { body: (i % 3) as 0, comb: ((i * 7) % 4) as 0, ring: 1 };
        const sh = shapeOf(tr);
        const ink = sim.INK_IDS[(i * 3 + Math.floor(i / 4)) % 4]!;
        cells.push({ key: `a${r}-${i}`, ox: 150 + (i + 0.5) * cw, oy: top + r * rh + rh * 0.7, wpx, look: { traits: tr, shape: sh, ink: inkLook(ink) }, recs: a7Hands[i]!, night, lod });
      }
    });
    for (let i = 0; i < N; i++) labels.push({ key: `c${i}`, x: 150 + i * cw, y: 6, text: `#${i + 1}`, color: txt, w: cw });
  } else if (view === 'v12a') {
    // 행 = 빛 끔 + 후보 low·mid·high, 열 = 체형 3 × 몸 폭 120·64·36pt. 같은 열 = 같은 몽망이(체형마다 다른 손·먹)
    const sizes = [120, 64, 36];
    const rows: [number, string][] = [
      [0, 'off (now)'],
      [BODY_LIGHT_LEVELS.low, `low ${BODY_LIGHT_LEVELS.low}`],
      [BODY_LIGHT_LEVELS.mid, `mid ${BODY_LIGHT_LEVELS.mid}`],
      [BODY_LIGHT_LEVELS.high, `high ${BODY_LIGHT_LEVELS.high}`],
    ];
    const lx = 90;
    const unit = (width - lx - 8) / (3 * sizes.reduce((a, b) => a + b, 0));
    const rh = (height - top - 6) / rows.length;
    rows.forEach(([lv, name], r) => {
      labels.push({ key: `r${r}`, x: 4, y: top + r * rh + rh * 0.45, text: name, color: txt, w: lx - 8 });
      let x = lx;
      for (let b = 0; b < 3; b++) {
        const tr: Traits = { body: b as 0, comb: b as 0, ring: 1 };
        const sh = shapeOf(tr);
        for (const sz of sizes) {
          const cw = sz * unit;
          cells.push({ key: `v${r}-${b}-${sz}`, ox: x + cw / 2, oy: top + r * rh + rh * 0.72, wpx: sz, look: { traits: tr, shape: sh, ink: inkLook(sim.INK_IDS[b]!) }, recs: v12Hands[b]!, night, light: lv });
          if (r === 0) labels.push({ key: `c${b}-${sz}`, x, y: 6, text: `${BODY_ASPECTS[b]} · ${sz}pt`, color: txt, w: cw });
          x += cw;
        }
      }
    });
  } else if (view === 'v12aperf') {
    const lv = Number(q('light', '0'));
    const N = Math.max(1, Math.min(60, Number(q('cells', '24'))));
    const cols = Math.ceil(Math.sqrt(N * (width / height)));
    const rowsN = Math.ceil(N / cols);
    const cw = width / cols;
    const ch = height / rowsN;
    const wpx = Math.min(120, cw * 0.5, ch * 0.6);
    for (let i = 0; i < N; i++) {
      const tr: Traits = { body: (i % 3) as 0, comb: (i % 4) as 0, ring: 1 };
      cells.push({ key: `p${i}`, ox: (i % cols + 0.5) * cw, oy: (Math.floor(i / cols) + 0.75) * ch, wpx, look: { traits: tr, shape: shapeOf(tr), ink: inkLook(sim.INK_IDS[i % 4]!) }, recs: v12Hands[i % 3]!, night, light: lv, wobble: true });
    }
  } else if (view === 'ink') {
    const cw = (width - left - 8) / 4;
    const ch = (height - top - 20) / 2;
    const wpx = cw * 0.4;
    const tr: Traits = { body: 1, comb: 0, ring: 1 };
    [0, 1].forEach((nt) =>
      sim.INK_IDS.forEach((ink, i) => {
        cells.push({ key: `${nt}-${ink}`, ox: left + (i + 0.5) * cw, oy: top + nt * ch + ch * 0.72, wpx, look: { traits: tr, shape: shapeOf(tr), ink: inkLook(ink) }, recs: recsByBody[1]!, night: nt });
        if (nt === 0) labels.push({ key: `l${i}`, x: left + i * cw, y: 8, text: ink, color: PALETTE.day.textSub, w: cw });
      }),
    );
  } else {
    // traits: 12 타고남, 먹 기본형, 3행 × 4열
    const cw = (width - left - 8) / 4;
    const ch = (height - top - 10) / 3;
    const wpx = Math.min(cw * 0.42, ch * 0.42);
    TRAITS.forEach((tr, i) => {
      const r = tr.body;
      const c = tr.comb;
      cells.push({ key: `t${i}`, ox: left + (c + 0.5) * cw, oy: top + r * ch + ch * 0.72, wpx, look: { traits: tr, shape: shapeOf(tr), ink: BASE_INK_LOOK }, recs: recsByBody[r]!, night });
      if (r === 0) labels.push({ key: `c${c}`, x: left + c * cw, y: 8, text: `${COMB_NAME[c]} ${COMB_SHAPES[c]!.join(':')}`, color: txt, w: cw });
    });
    [0, 1, 2].forEach((b) => labels.push({ key: `b${b}`, x: 4, y: top + b * ch + ch * 0.5, text: `${BODY_ASPECTS[b]}`, color: txt, w: left - 6 }));
  }

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: night ? PALETTE.night.bg : PALETTE.day.bg }]} testID="m1-board">
      <Canvas style={StyleSheet.absoluteFill}>
        {view === 'ink' ? (
          <>
            <Group clip={{ x: 0, y: 0, width, height: top + (height - top - 20) / 2 }}>
              <Paper width={width} height={height} />
            </Group>
            <Group clip={{ x: 0, y: top + (height - top - 20) / 2, width, height }}>
              <Fill color={PALETTE.night.bg} />
            </Group>
          </>
        ) : night ? (
          <Fill color={PALETTE.night.bg} />
        ) : (
          <Paper width={width} height={height} />
        )}
        {cells.map((c) => (
          <Cell key={c.key} ox={c.ox} oy={c.oy} wpx={c.wpx} look={c.look} records={c.recs} night={c.night} lod={c.lod} light={c.light} wobble={c.wobble} />
        ))}
      </Canvas>
      {labels.map((l) => (
        <Text key={l.key} style={[styles.label, { left: l.x, top: l.y, width: l.w, color: l.color }]}>
          {l.text}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { position: 'absolute', fontSize: 10, lineHeight: 12, textAlign: 'center' },
});
