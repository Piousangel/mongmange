// 몽망이 효과음 v0.1 합성기. 실행: node tools/sound/synth.mjs
// 결과: apps/mobile/assets/sounds/*.wav (22.05kHz 16bit mono). 시드 고정 → 재실행해도 같은 파일.
// 목록에 없는 옛 wav는 지운다(목록 = 이 파일의 SOUNDS).
// 톤: 한지·먹·붓·물. 고역은 깎고(4kHz 위 ≤3%), 어택은 부드럽게, 장난감 '뿅'(사각파·빠른 피치 점프) 금지.
// 폰 스피커(≈400Hz 아래 안 나옴)에서도 들리게 원샷에는 1~3kHz 존재감 레이어를 얹는다(presence).
import { writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SR, rng, seedOf, samples, zeros, white, brown, lp, hp, bp, mixAt, mulEnv, adExp,
  fadeEdges, sine, reverb, makeLoop, hum, normalizePeak, encodeWav, excite, airLayer, addLayer,
} from './dsp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'apps', 'mobile', 'assets', 'sounds');

const lerp = (a, b, u) => a + (b - a) * Math.min(1, Math.max(0, u));
const glide = (a, b, t0, t1) => (t) => lerp(a, b, (t - t0) / (t1 - t0));
const segEnv = (attack, hold, release) => (t) =>
  t < attack ? Math.sin((Math.PI / 2) * (t / attack)) ** 2
  : t < attack + hold ? 1
  : Math.max(0, Math.cos((Math.PI / 2) * Math.min(1, (t - attack - hold) / release))) ** 2;

// ---------- 몽망이 목소리: 감정 파라미터 → 허밍 ----------
// pitch: 기준 Hz. 놀람('응?' 빠른 상승)은 MVP에서 뺐다(1.x 목록).
export function mongVoice(emotion, r, pitch = 233) {
  switch (emotion) {
    case 'joy': { // 위로 올라가는 장3도 두 음절 '음-음↑'
      const x = zeros(0.75);
      mixAt(x, hum(0.2, { f0: () => pitch * 1.06, amp: segEnv(0.04, 0.08, 0.08), breath: 0.08, r }), 0.0);
      mixAt(x, hum(0.42, { f0: glide(pitch * 1.06, pitch * 1.06 * 1.26, 0, 0.12), amp: segEnv(0.05, 0.12, 0.25), breath: 0.08, r }), 0.17);
      return x;
    }
    case 'sleepy': { // 내려가는 숨: 들숨 같은 바람 → 낮아지는 '음…'
      const x = zeros(1.5);
      const br = lp(bp(white(samples(0.6), r), 700, 0.6), 1600);
      mixAt(x, mulEnv(br, segEnv(0.25, 0.05, 0.3)), 0.0, 0.35);
      mixAt(x, hum(0.95, { f0: glide(pitch * 0.95, pitch * 0.7, 0.05, 0.9), amp: segEnv(0.15, 0.2, 0.6), breath: 0.2, vibrato: 0.003, r }), 0.42);
      return x;
    }
    case 'curious': // 첫 눈뜸의 '응?' (단3도 위로, 느리고 작게)
      return hum(0.5, { f0: glide(pitch * 0.95, pitch * 0.95 * 1.19, 0.08, 0.35), amp: segEnv(0.08, 0.12, 0.28), breath: 0.12, r });
    case 'content': // 획 부착 때 낮은 '음—'
      return hum(0.8, { f0: glide(pitch * 0.72, pitch * 0.68, 0.1, 0.8), amp: segEnv(0.1, 0.25, 0.42), breath: 0.1, vibrato: 0.004, r });
    case 'pet': // 쓰다듬기: 짧은 '음' (살짝 올라감, 0.3초)
      return hum(0.3, { f0: glide(pitch, pitch * 1.06, 0.03, 0.2), amp: segEnv(0.035, 0.08, 0.17), breath: 0.1, r });
    case 'wait': // 첫 30초 6초 비트: 방울이 기다리며 내는 낮은 '음…'(끝이 아주 조금 들림 = 호기심)
      return hum(1.0, { f0: (t) => pitch * 0.82 * (t < 0.6 ? 1 : lerp(1, 1.04, (t - 0.6) / 0.3)), amp: segEnv(0.18, 0.35, 0.45), breath: 0.16, vibrato: 0.004, r });
    default: throw new Error(emotion);
  }
}

