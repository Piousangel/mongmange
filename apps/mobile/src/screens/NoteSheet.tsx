import { PALETTE, sim } from '@mong/core';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MOTIF_NAMES, dayName, hhmm, morningLine } from '../game/text';
import { DreamCard } from '../render/dreamCard/DreamCard';
import { DreamCardThumb, strokesForCard } from '../render/dreamCard/DreamCardThumb';
import { SharePlaceholder, cardA11y, cardLabels, nightName } from './cardText';
import type { Meta } from '../game/store';
import { PARAMS } from '../render/clock';
import { KText, track } from '../ui/type';
import { SANS, SERIF } from './ui';

/**
 * 공방 노트(아트 7-2, D-08): 평범한 목록 UI. 앨범·설정(소리·진동·알림)·접근성·잠/아침 시각·오늘 상태 한 줄.
 * 배경은 제자리에서 페이드, 시트만 아래에서 올라온다(리뷰 U8). 토글은 먹·한지 색 자체 컴포넌트(청록 금지).
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
}) {
  const { width, height } = useWindowDimensions();
  const [viewing, setViewing] = useState<number | null>(null);
  useEffect(() => {
    if (!visible) setViewing(null);
  }, [visible]);
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const k = useSharedValue(0);
  useEffect(() => {
    if (visible) {
      setMounted(true);
      k.value = withTiming(1, { duration: PARAMS.rm ? 0 : 320, easing: Easing.out(Easing.cubic) });
    } else if (mounted) {
      k.value = withTiming(0, { duration: PARAMS.rm ? 0 : 240 }, (done) => {
        if (done) runOnJS(setMounted)(false);
      });
    }
  }, [visible, mounted, k]);
  const backSt = useAnimatedStyle(() => ({ opacity: k.value }));
  const sheetSt = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - k.value) * height * 0.9 }] }));

  const s = meta.sound;
  const dry = sim.dryness(state, now);
  const status = [
    dayName(state.dayIndex),
    state.phase === 'asleep' ? '자는 중' : '깨어 있음',
    state.ledger.strokeUsed ? '오늘의 획을 그었어요' : '오늘의 획이 남아 있어요',
    dry > 0 ? '먹이 조금 말랐어요' : '먹이 촉촉해요',
  ].join(' · ');
  const shift = (m: number, d: number) => (m + d + 1440) % 1440;
  return (
    <Modal visible={mounted} animationType="none" transparent onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backSt]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="공방 노트 닫기" />
      </Animated.View>
      <Animated.View style={[styles.sheet, { maxHeight: height - insets.top - 24, paddingBottom: insets.bottom + 16 }, sheetSt]} accessibilityViewIsModal>
        <View style={styles.grain} pointerEvents="none" />
        <View style={styles.head}>
          <KText style={styles.title} accessibilityRole="header">
            공방 노트
          </KText>
          <Pressable onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel="닫기" testID="note-close">
            <KText style={styles.closeText}>닫기</KText>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          <KText style={styles.section}>오늘 상태</KText>
          <KText style={styles.status}>{status}</KText>
          {saveError !== null && <KText style={[styles.status, { color: PALETTE.day.accent, marginTop: 6 }]}>지금은 기기에 저장하지 못하고 있어요 · 앱을 닫기 전에 저장 공간을 확인해 주세요</KText>}

          <KText style={styles.section}>소리와 진동</KText>
          <Row label="소리" value={s.soundEnabled} onChange={(v) => onMeta({ sound: { ...s, soundEnabled: v } })} />
          <Row label="진동" value={s.hapticsEnabled} onChange={(v) => onMeta({ sound: { ...s, hapticsEnabled: v } })} />

          <KText style={styles.section}>알림</KText>
          <Row label="아침 꿈 알림 · 하루 한 번" value={meta.notifEnabled} onChange={onNotif} />

          <KText style={styles.section}>잠과 아침</KText>
          <Stepper label="잠 시각" value={hhmm(state.bedtimeLocalMin)} onMinus={() => onTimes(shift(state.bedtimeLocalMin, -30), state.morningLocalMin)} onPlus={() => onTimes(shift(state.bedtimeLocalMin, 30), state.morningLocalMin)} />
          <Stepper label="아침 시각" value={hhmm(state.morningLocalMin)} onMinus={() => onTimes(state.bedtimeLocalMin, shift(state.morningLocalMin, -30))} onPlus={() => onTimes(state.bedtimeLocalMin, shift(state.morningLocalMin, 30))} />

          <KText style={styles.section}>접근성</KText>
          <Row label="사물 대신 목록으로 보기" value={meta.listView} onChange={(v) => onMeta({ listView: v })} />
          <Row label="획을 버튼으로 긋기" value={meta.assistStroke} onChange={(v) => onMeta({ assistStroke: v })} />

          <KText style={styles.section}>인화 카드 {state.cards.length}장</KText>
          {state.cards.length === 0 && <KText style={styles.status}>아침마다 간밤의 꿈이 한 장씩 모여요</KText>}
          <Album cards={state.cards} strokes={state.strokes} width={width} onOpen={setViewing} />
        </ScrollView>
      </Animated.View>
      {viewing !== null && state.cards[viewing] && <CardViewer card={state.cards[viewing]!} strokes={state.strokes} onClose={() => setViewing(null)} />}
    </Modal>
  );
}

/** 지난 카드 한 장의 글(아침 문장은 sim이 카드와 함께 보관하지 않아 관찰 문장으로 다시 만든다) */
function pastLine(c: sim.DreamCard): string {
  return morningLine({ kind: 'observation', axis: null, keys: [] }, c);
}

