// 앱 쪽 순수 로직 테스트(소리 엔진 규칙·문구). RN·Expo 모듈은 불러오지 않는다.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    {
      // 네이티브 저장소(MMKV)는 테스트에서 웹 대체 경로(메모리)로
      name: 'storage-web',
      enforce: 'pre',
      resolveId(source, importer) {
        if (source === './storage' && importer?.endsWith('/game/store.ts')) return importer.replace(/store\.ts$/, 'storage.web.ts');
        return null;
      },
    },
    {
      // soundMap.ts의 Metro 에셋 require('...wav')를 테스트에서는 경로 문자열로 바꾼다
      name: 'metro-asset-require',
      transform(code, id) {
        if (!id.endsWith('soundMap.ts')) return null;
        return code.replace(/require\((['"][^'"]+\.wav['"])\)/g, '$1');
      },
    },
  ],
  // 시험은 기기 현지 시각을 서울로 고정한다(시험 고정값이 KST 기준). CI 러너는 UTC라 이것 없이는
  // 재우기 가능 시각 판정이 달라져 깨진다(11-20 첫 ci.yml 실행). 시간대별 동작은 core 시험이 tz 인자로 따로 본다.
  test: { include: ['test/**/*.test.ts', 'test/**/*.test.tsx'], environment: 'node', env: { TZ: 'Asia/Seoul' } },
});
