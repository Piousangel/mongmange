// 웹: 알림 no-op(권한은 늘 '없음'으로 본다)
export type PermissionState = 'granted' | 'denied' | 'undetermined';
export type NotifyResult = 'scheduled' | 'denied' | 'off';
/** 웹은 사전 문구 흐름을 확인할 수 있게 '아직 안 물음'으로 둔다(실제 창은 없음) */
export async function permission(): Promise<PermissionState> {
  return 'undetermined';
}
export async function requestPermission(): Promise<PermissionState> {
  return 'denied';
}
export async function scheduleMorning(_at: number): Promise<NotifyResult> {
  return 'off';
}
export async function cancelMorning(): Promise<void> {}
export function openSettings(): void {}
