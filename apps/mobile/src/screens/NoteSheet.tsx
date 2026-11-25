import { PALETTE, sim, type MongLook } from '@mong/core';
import { inkChangeAvailable, useMongLook, useStrokeInks } from '../game/look';
import { displayName } from '../game/naming';
import { NameTag } from './NameTag';
import { useFeature } from '../features';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { morningLine, motifName, visibleCaption } from '../game/text';
import { LANGUAGE_NAMES, clockTime, dayName, t, type LanguagePref } from '../i18n';
import { DreamCard } from '../render/dreamCard/DreamCard';
import { DreamCardThumb, strokesForCard } from '../render/dreamCard/DreamCardThumb';
import { ShareBar, cardA11y, cardLabels, nightName } from './cardText';
import type { Meta } from '../game/store';
import { PARAMS } from '../render/clock';
import { KText, track } from '../ui/type';
import { BottomSheet } from '../ui/BottomSheet';
import { SANS, SERIF } from './ui';

/**
 * 공방 노트(아트 7-2, D-08): 평범한 목록 UI. 앨범·설정(소리·진동·알림)·접근성·잠/아침 시각·오늘 상태 한 줄.
 * 시트·배경·제스처는 공통 BottomSheet(ui/BottomSheet): 배경은 제자리에서 페이드, 시트만 아래에서 올라오고(리뷰 U8) 손잡이·내용을 끌어 닫는다. 토글은 먹·한지 색 자체 컴포넌트(청록 금지).
 * 잠·아침 시각 변경은 sim setTimes 이벤트로 보낸다(검증·첫날 재계산은 sim).
 */
