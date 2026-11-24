// soundMap 규칙을 그대로 따르는 재생 엔진: 버스별 동시 재생 상한·가로채기, 전체 상한, 덕킹(200ms 어택·400ms 릴리스),
// 이벤트 스로틀, 햅틱 앱 전체 120ms 간격, 설정(소리·햅틱 따로). 실제 재생은 Backend가 한다(네이티브 expo-audio, 웹 no-op).
// 시계·타이머를 주입받아 테스트에서 결정적으로 돌린다.
import {
  HAPTIC_MIN_INTERVAL_MS,
  MAX_TOTAL_VOICES,
  MIX_RULES,
  SOUND_MAP,
  type Bus,
  type Haptic,
  type SoundCue,
  type SoundEvent,
  type SoundId,
  type SoundSettings,
} from './soundMap';

export interface Voice {
  setVolume(v: number): void;
  setRate(r: number): void;
  play(): void;
  /** 멈추고 자원 해제 */
  stop(): void;
  onEnd(cb: () => void): void;
}

export interface Backend {
  create(id: SoundId, loop: boolean): Voice | null;
  haptic(h: Haptic): void;
}

export interface Timers {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(h: unknown): void;
}

const DUCK_ATTACK_MS = 200;
const DUCK_RELEASE_MS = 400;
const RAMP_STEP_MS = 40;
/** 백그라운드로 가면 루프는 400ms에 페이드아웃(soundMap 기기 규칙) */
const BG_FADE_MS = 400;
const ONE_SHOT_MAX_MS = 8000;

const dbToGain = (db: number) => Math.pow(10, db / 20);

interface Playing {
  key: number;
  bus: Bus;
  event: SoundEvent;
  voices: { v: Voice; base: number }[];
  /** 0..1 페이드 게인 */
  fade: number;
  fadeTarget: number;
  fadeRate: number; // 1/ms
  stopWhenSilent: boolean;
  startedAt: number;
  loop: boolean;
}

export class SoundEngine {
  private playing: Playing[] = [];
  private lastEventAt = new Map<SoundEvent, number>();
  private lastHapticAt = -Infinity;
  private duck: Record<Bus, number> = { ambience: 1, gesture: 1, voice: 1, sfx: 1 };
  private ticker: unknown = null;
  private seq = 0;
  private suspended = false;
  /** 화면이 원하는 환경음(ambience 루프). 소리를 껐거나 백그라운드여도 기억했다가 되살린다(리뷰 C1) */
  private wantAmbience: SoundEvent | null = null;
  constructor(
    private backend: Backend,
    private timers: Timers,
    public settings: SoundSettings,
    private rand: () => number = Math.random,
  ) {}

  setSettings(s: SoundSettings) {
    const wasOn = this.settings.soundEnabled;
    this.settings = s;
    if (!s.soundEnabled) this.stopAll(150);
    else if (!wasOn) this.restoreAmbience();
    this.applyVolumes();
  }

  /** 지금 원하는 환경음(테스트·디버그) */
  get wantedAmbience() {
    return this.wantAmbience;
  }

  /** 지금 울리는 소리 수(테스트·디버그) */
  get activeCount() {
    return this.playing.filter((p) => p.fadeTarget > 0).length;
  }
  activeOn(bus: Bus) {
    return this.playing.filter((p) => p.bus === bus && p.fadeTarget > 0).map((p) => p.event);
  }
  duckGain(bus: Bus) {
    return this.duck[bus];
  }

  /**
   * 이름 가락(M2): nameMelody 큐의 첫 층 파일을 가락 번호의 파일로 바꾸고, 속도를 이름에서 정해진 값으로 고정해 낸다.
   * 버스·스로틀·설정·햅틱 규칙은 다른 원샷과 같다.
   */
  playMelody(sound: SoundId, rate: number): boolean {
    const cue = SOUND_MAP.nameMelody;
    if (cue.type !== 'oneShot') return false;
    return this.play('nameMelody', { ...cue, layers: cue.layers.map((l, i) => (i === 0 ? { ...l, sound } : l)), rateJitter: 0 }, rate);
  }

  /** 원샷 또는 루프 시작. 반환: 소리를 냈는가(스로틀·설정·상한으로 건너뛰면 false) */
  play(event: SoundEvent, cueIn?: SoundCue, fixedRate?: number): boolean {
    const cue = cueIn ?? SOUND_MAP[event];
    const t = this.timers.now();
    const last = this.lastEventAt.get(event);
    if (cue.bus === 'ambience' && cue.type !== 'oneShot') this.wantAmbience = event;
    if (cue.throttleMs > 0 && last !== undefined && t - last < cue.throttleMs) return false;
    this.lastEventAt.set(event, t);
    this.haptics(cue);
    if (!this.settings.soundEnabled || this.suspended) return false;
    if (cue.type !== 'oneShot') {
      // 같은 루프가 이미 돌면 그대로 둔다
      if (this.playing.some((p) => p.event === event && p.fadeTarget > 0)) return true;
    }
    return this.start(event, cue, fixedRate);
  }

