// 소리 엔진이 soundMap 규칙(스로틀·버스 상한·가로채기·전체 상한·덕킹·햅틱 간격·설정)을 지키는지.
import { describe, expect, it } from 'vitest';
import { SoundEngine, type Backend, type Timers, type Voice } from '../src/audio/engine';
import { DEFAULT_SOUND_SETTINGS, type Haptic, type SoundId } from '../src/audio/soundMap';

function fake() {
  let t = 0;
  const timeouts: { at: number; fn: () => void }[] = [];
  const intervals = new Map<number, { every: number; next: number; fn: () => void }>();
  let ids = 0;
  const created: { id: SoundId; loop: boolean; vol: number; stopped: boolean; end?: () => void }[] = [];
  const haptics: { at: number; h: Haptic }[] = [];
  const timers: Timers = {
    now: () => t,
    setTimeout: (fn, ms) => timeouts.push({ at: t + ms, fn }),
    setInterval: (fn, ms) => {
      const id = ++ids;
      intervals.set(id, { every: ms, next: t + ms, fn });
      return id;
    },
    clearInterval: (h) => intervals.delete(h as number),
  };
  const backend: Backend = {
    create(id, loop) {
      const rec: (typeof created)[number] = { id, loop, vol: 0, stopped: false };
      created.push(rec);
      const v: Voice = {
        setVolume: (x) => (rec.vol = x),
        setRate: () => {},
        play: () => {},
        stop: () => (rec.stopped = true),
        onEnd: (cb) => (rec.end = cb),
      };
      return v;
    },
    haptic: (h) => haptics.push({ at: t, h }),
  };
  const advance = (ms: number) => {
    const end = t + ms;
    while (t < end) {
      t = Math.min(end, t + 10);
      for (const x of timeouts.filter((x) => x.at <= t)) {
        timeouts.splice(timeouts.indexOf(x), 1);
        x.fn();
      }
      for (const iv of [...intervals.values()]) while (iv.next <= t) {
        iv.next += iv.every;
        iv.fn();
      }
    }
  };
  const eng = new SoundEngine(backend, timers, { ...DEFAULT_SOUND_SETTINGS }, () => 0.5);
  return { eng, created, haptics, advance };
}

