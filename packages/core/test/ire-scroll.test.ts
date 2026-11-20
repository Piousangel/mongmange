// 이레 두루마리 프레임 타임라인(C7) — 그럴듯한 오답 검사(OPERATING 8-1).
// 오답 후보: 같은 세이브인데 프레임이 달라짐 / 시계 값으로 정렬해 획 순서가 바뀜 / 자정을 날 경계로 씀 /
// 7획 미만·긴 잠·보름 카드에서 슬롯이 어긋나거나 길이가 바뀜 / 이름 공개를 꺼도 이름이 프레임에 남음 / 서버 루프 검사 밖 규격.
import { describe, expect, it } from 'vitest';
import {
  IRE_BEATS,
  IRE_OUTPUTS,
  IRE_SAFE_Y,
  IRE_SLOTS,
  LOOP_DURATION_RANGE_MS,
  addLocalDays,
  fullMoonDatesOfYear,
  ireAudioCues,
  ireDurationMs,
  ireFrameAt,
  ireLayout,
  ireLoopSourceOf,
  irePosterFrame,
  ireShareSourceOf,
  ireTextItems,
  localDateOf,
  nightDateOf,
  sim,
  type IreLoopSource,
  type IreOutputKind,
  type IreShareSource,
} from '../src/index';
import { H, KST, MIN, handStroke, kst, play } from './sim-helpers';

const STRINGS = { label: '느긋결', ink: '송연먹', app: '몽망이 키우기' };

type DayOpt = { skipStroke?: boolean; lateStroke?: boolean; awayNights?: number; moon?: boolean };

/** n일: 저녁 7시에 한 획 → 백그라운드(자동 잠) → 다음 날 아침 8시 열고 현상. 날마다 바꿀 수 있다 */
function playDays(n: number, opts: { seed?: number; start?: [number, number]; day?: (d: number) => DayOpt } = {}) {
  const [m0, d0] = opts.start ?? [11, 20];
  let s = sim.createInitial(kst(m0, d0, 19), KST, opts.seed ?? 11);
  let base = kst(m0, d0, 19);
  for (let d = 0; d < n; d++) {
    const o = opts.day?.(d) ?? {};
    const moon = o.moon ? { enabled: true, dev: true } : undefined;
    const evs: sim.Event[] = [{ type: 'grind', at: base + MIN, durationMs: 4000 + d * 900 }];
    if (o.lateStroke) {
      // 자정을 넘겨(현지 00:30) 긋고 00:40에 재운다 — 그 획은 여전히 '그 전날 저녁'의 하루다(04:00 경계)
      evs.push({ type: 'stroke', at: base + 5 * H + 30 * MIN, raw: handStroke(d + 1, 700 + d * 120) });
      evs.push({ type: 'putToSleep', at: base + 5 * H + 40 * MIN, moon });
      evs.push({ type: 'appBackground', at: base + 5 * H + 41 * MIN });
    } else {
      if (!o.skipStroke) evs.push({ type: 'stroke', at: base + 2 * MIN, raw: handStroke(d + 1, 700 + d * 120) });
      evs.push({ type: 'tap', at: base + 3 * MIN, target: 'body', holdMs: 900, x: 0.1, y: 0 });
      evs.push({ type: 'appBackground', at: base + 10 * MIN });
    }
    const away = o.awayNights ?? 1;
    const wakeAt = base + (away - 1) * 24 * H + 13 * H;
    evs.push({ type: 'appForeground', at: wakeAt, tzOffsetMin: KST, moon });
    evs.push({ type: 'developCard', at: wakeAt + MIN });
    s = play(s, evs).state;
    base += away * 24 * H;
  }
  return s;
}

function allFrames(src: IreShareSource | IreLoopSource, kind: IreOutputKind) {
  return Array.from({ length: IRE_OUTPUTS[kind].frames }, (_, i) => ireFrameAt(src, kind, i));
}

