// 인화 카드의 글(카드 위 라벨·스크린리더 설명)과 공유 자리. 문장은 앱이 언어별로 만든다(시스템 2.6).
import { PALETTE, type sim } from '@mong/core';
import { Pressable, StyleSheet } from 'react-native';
import type { DreamCardLabels } from '../render/dreamCard/DreamCard';
import { MOTIF_NAMES, MOTIF_SCENES, dayName } from '../game/text';
import { KText } from '../ui/type';
import { SANS } from './ui';

/** card.night = 현상한 아침의 dayIndex → 그 전날 밤의 꿈(리뷰 U12-④) */
export function nightName(card: sim.DreamCard): string {
  return card.night <= 1 ? '첫 밤' : `${dayName(card.night - 1)} 밤`;
}

export function cardLabels(card: sim.DreamCard, line: string): DreamCardLabels {
  const motif = MOTIF_NAMES[card.motifId] ?? '꿈';
  return { name: `몽망이·${dayName(Math.max(0, card.night - 1))}`, line, sub: `${motif} · ${nightName(card)}의 꿈` };
}

/** 스크린리더 설명: 무엇이 그려졌나(모티프) + 아침 문장 */
export function cardA11y(card: sim.DreamCard, line: string): string {
  const motif = MOTIF_NAMES[card.motifId] ?? '꿈';
  const scene = MOTIF_SCENES[card.motifId] ?? '먹물결 고리 가운데 몽망이가 눈을 감고 있어요';
  const merged = card.nightsMerged > 1 ? ` 밤 ${card.nightsMerged}개를 한 장에 모았어요.` : '';
  return `꿈 인화 카드, ${nightName(card)}, ${motif}. ${scene}.${merged} ${line}`.trim();
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
      accessibilityLabel="카드 보내기, 다음 업데이트에서 열려요"
      accessibilityState={{ disabled: true }}
      testID="card-share"
      hitSlop={6}
    >
      <KText style={[styles.text, dark && { color: PALETTE.night.textSub }]}>보내기 · 곧 열려요</KText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { marginTop: 10, minHeight: 44, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center', borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, borderColor: PALETTE.day.wash, opacity: 0.7 },
  text: { fontFamily: SANS, fontSize: 13, color: PALETTE.day.textSub },
});
