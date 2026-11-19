import { Canvas, Group, useClock } from '@shopify/react-native-skia';
import { useMemo, useRef, useState } from 'react';
import { type GestureResponderEvent, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { makeMutable, withTiming, Easing, type SharedValue } from 'react-native-reanimated';
import { InkStroke } from '../render/InkStroke';
import { Mongmangi } from '../render/Mongmangi';
import { Paper } from '../render/Paper';
import { day7, type BodyStroke } from '../render/pose';
import { buildStrokeMesh, nearestOnBody, type InputPoint } from '../render/strokeMesh';
import { BottomHint, SERIF, VerticalTitle } from './ui';

const ATTACH_GAP = 14; // 몸에서 이만큼 안쪽까지 끌어당긴다

interface Placed {
  stroke: BodyStroke;
  bornAt: number;
  offset: SharedValue<{ x: number; y: number }>;
}

/** (b) 드래그로 획 긋기 → 비백 획이 몸에 붙는다. 압력·속도 반영 */
export function StrokeScreen({ debug }: { debug: boolean }) {
  const { width, height } = useWindowDimensions();
  const clock = useClock();
  const pose = useMemo(() => day7(), []);
  const scale = width / 390;
  const cx = width * pose.anchor.x;
  const cy = height * pose.anchor.y;

  const live = useRef<InputPoint[]>([]);
  const [liveStroke, setLiveStroke] = useState<BodyStroke | null>(null);
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [info, setInfo] = useState('');

  // 화면 좌표 → 몽망이 로컬 좌표(숨쉬기 변형은 무시: 2.5% 이내)
  const toLocal = (e: GestureResponderEvent): InputPoint => {
    const ne = e.nativeEvent as GestureResponderEvent['nativeEvent'] & { force?: number; pressure?: number };
    const force = typeof ne.force === 'number' && ne.force > 0 ? ne.force : undefined;
    return {
      x: (ne.pageX - cx) / scale,
      y: (ne.pageY - cy) / scale,
      t: performance.now(),
      p: force !== undefined ? Math.min(force, 1) : 0.5,
    };
  };

  const rebuild = (smooth: number): BodyStroke | null => {
    const mesh = buildStrokeMesh(live.current, { width: 11, smooth });
    return mesh ? { mesh, kind: 'ink', seed: (placed.length * 17 + 5) % 97, age: 0 } : null;
  };

  return (
    <View
      style={styles.root}
      testID="stroke-surface"
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e) => {
        live.current = [toLocal(e)];
        setLiveStroke(null);
      }}
      onResponderMove={(e) => {
        live.current.push(toLocal(e));
        setLiveStroke(rebuild(1));
      }}
      onResponderRelease={() => {
        const s = rebuild(3); // 손을 떼면 몽망이가 획을 다듬는다
        setLiveStroke(null);
        if (!s) return;
        const spines = [...pose.strokes, ...placed.map((p) => p.stroke)].map((b) => b.mesh.spine);
        const start = s.mesh.spine[0]!;
        const near = nearestOnBody(start, pose.dropR, spines);
        const offset = makeMutable({ x: 0, y: 0 });
        if (near.d > ATTACH_GAP) {
          const k = (near.d - ATTACH_GAP * 0.5) / near.d;
          offset.value = withTiming(
            { x: (near.point.x - start.x) * k, y: (near.point.y - start.y) * k },
            { duration: 420, easing: Easing.out(Easing.cubic) },
          );
        }
        setPlaced((p) => [...p, { stroke: s, bornAt: clock.value, offset }]);
        setInfo(
          `len ${s.mesh.len.toFixed(0)}px · speed ${s.mesh.speed.toFixed(2)}px/ms · pressure ${s.mesh.pressure.toFixed(2)} · dry ${s.mesh.dry.toFixed(2)} · snap ${near.d > ATTACH_GAP ? near.d.toFixed(0) + 'px' : 'no'}`,
        );
      }}
    >
      <Canvas style={StyleSheet.absoluteFill} opaque pointerEvents="none">
        <Paper width={width} height={height} />
        <Mongmangi pose={pose} clock={clock} cx={cx} cy={cy} scale={scale} extra={placed} />
        {liveStroke && <LiveStroke stroke={liveStroke} cx={cx} cy={cy} scale={scale} />}
      </Canvas>
      <VerticalTitle text="몽망이 · 이레째" />
      <BottomHint label="몸에서 시작해 한 획" />
      {debug && info !== '' && (
        <Text style={styles.info} pointerEvents="none">
          {info}
        </Text>
      )}
    </View>
  );
}

function LiveStroke({ stroke, cx, cy, scale }: { stroke: BodyStroke; cx: number; cy: number; scale: number }) {
  // 그리는 중에는 숨쉬기 변형 없이 손가락 아래에 그대로 둔다
  return (
    <Group transform={[{ translateX: cx }, { translateY: cy }, { scale }]}>
      <InkStroke stroke={stroke} />
    </Group>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  info: { position: 'absolute', top: 20, left: 12, right: 12, fontSize: 10, color: '#7a7066', fontFamily: SERIF },
});
