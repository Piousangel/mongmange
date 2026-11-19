import { Canvas, useClock } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Mongmangi } from '../render/Mongmangi';
import { Paper } from '../render/Paper';
import { day0, day7 } from '../render/pose';
import { BottomHint, VerticalTitle } from './ui';

/** (a) 한지 + 먹 방울 + 빈자리 눈 깜빡임 + 숨쉬기 */
export function DayScreen({ day }: { day: 0 | 7 }) {
  const { width, height } = useWindowDimensions();
  const clock = useClock();
  const pose = useMemo(() => (day === 0 ? day0() : day7()), [day]);
  const scale = width / 390;
  return (
    <View style={styles.root}>
      <Canvas style={StyleSheet.absoluteFill} opaque>
        <Paper width={width} height={height} />
        <Mongmangi pose={pose} clock={clock} cx={width * pose.anchor.x} cy={height * pose.anchor.y} scale={scale} />
      </Canvas>
      <VerticalTitle text={day === 0 ? '몽망이 · 첫날' : '몽망이 · 이레째'} />
      <BottomHint label="오늘의 한 획" />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