describe('출력 규격 — 서버 루프 커밋 검사(3-5-3)·D-20', () => {
  it('웹 루프: 540×675, 무음, 글 없음, 길이 7.5~8.5초 안(정확히 8초)', () => {
    const o = IRE_OUTPUTS.webLoop;
    expect([o.width, o.height]).toEqual([540, 675]);
    expect(o.audio).toBe(false);
    expect(o.text).toBe(false);
    const ms = ireDurationMs('webLoop');
    expect(ms).toBe(8000);
    expect(ms).toBeGreaterThanOrEqual(LOOP_DURATION_RANGE_MS[0]);
    expect(ms).toBeLessThanOrEqual(LOOP_DURATION_RANGE_MS[1]);
  });

  it('공유 영상: 9:16 1080×1920, 8초 240프레임(30fps), 소리 있음', () => {
    const o = IRE_OUTPUTS.share;
    expect([o.width, o.height, o.frames, o.fps]).toEqual([1080, 1920, 240, 30]);
    expect(ireDurationMs('share')).toBe(8000);
    expect(o.audio).toBe(true);
  });

  it('박자 합 = 8초: 방울 0.6 + 7획 × 0.7 = 5.5, 꼬리표는 끝 1.5초(6.5~8.0)', () => {
    expect(IRE_BEATS.strokesEnd).toBe(5500);
    expect(8000 - IRE_BEATS.joyEnd).toBe(1500);
    expect(IRE_BEATS.loopFade[1]).toBe(8000);
  });

  it('소리 자리: 웹 루프는 0개, 공유는 방울 1 + 획 수 + 기쁨 1(모두 8초 안)', () => {
    const s = playDays(7);
    expect(ireAudioCues(ireShareSourceOf(s, { nameVisible: false }), 'webLoop')).toEqual([]);
    const cues = ireAudioCues(ireShareSourceOf(s, { nameVisible: false }), 'share');
    expect(cues.map((c) => c.sound)).toEqual(['ink_drop', ...Array(7).fill('stroke_attach'), 'mong_joy']);
    for (const c of cues) expect(c.t).toBeLessThan(8000);
  });
});

describe('결정성', () => {
  it('같은 이벤트 열 = 같은 슬롯·같은 240프레임, 세이브 왕복 뒤에도 같다', () => {
    const a = playDays(7);
    const b = playDays(7);
    const fa = allFrames(ireShareSourceOf(a, { nameVisible: false }), 'share');
    expect(allFrames(ireShareSourceOf(b, { nameVisible: false }), 'share')).toEqual(fa);
    const round = sim.parseState(sim.serializeState(a, a.clock.lastSimAt));
    expect(ireShareSourceOf(round, { nameVisible: false })).toEqual(ireShareSourceOf(a, { nameVisible: false }));
    expect(allFrames(ireShareSourceOf(round, { nameVisible: false }), 'share')).toEqual(fa);
  });
});

