// 네이티브 모듈 지연 로드: 모듈이 없는 옛 개발·테스트 빌드에서도 앱이 죽지 않게, 없으면 null(그 기능만 꺼진다).
// 쓰는 곳: share/native.ts, game/review.ts, game/entropy.ts. (audio·notify는 기존 자리 그대로)
export function optionalModule<T>(load: () => T): T | null {
  try {
    return load();
  } catch {
    return null;
  }
}
