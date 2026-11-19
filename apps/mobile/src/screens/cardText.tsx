// 인화 카드의 글(카드 위 라벨·스크린리더 설명)과 공유 자리. 문장은 앱이 언어별로 만든다(시스템 2.6).
import { PALETTE, type sim } from '@mong/core';
import { Pressable, StyleSheet } from 'react-native';
import type { DreamCardLabels } from '../render/dreamCard/DreamCard';
import { motifName, motifScene } from '../game/text';
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

/** 스크린리더 설명: 무엇이 그려졌나(모티프) + 아침 문장 */
export function cardA11y(card: sim.DreamCard, line: string): string {
  const motif = motifName(card.motifId) ?? t('motif.fallback');
  const scene = motifScene(card.motifId);
  const merged = card.nightsMerged > 1 ? t('card.a11y.merged', { n: card.nightsMerged }) : '';
  return t('card.a11y', { night: nightName(card), motif, scene, merged, line }).trim();
}

/**
 * 공유 자리(v1.2): 버튼 자리만. TODO(다음 EAS 빌드): expo-file-system + expo-sharing 설치 뒤
 * renderDreamCardImage(input, { aspect: '9:16' | '4:5', width: 1080 })의 base64를 파일로 써서 공유 시트를 연다.
 * 지금 빌드(3번째 EAS)에는 네이티브 모듈을 넣지 않는다 — 누르면 '다음 업데이트' 안내만.
 */
export function SharePlaceholder({ onPress, dark = false }: { onPress?: () => void; dark?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.btn}
      accessibilityRole="button"
      accessibilityLabel={t('card.share.a11y')}
      accessibilityState={{ disabled: true }}
      testID="card-share"
      hitSlop={6}
    >
      <KText style={[styles.text, dark && { color: PALETTE.night.textSub }]}>{t('card.share')}</KText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { marginTop: 10, minHeight: 44, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center', borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, borderColor: PALETTE.day.wash, opacity: 0.7 },
  text: { fontFamily: SANS, fontSize: 13, color: PALETTE.day.textSub },
});
