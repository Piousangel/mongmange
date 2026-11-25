// 앱 링크 받기(C11, C10 앱 링크 `https://mongmang.ink/m/*`). App 루트에 하나만 둔다 — 게임 화면 위에 시트만 띄운다.
// 처음 연 주소(getInitialURL)와 켜져 있는 동안 온 주소('url' 사건) 모두. 사이트의 /m/{코드}가 아니면 무시한다(웹 미리보기는 늘 무시).
// 같은 코드를 다시 열면 시트를 새로 띄운다(열 때마다 다시 불러옴). 디퍼드 딥링크는 하지 않는다.
import { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { LinkSheetHost } from '../screens/LinkSheet';
import { SITE_ORIGIN, STATIC_BASE } from './env';
import type { FetchLike } from './http';
import { linkCodeFromUrl } from './link';

const fetchFn: FetchLike = (url, init) => fetch(url, init);

export function LinkReceiver() {
  const [open, setOpen] = useState<{ code: string; n: number } | null>(null);

  useEffect(() => {
    let alive = true;
    let n = 0;
    const take = (url: string | null | undefined) => {
      const code = url ? linkCodeFromUrl(url, SITE_ORIGIN) : null;
      if (code && alive) setOpen({ code, n: ++n });
    };
    void Linking.getInitialURL()
      .then(take)
      .catch(() => {});
    const sub = Linking.addEventListener('url', (e) => take(e.url));
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  if (!open) return null;
  // 사이트 주소가 비면(배포 전) 페이지를 불러오지 못한다 → 시트가 '보여 드릴 수 없어요'로 답한다
  return <LinkSheetHost key={open.n} code={open.code} onClose={() => setOpen(null)} fetch={fetchFn} siteBase={STATIC_BASE} />;
}
