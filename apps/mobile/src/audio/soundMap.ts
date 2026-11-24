// 효과음 v0.1 매핑: 게임 이벤트 → 소리 파일·음량·햅틱 + 재생 규칙(스로틀·동시재생·설정). 타입과 데이터만 있다.
// 재생 코드·expo-audio·expo-haptics는 아직 들이지 않았다. 재생 코드는 이 파일의 규칙을 그대로 따른다.
// 소리 원본: tools/sound/synth.mjs (자체 합성, 시드 고정). 목록·트리거 표·의도: docs/sound/sound-v0.md
// 타이밍 상수(atMs·delayMs)는 아트 바이블 v1 8·11절 추정치다. 모션 구현이 상수를 갖게 되면 그 상수를 가져다 쓰게 바꾼다.

/** 정적 에셋 참조(Metro가 require한 숫자 id). */
export type SoundAsset = number;

export type SoundId =
  | 'paper_air_loop'
  | 'ink_drop'
  | 'mong_hum_wait'
  | 'eye_open'
  | 'pet_hum'
  | 'rub_loop'
  | 'ink_grind_loop'
  | 'brush_slow_loop'
  | 'brush_fast_loop'
  | 'stroke_attach'
  | 'sleep_drop'
  | 'night_ambience_loop'
  | 'morning_lift'
  | 'mong_joy'
  | 'mong_sleepy'
  | 'seal_tak'
  | NameMelodySound;

/** 이름 가락 32(M2, sound-v0 8절): `name_melody_00`..`name_melody_31`, 번호 = core `nameMelodyOf().id` */
type D = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
export type NameMelodySound = `name_melody_${'0' | '1' | '2'}${D}` | 'name_melody_30' | 'name_melody_31';
export const NAME_MELODY_COUNT = 32;
export function nameMelodySound(id: number): NameMelodySound {
  const k = Math.min(NAME_MELODY_COUNT - 1, Math.max(0, Math.floor(id)));
  return `name_melody_${String(k).padStart(2, '0')}` as NameMelodySound;
}

export const SOUND_FILES: Record<SoundId, SoundAsset> = {
  paper_air_loop: require('../../assets/sounds/paper_air_loop.wav'),
  ink_drop: require('../../assets/sounds/ink_drop.wav'),
  mong_hum_wait: require('../../assets/sounds/mong_hum_wait.wav'),
  eye_open: require('../../assets/sounds/eye_open.wav'),
  pet_hum: require('../../assets/sounds/pet_hum.wav'),
  rub_loop: require('../../assets/sounds/rub_loop.wav'),
  ink_grind_loop: require('../../assets/sounds/ink_grind_loop.wav'),
  brush_slow_loop: require('../../assets/sounds/brush_slow_loop.wav'),
  brush_fast_loop: require('../../assets/sounds/brush_fast_loop.wav'),
  stroke_attach: require('../../assets/sounds/stroke_attach.wav'),
  sleep_drop: require('../../assets/sounds/sleep_drop.wav'),
  night_ambience_loop: require('../../assets/sounds/night_ambience_loop.wav'),
  morning_lift: require('../../assets/sounds/morning_lift.wav'),
  mong_joy: require('../../assets/sounds/mong_joy.wav'),
  mong_sleepy: require('../../assets/sounds/mong_sleepy.wav'),
  seal_tak: require('../../assets/sounds/seal_tak.wav'),
  name_melody_00: require('../../assets/sounds/name_melody_00.wav'),
  name_melody_01: require('../../assets/sounds/name_melody_01.wav'),
  name_melody_02: require('../../assets/sounds/name_melody_02.wav'),
  name_melody_03: require('../../assets/sounds/name_melody_03.wav'),
  name_melody_04: require('../../assets/sounds/name_melody_04.wav'),
  name_melody_05: require('../../assets/sounds/name_melody_05.wav'),
  name_melody_06: require('../../assets/sounds/name_melody_06.wav'),
  name_melody_07: require('../../assets/sounds/name_melody_07.wav'),
  name_melody_08: require('../../assets/sounds/name_melody_08.wav'),
  name_melody_09: require('../../assets/sounds/name_melody_09.wav'),
  name_melody_10: require('../../assets/sounds/name_melody_10.wav'),
  name_melody_11: require('../../assets/sounds/name_melody_11.wav'),
  name_melody_12: require('../../assets/sounds/name_melody_12.wav'),
  name_melody_13: require('../../assets/sounds/name_melody_13.wav'),
  name_melody_14: require('../../assets/sounds/name_melody_14.wav'),
  name_melody_15: require('../../assets/sounds/name_melody_15.wav'),
  name_melody_16: require('../../assets/sounds/name_melody_16.wav'),
  name_melody_17: require('../../assets/sounds/name_melody_17.wav'),
  name_melody_18: require('../../assets/sounds/name_melody_18.wav'),
  name_melody_19: require('../../assets/sounds/name_melody_19.wav'),
  name_melody_20: require('../../assets/sounds/name_melody_20.wav'),
  name_melody_21: require('../../assets/sounds/name_melody_21.wav'),
  name_melody_22: require('../../assets/sounds/name_melody_22.wav'),
  name_melody_23: require('../../assets/sounds/name_melody_23.wav'),
  name_melody_24: require('../../assets/sounds/name_melody_24.wav'),
  name_melody_25: require('../../assets/sounds/name_melody_25.wav'),
  name_melody_26: require('../../assets/sounds/name_melody_26.wav'),
  name_melody_27: require('../../assets/sounds/name_melody_27.wav'),
  name_melody_28: require('../../assets/sounds/name_melody_28.wav'),
  name_melody_29: require('../../assets/sounds/name_melody_29.wav'),
  name_melody_30: require('../../assets/sounds/name_melody_30.wav'),
  name_melody_31: require('../../assets/sounds/name_melody_31.wav'),
};

