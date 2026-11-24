// M2 이름(C-integrated 2-2): 앱 쪽 문 세 개. 규칙(가락·대답·묻는 때·공유 이름)은 core sim/naming.ts, 여기는 플래그·메타를 끼워 넣기만 한다.
// - 화면 이름(displayName): 앱 안(홈 세로 이름·카드 보기·이름표). 공개 설정과 무관(architecture 3-5-2 표 끝 줄).
// - 공유 이름(sharedName): 꿈 카드 PNG·이레 영상·공개 스냅숏. **공유물은 반드시 이 함수로만 이름을 얻는다**(M2 시험이 고정).
// - 묻는 군(askGroup): 이름 시점 A/B. 판정 전 기본값 A(D-20 개정 줄). C2가 `nameTiming` 플래그와 군(abGroup)으로 바꾸는 자리.
import { sim } from '@mong/core';
import { isOn } from '../features';
import { getSnapshot } from './store';

type Named = Pick<sim.State, 'name'>;

/** 앱 안에 보이는 이름. naming 꺼짐 = 늘 null(빌드 1과 같은 화면) */
export function displayName(s: Named | null | undefined): string | null {
  return isOn('naming') && s?.name ? s.name.text : null;
}

/** 공유물에 실을 이름: naming 켬 + 이름 공개(meta.nameVisible) + 이름 있음일 때만 */
export function sharedName(s: Named | null | undefined): string | null {
  if (!s || !isOn('naming')) return null;
  return sim.sharedNameOf(s, getSnapshot().meta.nameVisible === true);
}

/** 이름 시점 군. C2 전에는 기본값 A(첫 재우기) */
export function askGroup(): sim.NameTimingGroup {
  return 'A';
}

/** 지금 이름 짓기 창을 저절로 열까(플래그 꺼짐이면 늘 아니오) */
export function namePromptNow(s: sim.State, moment: sim.NameMoment): boolean {
  if (!isOn('naming')) return false;
  return sim.namePromptDue(s, moment, askGroup(), getSnapshot().meta.nameAsk);
}
