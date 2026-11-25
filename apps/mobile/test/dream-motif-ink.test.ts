// C14b 꿈 모티프 붓 형상 15 — 앱 쪽: ① 번들 형상 + i18n 문구가 원격 모티프 파일 스키마 1(contract)을 그대로 통과한다
// (번들과 원격이 같은 꼴 — 나중에 원격 팩으로 옮겨도 고칠 것 없음) ② dreamContent 플래그는 운영 기본 꺼짐, 개발 빌드 기본 켜짐.
import { motifFileSchema } from '@mong/contract';
import { sim } from '@mong/core';
import { afterEach, describe, expect, it } from 'vitest';
import { DEV_BUILD_ON, FEATURE_DEFAULTS, bundledDefault, isOn, remoteBundled, setFeature } from '../src/features';
import { en } from '../src/i18n/en';
import { ko } from '../src/i18n/ko';
import type { MessageKey } from '../src/i18n/types';

const NEW = sim.MOTIFS.filter((m) => m.unlockAtCards > 0);
const text = (id: string) => {
  const pick = (tb: Record<MessageKey, string>) => ({
    title: tb[`motif.${id}` as MessageKey],
    line: tb[`caption.line.${id}` as MessageKey],
    scene: tb[`scene.${id}` as MessageKey],
  });
  return { ko: pick(ko), en: pick(en) };
};

describe('번들 형상 15 ↔ contract 모티프 파일 스키마 1', () => {
  it('형상·구역·가족·ko/en 문구가 motifFileSchema(경로 글자·굵기·개수·글자 수·금지어)를 통과한다', () => {
    expect(NEW).toHaveLength(15);
    // 알려진 것(카피 레인에 넘김): en 캡션 'A winding path ran on into the distance'의 'ran'이 원격 금지어(\bran\b — 몽망이가
    // 달렸다는 뜻을 막는 규칙)에 걸린다. 번들 문구에는 이 규칙이 적용되지 않지만, 원격 팩으로 옮기면 반려된다 — 고치면 이 목록을 비운다
    const KNOWN: Record<string, string> = { 'far-alone.path': 'text.en.line' };
    for (const m of NEW) {
      // 번들 id는 '구역.이름'(점)이고 원격 id 형식은 점이 없다 — id만 원격 꼴로 바꿔 나머지를 검사한다
      const r = motifFileSchema.safeParse({ schema: 1, id: m.id.replace('.', '-'), zone: m.zone, family: m.family, paths: m.paths, shader: { bleed: 0.25, grain: 0.15, tone: 'day' }, text: text(m.id) });
      const issues = r.success ? [] : r.error.issues.map((x) => x.path.join('.'));
      expect(issues, m.id).toEqual(KNOWN[m.id] ? [KNOWN[m.id]] : []);
    }
  });
});

describe('dreamContent 플래그 — 운영 기본 꺼짐·개발 빌드 기본 켜짐', () => {
  afterEach(() => setFeature('dreamContent', null));

  it('운영 기본값·원격 번들 값은 꺼짐(켜는 결정은 PM), 개발 빌드 번들 기본값만 켜짐', () => {
    expect(FEATURE_DEFAULTS.dreamContent).toBe(false);
    expect(DEV_BUILD_ON).toEqual(['dreamContent']);
    expect(bundledDefault('dreamContent', false)).toBe(false);
    expect(bundledDefault('dreamContent', true)).toBe(true);
    expect(remoteBundled()).not.toHaveProperty('dreamContent', true);
    // 개발 빌드 기본은 다른 플래그를 켜지 않는다
    for (const id of Object.keys(FEATURE_DEFAULTS) as (keyof typeof FEATURE_DEFAULTS)[]) if (id !== 'dreamContent') expect(bundledDefault(id, true), id).toBe(FEATURE_DEFAULTS[id]);
  });

  it('시험 환경(__DEV__ 없음) = 운영과 같이 꺼짐, 개발 메뉴로 켜고 되돌린다', () => {
    expect(isOn('dreamContent')).toBe(false);
    setFeature('dreamContent', true);
    expect(isOn('dreamContent')).toBe(true);
    setFeature('dreamContent', null);
    expect(isOn('dreamContent')).toBe(false);
  });
});