// ---------- 햅틱: expo-haptics 이름을 문자열로 그대로 옮김(패키지 미설치) ----------
/** Haptics.ImpactFeedbackStyle 값과 같다. */
export type ImpactStyle = 'light' | 'medium' | 'heavy' | 'soft' | 'rigid';
/** Haptics.NotificationFeedbackType 값과 같다. */
export type NotificationType = 'success' | 'warning' | 'error';

export type Haptic =
  | { kind: 'impact'; style: ImpactStyle } // Haptics.impactAsync(style)
  | { kind: 'notification'; type: NotificationType } // Haptics.notificationAsync(type)
  | { kind: 'selection' }; // Haptics.selectionAsync()
// Android 매핑(performAndroidHapticsAsync)은 expo-haptics 설치 때 그 버전 문서를 보고 정한다(04 4-3).

/** 이벤트 시작 기준 atMs에 한 번 울린다. 햅틱만으로 정보를 전하지 않는다(04 4-3). */
export type HapticBeat = { atMs: number; haptic: Haptic };

// ---------- 동시 재생 규칙 ----------
/**
 * 버스(채널 묶음). 버스마다 동시에 울리는 개수와 덕킹이 정해진다(MIX_RULES).
 * - ambience: 환경음 루프(종이 공기·밤 물). 한 번에 하나, 바뀔 때 크로스페이드.
 * - gesture: 손이 내는 루프(문지르기·먹 갈기·붓). 한 번에 하나(손가락은 한 동사만 한다).
 * - voice: 몽망이 허밍. 한 번에 하나, 새 것이 오면 옛 것을 80ms에 걸쳐 끊고 바꾼다.
 * - sfx: 재료 원샷(먹방울·부착·재우기·현상). 최대 2개, 넘치면 가장 오래된 것을 페이드아웃.
 */
export type Bus = 'ambience' | 'gesture' | 'voice' | 'sfx';

export type BusRule = {
  maxVoices: number;
  /** 넘칠 때: 'replace' = 같은 버스의 가장 오래된 소리를 stealFadeMs에 걸쳐 끄고 새 것을 낸다, 'drop' = 새 것을 버린다. */
  overflow: 'replace' | 'drop';
  stealFadeMs: number;
  /** 이 버스가 울리는 동안 다른 버스를 몇 dB 낮출지(200ms 어택·400ms 릴리스). */
  ducks: Partial<Record<Bus, number>>;
};

export const MIX_RULES: Record<Bus, BusRule> = {
  ambience: { maxVoices: 1, overflow: 'replace', stealFadeMs: 1200, ducks: {} },
  gesture: { maxVoices: 1, overflow: 'replace', stealFadeMs: 120, ducks: { ambience: -4 } },
  voice: { maxVoices: 1, overflow: 'replace', stealFadeMs: 80, ducks: { ambience: -3, gesture: -3 } },
  sfx: { maxVoices: 2, overflow: 'replace', stealFadeMs: 150, ducks: { ambience: -3 } },
};
/** 앱 전체 동시 재생 상한(버스 합). 넘치면 sfx → voice 순으로 새 것을 버린다(ambience·gesture는 끊지 않음). */
export const MAX_TOTAL_VOICES = 5;

