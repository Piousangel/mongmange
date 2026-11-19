import { Group, Shader, Vertices } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import type { BodyStroke } from './pose';
import { INK, VERMILION, strokeFx, strokeHaloFx } from './shaders';

function inkColor(s: BodyStroke): number[] {
  const base = s.kind === 'red' ? VERMILION : INK;
  const grey = 0.45;
  return base.map((c) => c + (grey - c) * s.age * 0.3);
}

interface Props {
  stroke: BodyStroke;
  /** 갓 그은 획의 번짐 애니메이션용: 시계(ms)와 태어난 시각(ms) */
  clock?: SharedValue<number>;
  bornAt?: number;
  /** 색을 덮어쓴다(밤: 물에 풀린 먹) */
  tint?: number[];
}

export function InkStroke({ stroke, clock, bornAt, tint }: Props) {
  const { mesh, seed } = stroke;
  const ink = tint ?? inkColor(stroke);
  const density = (stroke.kind === 'red' ? 0.88 : 0.98) * (1 - stroke.age * 0.1);
  const fresh = useDerivedValue(() => {
    if (!clock || bornAt === undefined) return 0;
    const k = (clock.value - bornAt) / 1000;
    return k < 0 ? 1 : Math.max(1 - k, 0);
  });
  const uniforms = useDerivedValue(() => ({
    len: mesh.len,
    dry: mesh.dry,
    seed,
    ink,
    density,
    fresh: fresh.value,
  }));
  const haloUniforms = useDerivedValue(() => ({
    seed,
    ink,
    amount: 0.1 + 0.18 * fresh.value,
  }));
  return (
    <Group>
      <Vertices vertices={mesh.halo.vertices} textures={mesh.halo.textures} indices={mesh.indices} mode="triangles">
        <Shader source={strokeHaloFx} uniforms={haloUniforms} />
      </Vertices>
      <Vertices vertices={mesh.vertices} textures={mesh.textures} indices={mesh.indices} mode="triangles">
        <Shader source={strokeFx} uniforms={uniforms} />
      </Vertices>
    </Group>
  );
}
