// 하루를 플레이하는 앱 흐름(MVP): 첫 실행 인트로 → 낮 홈(붓·벼루·연적) → 한 획 → 재우기 → 밤 → 아침 현상.
// 화면은 sim 상태에서 고르고, 손이 한 일은 모두 sim 이벤트로 보낸다. 효과(effects)는 소리·햅틱·한 줄 문구·알림으로 나눈다.
import { PALETTE, coreScale, sim, v3, type AttachLevel, type RawPoint, type StrokeRecord } from '@mong/core';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, AppState, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sound, useSoundSettings } from '../audio/sound';
import { GameHome, type RevealStage } from '../screens/GameHome';
import { IntroScreen, type IntroBeat } from '../screens/IntroScreen';
import { MorningScreen } from '../screens/MorningScreen';
import { NoteSheet } from '../screens/NoteSheet';
import { CloudSheetHost, cloudRowState } from '../screens/CloudSheet';
import { MyDataSheet } from '../screens/MyDataSheet';
import { useCloudDeps } from '../cloud';
import { PARKED_DAYS, PRE_RESTORE_DAYS, readParkedList, readPreRestore, readRecord, readUnconfirmedDelete } from '../cloud/record';
import type { CloudEntry } from '../cloud/useCloud';
import { METRICS_SETTING_CONNECTED, metricsSetting } from '../net/gate';
import { MetricsSheet } from '../screens/MetricsSheet';
import { bornDate } from '../screens/NameTag';
import { kv } from './storage';
import { NameSheet, type NameSheetMode } from '../screens/NameSheet';
import { displayName, namePromptNow } from './naming';
import { nameMelodySound } from '../audio/soundMap';
import { StrokeScreen } from '../screens/StrokeScreen';
import { SANS, SERIF, layout, styles as ui } from '../screens/ui';
import { KText, track } from '../ui/type';
import { PARAMS } from '../render/clock';
import { useLater } from '../lib/useLater';
import { DevPanel } from './DevPanel';
import { INTERNAL_TEST, devMenuMode } from '../buildKind';
import { cancelMorning, openSettings, permission, requestPermission, scheduleMorning } from './notify';
import { boot, dispatch, getSnapshot, getV3, goBackground, goForeground, install, isV3Mode, now, onEffects, setMeta, tickNow, tzOffsetNow, useGame } from './store';
import { InkstoneSheet, WordSheet, type WordPick } from '../screens/V3Sheets';
import { CUE } from '../render/answer';
import type { V3Home } from '../screens/GameHome';
import { A11Y_GRIND_MS, WORD_SHEET_INITIAL, cueOf, sheetGrindMode, sheetGrindOn, sheetGrindStep, wordSheetClose, wordSheetOnAppState, type SheetGrindEvent, type V3Cue } from './v3Flow';
import { rejectText } from './text';
import { requestReview } from './review';
import { createReviewAsker } from './reviewPolicy';
import { isOn, useFeature } from '../features';
import { useMongLook, useStrokeInks } from './look';
import { t } from '../i18n';
import { useLocale } from '../i18n/react';

const TICK_MS = 20_000;
/** v3: 한 마디가 몸에 붙은 뒤 홈으로(씻기 창 없음 — V8) */
const V3_RETURN_MS = 700;
/** 획을 받은 뒤 낮 홈으로 돌아가기까지(씻기 창 + 여유) */
const STROKE_RETURN_MS = sim.WASH_WINDOW_MS + 600;
/** 재우기 뒤 알림 사전 문구: 조수(2400ms) + 첫 밤 안심 문구(3400ms)가 끝난 다음 */
const NOTIF_PROMPT_DELAY_MS = 2400 + 3600;
const HOLD_MIN_MS = sim.LEDGER.holdMinMs;
const INTRO_BEAT_SOUND: Record<IntroBeat, Parameters<typeof sound.play>[0]> = {
  air: 'paperAir',
  drop: 'inkDropLand',
  wait: 'mongWait',
  open: 'firstEyeOpen',
  joy: 'mongJoy',
  pet: 'pet',
};

/** 평점 요청 1회 보장(앱 전체에 하나) */
const reviewAsker = createReviewAsker({
  getAsked: () => getSnapshot().meta.reviewAsked,
  markAsked: () => setMeta({ reviewAsked: true }),
  featureOn: () => isOn('review'),
  isActive: () => AppState.currentState === 'active' || AppState.currentState == null,
  request: requestReview,
  setTimer: (fn, ms) => setTimeout(fn, ms),
});

let booted = false;
function ensureBoot() {
  if (booted) return;
  booted = true;
  // 세이브가 없으면 설치 전(인트로). 설치 = 첫 탭 순간. 설치됨의 판정은 세이브 하나로만(리뷰 C7)
  boot();
}

type Kind = 'intro' | 'morning' | 'stroke' | 'day' | 'night';

/** 지금 알림을 예약할 시각(sim이 깨는 시각을 정한다). 개발 메뉴 시간 오프셋은 실제 시계로 되돌린다 */
function wakeAtReal(st: sim.State) {
  return sim.wakeableAt(st) - getSnapshot().meta.devOffsetMs;
}

