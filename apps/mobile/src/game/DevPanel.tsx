// i18n-ignore-file: 개발 빌드 전용 메뉴(__DEV__에서만 그린다) — 사용자 문구가 아니다
// 개발 메뉴(개발 빌드에서만, __DEV__): 시간 가속 · 세이브 초기화 · 스파이크 화면 바로가기.
import { sim } from '@mong/core';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HOUR_MS, devAdvance, devNextMorning, devReset, now, setMeta, useGame } from './store';
import { setFeature, useFeature } from '../features';

const SPIKES = [
  ['intro', 'screen=intro'],
  ['stroke', 'screen=stroke'],
  ['day7', 'screen=day&day=7'],
  ['night', 'screen=night'],
] as const;

export function DevPanel({ onSpike, onReset }: { onSpike: (q: string) => void; onReset: () => void }) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { state, meta, restoredFrom } = useGame();
  // 빌드 2 M1(타고남 + 먹 고르기): 기본 꺼짐, 여기서 켜서 확인(재시작하면 기본값)
  const ffTraits = useFeature('birthTraits');
  const ffInk = useFeature('inkChoice');
  const m1 = ffTraits && ffInk;
  const fmt = (t: number) => new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return (
    <View style={[styles.wrap, { bottom: insets.bottom + 8 }]} pointerEvents="box-none">
      <Pressable style={styles.pill} onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityLabel="개발 메뉴" testID="dev-toggle">
        <Text style={styles.pillText}>DEV</Text>
      </Pressable>
      {open && state && (
        <View style={styles.panel}>
          <Text style={styles.info}>
            {fmt(now())} (+{(meta.devOffsetMs / HOUR_MS).toFixed(1)}h) · {state.phase} · day {state.dayIndex} · 획 {state.strokesTotal} · 카드 {state.cards.length}
            {state.pendingCard ? ' · 현상 대기' : ''} · 복원 {restoredFrom}
            {state.phase === 'asleep' ? ` · 깸 ${fmt(sim.wakeableAt(state))}` : ''}
          </Text>
          <View style={styles.row}>
            <Btn label="+1h" id="dev-1h" onPress={() => devAdvance(HOUR_MS)} />
            <Btn label="+8h" id="dev-8h" onPress={() => devAdvance(8 * HOUR_MS)} />
            <Btn label="다음 아침" id="dev-morning" onPress={devNextMorning} />
            <Btn
              label={m1 ? 'M1 끄기' : 'M1 켜기'}
              id="dev-m1"
              onPress={() => {
                setFeature('birthTraits', !m1);
                setFeature('inkChoice', !m1);
              }}
            />
            <Btn label={meta.devCaptions ? '자막 끄기' : '소리 자막'} id="dev-captions" onPress={() => setMeta({ devCaptions: !meta.devCaptions })} />
            <Btn
              label="세이브 초기화"
              id="dev-reset"
              onPress={() => {
                onReset();
                devReset();
                setOpen(false);
              }}
            />
          </View>
          <View style={styles.row}>
            {SPIKES.map(([name, q]) => (
              <Btn
                key={name}
                label={`스파이크 ${name}`}
                id={`dev-spike-${name}`}
                onPress={() => {
                  if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.search = `?${q}`;
                  else onSpike(q);
                }}
              />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

function Btn({ label, onPress, id }: { label: string; onPress: () => void; id: string }) {
  return (
    <Pressable style={styles.btn} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} testID={id}>
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 8, bottom: 8, right: 8, alignItems: 'flex-start' }, // 화면 아래 safe-area는 App에서 감싼다
  pill: { minHeight: 32, minWidth: 44, paddingHorizontal: 8, justifyContent: 'center', borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.35)' },
  pillText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  panel: { marginTop: 6, padding: 8, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.75)', gap: 6, alignSelf: 'stretch' },
  info: { color: '#ddd', fontSize: 11, lineHeight: 15 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  btn: { minHeight: 36, paddingHorizontal: 10, justifyContent: 'center', borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.15)' },
  btnText: { color: '#fff', fontSize: 12 },
});
