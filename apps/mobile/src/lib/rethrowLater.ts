// 약속 안에서 잡힌 치명 오류를 '진짜 크래시'로 바꾼다(V24 리뷰 M2). RN 릴리스에서 처리 안 된 약속 거부는 치명이 아니라서,
// 진입점의 App 로드가 실패하면 앱이 한지 빈 화면에 멈춘 채 살아 있었다 → 사용자가 내리면 '깨끗한 끝'으로 보여 크래시 루프 판정·
// 네이티브 오류 복구(ERROR_RECOVERY_ONLY의 새 판 받기 포함)가 모두 못 봤다. 다음 틱에 다시 던져 전역 치명 처리(ErrorUtils)로 보낸다.
// 시험: test/ota-entry.test.ts
export type SetTimer = (fn: () => void, ms: number) => unknown;

export function rethrowLater(error: unknown, setTimer: SetTimer = (fn, ms) => setTimeout(fn, ms)): unknown {
  return setTimer(() => {
    throw error instanceof Error ? error : new Error(String(error));
  }, 0);
}