  /** 루프 멈춤(cue.fadeOutMs) */
  stop(event: SoundEvent) {
    const cue = SOUND_MAP[event];
    const ms = cue.type === 'oneShot' ? 80 : cue.fadeOutMs;
    if (this.wantAmbience === event) this.wantAmbience = null;
    for (const p of this.playing) if (p.event === event) this.fadeTo(p, 0, ms, true);
  }

  /** 붓 획: 손가락 속도(px/s)로 느린·빠른 루프 섞기 */
  setBrushSpeed(pxPerS: number) {
    const cue = SOUND_MAP.brushStroke;
    if (cue.type !== 'speedBlendLoop') return;
    const p = this.playing.find((x) => x.event === 'brushStroke' && x.fadeTarget > 0);
    if (!p || p.voices.length < 2) return;
    const k = Math.min(1, Math.max(0, (pxPerS - cue.slowPxS) / (cue.fastPxS - cue.slowPxS)));
    const moving = Math.min(1, pxPerS / cue.slowPxS);
    const level = cue.idleVolumeRatio + (1 - cue.idleVolumeRatio) * moving;
    p.voices[0]!.base = cue.volume * level * Math.cos((k * Math.PI) / 2);
    p.voices[1]!.base = cue.volume * level * Math.sin((k * Math.PI) / 2);
    this.applyVolumes();
  }

  /** 앱이 백그라운드로: 루프 400ms 페이드아웃 후 정지. 원샷은 그대로 끝나게 둔다 */
  suspend() {
    this.suspended = true;
    for (const p of this.playing) if (p.loop) this.fadeTo(p, 0, BG_FADE_MS, true);
  }
  /** 앞으로 돌아옴: 원하던 환경음을 다시 튼다(손 루프는 손을 다시 대야 난다) */
  resume() {
    this.suspended = false;
    this.restoreAmbience();
  }

  private restoreAmbience() {
    const ev = this.wantAmbience;
    if (!ev || !this.settings.soundEnabled || this.suspended) return;
    if (this.playing.some((p) => p.event === ev && p.fadeTarget > 0)) return;
    this.start(ev, SOUND_MAP[ev]);
  }

  stopAll(ms = 150) {
    for (const p of this.playing) this.fadeTo(p, 0, ms, true);
  }

  // ── 내부 ──────────────────────────────────────────────

  private haptics(cue: SoundCue) {
    if (!this.settings.hapticsEnabled) return;
    for (const beat of cue.haptics) {
      const fire = () => {
        const t = this.timers.now();
        if (t - this.lastHapticAt < HAPTIC_MIN_INTERVAL_MS) return; // 겹치면 나중 것을 버림
        if (!this.settings.hapticsEnabled) return;
        this.lastHapticAt = t;
        this.backend.haptic(beat.haptic);
      };
      if (beat.atMs <= 0) fire();
      else this.timers.setTimeout(fire, beat.atMs);
    }
  }

  private start(event: SoundEvent, cue: SoundCue, fixedRate?: number): boolean {
    const rule = MIX_RULES[cue.bus];
    const live = this.playing.filter((p) => p.fadeTarget > 0);
    const onBus = live.filter((p) => p.bus === cue.bus).sort((a, b) => a.startedAt - b.startedAt);
    // 전체 상한: sfx → voice 새 것을 버린다(ambience·gesture는 끊지 않음). 같은 버스 가로채기로 자리가 나면 통과
    const freesSlot = onBus.length >= rule.maxVoices && rule.overflow === 'replace';
    if (live.length >= MAX_TOTAL_VOICES && !freesSlot && (cue.bus === 'sfx' || cue.bus === 'voice')) return false;
    if (onBus.length >= rule.maxVoices) {
      if (rule.overflow === 'drop') return false;
      const steal = onBus.length - rule.maxVoices + 1;
      for (const p of onBus.slice(0, steal)) this.fadeTo(p, 0, rule.stealFadeMs, true);
    }
    const voices: Playing['voices'] = [];
    const loop = cue.type !== 'oneShot';
    if (cue.type === 'oneShot') {
      const rate = fixedRate ?? (cue.rateJitter > 0 ? 1 + (this.rand() * 2 - 1) * cue.rateJitter : 1);
      for (const layer of cue.layers) {
        const v = this.backend.create(layer.sound, false);
        if (!v) continue;
        v.setRate(rate);
        voices.push({ v, base: layer.volume });
      }
    } else if (cue.type === 'loop') {
      const v = this.backend.create(cue.sound, true);
      if (v) voices.push({ v, base: cue.volume });
    } else {
      const a = this.backend.create(cue.slow, true);
      const b = this.backend.create(cue.fast, true);
      if (a && b) voices.push({ v: a, base: cue.volume * cue.idleVolumeRatio }, { v: b, base: 0 });
    }
    if (voices.length === 0) return false;
    const fadeIn = cue.type === 'oneShot' ? 0 : cue.fadeInMs;
    const p: Playing = {
      key: ++this.seq,
      bus: cue.bus,
      event,
      voices,
      fade: fadeIn > 0 ? 0 : 1,
      fadeTarget: 1,
      fadeRate: fadeIn > 0 ? 1 / fadeIn : 0,
      stopWhenSilent: false,
      startedAt: this.timers.now(),
      loop,
    };
    this.playing.push(p);
    if (cue.type === 'oneShot') {
      let ended = 0;
      cue.layers.forEach((layer, i) => {
        const vv = voices[i];
        if (!vv) return;
        vv.v.onEnd(() => {
          ended++;
          if (ended >= voices.length) this.remove(p);
        });
        if (layer.delayMs && layer.delayMs > 0) this.timers.setTimeout(() => this.playing.includes(p) && vv.v.play(), layer.delayMs);
      });
      // 끝 알림을 놓쳐도 자리를 영원히 차지하지 않게(가장 긴 원샷 4.8초)
      this.timers.setTimeout(() => this.remove(p), ONE_SHOT_MAX_MS);
    }
    this.recomputeDuck();
    this.applyVolumes();
    if (cue.type === 'oneShot') {
      cue.layers.forEach((l, i) => {
        if (!(l.delayMs && l.delayMs > 0)) voices[i]?.v.play();
      });
    } else voices.forEach((x) => x.v.play());
    if (p.fade < 1) this.ensureTicker();
    return true;
  }

