// 인장 윤곽(core sealOutline, 단위 0..1) → Skia 경로. RN·글꼴을 불러오지 않는 순수 그리기 도우미(카드·이레 프레임·인장 표시가 같이 쓴다)
import { Skia, type SkPath } from '@shopify/react-native-skia';

/** 윤곽(단위 0..1, 평평한 xy 배열) → 한 변 size px 경로 */
export function sealPath(outline: readonly number[], size: number, x = 0, y = 0): SkPath {
  const p = Skia.PathBuilder.Make();
  p.moveTo(x + outline[0]! * size, y + outline[1]! * size);
  for (let i = 2; i < outline.length; i += 2) p.lineTo(x + outline[i]! * size, y + outline[i + 1]! * size);
  p.close();
  return p.build();
}
