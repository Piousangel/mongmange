import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppFonts } from './src/ui/type';
import { useLocale } from './src/i18n/react';
import { GameApp } from './src/game/GameApp';
import { PARAMS, readParamsFrom, useDriveClock } from './src/render/clock';
import { HomeScreen } from './src/screens/HomeScreen';
import { IntroScreen } from './src/screens/IntroScreen';
import { StrokeScreen } from './src/screens/StrokeScreen';
import { DreamCardPreview } from './src/render/dreamCard/DreamCardPreview';

// 기본 = 앱 흐름(GameApp). 스파이크 캡처용 URL은 그대로: ?screen=day|night|intro|stroke &day=0|7 &attach=1|2|3 &body=A|B &rm=1 &vclock=1 &clean=1
// 네이티브 개발 빌드에서는 개발 메뉴의 '스파이크' 버튼이 같은 화면을 연다. 돌아가기 버튼은 개발 전용이라 영어 고정(i18n 밖).
export default function App() {
  return (
    <SafeAreaProvider>
      <Root />
    </SafeAreaProvider>
  );
}

function Root() {
  useDriveClock();
  useLocale(); // 언어가 바뀌면 화면 전체를 다시 그린다(문구는 t()가 현재 언어로 읽는다)
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
        <Pressable style={[styles.back, { bottom: insets.bottom + 8 }]} onPress={() => setSpike(null)} accessibilityRole="button" accessibilityLabel={'Back to app' /* i18n-ignore: 개발 빌드 스파이크 화면 전용 */}>
          <Text style={styles.backText}>{'← App' /* i18n-ignore: 개발 빌드 스파이크 화면 전용 */}</Text>
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
