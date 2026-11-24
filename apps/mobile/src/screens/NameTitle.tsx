// M2 세로 이름 = 부르기 단추(C-integrated 2-2 '세로 제목 8자 상한', 아트 6절 v1.3, 시스템 1.1 '세로 이름 글자 탭 = 부르기').
// - 이름이 있으면 세로 제목 = 이름만(한글 6자 이하), 날 세기는 그 옆 작은 두 번째 세로줄(text-sub). 이름이 없으면 지금처럼 '몽망이·이레째'.
// - 영어·라틴 이름·글자 150% 이상은 가로 한 줄(세로쓰기는 한글 전용).
// - 스크린리더: "이름 부르기" 단추 하나. 최종 배치·두 줄 간격은 아트 판정 항목(ART-CHECK).
import { PALETTE } from '@mong/core';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { getLocale, t } from '../i18n';
import { KText, SERIF, track, useFontScale } from '../ui/type';

/** 세로로 세울 수 있나: 한국어 화면, 글자 150% 미만, 한글이 들고 라틴이 없는 8자 이하 */
export function verticalName(text: string, fs: number, loc = getLocale()): boolean {
  return loc === 'ko' && fs < 1.5 && [...text].length <= 8 && /[\uAC00-\uD7A3]/.test(text) && !/[A-Za-z]/.test(text);
}

export function NameTitle({
  name,
  day,
  color,
  top,
  onCall,
  onLayoutCenter,
}: {
  /** 지은 이름. null = 아직(몽망이·날) */
  name: string | null;
  /** 날 이름(dayName) */
  day: string;
  color: string;
  top: number;
  onCall: () => void;
  /** 몽망이가 바라볼 자리(화면 좌표, 이름 글자 가운데) */
  onLayoutCenter?: (x: number, y: number) => void;
}) {
  const fs = useFontScale();
  const main = name ?? t('day.title', { day });
  const callName = name ?? t('name.default');
  const vertical = verticalName(main, fs);
  const onLayout = (e: LayoutChangeEvent) => {
    const { x, y, width, height } = e.nativeEvent.layout;
    onLayoutCenter?.(x + width / 2, y + height / 2);
  };
  const a11y = { accessibilityRole: 'button' as const, accessibilityLabel: t('name.call.a11y', { name: callName }), accessibilityHint: t('name.call.hint') };
  if (!vertical) {
    return (
      <Pressable style={[styles.hWrap, { top }]} onPress={onCall} onLayout={onLayout} hitSlop={10} testID="name-title" {...a11y}>
        <KText style={[styles.h, { color }]} serif="title" numberOfLines={2}>
          {name ? t('name.title.h', { name, day }) : main}
        </KText>
      </Pressable>
    );
  }
  return (
    <Pressable style={[styles.vWrap, { top }]} onPress={onCall} onLayout={onLayout} hitSlop={12} testID="name-title" {...a11y}>
      <View style={styles.col}>
        {Array.from(main).map((ch, i) => (
          <Text key={i} style={[styles.vchar, { color }]} maxFontSizeMultiplier={1.4}>
            {ch}
          </Text>
        ))}
      </View>
      {name !== null && (
        <View style={[styles.col, styles.sub]}>
          {Array.from(day).map((ch, i) => (
            <Text key={i} style={[styles.subChar, { color: PALETTE.day.textSub }]} maxFontSizeMultiplier={1.4}>
              {ch}
            </Text>
          ))}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  vWrap: { position: 'absolute', alignSelf: 'center', flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 6, minWidth: 44, minHeight: 44, paddingHorizontal: 6 },
  col: { alignItems: 'center' },
  sub: { marginTop: 4 },
  vchar: { fontFamily: SERIF, fontSize: 17, lineHeight: 22 },
  subChar: { fontFamily: SERIF, fontSize: 11, lineHeight: 15 },
  hWrap: { position: 'absolute', left: 24, right: 24, minHeight: 44, justifyContent: 'center' },
  h: { textAlign: 'center', fontFamily: SERIF, fontSize: 17, letterSpacing: track.serif(17) },
});
