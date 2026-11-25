// `/m/{code}` HTML 고정물(test/fixtures/m-page/*.html)의 입력값과 생성 함수 — 서버 렌더러(apps/server/src/pages/m-html.ts)로 만든다.
// net-link 시험이 이 함수로 지금 서버 출력을 다시 만들어 고정물과 바이트 비교한다(C11 리뷰 M4: 서버 틀이 바뀌면 앱 시험이 빨개진다).
// 고정물을 새로 쓰려면: MPAGE_WRITE=1 npx vitest run test/net-link.test.ts
type Renderer = {
  renderLivePage: (v: Record<string, unknown>, cfg: Record<string, string>) => string;
  renderGonePage: (cfg: Record<string, string>) => string;
};

export const M_PAGE_CFG = {
  siteOrigin: 'https://mongmang.ink',
  publicOrigin: 'https://pub.example.co',
  storeIosUrl: 'https://apps.apple.com/',
  storeAndroidUrl: 'https://play.google.com/store/apps/details?id=x',
};

export async function renderMPageFixtures(): Promise<Record<'live' | 'anon' | 'gone', string>> {
  // 경로를 변수로 두어 앱 타입 검사가 서버 소스를 끌어오지 않게 한다(vitest는 TS를 그대로 불러온다)
  const path = new URL('../../../server/src/pages/m-html.ts', import.meta.url).href;
  const r = (await import(/* @vite-ignore */ path)) as Renderer;
  return {
    live: r.renderLivePage(
      {
        code: 'K7M3QX9P',
        lang: 'ko',
        title: '몽이 & <별>',
        auxKo: '송연먹 · 느긋결 몽망이를 보셨군요',
        auxEn: 'You met a Songyeon-ink, Easygoing Mongmangi',
        posterUrl: 'https://pub.example.co/storage/v1/object/public/public-pages/ab/cd/1/poster.jpg',
        ogUrl: 'https://pub.example.co/storage/v1/object/public/public-pages/ab/cd/1/og.jpg',
        loopUrl: null,
        snapUrl: null,
      },
      M_PAGE_CFG,
    ),
    anon: r.renderLivePage(
      {
        code: 'K7M3QX9P',
        lang: 'en',
        title: 'Mongmangi',
        auxKo: '먹 · 결',
        auxEn: 'You met a Mongmangi',
        posterUrl: 'https://pub.example.co/p/poster.jpg',
        ogUrl: 'https://pub.example.co/p/poster.jpg',
        loopUrl: 'https://pub.example.co/p/loop.mp4',
        snapUrl: 'https://pub.example.co/p/snap.json',
      },
      M_PAGE_CFG,
    ),
    gone: r.renderGonePage(M_PAGE_CFG),
  };
}
