import { Fill, Shader } from '@shopify/react-native-skia';
import { PAPER_BASE, paperFx } from './shaders';

export function Paper({ width, height }: { width: number; height: number }) {
  return (
    <Fill>
      <Shader source={paperFx} uniforms={{ res: [width, height], base: [...PAPER_BASE] }} />
    </Fill>
  );
}
