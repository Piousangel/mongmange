// `/m/**` 직접 호출(`*.run.app/m/…`) 막기 — B6 준비 리뷰 1안(서버 코드), DECISIONS B7a.
//
// 판단 근거 = **위조할 수 없는 가장 오른쪽 XFF 홉.** Cloud Run 앞의 Google 프런트엔드(GFE)는 자기에게 접속한 주소를 XFF 맨 오른쪽에 덧붙인다.
//  - Firebase Hosting 경유(브라우저 → Firebase → GFE → Cloud Run): 맨 오른쪽 = Firebase 쪽 주소 = Google 자체 서비스 대역
//  - 직접 호출(공격자 → GFE → Cloud Run): 맨 오른쪽 = 공격자 주소. 공격자는 그 왼쪽만 쓸 수 있다
// 그래서 맨 오른쪽 홉이 **Google 자체 서비스 대역(goog.json − cloud.json, google-edge-ranges.ts)** 안인지로 가른다.
// cloud.json(고객이 빌리는 GCE·Cloud Run·Functions 출구)을 빼므로 공격자가 Google Cloud VM 하나로 통과하지 못한다.
// Host·X-Forwarded-Host는 클라이언트가 마음대로 넣을 수 있어 쓰지 않는다.
//
// 범위: **web 그룹(`/m/**`)만.** 앱 API(api 그룹)는 앱이 `*.run.app`을 직접 부르는 정상 경로라(architecture.md 3-2 `EXPO_PUBLIC_API_BASE`)
// 여기에 걸면 앱이 깨진다 — 걸지 않는다. OTA(`ota.mongmang.ink`, Firebase 경유)는 B6 실측 뒤 같은 방식으로 넓힐 수 있다.
//
// 모드 WEB_EDGE_CHECK
//  - off     검사 안 함(개발·시험 기본)
//  - log     통과시키고 대역 밖 개수만 1분마다 경고 한 줄(`web_edge_unverified`, IP 없음) — **운영 기본. B6에서 실제 Firebase 요청의 맨 오른쪽 홉이
//            대역 안인지 실측한 뒤 enforce로** (Firebase 출구 대역은 Google이 따로 공개하지 않는다 [확인 필요: B6])
//  - enforce 대역 밖·XFF 없음·IP 아님 → **거부**(403 no-store, 레이트 리밋·DB 앞). 거부 수도 1분마다 개수만
// 실패 기본값: 대역 스냅숏이 비었거나 깨졌으면 **부팅 거부**(off 제외 — 이전 리비전이 그대로 남는다). 스냅숏이 7일 넘었으면 부팅 때 경고
// (`web_edge_ranges_stale`). 갱신은 매일 `scripts/update-google-edge-ranges.mjs --check`(B6 예약 작업, Google 권고).
// 주의(B7a 리뷰 L4): goog.json은 Google 인프라 **전체** 목록이 아니다 — Firebase Hosting 접속 IP 199.36.158.100도 goog·cloud 어디에도 없다.
// 그래서 Firebase → Cloud Run의 맨 오른쪽 홉이 대역 안인지는 **B6 첫날 실측**이고, log 모드에서 며칠 `web_edge_unverified` 0이 enforce 전환 조건이다.
// 남는 구멍: Google 자체 서비스를 프록시로 쓰는 경로(예: Apps Script UrlFetch 출구)는 대역 안이다 — 쿼터가 작아 홍수 수단은 못 되지만 [확인 필요: B6 L5].
import { isIP } from 'node:net';
import { expandV6 } from './client-ip';
import { GOOGLE_EDGE_RANGES } from './google-edge-ranges';

export type WebEdgeMode = 'off' | 'log' | 'enforce';
/** Google 권고는 매일 갱신(B7a 리뷰 L4) — 이미지에 묶인 스냅숏이 일주일 넘으면 부팅 때 경고 */
export const WEB_EDGE_STALE_DAYS = 7;

interface Ranges {
  v4: ReadonlyArray<readonly [number, number]>;
  v6: ReadonlyArray<readonly [bigint, bigint]>;
}

