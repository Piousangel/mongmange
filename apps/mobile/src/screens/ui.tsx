import { Fill, Group, Path, Shader, Skia, type SkPath } from '@shopify/react-native-skia';
import { CORE, PALETTE } from '@mong/core';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { paperFx } from '../render/shaders';

import { KText, SANS, SERIF, serifFamily, track, useFontScale } from '../ui/type';
import { SEAL_GLYPH, getLocale, t } from '../i18n';
export { SANS, SERIF } from '../ui/type';

/** 화면 배치(아트 7-1·7-3): W = 화면 폭 18%, 몽망이 중심 세로 62%, 사물 3개는 아래 22% 띠 */
export function layout(width: number, height: number) {
  const wpx = width * 0.18;
  const groundY = height * 0.62 + (CORE.h / 2) * wpx;
  return {
    wpx,
    cx: width * 0.5,
    groundY,
    /** 핵 크기 s일 때 핵 중심 y(바닥은 고정) */
    // UI 스레드(useDerivedValue 등)에서도 부르므로 worklet이어야 한다(11-20 S25: "Tried to synchronously call a Remote Function oyFor")
    // M1: h = 그 개체의 몸 높이(체형). 바닥(groundY)은 체형과 상관없이 같은 자리에 앉는다
    oyFor: (s: number, hIn?: number) => {
      'worklet';
      const h = hIn ?? CORE.h;
      return groundY - (h / 2) * s * wpx;
    },
    objectsY: height * 0.84,
  };
}

export function Paper({ width, height, light }: { width: number; height: number; light?: SharedValue<number> }) {
  const u = useDerivedValue(() => ({
    res: [width, height],
    base: [0xef / 255, 0xe8 / 255, 0xda / 255],
    light: light?.value ?? 1,
  }));
  return (
    <Fill>
      <Shader source={paperFx} uniforms={u} />
    </Fill>
  );
}

// 사물 선 아이콘(선 1.5px + 담묵 면 하나, 아트 7-1). 36×36 상자
const brush = Skia.Path.MakeFromSVGString('M5 29 L27 9 M27 9 L31 5.5 L29.5 10.5 Z M3 30 Q8 27 13 30')!;
const brushFill = Skia.Path.MakeFromSVGString('M27 9 L31 5.5 L29.5 10.5 Z')!;
const ink = Skia.Path.MakeFromSVGString('M5 12 Q5 8 9 8 L27 8 Q31 8 31 12 L31 25 Q31 29 27 29 L9 29 Q5 29 5 25 Z')!;
export const inkPool = Skia.Path.MakeFromSVGString('M11 13 L25 13 Q27 13 27 15 L27 19 Q27 21 25 21 L11 21 Q9 21 9 19 L9 15 Q9 13 11 13 Z')!;
const jar = Skia.Path.MakeFromSVGString('M15 9 L21 9 M15.5 9 Q15 12 11 14 Q6 17 7 23 Q8.5 30 18 30 Q27.5 30 29 23 Q30 17 25 14 Q21 12 20.5 9')!;
const jarFill = Skia.Path.MakeFromSVGString('M9 22 Q10 28 18 28 Q26 28 27 22 Z')!;

/** 사물 선 아이콘 3개. alpha = 아이콘별 불투명도(등장 순서·잠김), 없으면 모두 1 */
/** order[i] = 사물 i(0 붓·1 벼루·2 연적)가 놓이는 칸(0 왼쪽·1 가운데·2 오른쪽). 없으면 붓·벼루·연적 순 */
export function ObjectIcons({ width, y, color, dim, alpha, order = [0, 1, 2] }: { width: number; y: number; color: string; dim?: SharedValue<number>; alpha?: SharedValue<number[]>; order?: readonly number[] }) {
  const xs = [width * 0.2, width * 0.5, width * 0.8];
  const icons = [
    [brush, brushFill],
    [ink, inkPool],
    [jar, jarFill],
  ] as const;
  const op = useDerivedValue(() => 1 - (dim?.value ?? 0) * 0.6);
  return (
    <Group opacity={op}>
      {icons.map(([line, fill], i) => (
        <ObjectIcon key={i} i={i} x={xs[order[i] ?? i]!} y={y} line={line} fill={fill} color={color} alpha={alpha} />
      ))}
    </Group>
  );
}