export function NoteSheet({
  visible,
  onClose,
  state,
  meta,
  now,
  saveError,
  onMeta,
  onNotif,
  onTimes,
  onInkChange,
  onName,
  cloud,
}: {
  visible: boolean;
  onClose: () => void;
  state: sim.State;
  meta: Meta;
  now: number;
  saveError: string | null;
  onMeta: (p: Partial<Meta>) => void;
  /** 알림 켬/끔(끄면 예약 취소, 켜면 권한 확인은 GameApp) */
  onNotif: (on: boolean) => void;
  onTimes: (bedtimeLocalMin: number, morningLocalMin: number) => void;
  /** M1 '먹 바꾸기'(첫 밤 뒤, 새 획에만): 노트를 닫고 벼루 옆에 네 자루를 놓는다 */
  onInkChange?: () => void;
  /** M2 이름 짓기·바꾸기(플래그 naming): 노트를 닫고 이름 짓기 창을 연다. 없으면 이름 줄·이름표 줄을 그리지 않는다 */
  onName?: () => void;
  /** C12 맡겨 두기(플래그 cloud + 서버·로그인 포트): 노트를 닫고 맡겨 두기 시트를 연다. 없으면 절을 그리지 않는다 */
  cloud?: { state: 'on' | 'off' | 'paused' | 'attention'; open: () => void; /** 바꾸기 전 몽망이로 되돌리기(30일, 리뷰 H1). 기한 날짜 표기·열기 */ revert: { until: string; open: () => void } | null; /** '이 기기'를 골라 기기 칸(30일)에 따로 둔 몽망이들 다시 고르기 */ parked: { id: string; until: string; open: () => void }[]; /** 확인하지 못한 지우기가 남았을 때 웹 삭제 안내(인장 코드) — 지워졌다는 확인 전까지 늘 남긴다 */ oldNote: string | null };
}) {
  const look = useMongLook(state);
  const inkFlag = useFeature('inkChoice');
  const namingFlag = useFeature('naming');
  const { width } = useWindowDimensions();
  const [viewing, setViewing] = useState<number | null>(null);
  const [tagOpen, setTagOpen] = useState(false);
  const strokeInks = useStrokeInks(state);
  useEffect(() => {
    if (!visible) {
      setViewing(null);
      setTagOpen(false);
    }
  }, [visible]);
  const myName = displayName(state);
  const viewer = viewing !== null && state.cards[viewing] ? <CardViewer card={state.cards[viewing]!} strokes={state.strokes} look={look} owner={state} onClose={() => setViewing(null)} /> : null;
  const s = meta.sound;
  const dry = sim.dryness(state, now);
  const status = [
    dayName(state.dayIndex),
    state.phase === 'asleep' ? t('note.asleep') : t('note.awake'),
    state.ledger.strokeUsed ? t('note.strokeUsed') : t('note.strokeLeft'),
    dry > 0 ? t('note.dry') : t('note.wet'),
  ].join(' · ');
  const shift = (m: number, d: number) => (m + d + 1440) % 1440;
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('note.title')}
      theme="day"
      contentContainerStyle={{ paddingBottom: 24 }}
      testID="note"
      overlay={
        viewer || tagOpen ? (
          <>
            {viewer}
            {tagOpen && <NameTag state={state} name={myName} look={look} strokeInks={strokeInks} onClose={() => setTagOpen(false)} />}
          </>
        ) : null
      }
      onOverlayBack={() => (tagOpen ? setTagOpen(false) : setViewing(null))}
    >
      <KText style={styles.section} serif="title">{t('note.today')}</KText>
      <KText style={styles.status}>{status}</KText>
      {saveError !== null && <KText style={[styles.status, { color: PALETTE.day.accent, marginTop: 6 }]}>{t('note.saveError')}</KText>}
      {onName && (
        <>
          <Pressable style={styles.row} onPress={() => setTagOpen(true)} accessibilityRole="button" accessibilityLabel={t('note.tag.a11y')} testID="note-tag">
            <KText style={styles.rowText}>{t('note.tag')}</KText>
          </Pressable>
          <Pressable style={styles.row} onPress={onName} accessibilityRole="button" accessibilityLabel={myName ? t('note.rename', { name: myName }) : t('note.name')} testID="note-name">
            <KText style={styles.rowText}>{myName ? t('note.rename', { name: myName }) : t('note.name')}</KText>
          </Pressable>
        </>
      )}
      {onInkChange && state.phase === 'awake' && inkChangeAvailable(state, inkFlag) && (
        <Pressable style={styles.row} onPress={onInkChange} accessibilityRole="button" accessibilityLabel={t('note.inkChange.a11y')} testID="note-ink-change">
          <KText style={styles.rowText}>{t('note.inkChange')}</KText>
        </Pressable>
      )}

      <KText style={styles.section} serif="title">{t('note.soundSection')}</KText>
      <Row label={t('note.sound')} value={s.soundEnabled} onChange={(v) => onMeta({ sound: { ...s, soundEnabled: v } })} />
      <Row label={t('note.haptics')} value={s.hapticsEnabled} onChange={(v) => onMeta({ sound: { ...s, hapticsEnabled: v } })} />

      <KText style={styles.section} serif="title">{t('note.notifSection')}</KText>
      <Row label={t('note.notif')} value={meta.notifEnabled} onChange={onNotif} />

      <KText style={styles.section} serif="title">{t('note.timesSection')}</KText>
      <Stepper label={t('note.bedtime')} value={clockTime(state.bedtimeLocalMin)} onMinus={() => onTimes(shift(state.bedtimeLocalMin, -30), state.morningLocalMin)} onPlus={() => onTimes(shift(state.bedtimeLocalMin, 30), state.morningLocalMin)} />
      <Stepper label={t('note.morning')} value={clockTime(state.morningLocalMin)} onMinus={() => onTimes(state.bedtimeLocalMin, shift(state.morningLocalMin, -30))} onPlus={() => onTimes(state.bedtimeLocalMin, shift(state.morningLocalMin, 30))} />

      <KText style={styles.section} serif="title">{t('note.a11ySection')}</KText>
      <Row label={t('note.listView')} value={meta.listView} onChange={(v) => onMeta({ listView: v })} />
      <Row label={t('note.assistStroke')} value={meta.assistStroke} onChange={(v) => onMeta({ assistStroke: v })} />

      {cloud && (
        <>
          <KText style={styles.section} serif="title">{t('note.cloudSection')}</KText>
          <Pressable style={styles.row} onPress={cloud.open} accessibilityRole="button" accessibilityLabel={t('note.cloud.a11y', { state: t(`note.cloud.${cloud.state}`) })} testID="note-cloud">
            <KText style={styles.rowText}>{t('note.cloud')}</KText>
            <KText style={[styles.rowText, styles.rowValue]}>{t(`note.cloud.${cloud.state}`)}</KText>
          </Pressable>
          {cloud.oldNote !== null && (
            <KText style={[styles.status, { marginTop: 6 }]} testID="note-cloud-old">
              {t('note.cloud.oldWeb', { code: cloud.oldNote })}
            </KText>
          )}
          {cloud.parked.map((p, i) => (
            <Pressable key={p.id} style={[styles.row, styles.rowWrap]} onPress={p.open} accessibilityRole="button" accessibilityLabel={t('note.cloud.parked.a11y', { date: p.until })} testID={i === 0 ? 'note-cloud-parked' : `note-cloud-parked-${i}`}>
              <KText style={styles.rowText}>{t('note.cloud.parked')}</KText>
              <KText style={[styles.rowText, styles.rowValue]}>{t('note.cloud.revert.until', { date: p.until })}</KText>
            </Pressable>
          ))}
          {cloud.revert && (
            <Pressable style={[styles.row, styles.rowWrap]} onPress={cloud.revert.open} accessibilityRole="button" accessibilityLabel={t('note.cloud.revert.a11y', { date: cloud.revert.until })} testID="note-cloud-revert">
              <KText style={styles.rowText}>{t('note.cloud.revert')}</KText>
              <KText style={[styles.rowText, styles.rowValue]}>{t('note.cloud.revert.until', { date: cloud.revert.until })}</KText>
            </Pressable>
          )}
        </>
      )}

      <KText style={styles.section} serif="title">{t('note.langSection')}</KText>
      <LangPicker value={meta.lang} onChange={(lang) => onMeta({ lang })} />

      <KText style={styles.section} serif="title">{t('note.cards', { n: state.cards.length })}</KText>
      {state.cards.length === 0 && <KText style={styles.status}>{t('note.cardsEmpty')}</KText>}
      <Album cards={state.cards} strokes={state.strokes} width={width} onOpen={setViewing} look={look} sealSeed={namingFlag ? state.birth.sealSeed : undefined} />
    </BottomSheet>
  );
}