describe('소리 엔진', () => {
  it('스로틀: pet은 250ms 안 연타를 건너뛴다(소리·햅틱 모두)', () => {
    const { eng, created, haptics, advance } = fake();
    expect(eng.play('pet')).toBe(true);
    advance(100);
    expect(eng.play('pet')).toBe(false);
    advance(200);
    expect(eng.play('pet')).toBe(true);
    expect(created.filter((c) => c.id === 'pet_hum')).toHaveLength(2);
    expect(haptics).toHaveLength(2);
  });

  it('voice 버스는 하나: 새 허밍이 오면 옛 것은 80ms 안에 멈춘다', () => {
    const { eng, created, advance } = fake();
    eng.play('pet');
    eng.play('mongJoy');
    expect(eng.activeOn('voice')).toEqual(['mongJoy']);
    advance(120);
    expect(created.find((c) => c.id === 'pet_hum')!.stopped).toBe(true);
  });

  it('sfx는 둘까지, 셋째가 오면 가장 오래된 것을 끈다', () => {
    const { eng, advance } = fake();
    eng.play('inkDropLand');
    advance(10);
    eng.play('strokeAttach');
    advance(10);
    eng.play('sleepDrop');
    expect(eng.activeOn('sfx')).toEqual(['strokeAttach', 'sleepDrop']);
  });

  it('전체 상한 5: 넘치면 새 sfx를 버린다(환경·손 루프는 그대로)', () => {
    const { eng, advance } = fake();
    eng.play('paperAir');
    eng.play('inkGrind');
    eng.play('pet');
    eng.play('inkDropLand');
    advance(5);
    eng.play('strokeAttach');
    expect(eng.activeCount).toBe(5);
    advance(10);
    // sfx 버스가 꽉 찼으므로 가로채기(자리 생김) → 허용, 전체는 5 유지
    expect(eng.play('morningLift')).toBe(true);
    expect(eng.activeCount).toBe(5);
    expect(eng.activeOn('ambience')).toEqual(['paperAir']);
    expect(eng.activeOn('gesture')).toEqual(['inkGrind']);
  });

  it('덕킹: gesture가 울리면 ambience가 -4dB(약 0.63배)로 내려가고, 멈추면 돌아온다', () => {
    const { eng, advance } = fake();
    eng.play('paperAir');
    eng.play('inkGrind');
    advance(400);
    expect(eng.duckGain('ambience')).toBeCloseTo(Math.pow(10, -4 / 20), 3);
    eng.stop('inkGrind');
    advance(1200);
    expect(eng.duckGain('ambience')).toBeCloseTo(1, 5);
  });

  it('루프 페이드인: paperAir는 0에서 시작해 1500ms에 제 음량(0.4)', () => {
    const { eng, created, advance } = fake();
    eng.play('paperAir');
    const v = created[0]!;
    expect(v.vol).toBe(0);
    advance(1600);
    expect(v.vol).toBeCloseTo(0.4, 2);
  });

  it('햅틱은 앱 전체 120ms에 한 번(sleepDrop 3회 비트는 모두 울림)', () => {
    const { eng, haptics, advance } = fake();
    eng.play('sleepDrop');
    eng.play('pet'); // 0ms에 sleepDrop 40ms 비트와 pet 0ms 비트
    advance(2000);
    const at = haptics.map((h) => h.at);
    for (let i = 1; i < at.length; i++) expect(at[i]! - at[i - 1]!).toBeGreaterThanOrEqual(120);
    expect(haptics.filter((h) => h.at >= 900)).toHaveLength(2);
  });

  it('설정: 소리를 끄면 소리는 없고 햅틱은 남는다 / 진동을 끄면 햅틱만 없다', () => {
    const a = fake();
    a.eng.setSettings({ ...DEFAULT_SOUND_SETTINGS, soundEnabled: false });
    expect(a.eng.play('pet')).toBe(false);
    expect(a.created).toHaveLength(0);
    expect(a.haptics).toHaveLength(1);
    const b = fake();
    b.eng.setSettings({ ...DEFAULT_SOUND_SETTINGS, hapticsEnabled: false });
    expect(b.eng.play('pet')).toBe(true);
    expect(b.haptics).toHaveLength(0);
  });

  it('백그라운드: 루프는 400ms에 페이드아웃해 멈추고, suspend 중에는 새 소리를 내지 않는다', () => {
    const { eng, created, advance } = fake();
    eng.play('nightAmbience');
    advance(3000);
    eng.suspend();
    advance(500);
    expect(created[0]!.stopped).toBe(true);
    expect(eng.play('pet')).toBe(false);
    eng.resume();
    expect(eng.play('mongJoy')).toBe(true);
  });

  it('붓 속도 섞기: 느리면 느린 루프, 빠르면 빠른 루프, 멈추면 15%', () => {
    const { eng, created, advance } = fake();
    eng.play('brushStroke');
    advance(100);
    eng.setBrushSpeed(0);
    const [slow, fast] = created;
    expect(slow!.vol).toBeCloseTo(0.5 * 0.15, 2);
    eng.setBrushSpeed(2000);
    expect(fast!.vol).toBeGreaterThan(0.45);
    expect(slow!.vol).toBeLessThan(0.01);
  });

  it('원샷 끝 알림을 받으면 자리를 비운다', () => {
    const { eng, created } = fake();
    eng.play('pet');
    created[0]!.end!();
    expect(eng.activeCount).toBe(0);
  });
});

describe('환경음 되살리기(리뷰 C1)', () => {
  it('백그라운드 → 앞: 원하던 환경음이 다시 돈다', () => {
    const { eng, advance } = fake();
    eng.play('nightAmbience');
    advance(3000);
    eng.suspend();
    advance(600);
    expect(eng.activeOn('ambience')).toEqual([]);
    eng.resume();
    expect(eng.activeOn('ambience')).toEqual(['nightAmbience']);
  });

  it('소리 끄기 → 켜기: 환경음이 돌아온다. 꺼진 동안 바뀐 화면의 환경음을 따른다', () => {
    const { eng, advance } = fake();
    eng.play('paperAir');
    eng.setSettings({ ...DEFAULT_SOUND_SETTINGS, soundEnabled: false });
    advance(300);
    expect(eng.activeOn('ambience')).toEqual([]);
    eng.stop('paperAir');
    eng.play('nightAmbience'); // 꺼진 동안 밤이 됨(소리는 안 나지만 원함은 기억)
    expect(eng.activeOn('ambience')).toEqual([]);
    eng.setSettings({ ...DEFAULT_SOUND_SETTINGS, soundEnabled: true });
    expect(eng.activeOn('ambience')).toEqual(['nightAmbience']);
  });

  it('멈춘 환경음은 되살리지 않는다, 손 루프도 되살리지 않는다', () => {
    const { eng, advance } = fake();
    eng.play('paperAir');
    eng.stop('paperAir');
    eng.play('inkGrind');
    eng.suspend();
    advance(800);
    eng.resume();
    expect(eng.activeCount).toBe(0);
  });
});
