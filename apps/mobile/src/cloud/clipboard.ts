// 글귀 복사. 네이티브 클립보드 모듈(expo-clipboard)은 아직 바이너리에 없다(빌드 2 네이티브 묶음 후보) → 네이티브는 false를 돌려주고
// 화면은 글귀를 길게 눌러 고르는 안내(selectable 글자)로 대신한다. 웹은 clipboard.web.ts.
export async function copyText(_text: string): Promise<boolean> {
  return false;
}

/** 복사 버튼을 보일 수 있나 */
export const CAN_COPY = false;