/** 지난 카드 한 장의 글(아침 문장은 sim이 카드와 함께 보관하지 않아 관찰 문장으로 다시 만든다) */
function pastLine(c: sim.DreamCard): string {
  return morningLine({ kind: 'observation', axis: null, keys: [] }, c);
}

/** 인화 카드 앨범(도감 역할, 아트 7-2): 3열 썸네일. 썸네일은 저해상도 오프스크린 캐시(DreamCardThumb) */
function Album({ cards, strokes, width, onOpen, look, sealSeed }: { cards: sim.DreamCard[]; strokes: sim.Stroke[]; width: number; onOpen: (i: number) => void; look: MongLook; /** M2 그 아이의 인장(naming 켬) */ sealSeed?: number }) {
  const cols = width < 360 ? 2 : 3;
  const gap = 12;
  const tw = Math.floor((Math.min(width, 560) - 40 - gap * (cols - 1)) / cols);
  // 최근 카드가 앞. 카드별 획 목록은 한 번만 자른다(썸네일 캐시 키가 흔들리지 않게)
  const items = useMemo(() => cards.map((c, i) => ({ c, i, strokes: strokesForCard(strokes, c) })).reverse(), [cards, strokes]);
  return (
    <View style={[styles.album, { gap }]}>
      {items.map(({ c, i, strokes: st }) => (
        <Pressable key={i} onPress={() => onOpen(i)} style={{ width: tw }} accessibilityRole="button" accessibilityLabel={t('note.thumb.a11y', { card: cardA11y(c, pastLine(c)) })} testID={`album-${i}`}>
          <DreamCardThumb card={c} strokes={st} width={tw} look={look} sealSeed={sealSeed} />
          <KText style={styles.thumbText} numberOfLines={2} importantForAccessibility="no">
            {t(c.nightsMerged > 1 ? 'note.thumb.long' : 'note.thumb', { night: nightName(c), motif: motifName(c.motifId) ?? t('motif.fallback') })}
          </KText>
        </Pressable>
      ))}
    </View>
  );
}

