// 게임 상태 ↔ 집계 핑 다리(그리지 않는 컴포넌트). App 루트에 하나만 둔다.
// - 세이브 상태에서 평생 한 번 사건을 뽑아(syncOnce — 시작할 때와 상태가 바뀔 때) 넣고, 하루 첫 실행이면 '열기'를 기록한다.
// - 새 사건·새 날 열기가 생겼을 때와 백그라운드로 갈 때 아웃박스를 보낸다.
// - 원격 설정: 시작할 때와 포그라운드로 올 때 받고(필요할 때만 — TTL·15분·max-age·ETag), 백그라운드로 가면 이번 실행을 '건강함'으로 적는다
//   (크래시 루프 탈출 판정, 3-7-2). 원격 플래그 remoteMotifs가 켜져 있으면 콘텐츠 매니페스트·팩도 같은 때에 받는다.
// 핑이 꺼져 있으면(기본) 핑 호출은 아무것도 하지 않는다. 주소가 비면(배포 전 기본) 원격 받기도 하지 않는다. 실패해도 게임은 그대로다.
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { getSnapshot, now, useGame, type Snapshot } from '../game/store';
import { getLocale } from '../i18n';
import { appVer } from './env';
import { contentPacks, pingClient, remoteConfig } from './index';
import { contextFromState, type PingContext } from './ping';

function ctxOf(snap: Snapshot): PingContext | null {
  if (!snap.state || (Platform.OS !== 'ios' && Platform.OS !== 'android')) return null;
  return contextFromState(snap.state, now(), { platform: Platform.OS, appVer: appVer(), lang: getLocale() });
}

export function NetBridge() {
  const snap = useGame();

  useEffect(() => {
    const ctx = ctxOf(snap);
    if (!ctx || !snap.state) return;
    const added = pingClient.syncOnce(snap.state, ctx);
    const opened = pingClient.recordOpen(ctx);
    // eslint-disable-next-line mong/effect-needs-cleanup -- 집계 전송은 결과를 state에 쓰지 않고, 언마운트 때 취소하면 쌓인 칸을 잃는다(전송·재시도는 pingClient가 맡음)
    if (added > 0 || opened) void pingClient.flush(ctx);
  }, [snap]);

  useEffect(() => {
    const pull = (foreground: boolean) => {
      void remoteConfig
        .refresh({ foreground })
        .then(() => (remoteConfig.remoteFlag('remoteMotifs') === true ? contentPacks.refresh({ foreground }) : undefined))
        .catch(() => {}); // 원격 받기 실패는 번들 기본값으로 둔다(게임 경로와 무관)
    };
    pull(false);
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') pull(true);
      if (st !== 'background') return;
      remoteConfig.markHealthy();
      const ctx = ctxOf(getSnapshot());
      if (ctx) void pingClient.flush(ctx);
    });
    return () => sub.remove();
  }, []);

  return null;
}
