// 서버 호출 공통: 비차단·제한 시간(architecture.md 4-1). 실패는 던지지 않고 결과로 돌려준다 — 게임 경로는 이 결과를 기다리지 않는다.
// 결과를 셋으로 가른다(B0 리뷰 I4): 응답을 받음(ok·http) / 제한 시간 초과(timeout — 서버가 받았을 수도 있다) / 연결 실패(network — 안 닿았다).
export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export const NET_TIMEOUT_MS = 5000;

export type HttpResult = { kind: 'ok'; status: number; body: string } | { kind: 'http'; status: number } | { kind: 'timeout' } | { kind: 'network' };

export async function request(fetchFn: FetchLike, url: string, init: Parameters<FetchLike>[1] = {}, timeoutMs = NET_TIMEOUT_MS): Promise<HttpResult> {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctl?.abort();
  }, timeoutMs);
  try {
    const r = await fetchFn(url, { ...init, signal: ctl?.signal });
    if (!r.ok) return { kind: 'http', status: r.status };
    return { kind: 'ok', status: r.status, body: r.status === 204 ? '' : await r.text() };
  } catch {
    return timedOut ? { kind: 'timeout' } : { kind: 'network' };
  } finally {
    clearTimeout(timer);
  }
}