// ---------- 설정(소리·햅틱 개별 on/off, 아트 10절 접근성) ----------
export type SoundSettings = {
  /** 꺼지면 아무 소리도 내지 않는다(햅틱은 따로). */
  soundEnabled: boolean;
  /** 꺼지면 햅틱을 하나도 울리지 않는다('진동 끄기'). 소리와 독립. */
  hapticsEnabled: boolean;
  /** 0..1, 모든 cue 음량에 곱한다. */
  masterVolume: number;
};
export const DEFAULT_SOUND_SETTINGS: SoundSettings = { soundEnabled: true, hapticsEnabled: true, masterVolume: 1 };
/*
 * 기기 상태 규칙(재생 코드가 지킬 것):
 * - iOS 무음 스위치가 켜져 있으면 소리를 내지 않는다(오디오 세션 ambient — 다른 앱 음악을 끊지 않고 섞인다).
 * - 저전력 모드·카메라·받아쓰기 중 iOS 햅틱은 OS가 막는다. 막혀도 재시도하지 않는다.
 * - 앱이 백그라운드로 가면 루프는 400ms에 페이드아웃하고 멈춘다.
 */

// ---------- 스로틀(연타 폭주 방지) ----------
/**
 * cue.throttleMs: 같은 이벤트가 이 간격 안에 다시 오면 소리·햅틱을 건너뛴다(모션 반응은 그대로).
 * 햅틱은 그와 별도로 앱 전체에서 HAPTIC_MIN_INTERVAL_MS 안에 한 번만 울린다(겹치면 나중 것을 버림).
 */
export const HAPTIC_MIN_INTERVAL_MS = 120;

/** volume: 0..1 선형(파일은 피크 -3~-10dBFS로 정규화). delayMs: 이벤트 시작 기준. */
export type SoundLayer = { sound: SoundId; volume: number; delayMs?: number };

type CueBase = { bus: Bus; throttleMs: number; haptics: HapticBeat[] };

export type SoundCue =
  | (CueBase & {
      type: 'oneShot';
      layers: SoundLayer[];
      /** 반복감 줄이기: 재생 속도(=피치)를 ±이 비율 안에서 무작위로. 0이면 그대로. */
      rateJitter: number;
    })
  | (CueBase & { type: 'loop'; sound: SoundId; volume: number; fadeInMs: number; fadeOutMs: number })
  | (CueBase & {
      /** 붓 획: 손가락 속도(px/s)에 따라 두 루프의 음량을 섞는다. slowPxS 이하 = 느린 루프만, fastPxS 이상 = 빠른 루프만. */
      type: 'speedBlendLoop';
      slow: SoundId;
      fast: SoundId;
      volume: number;
      slowPxS: number;
      fastPxS: number;
      /** 멈춰 있으면(속도 0) 이 비율까지 줄인다 — 손가락을 대고 멈춘 붓은 거의 소리가 없다. */
      idleVolumeRatio: number;
      fadeInMs: number;
      fadeOutMs: number;
    });

export type SoundEvent =
  | 'paperAir'
  | 'inkDropLand'
  | 'mongWait'
  | 'firstEyeOpen'
  | 'pet'
  | 'rub'
  | 'inkGrind'
  | 'brushStroke'
  | 'strokeAttach'
  | 'sleepDrop'
  | 'nightAmbience'
  | 'morningLift'
  | 'mongJoy'
  | 'mongSleepy'
  | 'sealTak'
  | 'nameMelody';

const impact = (style: ImpactStyle, atMs = 0): HapticBeat => ({ atMs, haptic: { kind: 'impact', style } });