// ---------- 효과음 정의 ----------
// peak: 정규화 목표(dBFS). loop: 루프 길이(초). presence: 원샷에 얹는 존재감 레이어 { ex: 배음 레이어 dB, air: 노이즈 레이어 dB }(원신호 RMS 대비).
const SOUNDS = {
  // 첫 30초 0초: 빈 한지 위 공기. 종이 결이 아주 옅게 숨 쉬는 룸톤(6초 한 번 부풂).
  paper_air_loop: { peak: -10, loop: 6, make(r) {
    const L = 6, C = 1.5, n = samples(L + C);
    const air = lp(lp(hp(white(n, r), 350, 0.7), 2000, 0.7), 2600, 0.7);
    const low = lp(white(n, r), 300, 0.7);
    const nz = new Float64Array(n);
    for (let i = 0; i < n; i++) nz[i] = air[i] * 0.8 + low[i] * 0.6;
    const x = makeLoop(nz, L, C);
    for (let i = 0; i < x.length; i++) x[i] *= 0.8 + 0.2 * Math.sin((2 * Math.PI * i) / SR / L);
    return x;
  } },

  // 첫 30초 2초: 먹 한 방울이 한지에 앉는 '톡'(재우기 물방울보다 짧고 마르고 무겁게) + 번짐 800ms
  ink_drop: { peak: -3, presence: { ex: -12, air: -18 }, make(r) {
    const x = zeros(1.2);
    mixAt(x, mulEnv(sine(samples(0.12), (t) => Math.min(980, 460 * Math.exp(t / 0.03))), adExp(0.0015, 0.025)), 0.0, 0.7);
    mixAt(x, mulEnv(sine(samples(0.12), (t) => 300 - 60 * Math.min(1, t / 0.05)), adExp(0.003, 0.03)), 0.0, 0.45);
    const bloom = lp(bp(white(samples(0.9), r), 700, 0.6), 1800);
    mixAt(x, mulEnv(bloom, adExp(0.06, 0.25)), 0.02, 0.3);
    return reverb(x, r, { seconds: 0.9, tau: 0.22, mix: 0.25, tone: 1900, predelayMs: 10 });
  } },

  // 첫 30초 6초: 낮은 허밍 '음…'(기다림)
  mong_hum_wait: { peak: -4, presence: { ex: -12 }, make(r) { return reverb(mongVoice('wait', r), r, { seconds: 0.7, tau: 0.16, mix: 0.14, tone: 1500 }); } },

  // 첫 눈뜸: 먹이 갈라지는 바람결 + 낮은 번짐 울림 + '응?'
  eye_open: { peak: -3, presence: { ex: -10, air: -16 }, make(r) {
    const x = zeros(1.6);
    const ink = bp(white(samples(1.1), r), (i) => 500 + 1100 * Math.min(1, i / SR / 0.9), 0.8);
    mixAt(x, mulEnv(lp(ink, 2600), adExp(0.12, 0.35)), 0.0, 0.5);
    const bloom = new Float64Array(samples(1.4));
    const a = sine(bloom.length, 196), b = sine(bloom.length, 293.66);
    for (let i = 0; i < bloom.length; i++) bloom[i] = a[i] * 0.6 + b[i] * 0.3;
    mixAt(x, mulEnv(bloom, adExp(0.2, 0.45)), 0.05, 0.22);
    mixAt(x, mongVoice('curious', r), 0.4, 0.8);
    return reverb(x, r, { seconds: 1.2, tau: 0.3, mix: 0.22, tone: 2000 });
  } },

  // 톡톡(쓰다듬기) = 동사 표 정본 '짧은 허밍'
  pet_hum: { peak: -3, presence: { ex: -12 }, make(r) { return reverb(mongVoice('pet', r), r, { seconds: 0.4, tau: 0.08, mix: 0.1, tone: 1600 }); } },

  // 문지르기(몽망이 길게 누르기): 손끝이 말랑한 먹 몸을 쓰는 부드러운 결. 1.2초 숨 주기 × 2. 벼루 소리와 분리.
  rub_loop: { peak: -5, loop: 2.4, make(r) {
    const L = 2.4, C = 0.3, n = samples(L + C);
    const soft = lp(bp(white(n, r), 1150, 1.1), 2600, 0.7);
    const body = lp(white(n, r), 450, 0.7);
    const grain = lp(white(n, r), 12, 0.7);
    let gm = 1e-9; for (const v of grain) gm = Math.max(gm, Math.abs(v));
    const nz = new Float64Array(n);
    for (let i = 0; i < n; i++) nz[i] = soft[i] * (0.8 + 0.2 * grain[i] / gm) + body[i] * 0.35;
    const x = makeLoop(nz, L, C);
    for (let i = 0; i < x.length; i++) x[i] *= 0.4 + 0.6 * Math.sin((Math.PI * i) / SR / 1.2) ** 2; // 주기 1.2초(번짐 숨과 같음)
    return x;
  } },

  // 먹 갈기(벼루, 준비 동작): 먹이 돌 위를 도는 낮은 '사각' + 고운 알갱이. 한 바퀴 1.2초 × 2.
  ink_grind_loop: { peak: -4, loop: 2.4, make(r) {
    const L = 2.4, C = 0.3, n = samples(L + C);
    const grind = lp(brown(n, r), 420, 0.9);
    const fric = lp(bp(white(n, r), 900, 0.8), 2400);
    // 알갱이: 4~9ms 부드러운 창의 짧은 대역 노이즈(클릭 아님)를 무작위로 흩뿌림
    const grit = new Float64Array(n);
    const gl = samples(0.007);
    const src = bp(white(n, r), 2000, 1.2);
    for (let t = 0; t < n - gl; t += samples(0.004 + 0.014 * r())) {
      const a = 0.3 + 0.7 * r();
      for (let k = 0; k < gl; k++) grit[t + k] += src[t + k] * a * Math.sin((Math.PI * k) / gl) ** 2;
    }
    const nz = new Float64Array(n);
    for (let i = 0; i < n; i++) nz[i] = grind[i] * 1.0 + fric[i] * 0.55 + grit[i] * 0.45;
    const x = makeLoop(nz, L, C);
    // 원 그리기: 앞으로 미는 반 바퀴가 조금 더 크다(1.2초 주기)
    for (let i = 0; i < x.length; i++) { const ph = (2 * Math.PI * i) / SR / 1.2; x[i] *= 0.65 + 0.25 * Math.sin(ph) + 0.1 * Math.sin(2 * ph); }
    return x;
  } },

  // 붓 획 — 느릴 때: 젖은 붓이 한지를 천천히 끄는 둔한 마찰
  brush_slow_loop: { peak: -4, loop: 2.0, make(r) { return brushLoop(r, { center: 650, top: 1700, q: 0.9 }); } },
  // 붓 획 — 빠를 때: 마른 붓끝이 스치는 밝은 마찰(3kHz 근처에서 깎음)
  brush_fast_loop: { peak: -4, loop: 2.0, make(r) { return brushLoop(r, { center: 1400, top: 2900, q: 0.7 }); } },

  // 획이 몸에 붙음: 붙으러 가는 바람(0~180ms) → 먹이 스미는 '툭' → 번짐 + 낮은 '음—'
  stroke_attach: { peak: -3, presence: { ex: -12, air: -18 }, make(r) {
    const x = zeros(1.45);
    const sw = bp(white(samples(0.22), r), (i) => 600 + 900 * (i / samples(0.22)), 0.9);
    mixAt(x, mulEnv(lp(sw, 2200), segEnv(0.15, 0, 0.07)), 0.0, 0.35);
    mixAt(x, mulEnv(sine(samples(0.3), (t) => 130 - 35 * Math.min(1, t / 0.1)), adExp(0.006, 0.09)), 0.18, 0.9);
    mixAt(x, mulEnv(lp(white(samples(0.12), r), 700), adExp(0.003, 0.03)), 0.18, 0.4);
    const soak = lp(brown(samples(1.1), r), (i) => 900 - 600 * (i / samples(1.1)), 0.8);
    mixAt(x, mulEnv(soak, adExp(0.05, 0.4)), 0.2, 0.6);
    mixAt(x, mongVoice('content', r), 0.32, 0.55);
    return reverb(x, r, { seconds: 1.0, tau: 0.25, mix: 0.2, tone: 1800 });
  } },

  // 재우기: 연적에서 물 한 방울 '톡' + 긴 잔향, 아래에서 차오르는 조수
  sleep_drop: { peak: -3, presence: { air: -16 }, make(r) {
    const x = zeros(2.9);
    const drop = sine(samples(0.18), (t) => Math.min(1250, 540 * Math.exp(t / 0.03)));
    mixAt(x, mulEnv(drop, adExp(0.0015, 0.032)), 0.04, 0.8);
    mixAt(x, mulEnv(sine(samples(0.12), 290), adExp(0.002, 0.03)), 0.04, 0.35);
    const tide = lp(brown(samples(2.6), r), (i) => 250 + 250 * Math.sin(Math.PI * i / samples(2.6)), 0.7);
    mixAt(x, mulEnv(tide, segEnv(1.0, 0.6, 1.0)), 0.2, 0.9);
    return reverb(x, r, { seconds: 2.4, tau: 0.6, mix: 0.42, tone: 1600, predelayMs: 25 });
  } },

  // 밤 수면 앰비언스: 낮은 물 + 옅은 물결 결(스피커용 중역) + 아주 옅은 두 음 드론. 8초 루프(물결 1회).
  night_ambience_loop: { peak: -6, loop: 8, make(r) {
    const L = 8, C = 2, n = samples(L + C);
    const water = lp(lp(white(n, r), 220, 0.7), 220, 0.7);
    const air = lp(hp(white(n, r), 200), 600, 0.6);
    const ripple = lp(bp(white(n, r), 1100, 0.9), 2000, 0.7); // 폰 스피커에서 '물이 있다'를 알리는 중역
    // 노이즈만 크로스페이드로 잇고, 주기 성분(드론)은 루프 뒤에 더한다(상관 신호를 크로스페이드하면 +3dB 혹).
    const nz = new Float64Array(n);
    for (let i = 0; i < n; i++) nz[i] = water[i] + air[i] * 0.25 + ripple[i] * 0.22;
    const x = makeLoop(nz, L, C);
    // 드론 주파수는 8초 안에 정수 주기(f*8 ∈ ℕ), 물결·드론 흔들림 주기 8초 → 그대로 맞물림.
    const fs = [[98, 0.05], [98.125, 0.04], [147, 0.025]];
    let nr = 0; for (const v of x) nr += v * v; nr = Math.sqrt(nr / x.length);
    for (let i = 0; i < x.length; i++) {
      const t = i / SR;
      const swell = 0.75 + 0.25 * Math.sin((2 * Math.PI * t) / 8);
      let d = 0;
      for (const [f, a] of fs) d += a * Math.sin(2 * Math.PI * f * t);
      x[i] = x[i] * swell + d * nr * 4 * (0.8 + 0.2 * Math.cos((2 * Math.PI * t) / 8));
    }
    return x;
  } },

  // 아침 현상: 물 위 한지를 건져 올리는 물살 → 종이에서 떨어지는 물방울 → 물 빠짐 (대금 프레이즈는 녹음 대상)
  morning_lift: { peak: -3, make(r) {
    const x = zeros(2.8);
    const sw = bp(white(samples(0.7), r), (i) => 350 + 900 * (i / samples(0.7)), 0.8);
    mixAt(x, mulEnv(lp(sw, 2400), segEnv(0.35, 0.05, 0.3)), 0.0, 0.7);
    const drain = lp(brown(samples(1.7), r), (i) => 600 - 350 * (i / samples(1.7)), 0.8);
    mixAt(x, mulEnv(drain, adExp(0.1, 0.55)), 0.45, 0.8);
    [0.62, 0.81, 1.05, 1.32, 1.66, 2.05].forEach((t0, k) => {
      const f0 = 600 + 350 * r();
      const d = sine(samples(0.1), (t) => Math.min(f0 * 2.1, f0 * Math.exp(t / 0.025)));
      mixAt(x, mulEnv(d, adExp(0.0015, 0.022)), t0, 0.28 * (1 - k * 0.12));
    });
    return reverb(x, r, { seconds: 1.8, tau: 0.45, mix: 0.35, tone: 1700, predelayMs: 18 });
  } },

  mong_joy: { peak: -3, presence: { ex: -12 }, make(r) { return reverb(mongVoice('joy', r), r, { seconds: 0.6, tau: 0.12, mix: 0.12, tone: 1500 }); } },
  mong_sleepy: { peak: -4, presence: { ex: -12, air: -18 }, make(r) { return reverb(mongVoice('sleepy', r), r, { seconds: 0.8, tau: 0.2, mix: 0.15, tone: 1400 }); } },
};

