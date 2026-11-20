// 웹: Web Share API(파일 공유 가능하면) → 아니면 PNG 내려받기. 캡처 확인용으로 마지막 공유를 window.__mongLastShare에 남긴다(개발 빌드만).
import type { ShareResult } from './native';

export type { ShareResult } from './native';

/** 네이티브와 같은 이름(웹은 캐시 폴더가 없어 쓰지 않는다 — 영상 계약의 dir 값 맞춤) */
export const SHARE_DIR = 'mong-share';

export function shareSupported(): boolean {
  return typeof document !== 'undefined';
}

function bytesOf(base64: string): Uint8Array {
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function sharePng(base64: string, fileName: string, dialogTitle: string): Promise<ShareResult> {
  const g = globalThis as { __mongLastShare?: { fileName: string; bytes: number; via: string; base64: string } };
  try {
    const blob = new Blob([bytesOf(base64) as BlobPart], { type: 'image/png' });
    const file = new File([blob], fileName, { type: 'image/png' });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: dialogTitle });
        if (__DEV__) g.__mongLastShare = { fileName, bytes: blob.size, via: 'web-share', base64 };
        return 'shared';
      } catch (e) {
        // 유저가 닫음(AbortError)은 실패가 아니다
        if ((e as Error)?.name === 'AbortError') return 'shared';
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // eslint-disable-next-line mong/no-floating-timer -- 컴포넌트 밖 일회 해제: state를 건드리지 않고, 다운로드가 URL을 읽을 시간만 준다
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    if (__DEV__) g.__mongLastShare = { fileName, bytes: blob.size, via: 'download', base64 };
    return 'saved';
  } catch (e) {
    console.warn('[share] 실패:', e);
    return 'failed';
  }
}

/** 웹에는 영상 인코더가 없다(이레 영상은 네이티브 전용) — 호출되면 이미지판으로 떨어지게 'unavailable'(시트를 열기 전 실패) */
export async function shareFile(_uri: string, _mimeType: string, _uti: string, _dialogTitle: string): Promise<ShareResult> {
  return 'unavailable';
}