/** 개발 메뉴: 개발 빌드 = 전부, 내부 시험판 = 새 컨셉 v3 단추만(buildKind.ts), 운영·preview = 없음 */
const DEV_MENU = devMenuMode({ dev: __DEV__, internalTest: INTERNAL_TEST });

export function GameApp({ onSpike }: { onSpike: (screen: string) => void }) {
  ensureBoot();
  useLocale();
  const snap = useGame();
  const { state, meta } = snap;
  const look = useMongLook(state);
  const strokeInks = useStrokeInks(state);
  const [inkChanging, setInkChanging] = useState(false);
  const inkChoiceOn = useFeature('inkChoice');
  const namingOn = useFeature('naming');
  // M2 이름 짓기 창. then = 닫힌 뒤 이어서 할 일(A 시점: 이름 → 인장 '탁' → 잠, D-20 개정 줄)
  const [nameSheet, setNameSheet] = useState<{ mode: NameSheetMode; then: 'sleep' | null } | null>(null);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const L = layout(width, height);
  const [mode, setMode] = useState<'home' | 'stroke'>('home');
  // ── 새 컨셉 v3(플래그 conceptV3로 부팅했을 때만 snap.v3가 있다) ──
  const v3On = !!snap.v3;
  // 한 마디 시트: 앱이 앞에서 벗어나거나 시트가 닫히면 입력칸을 새로 만든다(쓴 글자를 남기지 않음, 리뷰 H2)
  const [wordSheet, setWordSheet] = useState(WORD_SHEET_INITIAL);
  const [inkSheetOpen, setInkSheetOpen] = useState(false);
  /** 판정이 끝난 한 마디(글자는 이미 버림) — 붓 한 획을 기다린다. 메모리에만 */
  const pendingWord = useRef<WordPick | null>(null);
  const [cue, setCue] = useState<V3Cue | null>(null);
  const cueSeq = useRef(0);
  const [introPlaying, setIntroPlaying] = useState(false);
  const [developed, setDeveloped] = useState<{ card: sim.DreamCard; line: sim.MorningLine } | null>(null);
  const [line, setLine] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [cloudOpen, setCloudOpen] = useState<false | 'default' | CloudEntry>(false);
  const [dataOpen, setDataOpen] = useState(false);
  const cloudFlag = useFeature('cloud');
  const cloudDeps = useCloudDeps();
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [nowT, setNowT] = useState(() => now());
  const [washOpen, setWashOpen] = useState(false);
  const washOpenRef = useRef(false);
  washOpenRef.current = washOpen;
  const [strokeKey, setStrokeKey] = useState(0);
  const [notifPrompt, setNotifPrompt] = useState(false);
  const [screenReader, setScreenReader] = useState(false);
  // 벼루 시트 갈기(눌러 시작·눌러 멈춤, 리뷰 2차 L-d). 앱 상태로도 멈춰야 해서 앱이 쥔다(L 리뷰 N3). ref = 이벤트 처리용 정본, state = 그리기용
  const sheetGrindAt = useRef<number | null>(null);
  const [sheetGrindStart, setSheetGrindStart] = useState<number | null>(null);
  const [grindNow, setGrindNow] = useState(0);
  /** 멈춤 규칙(v3Flow sheetGrindOn)을 적용하고, 멈추면 그때까지 간 양을 이 깸 장부에 넣는다 */
  const sheetGrind = useCallback((ev: SheetGrindEvent) => {
    const r = sheetGrindOn(sheetGrindAt.current, ev, getV3()?.sim.ledger.grindMs ?? 0);
    if (r.startAt === sheetGrindAt.current && !r.started && r.commitMs == null) return;
    sheetGrindAt.current = r.startAt;
    setSheetGrindStart(r.startAt);
    if (r.started) {
      setGrindNow(ev.at);
      sound.play('inkGrind');
    }
    if (r.commitMs != null) {
      sound.stop('inkGrind');
      if (r.commitMs > 0) dispatch({ type: 'grind', durationMs: r.commitMs });
    }
  }, []);
  const lineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const returnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const promptTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useSoundSettings(meta.sound);
  const later = useLater();

  const flash = useCallback((text: string, ms = 3400) => {
    if (lineTimer.current) clearTimeout(lineTimer.current);
    setLine(text);
    lineTimer.current = setTimeout(() => setLine(''), ms);
  }, []);

  useEffect(() => {
    // 웹은 스크린리더 감지가 믿을 수 없어 노트 설정으로만 켠다(캡처는 ?sr=1)
    if (Platform.OS === 'web') {
      if (PARAMS.sr) setScreenReader(true);
      return;
    }
    AccessibilityInfo.isScreenReaderEnabled()
      .then(setScreenReader)
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    return () => sub.remove();
  }, []);

  // ── 앱 앞/뒤 전환 → sim. 백그라운드는 sim에 알린 뒤 저장(store). 돌아오면 엔진이 환경음을 되살린다 ──
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      setWordSheet((cur) => wordSheetOnAppState(cur, st));
      // 시트 갈기는 background에서 멈춰 그 깸에 남긴다(sim에 백그라운드를 알리기 전, 다음 깸으로 넘어가지 않게)
      sheetGrind({ type: 'appState', state: st, at: Date.now() });
      if (st === 'active') {
        goForeground();
        reviewAsker.onActive();
        sound.resume();
        setNowT(now());
      } else if (st === 'background') {
        goBackground();
        sound.suspend();
        scheduleForBackground();
      }
    });
    const iv = setInterval(() => {
      if (AppState.currentState !== 'active' && AppState.currentState !== undefined) return;
      tickNow();
      setNowT(now());
    }, TICK_MS);
    return () => {
      sub.remove();
      clearInterval(iv);
    };
  }, [sheetGrind]);

  // ── sim 효과 → 소리·문구·알림 ──
  useEffect(
    () =>
      onEffects((effects, ev, st) => {
        setNowT(now());
        for (const e of effects) {
          switch (e.type) {
            case 'wordAccepted': {
              // 한 마디 + 붓 한 획이 몸에 붙음 → 홈으로 돌아가 마시고 대답(먹 방울은 붓 쪽에서)
              const pick = pendingWord.current;
              pendingWord.current = null;
              if (pick) {
                const w = layout(width, height);
                setCue(cueOf(pick.interpretation, width * 0.5, w.objectsY, ++cueSeq.current)); // v3 붓 = 가운데 칸
                // 모든 대답에 같은 알림 한 줄(곁 대답만 다르면 위기 판정이 들린다, 리뷰 M2)
                AccessibilityInfo.announceForAccessibility(t('v3.answer.a11y'));
              }
              if (st.strokesTotal === 1) later(() => flash(t('v3.line.firstWord'), 4000), 4400);
              break;
            }
            case 'writeRejected':
              if (e.reason !== 'tooShort') {
                pendingWord.current = null;
                setMode('home');
              }
              flash(e.reason === 'noInk' ? t('v3.line.noInk') : e.reason === 'done' ? t('v3.line.done') : e.reason === 'tooShort' ? rejectText('tooShort') : t('v3.line.used'));
              break;
            case 'received': {
              const w = layout(width, height);
              setCue({ kind: e.kind === 'treat' ? CUE.treat : e.bow ? CUE.mealBow : CUE.meal, intensity: 2, net: false, fromX: width * 0.2, fromY: w.objectsY, key: ++cueSeq.current }); // v3 벼루 = 왼쪽 칸
              AccessibilityInfo.announceForAccessibility(t('v3.fed.a11y', { item: t(`v3.item.${e.item}`) }));
              break;
            }
            case 'ireReached':
              later(() => flash(t('v3.line.ire', { n: e.ire }), 4000), 2600);
              break;
            case 'lifeComplete':
              later(() => flash(t('v3.line.complete'), 6000), 1200);
              break;
            case 'strokeAccepted':
              if (isV3Mode()) {
                // V8: 획 씻기 없음. 마시고 대답은 홈에서
                sound.play('strokeAttach');
                if (returnTimer.current) clearTimeout(returnTimer.current);
                returnTimer.current = setTimeout(() => setMode('home'), V3_RETURN_MS);
                break;
              }
              sound.play('strokeAttach');
              later(() => sound.play('mongJoy'), 900);
              setWashOpen(true);
              later(() => setWashOpen(false), sim.WASH_WINDOW_MS);
              if (returnTimer.current) clearTimeout(returnTimer.current);
              returnTimer.current = setTimeout(() => setMode('home'), STROKE_RETURN_MS);
              if (st.strokesTotal === 1) later(() => flash(t('line.firstStroke'), 4000), 1800);
              break;
            case 'strokeRejected':
              flash(e.reason === 'used' && washOpenRef.current ? t('line.washHint') : rejectText(e.reason));
              break;
            case 'strokeWashed':
              if (returnTimer.current) clearTimeout(returnTimer.current);
              setWashOpen(false);
              setStrokeKey((k) => k + 1);
              flash(t('line.washed'));
              break;
            case 'notSleepy':
              flash(t('line.notSleepy'));
              break;
            case 'rehydrated':
              flash(t('line.rehydrated'));
              break;
            case 'slept':
              // 연적으로 재웠을 때만(정산 중 잠에서는 묻지도 예약하지도 않는다, 리뷰 C2)
              if (ev?.type === 'putToSleep') {
                sound.play('sleepDrop');
                onPutToSleep(st);
              }
              break;
            case 'woke':
              setNotifPrompt(false);
              if (AppState.currentState === 'active') void cancelMorning();
              break;
            case 'named':
              // 인장 '탁'은 이름 인장 순간 한 곳에서만(D-14 개정, sound-v0 8절)
              sound.play('sealTak');
              break;
            case 'cardDeveloped':
              sound.play('morningLift');
              setDeveloped({ card: e.card, line: e.line });
              // 평점 요청: 이레 아침 카드를 건져 올린 직후 딱 한 번(먼저 기록 → 거절·실패해도 다시 묻지 않음)
              reviewAsker.onCardDeveloped(e.line);
              break;
            default:
              break;
          }
        }
      }),
    [flash, later, width, height],
  );

  /** 재우기 직후: 권한이 있으면 바로 예약. 처음이면 조수·안심 문구 뒤 앱 안 사전 문구 → (동의하면) OS 권한 창 */
  const onPutToSleep = (st: sim.State) => {
    const m = getSnapshot().meta;
    if (!m.notifEnabled) return;
    void permission().then((p) => {
      if (p === 'granted') void scheduleMorning(wakeAtReal(st));
      else if (p === 'undetermined' && !m.notifAsked) {
        if (promptTimer.current) clearTimeout(promptTimer.current);
        promptTimer.current = setTimeout(() => {
          if (getSnapshot().state?.phase === 'asleep') setNotifPrompt(true);
        }, NOTIF_PROMPT_DELAY_MS);
      }
    });
  };
  const answerPrompt = (yes: boolean) => {
    setNotifPrompt(false);
    if (!yes) {
      setMeta({ notifAsked: true, notifEnabled: false });
      return;
    }
    setMeta({ notifAsked: true });
    void requestPermission().then((p) => {
      const st = getSnapshot().state;
      if (p === 'granted' && st?.phase === 'asleep') void scheduleMorning(wakeAtReal(st));
    });
  };
  /** 공방 노트 알림 토글: 끄면 예약 취소, 켜면 권한 확인(영구 거절이면 기기 설정 안내) */
  const onNotif = (on: boolean) => {
    setMeta({ notifEnabled: on });
    if (!on) {
      void cancelMorning();
      return;
    }
    void permission().then(async (p) => {
      if (p === 'undetermined') p = await requestPermission();
      setMeta({ notifAsked: true });
      if (p === 'denied') {
        flash(t('line.notifDenied'));
        openSettings();
        return;
      }
      const st = getSnapshot().state;
      if (st?.phase === 'asleep') void scheduleMorning(wakeAtReal(st));
    });
  };

  /** 이름 짓기 창을 저절로 연다(묻기 기록을 먼저 남긴다 — 건너뛰어도 한 번으로 센다) */
  const openNameAsk = (st: sim.State, then: 'sleep' | null) => {
    setMeta({ nameAsk: sim.recordNameAsk(getSnapshot().meta.nameAsk, st.dayIndex) });
    setNameSheet({ mode: 'ask', then });
  };
  const closeName = (named: boolean) => {
    const then = nameSheet?.then ?? null;
    setNameSheet(null);
    // 이름을 지었으면 인장 '탁' → 몽망이가 이름 쪽을 바라본 뒤 잠든다. 건너뛰면 그대로 잔다
    if (then === 'sleep') later(() => dispatch({ type: 'putToSleep' }), named ? 1400 : 0);
  };
  /** 세로 이름 탭 = 부르기(C 3-1). 대답은 core callReply: 정 0~1·이름 지은 날 = '응?', 정 2부터 = 가락 */
  const callName = (): 'turn' | 'melody' => {
    const st = getSnapshot().state;
    if (!st) return 'turn';
    const reply = sim.callReply(st, { melody: isOn('nameMelody') });
    const who = displayName(st) ?? t('name.default');
    if (reply === 'melody') {
      const m = sim.melodyOfState(st);
      sound.playMelody(nameMelodySound(m.id), m.rate);
      AccessibilityInfo.announceForAccessibility(t('name.reply.melody.a11y', { name: who }));
    } else {
      sound.play('mongWait');
      AccessibilityInfo.announceForAccessibility(t('name.reply.turn.a11y', { name: who }));
    }
    return reply;
  };

  const kind: Kind = !state || introPlaying
    ? 'intro'
    : developed || (state.phase === 'awake' && state.pendingCard)
      ? 'morning'
      : state.phase === 'asleep'
        ? 'night'
        : mode === 'stroke'
          ? 'stroke'
          : 'day';

  // ── 환경음: 낮 = 종이 공기, 밤·아침 물 = 밤 물소리(조수가 다 찬 2400ms 뒤). 엔진이 원하는 환경음을 기억한다 ──
  const prevKind = useRef<Kind>('intro');
  useEffect(() => {
    const wet = kind === 'night' || (kind === 'morning' && !developed);
    let t: ReturnType<typeof setTimeout> | null = null;
    if (wet) {
      t = setTimeout(
        () => {
          sound.stop('paperAir');
          sound.play('nightAmbience');
        },
        prevKind.current === 'day' ? 2400 : 0,
      );
    } else if (kind !== 'intro') {
      sound.stop('nightAmbience');
      sound.play('paperAir');
    }
    prevKind.current = kind;
    return () => {
      if (t) clearTimeout(t);
    };
  }, [kind, developed]);

  // 벼루 시트 갈기: 0.1초마다 칸을 다시 그리고 6칸에 닿으면 저절로 멈춘다. 시트가 안 보이면(닫기·잠·아침·화면 내림) 멈춘다(간 만큼 남음, D-03)
  const inkSheetShown = inkSheetOpen && kind === 'day';
  useEffect(() => {
    if (sheetGrindStart == null) return;
    const iv = setInterval(() => {
      setGrindNow(Date.now());
      sheetGrind({ type: 'tick', at: Date.now() });
    }, 100);
    return () => clearInterval(iv);
  }, [sheetGrindStart, sheetGrind]);
  useEffect(() => {
    if (!inkSheetShown) sheetGrind({ type: 'hide', at: Date.now() });
  }, [inkSheetShown, sheetGrind]);
  useEffect(() => () => sheetGrind({ type: 'hide', at: Date.now() }), [sheetGrind]);

  // 낮 홈이 아니게 되면(잠·아침) 열려 있던 한 마디 시트를 닫고 입력칸을 새로 만든다(다음 날 어제 글자가 다시 보이지 않게, 리뷰 H2)
  useEffect(() => {
    if (kind !== 'day' && kind !== 'stroke') setWordSheet((cur) => (cur.open ? wordSheetClose(cur) : cur));
  }, [kind]);

  // 첫 밤 안심 문구(한 번): 밤 화면에 들어가면 표시하고 기록
  const soothe = kind === 'night' && !meta.firstNightShown;
  useEffect(() => {
    if (soothe) {
      const t = setTimeout(() => setMeta({ firstNightShown: true }), 4000);
      return () => clearTimeout(t);
    }
  }, [soothe]);

  // '이름을 눌러 불러 보세요' — 이름을 지은 뒤 처음 보는 낮 홈에서 한 번(밤에 지었으면 다음 낮에)
  const hintNow = kind === 'day' && namingOn && !!state?.name && !meta.callHintShown && nameSheet === null;
  useEffect(() => {
    if (!hintNow) return;
    const tm = setTimeout(() => {
      flash(t('name.callHint'), 4000);
      setMeta({ callHintShown: true });
    }, 2200);
    return () => clearTimeout(tm);
  }, [hintNow, flash]);

  // 사물 등장 순서: 단계가 바뀐 뒤 처음 그리는 낮 홈에서만 차례로 나타난다
  // v3: 하루 의례가 벼루부터라 사물 셋이 처음부터 다 나온다
  const reveal: RevealStage = !v3On && state && state.strokesTotal === 0 && state.dayIndex === 0 ? 'first' : 'all';
  const seenReveal = useRef<RevealStage | null>(null);
  const animateReveal = kind === 'day' && seenReveal.current !== reveal;
  useEffect(() => {
    if (kind === 'day' || kind === 'night') seenReveal.current = reveal;
  }, [kind, reveal]);

  const toW = (x: number, y: number) => ({ x: (x - L.cx) / L.wpx, y: (y - L.oyFor(coreScale(state?.strokesTotal ?? 0), look.shape.core.h)) / L.wpx });

  const full = state && snap.v3 ? { sim: state, v3: snap.v3 } : null;
  /** 스크린리더·목록 보기·스크린리더가 켜진 벼루 시트의 먹 갈기: 한 번에 6칸(H1) */
  const grindForA11y = () => {
    sound.play('inkGrind');
    later(() => sound.stop('inkGrind'), 700, { flushOnUnmount: true });
    dispatch({ type: 'grind', durationMs: A11Y_GRIND_MS });
    const f = getV3();
    if (f) AccessibilityInfo.announceForAccessibility(t('v3.word.ink', { n: v3.inkCells(f) }));
  };
  const v3Home: V3Home | null = full
    ? {
        night: v3.nightOf(full),
        ire: v3.nightOf(full) % v3.IRE_NIGHTS === 0 ? v3.nightOf(full) / v3.IRE_NIGHTS : null,
        complete: v3.isComplete(full),
        ink: v3.inkCells(full),
        cue,
        onInkstoneTap: () => setInkSheetOpen(true),
        onGrindA11y: () => grindForA11y(),
      }
    : null;

  let body: ReactNode;
  if (snap.futureSave) {
    // 옛 빌드로 내려감: 인트로(첫 탭 = 설치)로 가면 본 세이브를 덮어쓴다 → 안내만(리뷰 M-5)
    return (
      <View style={[styles.fill, styles.update, { backgroundColor: PALETTE.day.bg }]} testID="update-required" accessibilityRole="alert">
        <KText style={styles.updateTitle} serif="title" accessibilityRole="header">
          {t('update.title')}
        </KText>
        <KText style={styles.updateBody}>{t('update.body')}</KText>
      </View>
    );
  }
  if (kind === 'intro') {
    body = (
      <IntroScreen
        captions={__DEV__ && meta.devCaptions}
        hooks={{
          onBeat: (b) => sound.play(INTRO_BEAT_SOUND[b]),
          onFirstTap: (x, y) => {
            setIntroPlaying(true);
            const lost = getSnapshot().lostSave;
            if (!getSnapshot().state) install(toW(x, y));
            if (lost) later(() => flash(t('line.lostSave'), 6000), 9000);
            dispatch({ type: 'tap', target: 'body', holdMs: 0, ...toW(x, y) });
          },
          onPet: (x, y) => {
            sound.play('pet');
            dispatch({ type: 'tap', target: 'body', holdMs: 0, ...toW(x, y) });
          },
          onDone: () => {
            setIntroPlaying(false);
            flash(isV3Mode() ? t('v3.firstPrompt') : t('line.firstPrompt'), 4500);
          },
        }}
      />
    );
  } else if (!state) {
    body = null;
  } else if (kind === 'morning') {
    body = (
      <MorningScreen
        state={state}
        developed={developed}
        look={look}
        strokeInks={strokeInks}
        title={full ? (v3.isComplete(full) ? t('v3.complete') : t('v3.morning', { n: Math.max(1, full.v3.life.slept) })) : undefined}
        onDevelop={() => dispatch({ type: 'developCard' })}
        onDone={() => {
          setDeveloped(null);
          setMode('home');
          // 이름 묻는 때: A 두 번째(첫 재우기에 건너뛴 다음 아침)·B(둘째 날 아침) — 규칙은 core namePromptDue
          const st = getSnapshot().state;
          if (st && namePromptNow(st, 'morning')) openNameAsk(st, null);
        }}
      />
    );
  } else if (kind === 'stroke') {
    const onStroke = (raw: RawPoint[], level: AttachLevel): StrokeRecord | null => {
      const pick = pendingWord.current;
      // v3: 한 마디(판정 끝난 말결) + 붓 한 획을 한 이벤트로(R1 — 판정 뒤에만 영속화)
      const eff =
        v3On && pick
          ? dispatch({ type: 'write', word: { ...v3.storedWordOf(pick.interpretation), lexVer: v3.LEX_VER, source: 'keyboard' }, chars: pick.chars, raw, level, birthShape: isOn('birthTraits') })
          : // M1: 타고남 플래그가 켜져 있으면 그 개체의 체형으로 부착(D-12 개정 ①)
            dispatch({ type: 'stroke', raw, level, birthShape: isOn('birthTraits') });
      if (!eff.some((e) => e.type === 'strokeAccepted')) return null;
      return getSnapshot().state!.strokes.at(-1) ?? null;
    };
    body = (
      <StrokeScreen
        key={strokeKey}
        initial={0}
        game={{
          records: state.strokes,
          onStroke,
          onBrushTap: () => {
            if (returnTimer.current) clearTimeout(returnTimer.current);
            pendingWord.current = null;
            setMode('home');
          },
          v3: v3On,
          washOpen: v3On ? false : washOpen,
          onJarTap: () => !v3On && dispatch({ type: 'washStroke' }),
          assist: screenReader || meta.assistStroke,
          screenReader,
          wetMark: !state.ledger.strokeUsed,
          look,
          strokeInks,
          overlay:
            line !== '' ? (
              <KText style={[ui.line, styles.strokeLine, { top: insets.top + height * 0.16 }]} accessibilityLiveRegion="polite" pointerEvents="none">
                {line}
              </KText>
            ) : null,
        }}
      />
    );
  } else {
    body = (
      <GameHome
        state={state}
        now={nowT}
        line={line}
        listView={meta.listView}
        soothe={soothe}
        reveal={reveal}
        animateReveal={animateReveal}
        look={look}
        inkChoice={inkChoiceOn}
        inkChanging={inkChanging}
        strokeInks={strokeInks}
        naming={namingOn ? { name: displayName(state), onCall: callName } : null}
        v3={v3Home}
        actions={{
          onBrush: () => {
            const f = getV3();
            if (!f) {
              setMode('stroke');
              return;
            }
            const block = v3.writeBlock(f);
            if (block === 'noInk') flash(t('v3.line.noInk'), 4000);
            else if (block === 'done') flash(t('v3.line.done'), 4000);
            else if (block === 'used') flash(t('v3.line.used'), 4000);
            else if (!block) setWordSheet((cur) => ({ ...cur, open: true }));
          },
          onBrushBlocked: () => flash(t('line.brushBlocked'), 4000),
          onGrindStart: () => sound.play('inkGrind'),
          onGrindEnd: (ms) => {
            sound.stop('inkGrind');
            dispatch({ type: 'grind', durationMs: ms });
          },
          onSleep: () => {
            // A 시점: 연적을 탭하면 물이 오기 전에 이름 자리가 열린다(잘 수 있을 때만 — 졸리지 않으면 지금처럼 '아직 안 졸려요')
            if (state.phase === 'awake' && sim.canPutToSleep(state, now()) && namePromptNow(state, 'sleep')) {
              openNameAsk(state, 'sleep');
              return;
            }
            dispatch({ type: 'putToSleep' });
          },
          onPet: (x, y, holdMs, moveSpeed) => {
            sound.stop('rub');
            if (holdMs < HOLD_MIN_MS) {
              sound.play('pet');
              dispatch({ type: 'tap', target: 'body', holdMs, ...toW(x, y) });
            } else dispatch({ type: 'tap', target: 'body', holdMs, moveSpeed, ...toW(x, y) });
          },
          onRubStart: () => sound.play('rub'),
          onPaper: (x, y) => {
            setInkChanging(false); // 먹 바꾸기 중 종이를 누르면 네 자루를 거둔다(그대로 둠)
            dispatch({ type: 'tap', target: 'paper', holdMs: 0, ...toW(x, y) });
          },
          onNote: () => setNoteOpen(true),
          onChooseInk: (ink) => {
            // 먹 고르기(M1, H2): 첫날(첫 밤 전) = 몸의 먹(이미 그은 획도 다시 스밈), 그 뒤 = 먹 바꾸기(새 획에만). 규칙은 sim chooseInk.
            // 이름은 화면에 쓰지 않고 스크린리더에만
            const firstDay = state.dayIndex === 0;
            sound.play('inkGrind');
            later(() => sound.stop('inkGrind'), 700, { flushOnUnmount: true }); // 루프 소리 — 화면이 사라져도 반드시 멈춘다
            dispatch({ type: 'chooseInk', ink });
            setInkChanging(false);
            const name = t('ink.name', { ink });
            AccessibilityInfo.announceForAccessibility(firstDay ? t('ink.chosen.a11y', { name }) : t('ink.changed.a11y', { name }));
          },
          onInkName: (ink) => flash(t('ink.name', { ink }), 2400),
        }}
      />
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: PALETTE.day.bg }]}>
      {body}
      {full && (
        <>
          <WordSheet
            key={wordSheet.key}
            visible={wordSheet.open && kind === 'day'}
            covered={wordSheet.cover}
            ink={v3.inkCells(full)}
            names={state?.name?.text ? [state.name.text] : []}
            onClose={() => setWordSheet(wordSheetClose)}
            onPick={(p) => {
              pendingWord.current = p;
              setWordSheet(wordSheetClose);
              setMode('stroke');
              later(() => flash(t('v3.word.strokePrompt'), 3600), 300);
            }}
          />
          <InkstoneSheet
            visible={inkSheetShown}
            sheet={v3.mealSheet(full)}
            grindMode={sheetGrindMode(screenReader)}
            grinding={sheetGrindStart != null}
            grindCells={sheetGrindStep(full.sim.ledger.grindMs, sheetGrindStart == null ? 0 : grindNow - sheetGrindStart).cells}
            onClose={() => setInkSheetOpen(false)}
            onGrindRow={() => {
              if (sheetGrindMode(screenReader) === 'all') {
                // 스크린리더: 시트의 '먹 갈기'는 한 번에 6칸(길게 누르기를 못 해도 한 마디까지, 리뷰 H1)
                setInkSheetOpen(false);
                grindForA11y();
                return;
              }
              // 보는 사용자: 눌러 시작·눌러 멈춤, 길게 누르기와 같은 속도로 칸이 차오른다(리뷰 2차 L-d). 시트는 열린 채라 이어서 한 숟갈을 뜰 수 있다
              sheetGrind({ type: 'press', at: Date.now() });
            }}
            onSpoon={(item) => {
              setInkSheetOpen(false);
              dispatch({ type: 'offer', kind: 'meal', item });
            }}
            onTreat={(item) => {
              setInkSheetOpen(false);
              dispatch({ type: 'offer', kind: 'treat', item });
            }}
          />
        </>
      )}
      {wordSheet.cover && <View style={[StyleSheet.absoluteFill, { backgroundColor: PALETTE.day.bg, zIndex: 100 }]} pointerEvents="none" testID="v3-privacy-cover" />}
      {notifPrompt && kind === 'night' && (
        <View style={[styles.prompt, { bottom: insets.bottom + 28 }]} accessibilityViewIsModal testID="notif-prompt">
          <KText style={styles.promptText}>{t('notif.ask')}</KText>
          <KText style={styles.promptSub}>{t('notif.askSub')}</KText>
          <View style={styles.promptRow}>
            <Pressable onPress={() => answerPrompt(false)} style={styles.promptBtn} accessibilityRole="button" accessibilityLabel={t('notif.no')} testID="notif-no">
              <KText style={styles.promptBtnText}>{t('notif.no')}</KText>
            </Pressable>
            <Pressable onPress={() => answerPrompt(true)} style={styles.promptBtn} accessibilityRole="button" accessibilityLabel={t('notif.yes')} testID="notif-yes">
              <KText style={[styles.promptBtnText, { color: PALETTE.night.text }]}>{t('notif.yes')}</KText>
            </Pressable>
          </View>
        </View>
      )}
      {kind !== 'intro' && state && (
        <NoteSheet
          visible={noteOpen}
          onClose={() => setNoteOpen(false)}
          state={state}
          meta={meta}
          now={nowT}
          saveError={snap.saveError}
          onMeta={(p) => {
            setMeta(p);
            // 언어를 바꾸면 이미 예약한 아침 알림 문구도 새 언어로(권한이 있을 때만, scheduleMorning이 확인)
            const st = getSnapshot().state;
            if (p.lang !== undefined && getSnapshot().meta.notifEnabled && st?.phase === 'asleep') void scheduleMorning(wakeAtReal(st));
          }}
          onNotif={onNotif}
          onTimes={(b, m) => dispatch({ type: 'setTimes', bedtimeLocalMin: b, morningLocalMin: m })}
          onInkChange={() => {
            setNoteOpen(false);
            setMode('home');
            setInkChanging(true);
          }}
          cloud={
            cloudFlag && cloudDeps
              ? {
                  state: cloudRowState(readRecord(kv)),
                  open: () => {
                    setNoteOpen(false);
                    setCloudOpen('default');
                  },
                  // C12f 맡긴 것 보기: 켜짐 기록일 때만(옮겨 감·지우기 확인 중에는 맡겨 두기 시트가 먼저다)
                  view: readRecord(kv)?.state === 'on'
                    ? () => {
                        setNoteOpen(false);
                        setDataOpen(true);
                      }
                    : undefined,
                  oldNote: (() => {
                    const m = readUnconfirmedDelete(kv);
                    return m ? (m.creature ?? '?') : null;
                  })(),
                  parked: readParkedList(kv, nowT).map((p) => ({
                    id: p.id,
                    until: bornDate(p.at + PARKED_DAYS * 86_400_000, tzOffsetNow()),
                    expired: p.expired,
                    open: () => {
                      setNoteOpen(false);
                      setCloudOpen(`parked:${p.id}`);
                    },
                  })),
                  revert: (() => {
                    const pre = readPreRestore(kv, nowT);
                    if (!pre) return null;
                    return {
                      until: bornDate(pre.at + PRE_RESTORE_DAYS * 86_400_000, tzOffsetNow()),
                      expired: pre.expired,
                      open: () => {
                        setNoteOpen(false);
                        setCloudOpen('revert');
                      },
                    };
                  })(),
                }
              : undefined
          }
          metrics={
            METRICS_SETTING_CONNECTED
              ? {
                  on: metricsSetting(kv, now(), tzOffsetNow()).kind === 'on',
                  open: () => {
                    setNoteOpen(false);
                    setMetricsOpen(true);
                  },
                }
              : undefined
          }
          onName={
            namingOn
              ? () => {
                  setNoteOpen(false);
                  setNameSheet({ mode: state.name ? 'rename' : 'ask', then: null });
                }
              : undefined
          }
        />
      )}
      {METRICS_SETTING_CONNECTED && <MetricsSheet visible={metricsOpen} onClose={() => setMetricsOpen(false)} kv={kv} now={now} tzOffsetMin={tzOffsetNow} />}
      {cloudFlag && cloudDeps && (
        <MyDataSheet
          visible={dataOpen}
          onClose={() => setDataOpen(false)}
          onDelete={() => {
            setDataOpen(false);
            setCloudOpen('delete');
          }}
          deps={cloudDeps}
          tzOffsetMin={tzOffsetNow}
        />
      )}
      {cloudFlag && cloudDeps && <CloudSheetHost visible={cloudOpen !== false} entry={cloudOpen === false || cloudOpen === 'default' ? undefined : cloudOpen} onClose={() => setCloudOpen(false)} deps={cloudDeps} tzOffsetMin={tzOffsetNow} />}
      {nameSheet && state && (
        <NameSheet
          mode={nameSheet.mode}
          sealSeed={state.birth.sealSeed}
          initial={nameSheet.mode === 'rename' ? (state.name?.text ?? undefined) : undefined}
          onConfirm={(text) => dispatch({ type: 'setName', text })}
          onClose={closeName}
        />
      )}
      {DEV_MENU && (
        <DevPanel
          v3Only={DEV_MENU === 'v3'}
          onSpike={onSpike}
          onReset={() => {
            setDeveloped(null);
            setMode('home');
            setIntroPlaying(false);
            seenReveal.current = null;
          }}
        />
      )}
    </View>
  );
}

