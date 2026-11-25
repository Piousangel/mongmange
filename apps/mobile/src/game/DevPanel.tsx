// i18n-ignore-file: 개발 빌드 전용 메뉴(__DEV__에서만 그린다) — 사용자 문구가 아니다
// 개발 메뉴(개발 빌드에서만, __DEV__): 시간 가속 · 세이브 초기화 · 스파이크 화면 바로가기.
// 내부 시험판(eas internal-test, buildKind.ts devMenuMode = 'v3')에서는 v3Only — 새 컨셉 v3 정보 줄과 '처음부터 다시'·'밤 넘기기'·'밤 ×7'만.
import { sim, v3 } from '@mong/core';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HOUR_MS, devAdvance, devNextMorning, devReboot, devReset, devRestartV3, devSleepCycle, now, setMeta, useGame } from './store';
import { setFeature, useFeature } from '../features';
import { measureIreLoop } from '../share/ireVideoDev';

const SPIKES = [
  ['intro', 'screen=intro'],
  ['stroke', 'screen=stroke'],
  ['day7', 'screen=day&day=7'],
  ['night', 'screen=night'],
] as const;

export function DevPanel({ onSpike, onReset, v3Only = false }: { onSpike: (q: string) => void; onReset: () => void; v3Only?: boolean }) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { state, meta, restoredFrom, v3: block } = useGame();
  const ffV3 = useFeature('conceptV3');
  const full = state && block ? { sim: state, v3: block } : null;
  // 빌드 2 M1(타고남 + 먹 고르기): 기본 꺼짐, 여기서 켜서 확인(재시작하면 기본값)
  const ffTraits = useFeature('birthTraits');
  const ffInk = useFeature('inkChoice');
  const m1 = ffTraits && ffInk;
  // C10 기기 관문: 이레 영상 공유 켜기 + 웹 루프 인코딩 측정(docs/app/c7/device-gate.md)
  const ffIreVideo = useFeature('ireVideo');
  const [loopMsg, setLoopMsg] = useState<string | null>(null);
  const fmt = (t: number) => new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return (
    <View style={[styles.wrap, { bottom: insets.bottom + 8 }]} pointerEvents="box-none">
      <Pressable style={styles.pill} onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityLabel="개발 메뉴" testID="dev-toggle">
        <Text style={styles.pillText}>DEV</Text>
      </Pressable>
      {open && v3Only && <V3Panel onReset={onReset} close={() => setOpen(false)} />}
      {open && !v3Only && state && (
        <View style={styles.panel}>
          <Text style={styles.info}>
            {fmt(now())} (+{(meta.devOffsetMs / HOUR_MS).toFixed(1)}h) · {state.phase} · day {state.dayIndex} · 획 {state.strokesTotal} · 카드 {state.cards.length}
            {state.pendingCard ? ' · 현상 대기' : ''} · 복원 {restoredFrom}
            {state.phase === 'asleep' ? ` · 깸 ${fmt(sim.wakeableAt(state))}` : ''}
          </Text>
          {full && (
            <Text style={styles.info} testID="dev-v3-info">
              새 컨셉 v3 · {v3.nightOf(full)}번째 밤(잔 밤 {block!.life.slept}) · 이레 {v3.ireOf(full)} · 먹 {v3.inkCells(full)}칸 · 말 {block!.words.length} · 숟갈 {block!.meal.spoons}/작은 것 {block!.meal.treats}
              {v3.isComplete(full) ? ' · 완성(곁에 남음)' : ''}
            </Text>
          )}
          {loopMsg && <Text style={styles.info}>{loopMsg}</Text>}
          <View style={styles.row}>
            <Btn
              label={ffV3 ? '새 컨셉 끄기' : '새 컨셉 켜기'}
              id="dev-v3-toggle"
              onPress={() => {
                setFeature('conceptV3', !ffV3);
                onReset();
                devReboot();
              }}
            />
            {full && (
              <>
                <Btn
                  label="처음부터 다시"
                  id="dev-v3-restart"
                  onPress={() => {
                    onReset();
                    devRestartV3();
                    setOpen(false);
                  }}
                />
                <Btn label="밤 넘기기" id="dev-v3-night" onPress={devSleepCycle} />
                <Btn
                  label="밤 ×7"
                  id="dev-v3-night7"
                  onPress={() => {
                    for (let i = 0; i < 7; i++) devSleepCycle();
                  }}
                />
              </>
            )}
          </View>
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
            <Btn label={ffIreVideo ? '이레 영상 끄기' : '이레 영상 켜기'} id="dev-ire-video" onPress={() => setFeature('ireVideo', !ffIreVideo)} />
            <Btn
              label="루프 인코딩 측정"
              id="dev-ire-loop"
              onPress={() => {
                setLoopMsg('…');
                void measureIreLoop(state).then(setLoopMsg);
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

/** 내부 시험판 메뉴: 새 컨셉 v3 정보 + 처음부터 다시·밤 넘기기·밤 ×7(개발 빌드 메뉴와 같은 단추·id) */
function V3Panel({ onReset, close }: { onReset: () => void; close: () => void }) {
  const { state, v3: block } = useGame();
  const full = state && block ? { sim: state, v3: block } : null;
  if (!full) return null;
  return (
    <View style={styles.panel}>
      <Text style={styles.info} testID="dev-v3-info">
        새 컨셉 v3 · {v3.nightOf(full)}번째 밤(잔 밤 {block!.life.slept}) · 이레 {v3.ireOf(full)} · 먹 {v3.inkCells(full)}칸 · 말 {block!.words.length}
        {v3.isComplete(full) ? ' · 완성(곁에 남음)' : ''}
      </Text>
      <View style={styles.row}>
        <Btn
          label="처음부터 다시"
          id="dev-v3-restart"
          onPress={() => {
            onReset();
            devRestartV3();
            close();
          }}
        />
        <Btn label="밤 넘기기" id="dev-v3-night" onPress={devSleepCycle} />
        <Btn
          label="밤 ×7"
          id="dev-v3-night7"
          onPress={() => {
            for (let i = 0; i < 7; i++) devSleepCycle();
          }}
        />
      </View>
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