describe('획 순서·날 경계', () => {
  it('슬롯 = State.strokes 앞 7개 순서. 시계가 뒤로 간 세이브(createdAt 뒤바뀜)도 시각으로 다시 정렬하지 않는다', () => {
    const s = playDays(7);
    const src = ireShareSourceOf(s, { nameVisible: false });
    expect(src.slots.map((x) => x.strokeId)).toEqual(s.strokes.slice(0, 7).map((x) => x.id));
    const rewound = { ...s, strokes: s.strokes.map((st, i) => ({ ...st, createdAt: s.strokes[s.strokes.length - 1 - i]!.createdAt })) };
    expect(ireShareSourceOf(rewound, { nameVisible: false }).slots.map((x) => x.strokeId)).toEqual(src.slots.map((x) => x.strokeId));
  });

  it('획은 차례로 붙는다: k+1번째가 보이기 시작할 때 k번째는 이미 0.6 이상, 점도 차례로 찬다', () => {
    const frames = allFrames(ireShareSourceOf(playDays(7), { nameVisible: false }), 'share');
    for (const f of frames) {
      for (let k = 0; k + 1 < IRE_SLOTS; k++) {
        if (f.attachK[k + 1]! >= 0) expect(f.attachK[k]!).toBeGreaterThanOrEqual(0.6);
        expect(f.dots[k]!).toBeGreaterThanOrEqual(f.dots[k + 1]!);
      }
    }
    const last = frames[frames.length - 1]!;
    expect(last.attachK).toEqual(Array(7).fill(1));
    expect(last.dots).toEqual(Array(7).fill(1));
    expect(last.combN).toBe(7);
  });

  it('자정 넘겨 그은 획(현지 00:30)도 그 전날 저녁의 하루 — 04:00 경계(nightDateOf)와 슬롯 날이 일치, 자정 경계와는 다르다', () => {
    const s = playDays(7, { day: (d) => (d === 2 ? { lateStroke: true } : {}) });
    const src = ireShareSourceOf(s, { nameVisible: false });
    expect(src.slots.map((x) => x.day)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const first = nightDateOf(s.strokes[0]!.createdAt, KST)!;
    for (const slot of src.slots) {
      const at = s.strokes[slot.strokeIndex]!.createdAt;
      expect(nightDateOf(at, KST)).toBe(addLocalDays(first, slot.day));
    }
    // 이 사례가 실제로 자정을 넘겼는지: 자정 경계라면 하루 뒤 날짜가 된다(그럴듯한 오답)
    const late = s.strokes[src.slots[2]!.strokeIndex]!.createdAt;
    expect(localDateOf(late, KST)).toBe(addLocalDays(first, 3));
  });
});

describe('7획 미만·7획 초과·긴 잠·보름', () => {
  it('3획: 길이·프레임 수는 그대로(8초), 빈 슬롯의 점·카드는 끝까지 0', () => {
    const src = ireShareSourceOf(playDays(3), { nameVisible: false });
    expect(src.slots).toHaveLength(3);
    const frames = allFrames(src, 'share');
    expect(frames).toHaveLength(240);
    const last = frames[239]!;
    expect(last.dots).toEqual([1, 1, 1, 0, 0, 0, 0]);
    expect(last.attachK).toHaveLength(3);
    for (const f of frames) for (let k = 3; k < 7; k++) expect(f.cards[k]).toBe(0);
  });

  it('0획(방울만): 프레임은 240, 몸은 방울만 나타난다', () => {
    const s = sim.createInitial(kst(11, 20, 19), KST, 3);
    const frames = allFrames(ireShareSourceOf(s, { nameVisible: false }), 'share');
    expect(frames).toHaveLength(240);
    expect(frames[239]!.drop).toBe(1);
    expect(frames[239]!.attachK).toEqual([]);
  });

  it('9획: 첫 일곱 획만(이레 = 첫 일곱)', () => {
    const s = playDays(9);
    expect(s.strokes.length).toBe(9);
    const src = ireShareSourceOf(s, { nameVisible: false });
    expect(src.slots.map((x) => x.strokeId)).toEqual(s.strokes.slice(0, 7).map((x) => x.id));
  });

  it('긴 잠(사흘 비움) 카드: 그 획의 슬롯에 긴 잠 표시, 슬롯 수·순서는 그대로', () => {
    const s = playDays(7, { day: (d) => (d === 3 ? { awayNights: 3 } : {}) });
    const src = ireShareSourceOf(s, { nameVisible: false });
    expect(src.slots).toHaveLength(7);
    const long = src.slots.filter((x) => x.longSleep);
    expect(long).toHaveLength(1);
    expect(long[0]!.index).toBe(3);
    expect(s.cards[long[0]!.cardIndex!]!.nightsMerged).toBeGreaterThan(1);
    expect(src.slots.map((x) => x.day)).toEqual([...src.slots.map((x) => x.day)].sort((a, b) => a - b));
  });

  it('보름 카드가 낀 이레: 그 슬롯에 보름 표시, 카드가 하나씩 차례로 펼쳐진다', () => {
    // 2026년 보름 중 하나가 다섯째 밤 무렵에 오도록 시작일을 고른다(보름 처음 3장 보호를 피함)
    const full = fullMoonDatesOfYear(2026, KST).find((d) => d >= '2026-03-01')!;
    const start = addLocalDays(full, -4);
    const [, mm, dd] = start.split('-').map(Number);
    const s = playDays(7, { start: [mm!, dd!], day: () => ({ moon: true }) });
    const src = ireShareSourceOf(s, { nameVisible: false });
    expect(src.slots.some((x) => x.moon)).toBe(true);
    const frames = allFrames(src, 'share');
    const opened = (f: (typeof frames)[number]) => f.cards.filter((c) => c > 0).length;
    for (let i = 1; i < frames.length; i++) expect(opened(frames[i]!)).toBeGreaterThanOrEqual(opened(frames[i - 1]!));
  });

  it('아직 현상 전인 마지막 획(카드 없음)은 카드 칸을 펼치지 않는다', () => {
    let s = playDays(6);
    s = play(s, [{ type: 'stroke', at: kst(11, 26, 19, 5), raw: handStroke(7) }]).state;
    const src = ireShareSourceOf(s, { nameVisible: false });
    expect(src.slots[6]!.cardIndex).toBeNull();
    for (const f of allFrames(src, 'share')) expect(f.cards[6]).toBe(0);
  });
});

describe('이름 공개(nameVisible) — 꺼지면 이름은 프레임에 0', () => {
  const named = () => play(playDays(7), [{ type: 'setName', at: kst(11, 27, 9), text: '달무리' }]).state;

  it('꺼짐: 재료에 name 키가 없고, 240프레임 어느 글에도 이름이 없다', () => {
    const s = named();
    expect(s.name?.text).toBe('달무리');
    const src = ireShareSourceOf(s, { nameVisible: false });
    expect('name' in src).toBe(false);
    for (const f of allFrames(src, 'share')) {
      expect(f.showName).toBe(false);
      for (const it of ireTextItems(src, f, 'share', STRINGS)) expect(it.text).not.toContain('달무리');
    }
  });

  it('켜짐: 꼬리표가 보이는 프레임에만 이름이 있고, 꼬리표 전에는 없다', () => {
    const src = ireShareSourceOf(named(), { nameVisible: true });
    const frames = allFrames(src, 'share');
    const withName = frames.filter((f) => ireTextItems(src, f, 'share', STRINGS).some((it) => it.text.includes('달무리')));
    expect(withName.length).toBeGreaterThan(0);
    for (const f of withName) expect(f.t).toBeGreaterThanOrEqual(IRE_BEATS.tagIn[0]);
    expect(ireTextItems(src, frames[239]!, 'share', STRINGS).find((x) => x.role === 'tag')!.text).toBe('달무리 · 송연먹');
  });

  it('웹 루프: 이름 칸이 타입에 없고, 켜진 공유 재료를 넘겨도 글·이름이 0', () => {
    const s = named();
    const loop = ireLoopSourceOf(s);
    expect('name' in loop).toBe(false);
    // @ts-expect-error — 루프 재료는 이름을 받지 않는다(3-5-2)
    const bad: IreLoopSource = { ...loop, name: '달무리' };
    for (const f of allFrames(bad, 'webLoop')) {
      expect(f.showName).toBe(false);
      expect(f.label).toBe(0);
      expect(f.tag).toBe(0);
      expect(ireTextItems(ireShareSourceOf(s, { nameVisible: true }), f, 'webLoop', STRINGS)).toEqual([]);
    }
  });
});

describe('배치·이음', () => {
  it('공유 9:16: 점·카드·글·인장이 모두 세로 14~80% 안(아래 14%는 비움)', () => {
    const L = ireLayout('share');
    const ys: [number, number][] = [[L.dots.y - L.dots.r, L.dots.y + L.dots.r], ...L.cards.map((c): [number, number] => [c.y, c.y + c.h])];
    const T = L.text!;
    for (const t of [T.label, T.tag, T.app]) ys.push([t.y - t.size * (1080 / 1920), t.y]);
    ys.push([T.seal.y, T.seal.y + T.seal.h]);
    for (const [a, b] of ys) {
      expect(a).toBeGreaterThanOrEqual(IRE_SAFE_Y[0]);
      expect(b).toBeLessThanOrEqual(IRE_SAFE_Y[1]);
    }
    for (const c of L.cards) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x + c.w).toBeLessThanOrEqual(1);
    }
  });

  it('웹 루프 이음: 첫 프레임은 방울 전(먹 0), 끝 프레임은 한지로 거의 스밈 — 포스터는 스미기 직전', () => {
    const src = ireLoopSourceOf(playDays(7));
    const frames = allFrames(src, 'webLoop');
    expect(frames[0]!.drop).toBe(0);
    expect(frames[frames.length - 1]!.fade).toBeLessThan(0.05);
    const p = frames[irePosterFrame('webLoop')]!;
    expect(p.fade).toBe(1);
    expect(p.attachK).toEqual(Array(7).fill(1));
  });

  it('범위 밖 프레임 번호는 끝으로 자른다', () => {
    const src = ireShareSourceOf(playDays(2), { nameVisible: false });
    expect(ireFrameAt(src, 'share', -5)).toEqual(ireFrameAt(src, 'share', 0));
    expect(ireFrameAt(src, 'share', 999)).toEqual(ireFrameAt(src, 'share', 239));
  });
});