/** 앱이 뒤로 갈 때: 오늘 밤 자동 잠 → 깨는 시각을 sim으로 투영해 예약(권한이 이미 있을 때만, 묻지 않는다) */
function scheduleForBackground() {
  const { state, meta } = getSnapshot();
  if (!state || !meta.notifEnabled) return;
  let s = state;
  if (s.phase === 'awake') {
    const tr = sim.nextTransition(s);
    if (!tr || tr.kind !== 'sleep') return;
    s = sim.tick(s, tr.at + 1).state;
  }
  if (s.phase !== 'asleep') return;
  void scheduleMorning(wakeAtReal(s));
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  update: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, gap: 14 },
  updateTitle: { fontFamily: SERIF, fontSize: 20, color: PALETTE.day.text, textAlign: 'center', letterSpacing: track.serif(20) },
  updateBody: { fontFamily: SANS, fontSize: 15, lineHeight: 23, color: PALETTE.day.textSub, textAlign: 'center' },
  strokeLine: { color: PALETTE.day.textSub },
  prompt: { position: 'absolute', left: 20, right: 20, paddingVertical: 18, paddingHorizontal: 18, borderRadius: 12, backgroundColor: 'rgba(13,17,32,0.82)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(233,226,210,0.35)' },
  promptText: { fontFamily: SERIF, fontSize: 16, color: PALETTE.night.text, textAlign: 'center', letterSpacing: track.serif(16) },
  promptSub: { marginTop: 6, fontFamily: SANS, fontSize: 13, color: PALETTE.night.textSub, textAlign: 'center' },
  promptRow: { marginTop: 12, flexDirection: 'row', justifyContent: 'center', gap: 24 },
  promptBtn: { minHeight: 44, minWidth: 88, justifyContent: 'center', alignItems: 'center' },
  promptBtnText: { fontFamily: SANS, fontSize: 15, color: PALETTE.night.textSub },
});