/** 지난 카드 크게 다시 보기(앨범 위에 겹침). 카드 그림은 아침 화면과 같은 DreamCard */
function CardViewer({ card, strokes, onClose, look, owner }: { card: sim.DreamCard; strokes: sim.Stroke[]; onClose: () => void; look: MongLook; owner: sim.State }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const w = Math.max(160, Math.min(width - 40, 380, (height - insets.top - insets.bottom - 150) / 1.25));
  const st = useMemo(() => strokesForCard(strokes, card), [strokes, card]);
  const line = pastLine(card);
  // 꿈 캡션(dreams-30days 3-2 '공방 노트 카드 보기'). '처음 꾼 꿈'은 노트에 남기지 않는다(1-7)
  const dreamOn = useFeature('dreamContent');
  const moonOn = useFeature('moonNight');
  const caption = visibleCaption(card, { dream: dreamOn, moon: moonOn });
  // M2: 앱 안 카드는 이름(공개 설정과 무관), 낙관은 그 아이의 인장. 공유는 ShareBar가 공유 이름으로 다시 쓴다
  const namingOn = useFeature('naming');
  const labels = cardLabels(card, line, displayName(owner));
  const sealSeed = namingOn ? owner.birth.sealSeed : undefined;
  return (
    <View style={[StyleSheet.absoluteFill, styles.viewer, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 12 }]} accessibilityViewIsModal testID="card-viewer">
      <DreamCard card={card} strokes={st} labels={labels} width={w} a11yLabel={cardA11y(card, line, [caption])} look={look} sealSeed={sealSeed} />
      {caption && (
        <KText style={[styles.viewerCaption, { maxWidth: w }]} maxFontSizeMultiplier={1.5} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden testID="viewer-caption">
          {caption}
        </KText>
      )}
      <View style={styles.viewerActions}>
        <ShareBar dark input={{ card, strokes: st, labels, look, sealSeed }} owner={owner} />
        <Pressable onPress={onClose} style={styles.viewerClose} accessibilityRole="button" accessibilityLabel={t('note.viewer.back.a11y')} testID="viewer-close">
          <KText style={[styles.closeText, { color: PALETTE.night.text, textDecorationLine: 'underline' }]}>{t('note.viewer.back')}</KText>
        </Pressable>
      </View>
    </View>
  );
}

/** 먹·한지 토글: 켜짐 = 먹색 바탕 + 한지색 알, 꺼짐 = 한지 바탕 + 담묵 테 */
export function InkToggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  const k = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    k.value = withTiming(value ? 1 : 0, { duration: PARAMS.rm ? 0 : 180 });
  }, [value, k]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: 3 + k.value * 20 }] }));
  const track_ = useAnimatedStyle(() => ({ backgroundColor: k.value > 0.5 ? PALETTE.day.text : PALETTE.day.bgShade }));
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      hitSlop={8}
      style={styles.toggleHit}
    >
      <Animated.View style={[styles.toggle, track_]}>
        <Animated.View style={[styles.knob, knob, { backgroundColor: value ? PALETTE.day.bg : PALETTE.day.textSub }]} />
      </Animated.View>
    </Pressable>
  );
}

function Row({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.row}>
      <KText style={styles.rowText}>{label}</KText>
      <InkToggle value={value} onChange={onChange} label={label} />
    </View>
  );
}