export const SOUND_MAP: Record<SoundEvent, SoundCue> = {
  // 첫 30초 0~2초, 그리고 낮 화면의 바탕. 아주 작게.
  paperAir: { type: 'loop', bus: 'ambience', sound: 'paper_air_loop', volume: 0.4, fadeInMs: 1500, fadeOutMs: 1200, throttleMs: 0, haptics: [] },
  // 첫 30초 2초: 먹 한 방울이 한지에 앉는 순간(낙하 400ms가 끝날 때 부른다). soft 1회.
  inkDropLand: { type: 'oneShot', bus: 'sfx', layers: [{ sound: 'ink_drop', volume: 0.8 }], rateJitter: 0, throttleMs: 1000, haptics: [impact('soft')] },
  // 첫 30초 6초: 방울이 기다리며 '음…'. 9초까지 입력이 없으면 한 번 더(떨림과 같이).
  mongWait: { type: 'oneShot', bus: 'voice', layers: [{ sound: 'mong_hum_wait', volume: 0.6 }], rateJitter: 0, throttleMs: 2500, haptics: [] },
  // 첫 터치 → 눈이 처음 열림(평생 한 번). 먹이 갈라지는 시작(120ms)에 soft 1회.
  firstEyeOpen: { type: 'oneShot', bus: 'voice', layers: [{ sound: 'eye_open', volume: 0.85 }], rateJitter: 0, throttleMs: 0, haptics: [impact('soft', 120)] },
  // 몽망이 탭(쓰다듬기) = 동사 표 '짧은 허밍, light 1회'. 연타는 250ms에 한 번만 소리·햅틱.
  pet: { type: 'oneShot', bus: 'voice', layers: [{ sound: 'pet_hum', volume: 0.6 }], rateJitter: 0.06, throttleMs: 250, haptics: [impact('light')] },
  // 몽망이 길게 누르기(문지르기, 400ms 이상). 번짐 숨 주기 1.2초와 루프 주기가 같다. 벼루 소리와 다르다.
  rub: { type: 'loop', bus: 'gesture', sound: 'rub_loop', volume: 0.45, fadeInMs: 300, fadeOutMs: 600, throttleMs: 0, haptics: [] },
  // 벼루에서 먹 갈기(원 그리기 또는 길게 누르기 대체 입력). 손을 떼면 페이드아웃.
  inkGrind: { type: 'loop', bus: 'gesture', sound: 'ink_grind_loop', volume: 0.55, fadeInMs: 200, fadeOutMs: 500, throttleMs: 0, haptics: [] },
  // 붓 획 긋는 중. 획은 0ms 추종, 소리도 손가락을 대는 순간 시작.
  brushStroke: {
    type: 'speedBlendLoop',
    bus: 'gesture',
    slow: 'brush_slow_loop',
    fast: 'brush_fast_loop',
    volume: 0.5,
    slowPxS: 150,
    fastPxS: 1200,
    idleVolumeRatio: 0.15,
    fadeInMs: 40,
    fadeOutMs: 180,
    throttleMs: 0,
    haptics: [],
  },
  // 손을 뗀 뒤 획이 몸에 붙음(D-12). 핵 표면에 닿는 180ms에 light 1회.
  strokeAttach: { type: 'oneShot', bus: 'sfx', layers: [{ sound: 'stroke_attach', volume: 0.75 }], rateJitter: 0, throttleMs: 600, haptics: [impact('light', 180)] },
  // 재우기(연적 탭). 물 한 방울 + 조수 2400ms. 길고 약한 연속 3회.
  sleepDrop: {
    type: 'oneShot',
    bus: 'sfx',
    layers: [{ sound: 'sleep_drop', volume: 0.8 }],
    rateJitter: 0,
    throttleMs: 3000,
    haptics: [impact('soft', 40), impact('soft', 900), impact('soft', 1800)],
  },
  // 밤 화면 내내. 조수가 다 차오른 뒤(2400ms)부터 들어온다(ambience 버스에서 paperAir를 대체).
  nightAmbience: { type: 'loop', bus: 'ambience', sound: 'night_ambience_loop', volume: 0.3, fadeInMs: 2400, fadeOutMs: 1600, throttleMs: 0, haptics: [] },
  // 아침 현상(건져 올리기). 물 빠짐 1600ms 뒤 카드가 드러날 때 soft 1회. 대금 프레이즈는 녹음 전까지 없음.
  morningLift: { type: 'oneShot', bus: 'sfx', layers: [{ sound: 'morning_lift', volume: 0.8 }], rateJitter: 0, throttleMs: 3000, haptics: [impact('soft', 1600)] },
  // 기쁨: light 2회를 빗 두 번 튕김에 맞춤(눌림 120ms 뒤 튐, 빗은 +120ms 지연). 실제 모션과 맞춰 조정.
  mongJoy: { type: 'oneShot', bus: 'voice', layers: [{ sound: 'mong_joy', volume: 0.7 }], rateJitter: 0.04, throttleMs: 1200, haptics: [impact('light', 120), impact('light', 360)] },
  // 졸림(밤 무렵 하품). 햅틱 없음.
  mongSleepy: { type: 'oneShot', bus: 'voice', layers: [{ sound: 'mong_sleepy', volume: 0.6 }], rateJitter: 0, throttleMs: 8000, haptics: [] },
  // M2 인장 '탁': **이름 인장 순간 한 곳만**(이름을 처음 짓거나 바꾼 순간, sim 'named' 효과). 첫 30초 28.5초 낙관은 무음(아트 11절 v1.3).
  sealTak: { type: 'oneShot', bus: 'sfx', layers: [{ sound: 'seal_tak', volume: 0.8 }], rateJitter: 0, throttleMs: 600, haptics: [impact('rigid')] },
  // M2 이름 가락: 세로 이름을 불렀을 때 정 2부터의 대답. 파일은 가락 번호로 바꿔 끼우고(playMelody), 속도는 이름에서 정해진 값(무작위 흔들림 없음 — 같은 이름 = 같은 소리).
  // 기본 파일은 자리 표시(00). 햅틱은 빗 튕김(+120ms)에 light 1회 — 소리를 꺼도 대답이 손에 닿는다.
  nameMelody: { type: 'oneShot', bus: 'voice', layers: [{ sound: 'name_melody_00', volume: 0.7 }], rateJitter: 0, throttleMs: 900, haptics: [impact('light', 120)] },
};
