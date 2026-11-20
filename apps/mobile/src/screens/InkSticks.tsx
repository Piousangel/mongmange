// 먹 고르기(M1, 아트 7-1·11절 v1.3, C-integrated 2-1): 첫 획 뒤 벼루 옆에 먹 네 자루가 놓이고, 하나를 집으면 그 먹이다.
// 화면 글 없음(사물 UI 원칙) — 먹 이름은 길게 누를 때 한 줄로, 스크린리더는 라벨로, '목록으로 보기'는 버튼 글로.
// 첫날(첫 밤 전)에만 저절로 놓이고, 그 뒤에는 공방 노트 '먹 바꾸기'로만 연다 — 새 획에만(C-integrated 2-1·D-05, 팀 결정 H2).
// 고른 뒤에는 지금 먹 한 자루만 벼루 곁에 남는다. 스크린리더는 라디오(지금 먹 = 선택됨).
import { INK_TOKENS, PALETTE, sim } from '@mong/core';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { t } from '../i18n';
import { PARAMS, clamp01, clock, easeOut } from '../render/clock';
import { KText } from '../ui/type';
import { SANS } from './ui';

const RM = PARAMS.rm;
/** 자루 하나의 그림(pt). 사물 그림 28~36pt 안(아트 7-1) */
const STICK_W = 11;
const STICK_H = 34;
/** 터치 영역 44×44 이상(D-08) */
const HIT_W = 44;
const HIT_H = 52;

export const INK_ORDER = sim.INK_IDS;

/** 먹 한 자루: 선 1.5px + 먹 면 하나(그 먹이 획에 스미는 색 = 낮 stroke-ink 토큰). 머리 쪽은 간 자국(비스듬한 끝) */
function Stick({ ink, lean = 0 }: { ink: sim.InkId; lean?: number }) {
  return (
    <View style={[styles.stick, { backgroundColor: INK_TOKENS[ink].day.strokeInk, transform: [{ rotate: `${lean}deg` }] }]}>
      <View style={styles.ground} />
    </View>
  );
}

export function InkSticks({
  cx,
  top,
  shownAt,
  current,
  onChoose,
  onName,
}: {
  /** 벼루 중심 x(px) */
  cx: number;
  /** 자루 줄의 위쪽 y(px) */
  top: number;
  /** 놓이기 시작한 시계(ms) — 하나씩 차례로 놓인다 */
  shownAt: number;
  /** 지금 새 획에 쓰이는 먹(씨앗 먹 포함). 없으면 null */
  current: sim.InkId | null;
  onChoose: (ink: sim.InkId) => void;
  onName: (ink: sim.InkId) => void;
}) {
  const left = cx - (HIT_W * INK_ORDER.length) / 2;
  return (
    <View
      style={[styles.row, { left, top }]}
      accessibilityRole="radiogroup"
      accessibilityLabel={t('ink.sticks.a11y')}
      testID="ink-sticks"
    >
      {INK_ORDER.map((ink, i) => (
        <StickButton key={ink} ink={ink} i={i} shownAt={shownAt} checked={ink === current} onChoose={onChoose} onName={onName} />
      ))}
    </View>
  );
}

function StickButton({ ink, i, shownAt, checked, onChoose, onName }: { ink: sim.InkId; i: number; shownAt: number; checked: boolean; onChoose: (ink: sim.InkId) => void; onName: (ink: sim.InkId) => void }) {
  const name = t('ink.name', { ink });
  // 하나씩 놓인다(120ms 간격, 300ms), 모션 줄이기면 바로
  const st = useAnimatedStyle(() => {
    const k = RM ? 1 : easeOut(clamp01((clock.value - shownAt - i * 120) / 300));
    return { opacity: k, transform: [{ translateY: (1 - k) * 6 }] };
  });
  return (
    <Animated.View style={st}>
      <Pressable
        testID={`ink-${ink}`}
        style={styles.hit}
        onPress={() => onChoose(ink)}
        onLongPress={() => onName(ink)}
        delayLongPress={450}
        accessibilityRole="radio"
        accessibilityState={{ checked }}
        // iOS는 radiogroup을 읽지 않아 라벨에 '네 자루 중 몇째'를 넣는다(리뷰 L1)
        accessibilityLabel={t('ink.stick.a11y', { name, hue: t('ink.hue', { ink }), n: i + 1 })}
        accessibilityHint={t('ink.stick.hint')}
      >
        <Stick ink={ink} lean={(i - 1.5) * 4} />
      </Pressable>
    </Animated.View>
  );
}

/** 고른 뒤: 벼루 곁에 고른 먹 한 자루(장식, 누를 수 없음) */
export function KeptStick({ ink, x, y }: { ink: sim.InkId; x: number; y: number }) {
  return (
    <View
      style={[styles.kept, { left: x - STICK_W / 2, top: y }]}
      accessible
      accessibilityLabel={t('ink.kept.a11y', { name: t('ink.name', { ink }) })}
      testID="ink-kept"
      pointerEvents="none"
    >
      <Stick ink={ink} lean={14} />
    </View>
  );
}

/** '목록으로 보기'(D-08): 같은 네 자루를 평범한 버튼으로 */
export function InkList({ current, onChoose }: { current: sim.InkId | null; onChoose: (ink: sim.InkId) => void }) {
  return (
    <>
      {INK_ORDER.map((ink, i) => {
        const name = t('ink.name', { ink });
        return (
          <Pressable
            key={ink}
            testID={`ink-list-${ink}`}
            style={styles.listBtn}
            onPress={() => onChoose(ink)}
            accessibilityRole="radio"
            accessibilityState={{ checked: ink === current }}
            accessibilityLabel={t('ink.stick.a11y', { name, hue: t('ink.hue', { ink }), n: i + 1 })}
          >
            <View style={styles.listRow}>
              <Stick ink={ink} />
              <KText style={styles.listText}>{t('ink.list', { name })}</KText>
            </View>
          </Pressable>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  row: { position: 'absolute', flexDirection: 'row' },
  hit: { width: HIT_W, height: HIT_H, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 4 },
  stick: {
    width: STICK_W,
    height: STICK_H,
    borderRadius: 2.5,
    borderWidth: 1.5,
    borderColor: PALETTE.day.body,
    overflow: 'hidden',
  },
  // 간 쪽(아래 끝): 벼루에 갈린 자국 = 조금 더 짙은 띠
  ground: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 5, backgroundColor: PALETTE.day.body, opacity: 0.35 },
  kept: { position: 'absolute', width: STICK_W, height: STICK_H },
  listBtn: { minHeight: 52, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 10, backgroundColor: 'rgba(43,42,40,0.07)' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  listText: { fontFamily: SANS, fontSize: 15, color: PALETTE.day.text },
});
