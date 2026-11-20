// i18n-ignore-file: 스파이크 화면(?screen=stroke, 앱 흐름 밖) 개발 막대와 연구 표식. 사용자에게 보이지 않는다(StrokeScreen이 !clean && !game, ?study= 일 때만 그림).
// 사용자 화면 파일의 예외 표시 수 상한(i18n-static 시험)을 늘리지 않으려고 개발 전용 글을 이 파일로 모았다(A6 리뷰 L4).
import type { AttachLevel } from '@mong/core';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SANS } from './ui';

export function StrokeDevBar({ level, onLevel, onExport, onClear }: { level: AttachLevel; onLevel: (l: AttachLevel) => void; onExport: () => void; onClear: () => void }) {
  return (
    <View style={styles.dev}>
      {([1, 2, 3] as const).map((l) => (
        <Pressable key={l} onPress={() => onLevel(l)} style={[styles.btn, level === l && styles.on]}>
          <Text style={styles.btnText}>L{l}</Text>
        </Pressable>
      ))}
      <Pressable onPress={onExport} style={styles.btn}>
        <Text style={styles.btnText}>raw JSON</Text>
      </Pressable>
      <Pressable onPress={onClear} style={styles.btn}>
        <Text style={styles.btnText}>비우기</Text>
      </Pressable>
    </View>
  );
}

/** ?study= 연구 캡처용 단계 표식 */
export function StudyMark({ level }: { level: AttachLevel }) {
  return (
    <Text style={styles.study} pointerEvents="none">
      L{level}
    </Text>
  );
}

const styles = StyleSheet.create({
  dev: { position: 'absolute', top: 8, left: 8, flexDirection: 'row', gap: 4 },
  btn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.25)' },
  on: { backgroundColor: 'rgba(0,0,0,0.6)' },
  btnText: { color: '#fff', fontSize: 11 },
  study: { position: 'absolute', top: 14, right: 16, fontSize: 11, color: '#8a8076', fontFamily: SANS, letterSpacing: 1 },
});
