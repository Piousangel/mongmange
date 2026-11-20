// 인화 카드의 글(카드 위 라벨·스크린리더 설명)과 공유 버튼. 문장은 앱이 언어별로 만든다(시스템 2.6).
import { PALETTE, type sim } from '@mong/core';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { DreamCardInput, DreamCardLabels } from '../render/dreamCard/DreamCard';
import { useFeature } from '../features';
import { shareDreamCard, shareIreScroll, shareSupported } from '../share/shareCard';
import { appendA11y, motifName, motifScene } from '../game/text';
import { dayName, nightName as nightOf, t } from '../i18n';
import { KText } from '../ui/type';
import { SANS } from './ui';

/** card.night = 현상한 아침의 dayIndex → 그 전날 밤의 꿈(리뷰 U12-④) */
export function nightName(card: sim.DreamCard): string {
  return nightOf(Math.max(0, card.night - 1));
}

export function cardLabels(card: sim.DreamCard, line: string): DreamCardLabels {
  const motif = motifName(card.motifId) ?? t('motif.fallback');
  return { name: t('card.name', { day: dayName(Math.max(0, card.night - 1)) }), line, sub: t('card.sub', { motif, night: nightName(card) }) };
}

/**
 * 스크린리더 설명: 무엇이 그려졌나(모티프) + 아침 문장. 꿈 콘텐츠(dreamContent)가 켜져 있으면 끝에 카드 캡션과
 * '처음 꾼 꿈'을 붙인다(dreams-30days 3-2·1-7 — 시각 표시와 같은 때만).
 */
export function cardA11y(card: sim.DreamCard, line: string, extra: readonly (string | null | undefined)[] = []): string {
  const motif = motifName(card.motifId) ?? t('motif.fallback');
  const scene = motifScene(card.motifId);
  const merged = card.nightsMerged > 1 ? t('card.a11y.merged', { n: card.nightsMerged }) : '';
  return appendA11y(t('card.a11y', { night: nightName(card), motif, scene, merged, line }).trim(), extra);
}

type ShareKind = 'card' | 'story' | 'ire';
const NOTE_MS = 4000;

/**
 * 공유(빌드 1): 꿈 카드 4:5 / 9:16 PNG, 이레 아침에는 두루마리 이미지도. 그리는 동안 버튼에 '인화하는 중', 실패하면 한 줄 안내.
 * 기능 플래그(share)가 꺼졌거나 네이티브 모듈이 없는 옛 빌드면 아무것도 그리지 않는다(기능만 꺼짐).
 */
export function ShareBar({ input, ireState, dark = false }: { input: DreamCardInput; /** 있으면 이레 두루마리 버튼 */ ireState?: sim.State | null; dark?: boolean }) {
  const on = useFeature('share');
  const [busy, setBusy] = useState<ShareKind | null>(null);
  const [note, setNote] = useState('');
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 연타 잠금: state(busy)는 다시 그리기 전까지 옛 값이라 같은 틱의 두 번째 누름을 못 막는다(리뷰 M-4)
  const lock = useRef(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
      if (noteTimer.current) clearTimeout(noteTimer.current);
    },
    [],
  );
  if (!on || !shareSupported()) return null;
  const run = async (kind: ShareKind) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(kind);
    setNote('');
    let r: Awaited<ReturnType<typeof shareDreamCard>>;
    try {
      r = kind === 'ire' && ireState ? await shareIreScroll(ireState, input.look) : await shareDreamCard(input, kind === 'story' ? '9:16' : '4:5');
    } finally {
      lock.current = false;
    }
    if (!mounted.current) return;
    setBusy(null);
    const msg = r === 'failed' || r === 'unavailable' ? t('share.failed') : r === 'saved' ? t('share.saved') : '';
    setNote(msg);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    if (msg) noteTimer.current = setTimeout(() => setNote(''), NOTE_MS);
  };
  const pill = (kind: ShareKind, label: string, a11y: string) => (
    <Pressable
      key={kind}
      onPress={() => void run(kind)}
      style={[styles.btn, busy !== null && busy !== kind && styles.dim]}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ busy: busy === kind, disabled: busy !== null }}
      testID={`share-${kind}`}
      hitSlop={6}
    >
      <KText style={[styles.text, dark && { color: PALETTE.night.textSub }]} maxFontSizeMultiplier={1.5}>
        {busy === kind ? t('share.busy') : label}
      </KText>
    </Pressable>
  );
  return (
    <View style={styles.bar}>
      <View style={styles.row}>
        {pill('card', t('share.card'), t('share.card.a11y'))}
        {pill('story', t('share.story'), t('share.story.a11y'))}
      </View>
      {ireState && <View style={styles.row}>{pill('ire', t('share.ire'), t('share.ire.a11y'))}</View>}
      {note !== '' && (
        <KText style={[styles.note, dark && { color: PALETTE.night.textSub }]} accessibilityLiveRegion="polite" testID="share-note">
          {note}
        </KText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { marginTop: 10, alignItems: 'center', gap: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  btn: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center', borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, borderColor: PALETTE.day.wash },
  dim: { opacity: 0.45 },
  text: { fontFamily: SANS, fontSize: 13, color: PALETTE.day.textSub },
  note: { fontFamily: SANS, fontSize: 12, color: PALETTE.day.textSub, textAlign: 'center' },
});