function ObjectIcon({ i, x, y, line, fill, color, alpha }: { i: number; x: number; y: number; line: SkPath; fill: SkPath; color: string; alpha?: SharedValue<number[]> }) {
  const a = useDerivedValue(() => alpha?.value[i] ?? 1);
  return (
    <Group transform={[{ translateX: x - 18 }, { translateY: y - 18 }]} opacity={a}>
      <Path path={fill} color={PALETTE.day.wash} opacity={0.55} />
      <Path path={line} color={color} style="stroke" strokeWidth={1.5} strokeCap="round" strokeJoin="round" />
    </Group>
  );
}

export function ObjectLabels({ width, y, color, labels, order = [0, 1, 2] }: { width: number; y: number; color: string; labels?: string[]; order?: readonly number[] }) {
  const ls = labels ?? [t('obj.brush.label'), t('obj.inkstone.label'), t('obj.dropper.label')];
  return (
    <>
      {ls.map((l, i) => (
        <Text key={l} style={[styles.label, { color, top: y + 24, left: width * (0.2 + 0.3 * (order[i] ?? i)) - 50 }]} pointerEvents="none">
          {l}
        </Text>
      ))}
    </>
  );
}

/** 세로 명조 제목(8자 이하, 글자 단위 줄바꿈) + 주사 낙관(오른쪽 위, 화면에서 유일한 강조색). 영어는 늘 가로(아트 6절) */
/** onBottom = 제목 아래 끝(화면 y). 안내 문장을 제목과 겹치지 않게 놓는 데 쓴다 */
export function VerticalTitle({ text, color, opacity = 1, seal = true, top, onBottom }: { text: string; color: string; opacity?: number; seal?: boolean; top?: number; onBottom?: (y: number) => void }) {
  const fs = useFontScale();
  const onLayout = (e: LayoutChangeEvent) => onBottom?.(e.nativeEvent.layout.y + e.nativeEvent.layout.height);
  // 글자 150% 이상이면 가로쓰기(아트 6절, D-08). 세로쓰기는 한글 전용 — 라틴 글자를 세우면 읽히지 않는다
  if (fs >= 1.5 || getLocale() !== 'ko') {
    return (
      <KText style={[styles.line, { top: top ?? '16%', color, opacity, fontSize: 17, letterSpacing: track.serif(17) }]} pointerEvents="none" accessibilityRole="header" serif="title" onLayout={onLayout} testID="v-title">
        {text}
      </KText>
    );
  }
  return (
    <>
      <View style={[styles.vtitle, { opacity }, top !== undefined && { top }]} pointerEvents="none" accessible accessibilityRole="header" accessibilityLabel={text} onLayout={onLayout} testID="v-title">
        {Array.from(text).map((ch, i) => (
          <Text key={i} style={[styles.vchar, { color }]} maxFontSizeMultiplier={1.4}>
            {ch}
          </Text>
        ))}
      </View>
      {seal && (
        <View style={[styles.seal, { opacity }]} pointerEvents="none">
          <Text style={[styles.sealText, { fontFamily: serifFamily('title', 'ko') }]}>{SEAL_GLYPH}</Text>
        </View>
      )}
    </>
  );
}

/** 소리·햅틱 타이밍 자막(BRIEF 6절: 화면 하단 작은 글자) */
export function Caption({ text, color }: { text: string; color: string }) {
  if (!text) return null;
  return (
    <Text style={[styles.caption, { color }]} pointerEvents="none">
      {text}
    </Text>
  );
}

export const styles = StyleSheet.create({
  label: { position: 'absolute', width: 100, textAlign: 'center', fontFamily: SANS, fontSize: 13, letterSpacing: track.sans },
  vtitle: { position: 'absolute', top: '16%', alignSelf: 'center', alignItems: 'center' },
  vchar: { fontFamily: SERIF, fontSize: 17, lineHeight: 22 },
  seal: {
    position: 'absolute',
    top: 54,
    right: 26,
    width: 24,
    height: 24,
    backgroundColor: PALETTE.day.accent,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sealText: { color: '#F4E9DC', fontSize: 13, fontFamily: SERIF },
  caption: { position: 'absolute', bottom: 10, left: 0, right: 0, textAlign: 'center', fontFamily: SANS, fontSize: 10, opacity: 0.75 },
  line: { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontFamily: SERIF, fontSize: 15, letterSpacing: track.serif(15), paddingHorizontal: 24 },
});