function v4Num(ip: string): number {
  return ip.split('.').reduce((a, o) => a * 256 + Number(o), 0);
}
function v6Num(ip: string): bigint {
  return expandV6(ip).reduce((n, g) => (n << 16n) | BigInt(parseInt(g, 16)), 0n);
}
function inSorted<T extends number | bigint>(list: ReadonlyArray<readonly [T, T]>, x: T): boolean {
  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [s, e] = list[mid]!;
    if (x < s) hi = mid - 1;
    else if (x > e) lo = mid + 1;
    else return true;
  }
  return false;
}

/** IP가 Google 자체 서비스 대역 안인지. IPv4-매핑 IPv6는 IPv4로 */
export function inGoogleEdge(ip: string, ranges: Ranges = GOOGLE_EDGE_RANGES): boolean {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  const a = mapped ? mapped[1]! : ip;
  const kind = isIP(a);
  if (kind === 4) return inSorted(ranges.v4, v4Num(a));
  if (kind === 6) return inSorted(ranges.v6, v6Num(a));
  return false;
}

/** XFF 맨 오른쪽 홉(GFE가 덧붙인 값 — 위조 불가). 없거나 IP가 아니면 undefined */
export function rightmostHop(xff: string | string[] | undefined): string | undefined {
  if (!xff) return undefined;
  const last = (Array.isArray(xff) ? xff.join(',') : xff).split(',').map((s) => s.trim()).filter(Boolean).at(-1);
  if (!last) return undefined;
  const br = /^\[([^\]]+)\](?::\d+)?$/.exec(last);
  const v4 = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(last);
  const ip = br ? br[1]! : v4 ? v4[1]! : last;
  return isIP(ip) ? ip : undefined;
}

/** 대역 스냅숏 검사 — 비었거나 정렬이 깨졌으면 던진다(부팅 거부). 오래됐으면 경고 문구를 돌려준다 */
export function checkRanges(ranges: Ranges & { createdAt: string }, now: number): string | null {
  const sorted = <T extends number | bigint>(l: ReadonlyArray<readonly [T, T]>) => l.every(([s, e], i) => s <= e && (i === 0 || l[i - 1]![1] < s));
  if (ranges.v4.length === 0 || ranges.v6.length === 0 || !sorted(ranges.v4) || !sorted(ranges.v6)) {
    throw new Error('Google 대역 스냅숏이 비었거나 깨졌습니다 — scripts/update-google-edge-ranges.mjs로 다시 만드세요');
  }
  const age = (now - Date.parse(ranges.createdAt)) / 86_400_000;
  return age > WEB_EDGE_STALE_DAYS ? `Google 대역 스냅숏이 ${Math.floor(age)}일 됐습니다(갱신 주기 매일)` : null;
}

export class WebEdgeCheck {
  private unverified = 0;
  private denied = 0;
  private lastReport: number;

  constructor(
    readonly mode: WebEdgeMode,
    private readonly warn: (obj: Record<string, unknown>, msg: string) => void,
    private readonly now: () => number = Date.now,
    private readonly ranges: Ranges = GOOGLE_EDGE_RANGES,
  ) {
    this.lastReport = now();
  }

  /** true = 들여보냄. web 그룹 요청에만 부른다 */
  allow(xff: string | string[] | undefined): boolean {
    if (this.mode === 'off') return true;
    const hop = rightmostHop(xff);
    const ok = hop !== undefined && inGoogleEdge(hop, this.ranges);
    if (!ok) {
      if (this.mode === 'enforce') this.denied++;
      else this.unverified++;
    }
    this.report();
    return ok || this.mode === 'log';
  }

  /** 1분마다 개수만(IP·경로 없음) */
  private report(): void {
    const t = this.now();
    if (t - this.lastReport < 60_000) return;
    this.lastReport = t;
    if (this.unverified) this.warn({ code: 'web_edge_unverified', count: this.unverified }, '/m 요청 중 Google 앞단 대역 밖(log 모드 — 통과시킴)');
    if (this.denied) this.warn({ code: 'web_edge_denied', count: this.denied }, '/m 직접 호출 거부');
    this.unverified = 0;
    this.denied = 0;
  }
}
