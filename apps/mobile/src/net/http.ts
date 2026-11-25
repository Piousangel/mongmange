// 서버 호출 공통: 비차단·제한 시간(architecture.md 4-1). 실패는 던지지 않고 결과로 돌려준다 — 게임 경로는 이 결과를 기다리지 않는다.
// 결과를 셋으로 가른다(B0 리뷰 I4): 응답을 받음(ok·http) / 제한 시간 초과(timeout — 서버가 받았을 수도 있다) / 연결 실패(network — 안 닿았다).
// C11: 원격 문서 캐시가 ETag·max-age를 따르도록 응답 머리글(header)을 함께 돌려주고, 팩 다시 받기에 `cache: 'reload'`를 넘길 수 있다.
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal; cache?: 'reload' | 'no-cache' },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
  /** 응답 머리글(fetch Headers와 같은 꼴). 없는 구현(시험·옛 가짜)도 있다 */
  headers?: { get(name: string): string | null };
}>;

export const NET_TIMEOUT_MS = 5000;

/** 응답 머리글 읽기(없으면 null) */
export type HeaderGet = (name: string) => string | null;

/** http = 2xx가 아닌 응답. body는 오류 본문(맡겨 두기 409의 `error.details.server`처럼 판단에 쓰는 값 — C12). 못 읽으면 빈 문자열 */
export type HttpResult =
  | { kind: 'ok'; status: number; body: string; header?: HeaderGet }
  | { kind: 'http'; status: number; body: string; header?: HeaderGet }
  | { kind: 'timeout' }
  | { kind: 'network' };

export async function request(fetchFn: FetchLike, url: string, init: Parameters<FetchLike>[1] = {}, timeoutMs = NET_TIMEOUT_MS): Promise<HttpResult> {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctl?.abort();
  }, timeoutMs);
  try {
    const r = await fetchFn(url, { ...init, signal: ctl?.signal });
    const h = r.headers;
    const header: HeaderGet = (name) => {
      try {
        return h?.get(name) ?? null;
      } catch {
        return null;
      }
    };
    if (!r.ok) return { kind: 'http', status: r.status, body: await r.text().catch(() => ''), header };
    return { kind: 'ok', status: r.status, body: r.status === 204 ? '' : await r.text(), header };
  } catch {
    return timedOut ? { kind: 'timeout' } : { kind: 'network' };
  } finally {
    clearTimeout(timer);
  }
}

/** `Cache-Control`의 max-age(초). 없거나 틀리면 null. no-store·no-cache는 0 */
export function maxAgeOf(cacheControl: string | null): number | null {
  if (!cacheControl) return null;
  const v = cacheControl.toLowerCase();
  if (/(?:^|[,\s])no-(?:store|cache)(?:$|[,\s=])/.test(v)) return 0;
  const m = /(?:^|[,\s])max-age\s*=\s*"?(\d{1,10})"?/.exec(v);
  return m ? Number(m[1]) : null;
}
