// 통계·링크 시트 확인판(웹 ?screen=net&nv=<갈래>, 캡처 scripts/c11-capture.mjs). 제품 화면이 아니다(개발 번들에만 — App.tsx).
// 메모리 저장소와 가짜 응답으로 시트의 각 갈래를 실제 컴포넌트로 보여 준다. 포스터는 자리 그림(SVG)이다 — 실제 포스터는 주인 앱이 올린 4:5 JPEG.
//   nv = metrics-age | metrics-under | metrics-off | metrics-on
//      | link-loading | link-live | link-live-anon | link-gone | link-failed | link-report | link-report-failed | link-reported
import type { KV } from '@mong/core';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { recordAge } from '../cloud/ageGate';
import { METRICS_ON_KEY } from '../net/gate';
import type { FetchLike } from '../net/http';
import type { LinkView } from '../net/link';
import { LinkSheetHost } from './LinkSheet';
import fixture from './netBoard.fixture.json';
import { MetricsSheet } from './MetricsSheet';

const POSTER =
  'data:image/svg+xml;base64,' +
  btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500" viewBox="0 0 400 500"><rect width="400" height="500" fill="#EFE8DA"/>' +
      '<path d="M200 150c70 0 112 52 112 118s-46 112-112 112-112-46-112-112 42-118 112-118z" fill="#1B1A18" opacity="0.92"/>' +
      '<circle cx="170" cy="255" r="9" fill="#EFE8DA"/><circle cx="232" cy="255" r="9" fill="#EFE8DA"/>' +
      '<path d="M150 150c18-40 40-60 52-62M208 150c10-34 30-52 46-54" stroke="#1B1A18" stroke-width="10" stroke-linecap="round" fill="none"/></svg>',
  );

function memKV(): KV {
  const m = new Map<string, string>();
  return {
    getString: (k) => m.get(k),
    set: (k, v) => void m.set(k, v),
    remove: (k) => void m.delete(k),
  };
}

const NAME = fixture.name;
const page = (title: string | null) => ({
  kind: 'live' as const,
  title,
  aux: { ko: fixture.auxKo, en: fixture.auxEn },
  posterUrl: POSTER,
});

const LINK: Record<string, LinkView> = {
  'link-loading': { v: 'loading' },
  'link-live': { v: 'live', page: page(NAME) },
  'link-live-anon': { v: 'live', page: page(null) },
  'link-gone': { v: 'gone' },
  'link-failed': { v: 'failed', why: 'offline' },
  'link-report': { v: 'report', page: page(NAME), reason: 'personal' },
  'link-report-failed': { v: 'reportFailed', page: page(NAME), reason: 'other', why: 'limited' },
  'link-reported': { v: 'reported' },
};

/** 알리기는 늘 204(확인판에서 실제 흐름을 눌러 볼 수 있게) */
const fakeFetch: FetchLike = async () => ({ ok: true, status: 204, text: async () => '' });

export function NetBoard() {
  const nv = typeof window !== 'undefined' && window.location ? (new URLSearchParams(window.location.search).get('nv') ?? 'metrics-age') : 'metrics-age';
  const kv = useMemo(() => {
    const k = memKV();
    const at = Date.now();
    const tz = -new Date().getTimezoneOffset();
    if (nv === 'metrics-under') recordAge(k, 'under', at, tz);
    if (nv === 'metrics-off' || nv === 'metrics-on') recordAge(k, 'pass', at, tz);
    if (nv === 'metrics-on') k.set(METRICS_ON_KEY, '1');
    return k;
  }, [nv]);
  const [open, setOpen] = useState(true);
  return (
    <View style={styles.fill} testID="net-board">
      {nv.startsWith('metrics') && <MetricsSheet visible={open} onClose={() => setOpen(false)} kv={kv} />}
      {nv.startsWith('link') && open && <LinkSheetHost code="K7M3QX9P" onClose={() => setOpen(false)} fetch={fakeFetch} siteBase="https://board.local" initial={LINK[nv] ?? LINK['link-live']} />}
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1, backgroundColor: '#EFE8DA' } });