/** 언어 고르기(D-17): 기기 따름 / 한국어 / English. 라디오 묶음 — 언어 이름은 늘 그 언어 글자로 */
function LangPicker({ value, onChange }: { value: LanguagePref; onChange: (v: LanguagePref) => void }) {
  const opts: { v: LanguagePref; label: string }[] = [
    { v: 'system', label: t('note.lang.system') },
    { v: 'ko', label: LANGUAGE_NAMES.ko },
    { v: 'en', label: LANGUAGE_NAMES.en },
  ];
  return (
    <View accessibilityRole="radiogroup">
      {opts.map((o) => {
        const on = o.v === value;
        return (
          <Pressable key={o.v} onPress={() => onChange(o.v)} style={styles.row} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={o.label} testID={`lang-${o.v}`}>
            <KText style={styles.rowText}>{o.label}</KText>
            <View style={[styles.radio, on && styles.radioOn]}>{on && <View style={styles.radioDot} />}</View>
          </Pressable>
        );
      })}
    </View>
  );
}

function Stepper({ label, value, onMinus, onPlus }: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <View style={[styles.row, styles.rowWrap]}>
      <KText style={styles.rowText}>{label}</KText>
      {/* 글자 200%·영어 12시간제에서 한 줄에 안 들어가면 조절 묶음이 다음 줄 오른쪽으로 내려간다(i18n-v1 캡처) */}
      <View style={styles.stepGroup}>
        <Pressable onPress={onMinus} style={styles.step} accessibilityRole="button" accessibilityLabel={t('note.earlier.a11y', { label })}>
          <KText style={styles.stepText}>{t('note.earlier')}</KText>
        </Pressable>
        <KText style={[styles.rowText, styles.time]}>{value}</KText>
        <Pressable onPress={onPlus} style={styles.step} accessibilityRole="button" accessibilityLabel={t('note.later.a11y', { label })}>
          <KText style={styles.stepText}>{t('note.later')}</KText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  closeText: { fontFamily: SANS, fontSize: 15, color: PALETTE.day.textSub },
  section: { marginTop: 20, marginBottom: 2, fontFamily: SERIF, fontSize: 14, color: PALETTE.day.textSub, letterSpacing: track.serif(14) },
  status: { fontFamily: SANS, fontSize: 15, color: PALETTE.day.text, lineHeight: 22 },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: PALETTE.day.wash },
  rowText: { fontFamily: SANS, fontSize: 15, color: PALETTE.day.text, flexShrink: 1 },
  rowWrap: { flexWrap: 'wrap' },
  rowValue: { color: PALETTE.day.textSub, textAlign: 'right' },
  stepGroup: { flexDirection: 'row', alignItems: 'center', marginLeft: 'auto' },
  time: { minWidth: 56, textAlign: 'center', fontVariant: ['tabular-nums'] },
  step: { minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontFamily: SANS, fontSize: 13, color: PALETTE.day.textSub, textDecorationLine: 'underline' },
  toggleHit: { minHeight: 44, justifyContent: 'center' },
  album: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  thumbText: { marginTop: 6, fontFamily: SANS, fontSize: 12, lineHeight: 16, color: PALETTE.day.textSub },
  viewer: { backgroundColor: 'rgba(12,16,29,0.96)', alignItems: 'center', justifyContent: 'center' },
  viewerActions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 },
  viewerCaption: { marginTop: 12, textAlign: 'center', fontFamily: SERIF, fontSize: 14, lineHeight: 22, color: PALETTE.night.textSub, letterSpacing: track.serif(14) },
  viewerClose: { minHeight: 44, minWidth: 88, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  toggle: { width: 46, height: 26, borderRadius: 13, borderWidth: 1, borderColor: PALETTE.day.textSub, justifyContent: 'center' },
  knob: { width: 18, height: 18, borderRadius: 9 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: PALETTE.day.textSub, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  radioOn: { borderColor: PALETTE.day.text },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: PALETTE.day.text },
});
