// PNG를 OS 공유 시트로(expo-file-system으로 캐시에 쓰고 expo-sharing으로 연다). 웹은 native.web.ts.
// 네이티브 모듈이 없는 옛 빌드에서도 죽지 않게 지연 로드한다 — 없으면 shareSupported() = false라 화면이 공유 버튼을 숨긴다.
import { optionalModule } from '../lib/optionalModule';

type FS = typeof import('expo-file-system');
type Sharing = typeof import('expo-sharing');
const FileSystem = optionalModule<FS>(() => require('expo-file-system'));
const ExpoSharing = optionalModule<Sharing>(() => require('expo-sharing'));
/** 공유 임시 파일 전용 캐시 폴더. **다음 공유 전에** 통째로 비운다(받는 앱이 아직 읽는 중일 수 있어 공유 직후에는 지우지 않음, 리뷰 L-3) */
const SHARE_DIR = 'mong-share';

export type ShareResult = 'shared' | 'saved' | 'unavailable' | 'failed';

export function shareSupported(): boolean {
  return !!FileSystem && !!ExpoSharing;
}

/** base64 PNG → 캐시 파일 → 공유 시트. 시트를 닫으면(보냈든 안 보냈든) 'shared'. 지난 공유 파일은 이번 공유 전에 지운다 */
export async function sharePng(base64: string, fileName: string, dialogTitle: string): Promise<ShareResult> {
  if (!FileSystem || !ExpoSharing) return 'unavailable';
  try {
    if (!(await ExpoSharing.isAvailableAsync())) return 'unavailable';
    const dir = new FileSystem.Directory(FileSystem.Paths.cache, SHARE_DIR);
    if (dir.exists) dir.delete();
    dir.create();
    const file = new FileSystem.File(dir, fileName);
    file.create();
    await file.write(base64, { encoding: 'base64' });
    await ExpoSharing.shareAsync(file.uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle });
    return 'shared';
  } catch (e) {
    console.warn('[share] 실패:', e);
    return 'failed';
  }
}