// ---------- M2 이름 가락 32 + 인장 '탁'(sound-v0 8절, C-integrated 2-2) ----------
// 가락 id = (음 개수 − 1) × 8 + 윤곽. 윤곽 순서는 core MELODY_CONTOURS와 같아야 한다(rise·fall·arch·valley·flatUp·flatDown·zigzag·steps).
// 음은 반음 단위 네 점, 음 개수가 적으면 네 점에서 고르게 뽑는다. 한 음 0.19초, 음 사이는 짧은 활음(입을 닫은 채 이어 부름).
// 음역·빠르기는 앱이 재생 속도 ±8%로만 흔든다(런타임 피치 처리 없음).
export const MELODY_CONTOURS = {
  rise: [0, 2, 4, 7],
  fall: [7, 4, 2, 0],
  arch: [0, 5, 7, 3],
  valley: [5, 0, -2, 3],
  flatUp: [0, 0, 0, 4],
  flatDown: [4, 4, 4, 0],
  zigzag: [0, 4, 1, 5],
  steps: [0, 2, 2, 5],
};
const CONTOUR_ORDER = ['rise', 'fall', 'arch', 'valley', 'flatUp', 'flatDown', 'zigzag', 'steps'];
export function melodyNotes(id) {
  const n = Math.floor(id / 8) + 1;
  const pts = MELODY_CONTOURS[CONTOUR_ORDER[id % 8]];
  if (n === 1) return [pts[0], pts[3]]; // 한 음절: 한 음 안에서 첫 점 → 끝 점으로 미끄러짐
  return Array.from({ length: n }, (_, i) => pts[Math.round((i * 3) / (n - 1))]);
}
function nameMelody(id, r, pitch = 233) {
  const n = Math.floor(id / 8) + 1;
  const st = melodyNotes(id).map((v) => pitch * 2 ** (v / 12));
  const NOTE = 0.19;
  if (n === 1) return hum(0.42, { f0: glide(st[0], st[1], 0.06, 0.3), amp: segEnv(0.04, 0.16, 0.2), breath: 0.1, r });
  const dur = n * NOTE + 0.22;
  // 음 경계 40ms 활음 + 끝 음은 조금 길게 놓는다(대답이 끝났다는 느낌)
  const f0 = (t) => {
    const i = Math.min(n - 1, Math.floor(t / NOTE));
    const u = t - i * NOTE;
    const prev = i > 0 ? st[i - 1] : st[0];
    return u < 0.04 && i > 0 ? lerp(prev, st[i], u / 0.04) : st[i];
  };
  const amp = (t) => {
    const env = segEnv(0.04, n * NOTE - 0.08, 0.26)(t);
    const u = (t % NOTE) / NOTE;
    const dip = t < (n - 1) * NOTE ? 1 - 0.28 * Math.max(0, 1 - Math.abs(u - 1) * 6) * Math.max(0, 1 - u * 6) : 1; // 음절 사이 아주 얕은 골
    return env * (u > 0.85 && t < (n - 1) * NOTE ? 0.78 : dip);
  };
  return hum(dur, { f0, amp, breath: 0.1, vibrato: 0.004, r });
}
for (let id = 0; id < 32; id++) {
  SOUNDS[`name_melody_${String(id).padStart(2, '0')}`] = {
    peak: -3,
    presence: { ex: -12 },
    make(r) {
      return reverb(nameMelody(id, r), r, { seconds: 0.6, tau: 0.13, mix: 0.12, tone: 1500 });
    },
  };
}
// 인장 '탁': 마른 나무·돌 위 짧은 타격(중역 몸통) + 인주가 눌리는 둔한 낮은 눌림. 고역은 깎아 장난감 '딸깍'이 되지 않게
SOUNDS.seal_tak = {
  peak: -3,
  presence: { ex: -10, air: -16 },
  make(r) {
    const x = zeros(0.5);
    // 타격 몸통: 나무 공명 두 개(820·1450Hz) + 짧은 결 노이즈
    mixAt(x, mulEnv(sine(samples(0.12), () => 820), adExp(0.001, 0.03)), 0.0, 0.55);
    mixAt(x, mulEnv(sine(samples(0.1), () => 1450), adExp(0.001, 0.02)), 0.0, 0.35);
    mixAt(x, mulEnv(lp(bp(white(samples(0.1), r), 1300, 1.2), 2600), adExp(0.0008, 0.03)), 0.0, 1.4);
    // 인주의 둔한 눌림(낮게, 작게)
    mixAt(x, mulEnv(sine(samples(0.14), (t) => 190 - 50 * Math.min(1, t / 0.06)), adExp(0.002, 0.04)), 0.0, 0.3);
    mixAt(x, mulEnv(lp(brown(samples(0.2), r), 380), adExp(0.01, 0.06)), 0.012, 0.15);
    return reverb(x, r, { seconds: 0.35, tau: 0.07, mix: 0.12, tone: 1700, predelayMs: 6 });
  },
};

