// 서버 번들(architecture.md 6-2 '안 되면 esbuild 한 파일 번들'을 기본으로 택함).
// - @mong/core와 Prisma 생성 클라이언트는 TS 원본을 번들에 넣는다 → core는 빌드 산출물·exports 변경 없이 그대로(앱 영향 0).
// - node_modules 패키지는 외부로 둔다(Nest의 선택 require가 번들에서 깨지지 않게). 런타임 이미지에는 prod 의존성만.
// - emitDecoratorMetadata가 켜져 있으면 tsup이 SWC로 데코레이터 메타데이터를 낸다(Nest DI에 필요).
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { main: 'src/main.ts', openapi: 'src/openapi.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: true,
  noExternal: ['@mong/core'],
});
