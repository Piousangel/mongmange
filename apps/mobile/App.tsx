import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { DayScreen } from './src/screens/DayScreen';
import { NightScreen } from './src/screens/NightScreen';
import { StrokeScreen } from './src/screens/StrokeScreen';

type ScreenId = 'a' | 'b' | 'c';

// 웹 캡처용: ?screen=a|b|c&day=0|7&clean=1
function initial(): { screen: ScreenId; day: 0 | 7; clean: boolean } {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return { screen: 'a', day: 0, clean: false };
  const q = new URLSearchParams(window.location.search);
  const s = q.get('screen');
  return {
    screen: s === 'b' || s === 'c' ? s : 'a',
    day: q.get('day') === '7' ? 7 : 0,
    clean: q.get('clean') === '1',
  };
}

export default function App() {
  const [init] = useState(initial);
  const [screen, setScreen] = useState<ScreenId>(init.screen);
  const [day, setDay] = useState<0 | 7>(init.day);
  return (
    <View style={styles.root}>
      {screen === 'a' && <DayScreen day={day} />}
      {screen === 'b' && <StrokeScreen debug={!init.clean} />}
      {screen === 'c' && <NightScreen />}
      {!init.clean && (
        <View style={styles.bar}>
          {(['a', 'b', 'c'] as const).map((id) => (
            <Pressable key={id} onPress={() => setScreen(id)} style={[styles.btn, screen === id && styles.on]}>
              <Text style={styles.btnText}>{{ a: '낮', b: '획', c: '밤' }[id]}</Text>
            </Pressable>
          ))}
          {screen === 'a' && (
            <Pressable onPress={() => setDay(day === 0 ? 7 : 0)} style={styles.btn}>
              <Text style={styles.btnText}>{day}일차</Text>
            </Pressable>
          )}
        </View>
      )}
      <StatusBar style={screen === 'c' ? 'light' : 'dark'} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', gap: 4 },
  btn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.25)' },
  on: { backgroundColor: 'rgba(0,0,0,0.55)' },
  btnText: { color: '#fff', fontSize: 11 },
});
