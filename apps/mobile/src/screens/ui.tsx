import { Fill, Group, Path, Shader, Skia } from '@shopify/react-native-skia';
import { CORE, PALETTE } from '@mong/core';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { paperFx } from '../render/shaders';

export const SERIF = Platform.select({
  web: '"AppleMyungjo", "Noto Serif KR", "Nanum Myeongjo", serif',
  default: undefined,
});
export const SANS = Platform.select({
  web: '"Pretendard", "Apple SD Gothic Neo", system-ui, sans-serif',
  default: undefined,
});

/** 화면 배치(아트 7-1·7-3): W = 화면 폭 18%, 몽망이 중심 세로 62%, 사물 3개는 아래 22% 띠 */
export function layout(width: number, height: number) {
  const wpx = width * 0.18;
  const groundY = height * 0.62 + (CORE.h / 2) * wpx;
  return {
    wpx,
    cx: width * 0.5,
    groundY,
    /** 핵 크기 s일 때 핵 중심 y(바닥은 고정) */
    oyFor: (s: number) => groundY - (CORE.h / 2) * s * wpx,
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
const inkPool = Skia.Path.MakeFromSVGString('M11 13 L25 13 Q27 13 27 15 L27 19 Q27 21 25 21 L11 21 Q9 21 9 19 L9 15 Q9 13 11 13 Z')!;
const jar = Skia.Path.MakeFromSVGString('M15 9 L21 9 M15.5 9 Q15 12 11 14 Q6 17 7 23 Q8.5 30 18 30 Q27.5 30 29 23 Q30 17 25 14 Q21 12 20.5 9')!;
const jarFill = Skia.Path.MakeFromSVGString('M9 22 Q10 28 18 28 Q26 28 27 22 Z')!;

export function ObjectIcons({ width, y, color, dim }: { width: number; y: number; color: string; dim?: SharedValue<number> }) {
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
        <Group key={i} transform={[{ translateX: xs[i]! - 18 }, { translateY: y - 18 }]}>
          <Path path={fill} color={PALETTE.day.wash} opacity={0.55} />
          <Path path={line} color={color} style="stroke" strokeWidth={1.5} strokeCap="round" strokeJoin="round" />
        </Group>
      ))}
    </Group>
  );
}

export function ObjectLabels({ width, y, color, labels = ['한 획', '먹 갈기', '물 한 방울'] }: { width: number; y: number; color: string; labels?: string[] }) {
  return (
    <>
      {labels.map((l, i) => (
        <Text key={l} style={[styles.label, { color, top: y + 24, left: width * (0.2 + 0.3 * i) - 50 }]} pointerEvents="none">
          {l}
        </Text>
      ))}
    </>
  );
}

/** 세로 명조 제목(8자 이하, 글자 단위 줄바꿈) + 주사 낙관(오른쪽 위, 화면에서 유일한 강조색) */
export function VerticalTitle({ text, color, opacity = 1, seal = true }: { text: string; color: string; opacity?: number; seal?: boolean }) {
  return (
    <>
      <View style={[styles.vtitle, { opacity }]} pointerEvents="none">
        {Array.from(text).map((ch, i) => (
          <Text key={i} style={[styles.vchar, { color }]}>
            {ch}
          </Text>
        ))}
      </View>
      {seal && (
        <View style={[styles.seal, { opacity }]} pointerEvents="none">
          <Text style={styles.sealText}>몽</Text>
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
  label: { position: 'absolute', width: 100, textAlign: 'center', fontFamily: SANS, fontSize: 13, letterSpacing: 1 },
  vtitle: { position: 'absolute', top: '16%', alignSelf: 'center', alignItems: 'center' },
  vchar: { fontFamily: SERIF, fontSize: 17, lineHeight: 22, letterSpacing: 1.4 },
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
  line: { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontFamily: SERIF, fontSize: 14, letterSpacing: 1 },
});