function brushLoop(r, { center, top, q }) {
  const L = 2.0, C = 0.25, n = samples(L + C);
  // 붓털 결: 느린 무작위 진폭(손 떨림) × 중심 주파수 흔들림(2초에 정수 주기)
  const grain = lp(white(n, r), 25, 0.7);
  let gm = 1e-9; for (const v of grain) gm = Math.max(gm, Math.abs(v));
  const f = (i) => center * (1 + 0.15 * Math.sin((2 * Math.PI * i) / SR / 1.0) + 0.08 * Math.sin((2 * Math.PI * i * 3) / SR / 2.0));
  const fric = lp(bp(white(n, r), f, q), top, 0.7);
  const body = lp(brown(n, r), 300, 0.8);
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = (fric[i] * (0.75 + 0.25 * grain[i] / gm) + body[i] * 0.35);
  return makeLoop(x, L, C);
}

export function render(name) {
  const def = SOUNDS[name];
  const r = rng(seedOf(name));
  let x = def.make(r);
  if (def.presence) {
    const { ex, air } = def.presence;
    const base = x.slice();
    if (ex !== undefined) addLayer(x, excite(base, { center: 1500 }), ex);
    if (air !== undefined) addLayer(x, airLayer(base, r, { center: 1700 }), air);
    x = lp(x, 3800, 0.7); // 존재감은 4kHz 아래에서만
  }
  x = hp(x, 35, 0.7); // DC·초저역 제거
  // 잔향 꼬리 끝을 -50dB 근처에서 자르고 페이드
  let p = 0; for (const v of x) p = Math.max(p, Math.abs(v));
  let end = x.length;
  while (end > samples(0.05) && Math.abs(x[end - 1]) < p * 0.003) end--;
  x = fadeEdges(x.slice(0, Math.min(x.length, end + samples(0.03))), 5, 40);
  return normalizePeak(x, def.peak);
}

// 루프는 HP 필터 과도 응답을 피하려고 '두 번 이어 붙여 필터 → 뒤쪽 한 바퀴'를 쓴다.
function renderLoop(name) {
  const def = SOUNDS[name];
  const r = rng(seedOf(name));
  const once = def.make(r);
  const twice = new Float64Array(once.length * 2);
  twice.set(once); twice.set(once, once.length);
  const f = hp(twice, 35, 0.7);
  return normalizePeak(f.slice(once.length), def.peak);
}

export const NAMES = Object.keys(SOUNDS);
export const isLoop = (name) => Boolean(SOUNDS[name].loop);

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(OUT, { recursive: true });
  for (const f of readdirSync(OUT)) if (f.endsWith('.wav') && !NAMES.includes(f.slice(0, -4))) { unlinkSync(join(OUT, f)); console.log(`removed ${f}`); }
  for (const name of NAMES) {
    const x = isLoop(name) ? renderLoop(name) : render(name);
    writeFileSync(join(OUT, `${name}.wav`), encodeWav(x));
    console.log(`${name}.wav  ${(x.length / SR).toFixed(2)}s`);
  }
}
