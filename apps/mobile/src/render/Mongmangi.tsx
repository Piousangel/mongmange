import { Group, Rect, Shader } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { InkStroke } from './InkStroke';
import type { BodyStroke, MongmangiPose } from './pose';
import { blinkAt, breathAt } from './motion';
import { INK, dropFx } from './shaders';

interface Props {
  pose: MongmangiPose;
  clock: SharedValue<number>;
  /** 화면 좌표의 머리 중심 */
  cx: number;
  cy: number;
  scale: number;
  /** 사용자가 새로 그은 획(태어난 시각 포함) */
  extra?: { stroke: BodyStroke; bornAt: number; offset?: SharedValue<{ x: number; y: number }> }[];
}

export function Mongmangi({ pose, clock, cx, cy, scale, extra = [] }: Props) {
  const transform = useDerivedValue(() => {
    const b = breathAt(clock.value);
    const sy = 1 + 0.025 * b;
    const sx = 1 - 0.012 * b;
    return [{ translateX: cx }, { translateY: cy }, { scaleX: scale * sx }, { scaleY: scale * sy }];
  });
  const dropUniforms = useDerivedValue(() => ({
    r: pose.dropR,
    blink: blinkAt(clock.value),
    eye: [pose.eye.x, pose.eye.y],
    eyeR: pose.eyeR,
    ink: [...INK],
    bleed: 1,
  }));
  const R = pose.dropR * 2.4;
  return (
    <Group transform={transform}>
      {pose.strokes.map((s, i) => (
        <InkStroke key={i} stroke={s} />
      ))}
      {extra.map((e, i) => (
        <ExtraStroke key={`x${i}`} {...e} clock={clock} />
      ))}
      <Rect x={-R} y={-R} width={R * 2} height={R * 2}>
        <Shader source={dropFx} uniforms={dropUniforms} />
      </Rect>
    </Group>
  );
}

function ExtraStroke({
  stroke,
  bornAt,
  offset,
  clock,
}: {
  stroke: BodyStroke;
  bornAt: number;
  offset?: SharedValue<{ x: number; y: number }>;
  clock: SharedValue<number>;
}) {
  const t = useDerivedValue(() => {
    const o = offset?.value ?? { x: 0, y: 0 };
    return [{ translateX: o.x }, { translateY: o.y }];
  });
  return (
    <Group transform={t}>
      <InkStroke stroke={stroke} clock={clock} bornAt={bornAt} />
    </Group>
  );
}
