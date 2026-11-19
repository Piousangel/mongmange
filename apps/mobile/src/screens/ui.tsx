import { Platform, StyleSheet, Text, View } from 'react-native';

export const SERIF = Platform.select({
  web: '"AppleMyungjo", "Noto Serif KR", "Nanum Myeongjo", serif',
  default: undefined,
});

/** A4 시안의 세로 제목 + 인장 */
export function VerticalTitle({ text, color = '#2b2826', seal = true }: { text: string; color?: string; seal?: boolean }) {
  return (
    <View style={styles.vtitle} pointerEvents="none">
      {Array.from(text).map((ch, i) => (
        ch === ' ' ? (
          <View key={i} style={styles.vgap} />
        ) : (
          <Text key={i} style={[styles.vchar, { color }]}>
            {ch}
          </Text>
        )
      ))}
      {seal && (
        <View style={styles.seal}>
          <Text style={styles.sealText}>몽</Text>
        </View>
      )}
    </View>
  );
}

export function BottomHint({ label, color = '#6d655c' }: { label: string; color?: string }) {
  return (
    <View style={styles.bottom} pointerEvents="none">
      <View style={[styles.rule, { backgroundColor: color }]} />
      <Text style={[styles.hint, { color }]}>{label}</Text>
      <View style={[styles.brush, { borderColor: color }]}>
        <Text style={[styles.brushGlyph, { color }]}>筆</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  vgap: { height: 8 },
  vtitle: { position: 'absolute', top: 56, alignSelf: 'center', alignItems: 'center' },
  vchar: { fontFamily: SERIF, fontSize: 17, lineHeight: 23, letterSpacing: 1 },
  seal: {
    marginTop: 10,
    width: 22,
    height: 22,
    backgroundColor: '#c8452a',
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sealText: { color: '#f4e9dc', fontSize: 12, fontFamily: SERIF },
  bottom: { position: 'absolute', bottom: 40, left: 36, right: 36, alignItems: 'center' },
  rule: { height: StyleSheet.hairlineWidth, alignSelf: 'stretch', opacity: 0.6 },
  hint: { marginTop: 14, fontFamily: SERIF, fontSize: 15, letterSpacing: 4 },
  brush: {
    marginTop: 18,
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brushGlyph: { fontFamily: SERIF, fontSize: 20 },
});