  private fadeTo(p: Playing, target: number, ms: number, stop: boolean) {
    p.fadeTarget = target;
    p.stopWhenSilent = stop && target === 0;
    if (ms <= 0) {
      p.fade = target;
      if (p.stopWhenSilent) this.remove(p);
      else this.applyVolumes();
    } else {
      p.fadeRate = Math.abs(p.fade - target) / ms || 1;
      this.ensureTicker();
    }
    this.recomputeDuck();
  }

  private remove(p: Playing) {
    const i = this.playing.indexOf(p);
    if (i < 0) return;
    this.playing.splice(i, 1);
    for (const x of p.voices) x.v.stop();
    this.recomputeDuck();
    this.applyVolumes();
  }

  /** 울리는 버스가 다른 버스를 낮춘다(dB 합산). 목표값만 정하고 램프는 ticker가 */
  private duckTarget: Record<Bus, number> = { ambience: 1, gesture: 1, voice: 1, sfx: 1 };
  private duckSpan: Record<Bus, number> = { ambience: 1, gesture: 1, voice: 1, sfx: 1 };
  private recomputeDuck() {
    const db: Record<Bus, number> = { ambience: 0, gesture: 0, voice: 0, sfx: 0 };
    const busesOn = new Set(this.playing.filter((p) => p.fadeTarget > 0).map((p) => p.bus));
    for (const b of busesOn) {
      const d = MIX_RULES[b].ducks;
      for (const k of Object.keys(d) as Bus[]) db[k] += d[k] ?? 0;
    }
    for (const k of Object.keys(db) as Bus[]) {
      const g = dbToGain(db[k]);
      if (g !== this.duckTarget[k]) this.duckSpan[k] = Math.abs(g - this.duck[k]) || 1e-6;
      this.duckTarget[k] = g;
    }
    this.ensureTicker();
  }

  private ensureTicker() {
    if (this.ticker !== null) return;
    this.ticker = this.timers.setInterval(() => this.step(RAMP_STEP_MS), RAMP_STEP_MS);
  }

  private step(dt: number) {
    let busy = false;
    for (const k of Object.keys(this.duck) as Bus[]) {
      const cur = this.duck[k];
      const tgt = this.duckTarget[k];
      if (cur === tgt) continue;
      // 목표가 바뀐 순간의 거리를 어택 200ms·릴리스 400ms에 걸쳐 선형으로
      const rate = (this.duckSpan[k] / (tgt < cur ? DUCK_ATTACK_MS : DUCK_RELEASE_MS)) * dt;
      this.duck[k] = tgt < cur ? Math.max(tgt, cur - rate) : Math.min(tgt, cur + rate);
      busy = true;
    }
    for (const p of [...this.playing]) {
      if (p.fade === p.fadeTarget) continue;
      const d = p.fadeRate * dt;
      p.fade = p.fadeTarget > p.fade ? Math.min(p.fadeTarget, p.fade + d) : Math.max(p.fadeTarget, p.fade - d);
      if (p.fade === 0 && p.stopWhenSilent) this.remove(p);
      else busy = true;
    }
    this.applyVolumes();
    if (!busy && this.ticker !== null) {
      this.timers.clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  private applyVolumes() {
    const master = this.settings.masterVolume;
    for (const p of this.playing) for (const x of p.voices) x.v.setVolume(Math.max(0, Math.min(1, x.base * p.fade * this.duck[p.bus] * master)));
  }
}
