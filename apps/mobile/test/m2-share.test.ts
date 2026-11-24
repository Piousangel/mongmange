// M2 리뷰 M-2: 공유 경로 **입구**가 이름을 정한다는 것을 런타임으로 본다(정적 정규식은 보조).
// 그럴듯한 오답: 화면 라벨(앱 안 이름)을 그대로 넘기면 PNG에 이름이 실린다 / 공개 스위치를 우회해 state.name을 읽는다.
// 이름이 든 state·labels를 그대로 넣어도, 공개가 꺼졌거나 naming이 꺼졌으면 공유 결과(카드 재료·이레 재료·스냅숏 직렬화)에 이름이 0이어야 한다.
import { ireShareSourceOf, parsePublicSnapshot, serializePublicSnapshot, sim, type KV } from '@mong/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import namedSnap from '../../../packages/core/test/fixtures/snap/named.json';

vi.mock('../src/render/dreamCard/renderImage', () => ({ renderDreamCardImage: vi.fn(async () => ({ width: 1, height: 1, mime: 'image/png', base64: '' })), renderIreScrollImage: vi.fn() }));
vi.mock('../src/share/native', () => ({ SHARE_DIR: 'mong-share', shareFile: vi.fn(), sharePng: vi.fn(async () => 'shared'), shareSupported: () => true }));
vi.mock('../src/render/ireVideo/prepare', () => ({ prepareIreShare: vi.fn() }));
vi.mock('../src/render/ireVideo/renderFrame', () => ({ renderIreFramePixels: vi.fn() }));
vi.mock('../src/render/clock', () => ({ PARAMS: { shareFail: false } }));
vi.mock('../src/render/dreamCard/DreamCardThumb', () => ({ strokesForCard: vi.fn(() => []) }));

import { setFeature } from '../src/features';
import { sharedName } from '../src/game/naming';
import { __configureForTest, dispatch, getSnapshot, install, setMeta } from '../src/game/store';
import { __setDeviceTagForTest } from '../src/i18n';
import { renderDreamCardImage } from '../src/render/dreamCard/renderImage';
import { shareDreamCard } from '../src/share/shareCard';

const NAME = '몽실이';
const mem = (): KV => {
  const m = new Map<string, string>();
  return { getString: (k) => m.get(k), set: (k, v) => void m.set(k, v), remove: (k) => void m.delete(k) } as KV;
};
const card: sim.DreamCard = { night: 3, motifId: 'center.moon', composition: 0, inkTone: 0.5, flow: 0, flowSeed: 1, strokeRef: null, nightsMerged: 1 };

beforeEach(() => {
  vi.stubGlobal('__DEV__', false); // shareCard의 개발 실패 흉내 스위치
  __setDeviceTagForTest('ko-KR');
  __configureForTest({ kv: mem(), now: () => Date.UTC(2026, 11, 1, 3) });
  install();
  dispatch({ type: 'setName', text: NAME });
});
afterEach(() => {
  setFeature('naming', null);
  vi.clearAllMocks();
});

/** 공유 입구 세 곳을 이름이 든 재료로 모두 부르고, 밖으로 나간 값을 문자열로 모은다 */
async function shareAll(): Promise<string> {
  const st = getSnapshot().state!;
  // 화면 라벨처럼 앱 안 이름이 든 labels를 그대로 넘긴다(호출부 실수 흉내)
  await shareDreamCard({ card, strokes: [], labels: { name: NAME, line: '줄', sub: '보조' } }, '4:5', st);
  await shareDreamCard({ card, strokes: [] }, '9:16', st);
  await shareDreamCard({ card, strokes: [], labels: { name: NAME, line: '줄', sub: '보조' } }, '4:5', null);
  const cards = vi.mocked(renderDreamCardImage).mock.calls.map((c) => JSON.stringify(c[0]));
  // 그림 함수가 실제로 세 번 불렸어야 '이름 0'이 의미가 있다(아무것도 안 그려서 통과하는 것을 막음)
  expect(cards.length).toBe(3);
  // 이레 재료·공개 스냅숏: 앱의 공유 이름 문을 거친 값으로 만든다(core 재료 함수에 nameVisible = 문 결과)
  const ire = JSON.stringify(ireShareSourceOf(st, { nameVisible: sharedName(st) !== null }));
  const parsed = parsePublicSnapshot(namedSnap);
  if (!parsed.ok) throw new Error('fixture');
  const snap = serializePublicSnapshot(parsed.snap, sharedName(st));
  return [...cards, ire, snap].join('\n');
}

describe('공유 입구 런타임 시험', () => {
  it('naming 켬 + 공개 끔: 카드 3번·이레 재료·스냅숏 어디에도 이름 0', async () => {
    setFeature('naming', true);
    expect(await shareAll()).not.toContain(NAME);
    expect(vi.mocked(renderDreamCardImage).mock.calls.length).toBe(3);
  });
  it('naming 꺼짐 + 공개 켬: 이름 0', async () => {
    setMeta({ nameVisible: true });
    expect(await shareAll()).not.toContain(NAME);
  });
  it('둘 다 켬이면 그때만 실린다(카드 재료·이레 재료·스냅숏) — 시험이 실제로 이름을 볼 수 있다는 대조', async () => {
    setFeature('naming', true);
    setMeta({ nameVisible: true });
    const out = await shareAll();
    const calls = vi.mocked(renderDreamCardImage).mock.calls;
    expect(calls[0]![0].labels!.name).toBe(NAME);
    expect(calls[1]![0].labels!.name).toBe(NAME);
    expect(calls[2]![0].labels!.name).not.toBe(NAME); // owner 없음 = 이름 없음
    expect(out.split('\n')[3]).toContain(NAME);
    expect(out.split('\n')[4]).toContain(NAME);
  });
});
