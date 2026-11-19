// 로컬 알림 1종(systems 3.6): "간밤의 꿈이 현상됐어요" — 깰 수 있는 시각에 **하나만** 예약한다.
// 경합 방지(리뷰 C8): 모든 작업을 한 줄 큐로 직렬화하고, 고정 identifier로 덮어쓴다.
// 권한은 여기서 묻지 않는다: 묻는 시점(첫 재우기 뒤 사전 문구 동의)은 화면이 정하고 requestPermission을 부른다.
// 마름·방치 알림은 없다(D-03). 웹은 notify.web.ts(no-op).
// 네이티브 모듈이 없는 옛 개발 빌드에서도 죽지 않게 지연 로드한다. 없으면 모든 호출이 실패로 처리되어 알림만 꺼진다.
import { subscribeLocale, t } from '../i18n';

type ExpoNotifications = typeof import('expo-notifications');
const loaded: ExpoNotifications | null = (() => {
  try {
    return require('expo-notifications') as ExpoNotifications;
  } catch {
    return null;
  }
})();
const Notifications: ExpoNotifications =
  loaded ??
  (new Proxy({} as ExpoNotifications, {
    get() {
      throw new Error('expo-notifications native module missing');
    },
  }));
import { Linking, Platform } from 'react-native';

const CHANNEL = 'morning';
const ID = 'mong-morning';
let ready = false;
let queue: Promise<unknown> = Promise.resolve();

function setup() {
  if (ready || !loaded) return;
  ready = true;
  // 앱이 앞에 있을 때는 띄우지 않는다(이미 아침 화면이 보인다)
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false }),
  });
  if (Platform.OS === 'android') {
    setChannel();
    // 언어를 바꾸면 시스템 설정에 보이는 채널 이름도 새 언어로(같은 id로 다시 부르면 이름만 갱신된다, 리뷰 P2)
    subscribeLocale(setChannel);
  }
}

function setChannel() {
  Notifications.setNotificationChannelAsync(CHANNEL, { name: t('notif.channel'), importance: Notifications.AndroidImportance.DEFAULT }).catch(() => {});
}

function enqueue<T>(job: () => Promise<T>, fallback: T): Promise<T> {
  const run = queue.then(job, job).catch(() => fallback);
  queue = run;
  return run;
}

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export async function permission(): Promise<PermissionState> {
  setup();
  try {
    const p = await Notifications.getPermissionsAsync();
    if (p.granted) return 'granted';
    return p.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'denied';
  }
}

/** OS 권한 창(사전 문구에 동의했을 때, 또는 노트에서 켤 때만) */
export function requestPermission(): Promise<PermissionState> {
  setup();
  return enqueue(async () => {
    const p = await Notifications.requestPermissionsAsync();
    return p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied';
  }, 'denied' as PermissionState);
}

export type NotifyResult = 'scheduled' | 'denied' | 'off';

/** 다음 깨는 시각에 하나만 예약(권한이 이미 있을 때만, 묻지 않는다) */
export function scheduleMorning(at: number): Promise<NotifyResult> {
  setup();
  return enqueue(async (): Promise<NotifyResult> => {
    const p = await Notifications.getPermissionsAsync();
    if (!p.granted) return 'denied';
    await Notifications.cancelScheduledNotificationAsync(ID).catch(() => {});
    if (at <= Date.now() + 1000) return 'off';
    await Notifications.scheduleNotificationAsync({
      identifier: ID,
      content: { title: t('notif.title'), body: t('notif.body') },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL },
    });
    return 'scheduled';
  }, 'off');
}

export function cancelMorning(): Promise<void> {
  return enqueue(async () => {
    await Notifications.cancelScheduledNotificationAsync(ID);
  }, undefined);
}

/** 권한을 영구 거절한 뒤 노트에서 켤 때: OS 설정 열기 */
export function openSettings(): void {
  Linking.openSettings().catch(() => {});
}
