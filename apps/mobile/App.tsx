import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PARAMS, useDriveClock } from './src/render/clock';
import { HomeScreen } from './src/screens/HomeScreen';
import { IntroScreen } from './src/screens/IntroScreen';
import { StrokeScreen } from './src/screens/StrokeScreen';

// 웹 캡처용 URL: ?screen=day|night|intro|stroke &day=0|7 &attach=1|2|3 &body=A|B &rm=1 &vclock=1 &clean=1
// 네이티브(개발 빌드)는 URL이 없으므로 기본 = 첫 30초(intro).
export default function App() {
  useDriveClock();
  const screen = Platform.OS === 'web' ? PARAMS.screen : 'intro';
  return (
    <GestureHandlerRootView style={styles.root}>
      {screen === 'intro' && <IntroScreen />}
      {screen === 'stroke' && <StrokeScreen initial={PARAMS.day} />}
      {(screen === 'day' || screen === 'night') && <HomeScreen day={PARAMS.day} startNight={screen === 'night'} />}
      <StatusBar style={screen === 'night' ? 'light' : 'dark'} />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
