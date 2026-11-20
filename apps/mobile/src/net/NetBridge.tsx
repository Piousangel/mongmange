// 게임 상태 ↔ 집계 핑 다리(그리지 않는 컴포넌트). App 루트에 하나만 둔다.
// - 세이브 상태에서 평생 한 번 사건을 뽑아(syncOnce — 시작할 때와 상태가 바뀔 때) 넣고, 하루 첫 실행이면 '열기'를 기록한다.
// - 새 사건·새 날 열기가 생겼을 때와 백그라운드로 갈 때 아웃박스를 보낸다.
// 핑이 꺼져 있으면(기본) 모든 호출이 아무것도 하지 않는다. 실패해도 게임은 그대로다.
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { getSnapshot, now, useGame, type Snapshot } from '../game/store';
import { getLocale } from '../i18n';
import { appVer } from './env';
import { pingClient } from './index';
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
    if (added > 0 || opened) void pingClient.flush(ctx);
  }, [snap]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'background') return;
      const ctx = ctxOf(getSnapshot());
      if (ctx) void pingClient.flush(ctx);
    });
    return () => sub.remove();
  }, []);

  return null;
}
