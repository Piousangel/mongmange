// 보름 모티프(core, 의존성 0)와 원격 계약(@mong/contract, zod)이 같은 모양인지 묶는다(C4).
// core는 contract를 import할 수 없어 구조 타입을 따로 두므로, 어긋나면 여기서 타입 검사·런타임 둘 다 깨진다.
import {
  contentManifestSchema,
  MOTIF_ZONES,
  motifFileSchema,
  type ContentManifest,
  type MotifFile,
} from '@mong/contract';
import { BUNDLED_MOON_MOTIFS, moonPackIds, type ManifestLike, type MotifFileData, type MotifFileZone } from '@mong/core';
import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/en';
import { ko } from '../src/i18n/ko';
import type { MessageKey } from '../src/i18n/types';

/** 번들 보름 문구는 i18n에만 있다(D-25 C6 줄) — 스키마 1 `text` 모양으로 모은다 */
const moonText = (id: string) => {
  const pick = (tb: Record<MessageKey, string>) => ({
    title: tb[`moon.${id}` as MessageKey],
    line: tb[`caption.moon.line.${id}` as MessageKey],
    scene: tb[`scene.moon.${id}` as MessageKey],
  });
  return { ko: pick(ko), en: pick(en) };
};

// 타입: contract가 내놓는 값을 core 함수에 그대로 넘길 수 있어야 한다(pnpm typecheck가 잡는다)
const asCoreFile = (m: MotifFile): MotifFileData => m;
const asCoreManifest = (m: ContentManifest): ManifestLike => m;
const zonesMatch: readonly MotifFileZone[] = MOTIF_ZONES;

describe('core 보름 모티프 ↔ contract 스키마 1', () => {
  it('zone 열거가 같다', () => {
    expect([...zonesMatch].sort()).toEqual(
      (['near-alone', 'near-with', 'far-alone', 'far-with', 'center', 'moon'] satisfies MotifFileZone[]).sort(),
    );
  });

  it('번들 보름 3의 i18n 문구·zone·family가 motifFileSchema(글자 수 상한·금지어)를 통과한다(형상은 C14 전이라 자리 경로로 채워 검사)', () => {
    for (const m of BUNDLED_MOON_MOTIFS) {
      const file = {
        schema: m.schema,
        id: m.id,
        zone: m.zone,
        family: m.family,
        paths: m.paths.length > 0 ? m.paths : [{ d: 'M0 0 L1 1', w: 1, layer: 'gold' }],
        shader: m.shader,
        text: moonText(m.id),
      };
      const r = motifFileSchema.safeParse(file);
      expect(r.success, `${m.id}: ${r.success ? '' : JSON.stringify(r.error.issues)}`).toBe(true);
      if (r.success) expect(asCoreFile(r.data).id).toBe(m.id);
    }
  });

  it('12·1·2월 = 달길·달빛 그네·달 건지기(달항아리는 번들 아님)', () => {
    expect(BUNDLED_MOON_MOTIFS.map((m) => [m.id, m.month, moonText(m.id).ko.title])).toEqual([
      ['moon-12', 12, '달길'],
      ['moon-01', 1, '달빛 그네'],
      ['moon-02', 2, '달 건지기'],
    ]);
  });

  it('contract로 검증한 매니페스트를 core moonPackIds가 그대로 읽는다', () => {
    const sha = 'a'.repeat(64);
    const parsed = contentManifestSchema.parse({
      v: 1,
      seq: 3,
      motifs: [
        { id: 'w2027-06-crane', kind: 'weekly', from: '2027-02-08', schema: 1, minAppBuild: 14, url: '/content/motifs/w2027-06-crane.3f9a1c7e.json', sha256: sha, bytes: 9123 },
        { id: 'moon-03', kind: 'moon', month: 3, schema: 1, minAppBuild: 14, url: '/content/motifs/moon-03.a1b2c3d4.json', sha256: sha, bytes: 11204 },
        { id: 'moon-04', kind: 'moon', month: 4, schema: 1, minAppBuild: 14, url: '/content/motifs/moon-04.a1b2c3d4.json', sha256: sha, bytes: 11204 },
      ],
      revoked: ['moon-04'],
    });
    expect(moonPackIds(asCoreManifest(parsed), 14)).toEqual(['moon-03']);
    expect(moonPackIds(asCoreManifest(parsed), 13)).toEqual([]);
  });
});
