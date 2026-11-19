import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppFonts } from './src/ui/type';
import { GameApp } from './src/game/GameApp';
import { PARAMS, readParamsFrom, useDriveClock } from './src/render/clock';
import { HomeScreen } from './src/screens/HomeScreen';
import { IntroScreen } from './src/screens/IntroScreen';
import { StrokeScreen } from './src/screens/StrokeScreen';
import { DreamCardPreview } from './src/render/dreamCard/DreamCardPreview';

// 기본 = 앱 흐름(GameApp). 스파이크 캡처용 URL은 그대로: ?screen=day|night|intro|stroke &day=0|7 &attach=1|2|3 &body=A|B &rm=1 &vclock=1 &clean=1
// 네이티브 개발 빌드에서는 개발 메뉴의 '스파이크' 버튼이 같은 화면을 연다.
export default function App() {
  return (
    <SafeAreaProvider>
      <Root />
    </SafeAreaProvider>
  );
}

function Root() {
  useDriveClock();
  const fontsReady = useAppFonts();
  const insets = useSafeAreaInsets();
  const [spike, setSpike] = useState<string | null>(null);
  const screen = spike ? readParamsFrom(spike).screen : Platform.OS === 'web' ? PARAMS.screen : 'app';
  const p = spike ? readParamsFrom(spike) : PARAMS;
  if (!fontsReady) return <GestureHandlerRootView style={[styles.root, { backgroundColor: '#EFE8DA' }]} />;
  return (
    <GestureHandlerRootView style={styles.root}>
      {screen === 'app' && <GameApp onSpike={setSpike} />}
      {screen === 'intro' && <IntroScreen />}
      {screen === 'card' && <DreamCardPreview />}
      {screen === 'stroke' && <StrokeScreen initial={p.day} />}
      {(screen === 'day' || screen === 'night') && <HomeScreen day={p.day} startNight={screen === 'night'} />}
      {spike !== null && (
        <Pressable style={[styles.back, { bottom: insets.bottom + 8 }]} onPress={() => setSpike(null)} accessibilityRole="button" accessibilityLabel="앱으로 돌아가기">
          <Text style={styles.backText}>← 앱</Text>
        </Pressable>
      )}
      <StatusBar style={screen === 'night' ? 'light' : 'dark'} />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  back: { position: 'absolute', left: 8, bottom: 8, minHeight: 36, paddingHorizontal: 10, justifyContent: 'center', borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.5)' },
  backText: { color: '#fff', fontSize: 12 },
});