/** 인화 카드 앨범(도감 역할, 아트 7-2): 3열 썸네일. 썸네일은 저해상도 오프스크린 캐시(DreamCardThumb) */
function Album({ cards, strokes, width, onOpen }: { cards: sim.DreamCard[]; strokes: sim.Stroke[]; width: number; onOpen: (i: number) => void }) {
  const cols = width < 360 ? 2 : 3;
  const gap = 12;
  const tw = Math.floor((Math.min(width, 560) - 40 - gap * (cols - 1)) / cols);
  // 최근 카드가 앞. 카드별 획 목록은 한 번만 자른다(썸네일 캐시 키가 흔들리지 않게)
  const items = useMemo(() => cards.map((c, i) => ({ c, i, strokes: strokesForCard(strokes, c) })).reverse(), [cards, strokes]);
  return (
    <View style={[styles.album, { gap }]}>
      {items.map(({ c, i, strokes: st }) => (
        <Pressable key={i} onPress={() => onOpen(i)} style={{ width: tw }} accessibilityRole="button" accessibilityLabel={`${cardA11y(c, pastLine(c))} 크게 보기`} testID={`album-${i}`}>
          <DreamCardThumb card={c} strokes={st} width={tw} />
          <KText style={styles.thumbText} numberOfLines={2} importantForAccessibility="no">
            {nightName(c)} · {MOTIF_NAMES[c.motifId] ?? c.motifId}
            {c.nightsMerged > 1 ? ' · 긴 잠' : ''}
          </KText>
        </Pressable>
      ))}
    </View>
  );
}

/** 지난 카드 크게 다시 보기(앨범 위에 겹침). 카드 그림은 아침 화면과 같은 DreamCard */
function CardViewer({ card, strokes, onClose }: { card: sim.DreamCard; strokes: sim.Stroke[]; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const w = Math.max(160, Math.min(width - 40, 380, (height - insets.top - insets.bottom - 150) / 1.25));
  const st = useMemo(() => strokesForCard(strokes, card), [strokes, card]);
  const line = pastLine(card);
  return (
    <View style={[StyleSheet.absoluteFill, styles.viewer, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 12 }]} accessibilityViewIsModal testID="card-viewer">
      <DreamCard card={card} strokes={st} labels={cardLabels(card, line)} width={w} a11yLabel={cardA11y(card, line)} />
      <View style={styles.viewerActions}>
        <SharePlaceholder dark />
        <Pressable onPress={onClose} style={styles.viewerClose} accessibilityRole="button" accessibilityLabel="앨범으로 돌아가기" testID="viewer-close">
          <KText style={[styles.closeText, { color: PALETTE.night.text, textDecorationLine: 'underline' }]}>앨범으로</KText>
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

function Stepper({ label, value, onMinus, onPlus }: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <View style={styles.row}>
      <KText style={styles.rowText}>{label}</KText>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable onPress={onMinus} style={styles.step} accessibilityRole="button" accessibilityLabel={`${label} 30분 앞당기기`}>
          <KText style={styles.stepText}>이르게</KText>
        </Pressable>
        <KText style={[styles.rowText, styles.time]}>{value}</KText>
        <Pressable onPress={onPlus} style={styles.step} accessibilityRole="button" accessibilityLabel={`${label} 30분 늦추기`}>
          <KText style={styles.stepText}>늦게</KText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(20,18,16,0.38)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: PALETTE.day.bg, borderTopLeftRadius: 14, borderTopRightRadius: 14, paddingHorizontal: 20, paddingTop: 14, overflow: 'hidden' },
  grain: { position: 'absolute', left: 0, right: 0, top: 0, height: 6, backgroundColor: PALETTE.day.bgShade, opacity: 0.7 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: PALETTE.day.wash },
  title: { fontFamily: SERIF, fontSize: 19, color: PALETTE.day.text, letterSpacing: track.serif(19) },
  close: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  closeText: { fontFamily: SANS, fontSize: 15, color: PALETTE.day.textSub },
  section: { marginTop: 20, marginBottom: 2, fontFamily: SERIF, fontSize: 14, color: PALETTE.day.textSub, letterSpacing: track.serif(14) },
  status: { fontFamily: SANS, fontSize: 15, color: PALETTE.day.text, lineHeight: 22 },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: PALETTE.day.wash },
  rowText: { fontFamily: SANS, fontSize: 15, color: PALETTE.day.text, flexShrink: 1 },
  time: { minWidth: 56, textAlign: 'center', fontVariant: ['tabular-nums'] },
  step: { minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontFamily: SANS, fontSize: 13, color: PALETTE.day.textSub, textDecorationLine: 'underline' },
  toggleHit: { minHeight: 44, justifyContent: 'center' },
  album: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  thumbText: { marginTop: 6, fontFamily: SANS, fontSize: 12, lineHeight: 16, color: PALETTE.day.textSub },
  viewer: { backgroundColor: 'rgba(12,16,29,0.96)', alignItems: 'center', justifyContent: 'center' },
  viewerActions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 },
  viewerClose: { minHeight: 44, minWidth: 88, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  toggle: { width: 46, height: 26, borderRadius: 13, borderWidth: 1, borderColor: PALETTE.day.textSub, justifyContent: 'center' },
  knob: { width: 18, height: 18, borderRadius: 9 },
});
