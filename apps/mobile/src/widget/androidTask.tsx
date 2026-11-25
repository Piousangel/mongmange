// Android 위젯 작업 핸들러(C10 자리). react-native-android-widget가 위젯 추가·갱신 때 헤드리스 JS로 부른다.
// 지금은 한지색 빈 칸 + 값 하나(리허설 확인용). 화면·스크린리더 라벨·다크 모드는 C3 몫.
import { FlexWidget, TextWidget, registerWidgetTaskHandler, type WidgetTaskHandlerProps } from 'react-native-android-widget';
import { readAndroidWidgetValue } from './value';

export function renderMongWidget(value: string | undefined) {
  return (
    <FlexWidget style={{ height: 'match_parent', width: 'match_parent', backgroundColor: '#EFE8DA', justifyContent: 'center', alignItems: 'center' }}>
      <TextWidget text={value ?? ''} style={{ fontSize: 11, color: '#2B2A28' }} />
    </FlexWidget>
  );
}

export async function mongWidgetTaskHandler({ widgetAction, renderWidget }: WidgetTaskHandlerProps): Promise<void> {
  if (widgetAction === 'WIDGET_DELETED') return;
  renderWidget(renderMongWidget(readAndroidWidgetValue()));
}

export function registerMongWidget(): void {
  registerWidgetTaskHandler(mongWidgetTaskHandler);
}
