import { registerRootComponent } from 'expo';
import { skiaReady } from './src/skiaReady';

// Skia(웹은 CanvasKit) 로드가 끝난 뒤에 App을 불러온다.
skiaReady().then(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const App = require('./App').default;
  registerRootComponent(App);
});
