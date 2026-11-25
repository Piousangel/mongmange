// 웹(미리보기·캡처): 브라우저 클립보드. 막혀 있으면 false.
export async function copyText(text: string): Promise<boolean> {
  try {
    const c = (globalThis as { navigator?: { clipboard?: { writeText?: (s: string) => Promise<void> } } }).navigator?.clipboard;
    if (!c?.writeText) return false;
    await c.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export const CAN_COPY = true;
