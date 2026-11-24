// M2 인장(C-integrated 2-2): 주사 정사각 + 가운데 '몽'(SEAL_GLYPH) + 테두리 16칸 이 빠짐(core sealOutlineOf, 인장 씨앗에서만 — 이름과 무관).
// 주사는 한 화면 한 곳(아트 4절): 이 인장을 그리는 화면은 다른 주사(공방 노트 입구 낙관)를 가린다 — 이름 짓기 창은 불투명 한지로 덮고, 이름표는 노트 안이다.
// 작게 그리면(한 변 < SEAL.lodMinPt) 이 빠짐 없이 사각(core LOD).
import { Canvas, Path } from '@shopify/react-native-skia';
import { PALETTE, sealOutlineOf } from '@mong/core';
import { useMemo } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { SEAL_GLYPH } from '../i18n';
import { serifFamily } from '../ui/type';
import { sealPath } from './sealPath';

export function SealMark({ sealSeed, size, style, testID }: { sealSeed: number; size: number; style?: ViewStyle; testID?: string }) {
  const path = useMemo(() => sealPath(sealOutlineOf(sealSeed, size), size), [sealSeed, size]);
  return (
    <View style={[{ width: size, height: size }, style]} pointerEvents="none" testID={testID} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Canvas style={StyleSheet.absoluteFill}>
        <Path path={path} color={PALETTE.day.accent} />
      </Canvas>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Text style={{ color: PALETTE.day.bg, fontSize: size * 0.54, lineHeight: size * 0.7, fontFamily: serifFamily('title', 'ko') }} maxFontSizeMultiplier={1}>
          {SEAL_GLYPH}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ center: { alignItems: 'center', justifyContent: 'center' } });
