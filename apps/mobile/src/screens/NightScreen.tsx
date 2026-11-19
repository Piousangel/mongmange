import { Canvas, DisplacementMap, Fill, Group, Shader, useClock } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { InkStroke } from '../render/InkStroke';
import { day7 } from '../render/pose';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { breathAt } from '../render/motion';
import { nightFx, warpFx } from '../render/shaders';
import { SERIF } from './ui';

type Ripple = [number, number, number, number]; // x, y, 시작(초), 세기

/** (c) 밤 수면: 먹이 물에 풀리는 도메인 워핑 + 파문 + 터치 반응 */
export function NightScreen() {
  const { width, height } = useWindowDimensions();
  const clock = useClock();
  const ripples = useSharedValue<Ripple[]>([
    [0, 0, -99, 0],
    [0, 0, -99, 0],
    [0, 0, -99, 0],
  ]);
  const touch = useSharedValue<{ x: number; y: number; at: number }>({ x: -999, y: -999, at: -99 });
  const cx = width * 0.5;
  const cy = height * 0.40;
  const scale = (width / 390) * 0.82;
  const pose = useMemo(() => day7(), []);
  // 셰이더 속 머리(방울) 반지름 = 낮 몽망이 머리와 같은 크기
  const r = pose.dropR * scale;
  const bodyT = useDerivedValue(() => {
    const b = breathAt(clock.value * 1.4);
    return [{ translateX: cx }, { translateY: cy }, { scale: scale * (1 + 0.015 * b) }];
  });
  const warpU = useDerivedValue(() => {
    const since = clock.value / 1000 - touch.value.at;
    return { time: clock.value / 1000, amt: 1 + (since < 0 ? 0 : Math.exp(-since * 1.2) * 1.5) };
  });

  const uniforms = useDerivedValue(() => {
    const t = clock.value / 1000;
    // 네 번째 파문: 붓 끝에서 6초마다 떨어지는 물방울(배경 생명감)
    const drip = Math.floor(t / 6) * 6;
    const rp = ripples.value;
    const since = t - touch.value.at;
    return {
      res: [width, height],
      time: t,
      center: [cx, cy],
      r,
      breath: breathAt(clock.value * 1.4),
      rp0: rp[0]!,
      rp1: rp[1]!,
      rp2: rp[2]!,
      rp3: [width * 0.8, height * 0.68, drip, 0.7],
      touch: [touch.value.x, touch.value.y],
      touchAmt: since < 0 ? 0 : Math.exp(-since * 1.2),
    };
  });

  const onTouch = (x: number, y: number) => {
    const t = clock.value / 1000;
    const next = [...ripples.value.slice(1), [x, y, t, 1] as Ripple];
    ripples.value = next;
    touch.value = { x, y, at: t };
  };

  return (
    <View
      style={styles.root}
      testID="night-surface"
      onStartShouldSetResponder={() => true}
      onResponderGrant={(e) => onTouch(e.nativeEvent.pageX, e.nativeEvent.pageY)}
    >
      <Canvas style={StyleSheet.absoluteFill} opaque pointerEvents="none">
        <Fill>
          <Shader source={nightFx} uniforms={uniforms} />
        </Fill>
        {/* 낮에 그은 획(몸)이 물속에서 흔들리며 풀린다: 변위 맵 + 약한 블러 */}
        <Group opacity={0.9}>
          <DisplacementMap channelX="r" channelY="g" scale={14}>
            <Shader source={warpFx} uniforms={warpU} />
          </DisplacementMap>
          <Group transform={bodyT}>
            {pose.strokes.map((s, i) => (
              <InkStroke key={i} stroke={s} tint={s.kind === 'red' ? [0.55, 0.22, 0.14] : [0.008, 0.01, 0.02]} />
            ))}
          </Group>
        </Group>
      </Canvas>
      <View style={styles.top} pointerEvents="none">
        <Text style={styles.moons}>·  ☾  ☽  ●  ☾  ☽  ·</Text>
        <Text style={styles.title}>이레째 밤</Text>
        <Text style={styles.sub}>낮에 그은 획이 물에 풀리는 꿈</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a1222' },
  top: { position: 'absolute', top: 46, left: 0, right: 0, alignItems: 'center' },
  moons: { color: '#d9cfb8', fontSize: 13, letterSpacing: 4, opacity: 0.8 },
  title: { marginTop: 22, color: '#e6dcc6', fontFamily: SERIF, fontSize: 18, letterSpacing: 3 },
  sub: { marginTop: 8, color: '#b8ae98', fontFamily: SERIF, fontSize: 13, fontStyle: 'italic' },
});
