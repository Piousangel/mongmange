// C13 무작위 시나리오 세계(로드맵 C13, 정본 Q5·Q9). 기기 여럿 + 가짜 서버(cloud/fakeServer) + 가짜 시계(vitest 가짜 타이머)를 한 세계로 묶고,
// 사건 열(Act[])을 그대로 돌리며 매 사건 뒤 불변식 다섯 가지를 본다:
//  ① 유실 0: 한 번이라도 어딘가(기기 본·기기 칸·서버 본·서버 conflict 칸)에 있던 **본**은, 사용자가 직접 지우거나 비우지 않았다면
//     그 본 자체나 그 본에서 이어 키운 본(게임 저장으로 이어진 후손)이 어딘가에 늘 하나 이상 남는다. 본의 열쇠 = 저장 시각을 뺀 상태 내용.
//     예외(설계): 서버 conflict 칸 3벌 상한에서 밀려난 것(record.ts 머리말 — 30일 약속은 기기 parked 칸이 지킨다).
//     기기 칸(preRestore·parked)은 '사용자가 비움'이 아니면 사라지지 않는다(시계와 무관 — ③과 같이 본다).
//     서버 본은 말없이 덮이지 않는다(①덮임): 서버 본이 바뀌면 새 본이 옛 본의 후손이거나, 옛 본이 conflict 칸에 들어갔거나,
//     사용자가 그 본을 직접 골랐어야 한다(parked 칸 본으로 이어 가기 뒤 맡기기). 실서버는 덮인 본을 이력(overwritten)에 두지만
//     앱 원칙은 '충돌이면 자동으로 고르지 않는다'(C12)라, 이력이 있어도 말없이 덮는 것은 실패다.
//  ② 거짓 안내 0: '지웠어요'(deleted)·'끝남'(ended)인데 서버에 그 몽망이가 남음, '되찾음'(recovered·already)인데 지금 로그인의 몽망이가 다름.
//  ③ 시계 조작으로 지워지는 것 0: 기기 시계를 앞뒤로 돌려도 ①이 그대로(시계 사건은 아무것도 지울 수 없다).
//  ④ 통계를 끈 뒤 나가는 요청 0: 핑 요청이 나가는 순간 동의(metricsConsent)가 거짓이면 실패.
//  ⑤ 식별자 0: 맡겨 두기 요청의 경로·머리글·본문 키가 계약 목록 밖이면, 핑 본문에 긴 숫자(ms 시각·씨앗)·계약 밖 키가 있으면 실패.
// 사건은 '보기에 맞는 선택지 중 r번째' 꼴이라, 사건을 빼도 열이 계속 돌아간다 → 실패 열을 줄여(shrink) 고정 시험으로 남길 수 있다.
// 화면 쪽(useCloud 훅)의 send·작업 실행 규칙은 React 없이 여기서 같은 순서로 흉내 낸다(훅의 부작용 3가지: 글귀 확인 완료·켜짐인데 기록 없음 → 소개·옮겨 감/지움 → 소개면 기록 지움).
import { createHash } from 'node:crypto';
import { daysBetween, localDate, normalizeRecoveryCode, pingSchema } from '@mong/contract';
import { SAVE_KEYS, sim, type KV } from '@mong/core';
import { vi } from 'vitest';
import { recordAge } from '../../src/cloud/ageGate';
import { createCloudApi } from '../../src/cloud/api';
import { createFakeServer, type FakeServer } from '../../src/cloud/fakeServer';
import { deleteToken, initialView, reduce, startEvents, type CloudEvent, type Task, type TaskResult, type View } from '../../src/cloud/model';
import { PARKED_KEY, PRE_RESTORE_KEY, readParkedList, readPreRestore, readRecord, readUnconfirmedDelete, writeRecord } from '../../src/cloud/record';
import { markCodeConfirmed, runTask, type TaskDeps } from '../../src/cloud/tasks';
import { SLOW_MS } from '../../src/cloud/useCloud';
import { metricsConsent, setMetricsOn } from '../../src/net/gate';
import type { FetchLike } from '../../src/net/http';
import { createPingClient, PING_USER_AGENT, type PingContext } from '../../src/net/ping';

export const T0 = Date.UTC(2026, 10, 25, 3, 0); // 서울 11-25 정오
export const TZ = 540;
export const DAY = 86_400_000;
const API = 'https://api.test';

/** 결정적 PRNG(mulberry32) — fast-check 없이 시드 하나로 같은 사건 열 */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const sha = async (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

export type MemKV = KV & { m: Map<string, string> };
export function memKV(init?: Map<string, string>): MemKV {
  const m = new Map(init ?? []);
  return { m, getString: (k) => m.get(k), set: (k, v) => void m.set(k, v), remove: (k) => void m.delete(k) };
}

/**
 * 사건 하나. 숫자 r(0~1)은 그 순간 보기에 맞는 선택지 중 하나를 고른다(보기가 달라져도 열이 계속 돈다).
 * ui = 화면 조작, play = 게임이 새 본을 저장(깸·획), tick = 실제 시간 흐름(가짜 타이머 + 시계), clock = 그 기기 시계만 조작,
 * net = 서버·네트워크 고장 바꾸기, expire = 그 기기 접근 토큰 만료, clone = 그 기기의 OS 백업을 새 기기에 복원(세 번째 값 1이면 세션까지 따라옴 —
 * 세션 백업 제외 전 바이너리·기기 이전: 같은 로그인을 두 기기가 쓰는 Q9 '복원 뒤 옛 기기 계속 사용', 아니면 세션 없음),
 * ping = 통계 켜기·끄기·기록·보내기, reopen = 시트를 닫았다 다시 연다
 */
export type Act =
  | ['ui', number, number]
  | ['play', number]
  | ['tick', number]
  | ['clock', number, number]
  | ['net', number, number]
  | ['expire', number]
  | ['clone', number, number?]
  | ['ping', number, number]
  | ['reopen', number]
  /** 정해진 화면 사건 하나(고정 시나리오용) */
  | ['ev', number, CloudEvent];

export interface Violation {
  rule: '①유실' | '①칸' | '①덮임' | '②거짓안내' | '④끈뒤요청' | '⑤식별자' | '⑤경로' | '실행';
  step: number;
  msg: string;
  /** 이 사건 안에서 끝난 작업들(알려진 결함 가려내기용) */
  settled: string[];
}

interface Pending {
  task: Task;
  started: number;
  settled: boolean;
  result?: TaskResult;
  /** 작업 시작 때 기기 기록·확인 못 한 지우기 표시(② 판정용) */
  rec0: ReturnType<typeof readRecord>;
  marker0: ReturnType<typeof readUnconfirmedDelete>;
}

interface Dev {
  name: string;
  kv: MemKV;
  deps: TaskDeps;
  view: View;
  pending: Pending | null;
  skew: number;
  ping: ReturnType<typeof createPingClient>;
  flushing: Promise<void> | null;
  /** 사용자가 고른 본(parked 칸 본으로 이어 가기)이라 다음 맡기기가 서버 본을 바꿔도 된다 */
  mayReplace: boolean;
}

export interface World {
  srv: FakeServer;
  devs: Dev[];
  t: number;
  violations: Violation[];
  step: number;
  /** 사용자가 적어 둔 글귀(정규화 16자) → 그 글귀를 받을 때 서버의 몽망이 인장 코드 */
  codebook: Map<string, string>;
  notebook: string[];
  /** 이번 사건에서 사용자가 직접 비운 자리(①의 예외) */
  excused: Set<string>;
  /** 이번 사건 안에서 끝난 작업 */
  settledNow: string[];
  /** 게임 저장으로 이어진 본: 자식 열쇠 → 부모 열쇠 */
  parent: Map<string, string>;
  /** 지금까지 본 모든 본(사용자가 지운 것은 뺌) */
  tracked: Set<string>;
  plays: number;
  /** 서버 사용자별 지금 서버 본 열쇠(①덮임) */
  srvSave: Map<string, string>;
  /** 서버에 닿은 핑 본문(기기 이름, 본문) */
  pings: Array<{ dev: string; body: string }>;
  /** 요청·핑 수(보고용) */
  stats: { cloud: number; ping: number; tasks: Record<string, number>; results: Record<string, number> };
}

const MAX_DEVS = 4;

/** 본 열쇠: 저장 시각을 뺀 상태 내용(받아 이어 가기 adopt가 다시 저장해도 같은 열쇠) */
export function keyOf(raw: string): string {
  try {
    return createHash('sha1').update(JSON.stringify(sim.parseState(raw))).digest('hex').slice(0, 12);
  } catch {
    return `bad:${createHash('sha1').update(raw).digest('hex').slice(0, 12)}`;
  }
}

/** 처음 설치한 기기: 자기 몽망이 한 마리(씨앗이 다르면 다른 몽망이) */
function freshSave(seed: number, t: number): string {
  const s = sim.createInitial(T0 - seed * 3_600_000, TZ, seed);
  return sim.serializeState(s, t);
}

/** 게임이 새 본을 저장한다(깸 정산·하루 지남 흉내 — 같은 몽망이, 다음 날). 저장마다 내용이 달라지게 rng에 일련번호 */
export function playOnce(raw: string, t: number, n: number): string {
  const s = sim.parseState(raw);
  return sim.serializeState({ ...s, dayIndex: s.dayIndex + 1, rng: 1_000_000 + n }, t);
}

function pingCtx(t: number): PingContext | null {
  const cohortDay = localDate(T0, TZ);
  const dayN = daysBetween(cohortDay, localDate(t, TZ));
  if (!(dayN >= 0 && dayN <= 400)) return null;
  return { cohortDay, dayN, tzOffsetMin: TZ, platform: 'android', appVer: '1.0', lang: 'ko' };
}

// ── ⑤ 계약 목록 ──
const CLOUD_PATHS = new Set(['POST me/bootstrap', 'POST recovery-code', 'POST recover', 'GET saves/main', 'GET saves/main/meta', 'PUT saves/main', 'POST saves/main/conflicts', 'DELETE me']);
const CLOUD_HEADERS = new Set(['accept', 'authorization', 'content-type', 'if-match', 'if-none-match']);
const BODY_KEYS: Record<string, string[]> = {
  'POST me/bootstrap': ['ageGate'],
  'POST recovery-code': [],
  'POST recover': ['code', 'ageGate'],
  'PUT saves/main': ['body', 'clientSavedAt', 'resolve'],
  'POST saves/main/conflicts': ['body', 'clientSavedAt'],
};
/** DELETE /me를 보낼 수 있는 작업(사용자가 '지우기'·'다시 지우기'를 직접 고른 것뿐) */
const DELETE_TASKS = new Set<Task['t']>(['delete', 'deleteCheck', 'retryForgotten']);

export function createWorld(seed: number, nDevs = 2): World {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const srv = createFakeServer(sha, seed);
  const w: World = { srv, devs: [], t: T0, violations: [], step: 0, codebook: new Map(), notebook: [], excused: new Set(), settledNow: [], parent: new Map(), tracked: new Set(), plays: 0, srvSave: new Map(), pings: [], stats: { cloud: 0, ping: 0, tasks: {}, results: {} } };
  for (let i = 0; i < nDevs; i++) addDevice(w, memKV(new Map([[SAVE_KEYS.main, freshSave(i + 1, T0)]])));
  return w;
}

export function disposeWorld(): void {
  vi.useRealTimers();
}

function violate(w: World, rule: Violation['rule'], msg: string) {
  w.violations.push({ rule, step: w.step, msg, settled: [...w.settledNow] });
}

function addDevice(w: World, kv: MemKV): Dev {
  const name = String.fromCharCode(65 + w.devs.length);
  // 연령 확인은 통과로 둔다(켜기·되찾기·통계 모두 같은 기록)
  recordAge(kv, 'pass', T0, TZ);
  const auth = w.srv.authFor(name);
  const dev = {} as Dev;
  const cloudFetch: FetchLike = async (url, init = {}) => {
    w.stats.cloud++;
    checkCloudRequest(w, dev, url, init);
    return w.srv.fetch(url, init);
  };
  const now = () => w.t + dev.skew;
  Object.assign(dev, {
    name,
    kv,
    skew: 0,
    view: { v: 'intro' } as View,
    pending: null,
    flushing: null,
    mayReplace: false,
    deps: {
      api: createCloudApi({ fetch: cloudFetch, base: API, auth }),
      auth,
      kv,
      sha256: sha,
      now,
      local: {
        raw: () => kv.getString(SAVE_KEYS.main) ?? null,
        adopt: (st: sim.State) => {
          kv.set(SAVE_KEYS.main, sim.serializeState(st, now()));
          return true;
        },
      },
    } satisfies TaskDeps,
  });
  dev.view = initialView(readRecord(kv));
  const pingFetch: FetchLike = async (url, init = {}) => {
    w.stats.ping++;
    // ④ 요청이 나가는 바로 그 순간의 동의
    if (!metricsConsent(kv, true)) violate(w, '④끈뒤요청', `${name}: 통계를 끈 뒤 핑 요청 ${url}`);
    checkPingRequest(w, name, url, init);
    if (w.srv.faults.offline) throw new TypeError('Network request failed');
    w.pings.push({ dev: name, body: init.body ?? '' });
    const d = w.srv.faults.delayMs;
    if (d > 0)
      await new Promise<void>((res, rej) => {
        const id = setTimeout(res, d);
        init.signal?.addEventListener('abort', () => {
          clearTimeout(id);
          rej(new Error('aborted'));
        });
      });
    return { ok: true, status: 204, text: async () => '' };
  };
  // 달 창은 홀수 날, 위젯 1개 — 날이 다른 사건이 다른 차원 묶음이 되어 보내기 한 번에 핑이 여럿 나간다(끈 뒤 '다음 덩어리' 판정)
  dev.ping = createPingClient({ kv, fetch: pingFetch, apiBase: API, consent: () => metricsConsent(kv, true), nameTiming: () => 'A', now, isMoonWindow: (ld) => Number(ld.slice(-1)) % 2 === 1, widgetCount: () => 1 });
  w.devs.push(dev);
  return dev;
}

function checkCloudRequest(w: World, dev: Dev, url: string, init: Parameters<FetchLike>[1] = {}) {
  const m = /^https:\/\/api\.test\/api\/v1\/([a-z/-]+)$/.exec(url);
  const route = `${init.method ?? 'GET'} ${m?.[1] ?? url}`;
  if (!m || !CLOUD_PATHS.has(route)) return violate(w, '⑤경로', `${dev.name}: 계약 밖 경로 ${route}`);
  for (const h of Object.keys(init.headers ?? {})) if (!CLOUD_HEADERS.has(h.toLowerCase())) violate(w, '⑤식별자', `${dev.name}: 계약 밖 머리글 ${h} (${route})`);
  const want = BODY_KEYS[route];
  if (init.body !== undefined) {
    const o = JSON.parse(init.body) as Record<string, unknown>;
    const extra = Object.keys(o).filter((k) => !want?.includes(k));
    if (extra.length) violate(w, '⑤식별자', `${dev.name}: 본문에 계약 밖 키 ${extra.join(',')} (${route})`);
    const gate = o.ageGate as Record<string, unknown> | undefined;
    if (gate && Object.keys(gate).some((k) => k !== 'v' && k !== 'ok')) violate(w, '⑤식별자', `${dev.name}: ageGate에 판정 밖 값 ${JSON.stringify(gate)}`);
  } else if (want && want.length) violate(w, '⑤경로', `${dev.name}: 본문이 없는 ${route}`);
  if (route === 'DELETE me' && !(dev.pending && DELETE_TASKS.has(dev.pending.task.t))) violate(w, '②거짓안내', `${dev.name}: 사용자가 고르지 않은 작업(${dev.pending?.task.t ?? '없음'})에서 DELETE /me`);
}

function checkPingRequest(w: World, name: string, url: string, init: Parameters<FetchLike>[1] = {}) {
  if (url !== `${API}/api/v1/ping` || init.method !== 'POST') violate(w, '⑤경로', `${name}: 핑 경로 ${init.method} ${url}`);
  const hs = Object.keys(init.headers ?? {});
  if (hs.some((h) => h !== 'content-type' && h !== 'user-agent') || init.headers?.['user-agent'] !== PING_USER_AGENT) violate(w, '⑤식별자', `${name}: 핑 머리글 ${JSON.stringify(init.headers)}`);
  const body = init.body ?? '';
  const parsed = pingSchema.safeParse(JSON.parse(body));
  if (!parsed.success) violate(w, '⑤식별자', `${name}: 핑 본문이 계약 밖 ${body}`);
  // ms 시각(13자리)·세이브 씨앗(긴 정수)은 한 글자도 실리면 안 된다
  if (/\d{6,}/.test(body.replace(/"\d{4}-\d{2}-\d{2}"/g, '""'))) violate(w, '⑤식별자', `${name}: 핑 본문에 긴 숫자 ${body}`);
}

// ── 위치(①) ──
type Loc = { key: string };
function locations(w: World): Map<string, Loc> {
  const out = new Map<string, Loc>();
  for (const d of w.devs) {
    const main = d.kv.getString(SAVE_KEYS.main);
    if (main) out.set(`dev:${d.name}:main`, { key: keyOf(main) });
    // 칸은 저장소 원문을 직접 읽는다(운영 읽기 함수가 거르거나 지워도 시험은 속지 않는다)
    try {
      const pre = JSON.parse(d.kv.getString(PRE_RESTORE_KEY) ?? 'null') as { raw?: string } | null;
      if (pre?.raw) out.set(`dev:${d.name}:pre`, { key: keyOf(pre.raw) });
    } catch {
      /* 깨진 칸 */
    }
    try {
      const pk = JSON.parse(d.kv.getString(PARKED_KEY) ?? '[]') as Array<{ id?: string; at?: number; raw?: string }>;
      for (const p of Array.isArray(pk) ? pk : [pk]) if (p.raw) out.set(`dev:${d.name}:parked:${p.id ?? `p${p.at}-0`}`, { key: keyOf(p.raw) });
    } catch {
      /* 깨진 칸 */
    }
  }
  for (const u of w.srv.dump()) {
    if (u.save) out.set(`srv:${u.id}:save`, { key: keyOf(u.save.body) });
    u.conflicts.forEach((c, i) => out.set(`srv:${u.id}:conf:${i}:${c.id ?? ''}`, { key: keyOf(c.body) }));
  }
  return out;
}

function isAncestorOrSelf(w: World, anc: string, k: string): boolean {
  for (let x: string | undefined = k, n = 0; x !== undefined && n < 10_000; x = w.parent.get(x), n++) if (x === anc) return true;
  return false;
}

/** ①덮임: 서버 본이 바뀐 사용자마다 옛 본이 후손·conflict 칸·사용자 선택 중 하나로 설명되어야 한다 */
function checkOverwrite(w: World, act: Act) {
  for (const u of w.srv.dump()) {
    const now = u.save ? keyOf(u.save.body) : null;
    const prev = w.srvSave.get(u.id);
    if (now === null) continue;
    w.srvSave.set(u.id, now);
    if (prev === undefined || prev === now || isAncestorOrSelf(w, prev, now)) continue;
    if (u.conflicts.some((c) => keyOf(c.body) === prev)) continue;
    const chooser = w.devs.find((d) => d.mayReplace && d.kv.getString(SAVE_KEYS.main) !== undefined && keyOf(d.kv.getString(SAVE_KEYS.main)!) === now);
    if (chooser) continue;
    violate(w, '①덮임', `서버 본 ${prev} 가 사용자 선택 없이 ${now} 로 덮임(conflict 칸에도 없음, 사건 ${JSON.stringify(act)})`);
  }
  // 고른 본이 서버에 올라갔으면 허락은 끝
  for (const d of w.devs) {
    const body = w.srv.peek(d.name)?.save?.body;
    const main = d.kv.getString(SAVE_KEYS.main);
    if (d.mayReplace && body && main && keyOf(body) === keyOf(main)) d.mayReplace = false;
  }
}

/** 자리마다 그 자리가 덮는 본들(자기 + 조상) */
function coverage(w: World, locs: Map<string, Loc>): Map<string, string[]> {
  const cov = new Map<string, string[]>();
  for (const [where, { key }] of locs) {
    for (let k: string | undefined = key, n = 0; k !== undefined && n < 10_000; k = w.parent.get(k), n++) {
      const list = cov.get(k) ?? [];
      list.push(where);
      cov.set(k, list);
    }
  }
  return cov;
}

function checkLoss(w: World, before: Map<string, Loc>, after: Map<string, Loc>, act: Act) {
  const covBefore = coverage(w, before);
  const covAfter = coverage(w, after);
  for (const { key } of after.values()) w.tracked.add(key);
  for (const key of [...w.tracked]) {
    if (covAfter.has(key)) continue;
    const where = covBefore.get(key) ?? [];
    if (where.every((k) => excusedLoc(w, k))) {
      w.tracked.delete(key); // 사용자가 지운 자리에만 있던 본
      continue;
    }
    violate(w, '①유실', `본 ${key} 와 그 후손이 모두 사라짐(사건 ${JSON.stringify(act)}). 있던 곳: ${where.join(' ') || '(없음)'}`);
    w.tracked.delete(key);
  }
  // 기기 칸(preRestore·parked)은 사용자가 비우지 않으면 사라지지 않는다 — 시계를 어떻게 돌려도(③)
  for (const k of before.keys()) {
    if (!/^dev:[A-Z]:(pre|parked:)/.test(k) || after.has(k) || excusedLoc(w, k)) continue;
    violate(w, '①칸', `기기 칸 ${k} 가 사용자 비우기 없이 사라짐(사건 ${JSON.stringify(act)})`);
  }
}
function excusedLoc(w: World, k: string): boolean {
  if (w.excused.has(k)) return true;
  const m = /^srv:([^:]+):/.exec(k);
  if (m !== null && w.excused.has(`srv:${m[1]}`)) return true;
  // 설계 예외: 서버 conflict 칸은 최대 3벌 — 가득 찬 채 새 칸이 들어와 밀려난 것
  const c = /^srv:([^:]+):conf:/.exec(k);
  return c !== null && (w.srv.dump().find((u) => u.id === c[1])?.conflicts.length ?? 0) >= 3;
}

// ── 화면(useCloud.send와 같은 규칙) ──
function send(w: World, d: Dev, ev: CloudEvent) {
  const prev = d.view;
  let next = reduce(prev, ev);
  if (next === prev) return;
  if (next.v === 'on' && !readRecord(d.kv)) next = { v: 'intro' };
  if (prev.v === 'code' && next.v !== 'code') markCodeConfirmed(d.kv);
  if ((prev.v === 'moved' || prev.v === 'deleted') && next.v === 'intro') writeRecord(d.kv, null);
  d.view = next;
  if (next.v === 'code' && prev.v !== 'code') {
    // 글귀를 받는 순간: 사용자가 공책에 적는다. 그 글귀가 가리키는 몽망이 = 지금 이 로그인의 몽망이
    const c16 = normalizeRecoveryCode(next.code);
    const cur = w.srv.peek(d.name)?.creature;
    if (c16 && cur) {
      w.codebook.set(c16, cur);
      w.notebook.push(c16);
    }
  }
  startIfBusy(w, d);
}

function startIfBusy(w: World, d: Dev) {
  const v = d.view;
  if (v.v !== 'busy' || (d.pending && d.pending.task === v.task)) return;
  const p: Pending = { task: v.task, started: w.t, settled: false, rec0: readRecord(d.kv), marker0: readUnconfirmedDelete(d.kv) };
  d.pending = p;
  w.stats.tasks[v.task.t] = (w.stats.tasks[v.task.t] ?? 0) + 1;
  void runTask(v.task, d.deps).then((r) => {
    p.settled = true;
    p.result = r;
  });
}

/** 끝난 작업을 화면에 넘기고 ② 판정. 느림 표시도 여기서 */
function settle(w: World) {
  for (let loop = 0; loop < 50; loop++) {
    let any = false;
    for (const d of w.devs) {
      const p = d.pending;
      if (!p) continue;
      if (!p.settled) {
        if (w.t - p.started >= SLOW_MS && d.view.v === 'busy' && !d.view.slow) send(w, d, { e: 'slow' });
        continue;
      }
      any = true;
      d.pending = null;
      const r = p.result!;
      w.settledNow.push(`${d.name}:${p.task.t}:${r.r}`);
      if (p.task.t === 'takeParked' && r.r === 'synced') d.mayReplace = true;
      w.stats.results[r.r] = (w.stats.results[r.r] ?? 0) + 1;
      judge(w, d, p, r);
      send(w, d, { e: 'done', result: r });
    }
    if (!any) return;
  }
}

function judge(w: World, d: Dev, p: Pending, r: TaskResult) {
  const users = w.srv.dump();
  const has = (creature: string | null | undefined) => !!creature && users.some((u) => u.creature === creature);
  if (r.r === 'deleted' || r.r === 'ended') {
    const creature = p.task.t === 'retryForgotten' ? p.marker0?.creature : p.rec0?.creature;
    if (has(creature)) violate(w, '②거짓안내', `${d.name}: '${r.r}'라 했는데 서버에 몽망이 ${creature} 가 남음(작업 ${p.task.t})`);
  }
  if (r.r === 'already') {
    const target = p.task.t === 'recover' ? p.task.target : null;
    const cur = w.srv.peek(d.name)?.creature;
    if (!target || cur !== target) violate(w, '②거짓안내', `${d.name}: '이미 되찾음'인데 지금 로그인 몽망이 ${cur} ≠ 대상 ${target}`);
  }
  if (r.r === 'recovered' && p.task.t === 'recover') {
    const want = w.codebook.get(p.task.code);
    const cur = w.srv.peek(d.name)?.creature;
    if (!want || cur !== want) violate(w, '②거짓안내', `${d.name}: '되찾음'인데 지금 로그인 몽망이 ${cur} ≠ 글귀의 몽망이 ${want}`);
  }
}

/** 보기에 맞는 화면 선택지. r로 하나 고른다 */
function uiOptions(w: World, d: Dev): Array<() => void> {
  const v = d.view;
  const s = (ev: CloudEvent) => () => send(w, d, ev);
  const pre = readPreRestore(d.kv, d.deps.now());
  const parked = readParkedList(d.kv, d.deps.now());
  const rec = readRecord(d.kv);
  const um = readUnconfirmedDelete(d.kv);
  const start = (purpose: 'enable' | 'recover') => () => {
    for (const ev of startEvents(purpose, { kind: 'passed' }, um?.abandoned === false)) send(w, d, ev);
  };
  // 같은 선택지를 여러 번 넣어 무게를 준다(깊은 길 — 되찾기·나란히 고르기·칸 — 이 자주 나오게)
  const x = <T>(n: number, f: T): T[] => Array.from({ length: n }, () => f);
  const extra: Array<() => void> = [];
  if (pre) extra.push(...x(2, s({ e: 'askRevert', now: null, before: null })));
  for (const p of parked) extra.push(...x(2, s({ e: 'openParked', slot: p.id })));
  switch (v.v) {
    case 'intro':
      return [start('enable'), ...x(w.notebook.length ? 3 : 1, start('recover')), ...(um && !um.abandoned ? [s({ e: 'retryForgotten' })] : []), ...(um ? [s({ e: 'askDismissOld' })] : []), ...extra];
    case 'recoverInput': {
      const opts: Array<() => void> = [s({ e: 'back' })];
      const codes = w.notebook.slice(-4);
      codes.forEach((c, i) => {
        const creature = w.codebook.get(c);
        const n = i === codes.length - 1 ? 4 : 1; // 가장 최근 글귀를 주로
        opts.push(...x(n, s({ e: 'submitCode', input: c })));
        if (creature) opts.push(...x(n, s({ e: 'submitCode', input: c, seal: creature })));
      });
      if (rec?.creature && codes.length) opts.push(s({ e: 'submitCode', input: codes[codes.length - 1]!, seal: rec.creature }));
      opts.push(s({ e: 'submitCode', input: 'ABCD-EFGH-JKMN-PQRS' }));
      return opts;
    }
    case 'code':
      return v.step === 'show' ? [s({ e: 'codeWritten' })] : [s({ e: 'codeCheck', input: v.code.slice(-4) }), s({ e: 'codeAgain' })];
    case 'choose':
      if (v.confirming) return [s({ e: 'confirmPick' }), s({ e: 'back' })];
      return [
        () => (send(w, d, { e: 'pick', side: 'local' }), send(w, d, { e: 'confirmPick' })),
        () => (send(w, d, { e: 'pick', side: 'server' }), send(w, d, { e: 'confirmPick' })),
        s({ e: 'back' }),
        ...(v.why === 'parked' && v.pick.slot ? [s({ e: 'askDropParked', slot: v.pick.slot })] : []),
      ];
    case 'on':
      return [
        ...x(3, s({ e: 'syncNow' })),
        ...x(rec?.conflict ? 3 : 1, s({ e: 'resolve' })),
        s({ e: 'reissue' }),
        () => send(w, d, { e: 'askDelete', token: deleteToken(rec) }),
        ...(um ? [s({ e: 'askDismissOld' })] : []),
        ...extra,
      ];
    case 'deleteConfirm':
      return [s({ e: 'confirmDelete', input: v.token }), s({ e: 'back' }), s({ e: 'confirmDelete', input: 'ZZZZ' })];
    case 'failed':
      return [s({ e: 'retry' }), s({ e: 'retry' }), s({ e: 'back' })];
    case 'deleteCheck':
      return [s({ e: 'retry' }), s({ e: 'forget' })];
    case 'parkFull':
      return [...parked.map((p) => s({ e: 'askDropParked', slot: p.id })), s({ e: 'continue' })];
    case 'oldAccount':
      return [s({ e: 'retryOld' }), s({ e: 'skipOld' }), s({ e: 'back' })];
    case 'oldCleared':
      return [s({ e: 'proceedOld' })];
    case 'dismissOldConfirm':
    case 'dropParkedConfirm':
    case 'dropPreConfirm':
      return [s({ e: v.v === 'dismissOldConfirm' ? 'confirmDismissOld' : v.v === 'dropParkedConfirm' ? 'confirmDropParked' : 'confirmDropPre' }), s({ e: 'back' })];
    case 'revertConfirm':
      return [s({ e: 'confirmRevert' }), s({ e: 'askDropPre' }), s({ e: 'back' })];
    case 'moved':
    case 'deleted':
      return [s({ e: 'restart' }), ...extra];
    case 'already':
    case 'reverted':
    case 'forgotten':
    case 'ended':
    case 'orphaned':
      return [s({ e: 'continue' })];
    case 'age':
      return [s({ e: 'age', ok: true })];
    case 'ageUnder':
      return [s({ e: 'back' })];
    case 'busy':
      return [];
  }
}

const pickOf = <T>(arr: readonly T[], r: number): T | undefined => arr[Math.min(arr.length - 1, Math.floor(r * arr.length))];
const DELAYS = [0, 0, 0, 300, 4_900, 5_100, 12_000, 20_000, 30_000];

/** 사건 하나를 돌리고 불변식을 본다 */
export async function apply(w: World, act: Act): Promise<void> {
  w.excused = new Set();
  w.settledNow = [];
  const before = locations(w);
  const dev = (i: number) => w.devs[i % w.devs.length]!;
  switch (act[0]) {
    case 'ui': {
      const d = dev(act[1]);
      const opts = uiOptions(w, d);
      const f = pickOf(opts, act[2]);
      // 사용자가 직접 비우는 확인(칸·서버 지우기)은 그 자리를 ①에서 뺀다
      if (d.view.v === 'dropParkedConfirm') w.excused.add(`dev:${d.name}:parked:${d.view.slot}`);
      if (d.view.v === 'dropPreConfirm') w.excused.add(`dev:${d.name}:pre`);
      f?.();
      break;
    }
    case 'play': {
      const d = dev(act[1]);
      const raw = d.kv.getString(SAVE_KEYS.main);
      if (raw) {
        const next = playOnce(raw, d.deps.now(), ++w.plays);
        w.parent.set(keyOf(next), keyOf(raw));
        d.kv.set(SAVE_KEYS.main, next);
      }
      break;
    }
    case 'tick': {
      w.t += act[1];
      await vi.advanceTimersByTimeAsync(act[1]);
      break;
    }
    case 'clock':
      dev(act[1]).skew += act[2];
      break;
    case 'net': {
      const f = w.srv.faults;
      const k = act[1] % 6;
      if (k === 0) f.offline = act[2] < 0.5;
      else if (k === 1) f.delayMs = pickOf(DELAYS, act[2])!;
      else if (k === 2) f.delayAfterMs = pickOf(DELAYS, act[2])!;
      else if (k === 3) f.dropAfterCommit = true;
      else if (k === 4) f.failNext = pickOf([{ status: 500, code: 'internal' }, { status: 503, code: 'unavailable' }, { status: 429, code: 'rate_limited' }, { status: 401, code: 'unauthorized' }, { status: 502, code: 'bad_gateway' }], act[2])!;
      else Object.assign(f, { offline: false, delayMs: 0, delayAfterMs: 0, dropAfterCommit: false, failNext: null });
      break;
    }
    case 'expire':
      w.srv.expireSession(dev(act[1]).name);
      break;
    case 'clone': {
      if (w.devs.length >= MAX_DEVS) break;
      // OS 백업 복원: 세이브·맡겨 두기 기록·칸은 따라오고, 세션(백업 제외)은 없다 → 새 기기 이름 = 새 세션 없음
      const src = dev(act[1]);
      const name = String.fromCharCode(65 + w.devs.length);
      if (act[2] === 1) w.srv.copySession(src.name, name);
      const d = addDevice(w, memKV(src.kv.m));
      d.view = initialView(readRecord(d.kv));
      break;
    }
    case 'ping': {
      const d = dev(act[1]);
      const ctx = pingCtx(d.deps.now());
      // 켜기 / 끄기(보내는 중이어도) / 열기 기록 / 공유 기록 / 보내기 / 보내기 시작 직후 끄기(첫 요청이 나간 사이 — C11 리뷰 M1).
      // 기록과 보내기를 떼어 두어 여러 날·여러 차원 묶음이 쌓인 뒤 보내기 한 번에 핑이 여럿 나가게 한다
      const k = Math.floor(act[2] * 6);
      const flush = () => {
        if (!ctx || d.flushing) return;
        const p = d.ping.flush(ctx).finally(() => {
          if (d.flushing === p) d.flushing = null;
        });
        d.flushing = p;
      };
      if (k === 0) setMetricsOn(d.kv, true);
      else if (k === 1) setMetricsOn(d.kv, false);
      else if (k === 2 && ctx) d.ping.recordOpen(ctx);
      else if (k === 3 && ctx) d.ping.track('share_link', ctx);
      else if (k === 4) flush();
      else {
        flush();
        setMetricsOn(d.kv, false);
      }
      break;
    }
    case 'ev':
      send(w, dev(act[1]), act[2]);
      break;
    case 'reopen': {
      const d = dev(act[1]);
      if (d.view.v !== 'busy' && d.view.v !== 'code') d.view = initialView(readRecord(d.kv));
      break;
    }
  }
  await vi.advanceTimersByTimeAsync(0);
  // DELETE /me는 사용자가 고른 작업에서만 나간다(checkCloudRequest가 본다) → 그 작업이 지운 서버 사용자는 ①에서 뺀다
  const usersNow = new Set(w.srv.dump().map((u) => u.id));
  for (const k of before.keys()) {
    const m = /^srv:([^:]+):/.exec(k);
    if (m && !usersNow.has(m[1]!)) w.excused.add(`srv:${m[1]}`);
  }
  // 칸 비우기 작업이 이번 사건 안에 끝났으면 그 칸도 뺀다
  for (const d of w.devs) {
    const p = d.pending;
    if (p?.settled && p.result?.r === 'parkedDropped') {
      if (p.task.t === 'dropParked') w.excused.add(`dev:${d.name}:parked:${p.task.slot}`);
      if (p.task.t === 'dropPre') w.excused.add(`dev:${d.name}:pre`);
    }
  }
  settle(w);
  await vi.advanceTimersByTimeAsync(0);
  settle(w);
  checkLoss(w, before, locations(w), act);
  checkOverwrite(w, act);
  w.step++;
}

/** 남은 작업·핑을 모두 끝낸다(네트워크를 고친 뒤) */
export async function drain(w: World): Promise<void> {
  await apply(w, ['net', 5, 0]);
  for (let i = 0; i < 40 && w.devs.some((d) => d.pending !== null || d.flushing !== null); i++) await apply(w, ['tick', 5_000]);
}

/** 시드 → 사건 열. profile 'ping' = 통계 전용(핑·시계·시간·끊김·지연만 — ④⑤를 촘촘히) */
export function genActs(seed: number, n: number, profile: 'all' | 'ping' = 'all'): Act[] {
  const r = prng(seed);
  const acts: Act[] = [];
  const dev = () => Math.floor(r() * 4);
  if (profile === 'ping') {
    for (let i = 0; i < n; i++) {
      const x = r();
      if (x < 0.55) acts.push(['ping', dev(), r()]);
      else if (x < 0.7) acts.push(['clock', dev(), pickOf([-DAY, DAY, DAY, 2 * DAY, 8 * DAY], r())!]);
      else if (x < 0.82) acts.push(['tick', pickOf([0, 200, 6_000, 12_000, 3_600_000, DAY], r())!]);
      else if (x < 0.9) acts.push(['net', 0, r() < 0.4 ? 0.1 : 0.9]);
      else acts.push(['net', 1, r()]);
    }
    return acts;
  }
  for (let i = 0; i < n; i++) {
    const x = r();
    if (x < 0.5) acts.push(['ui', dev(), r()]);
    else if (x < 0.6) acts.push(['play', dev()]);
    else if (x < 0.7) acts.push(['tick', pickOf([200, 1_000, 4_000, 6_000, 16_000, 31_000, 3_600_000], r())!]);
    else if (x < 0.8) {
      // 고장은 오래 머물지 않게: 끊김 켜기 15%·끄기 25%, 지연 25%, 커밋 뒤 끊김 10%, 상태 코드 하나 10%, 모두 고침 15%
      const y = r();
      if (y < 0.15) acts.push(['net', 0, 0.1]);
      else if (y < 0.4) acts.push(['net', 0, 0.9]);
      else if (y < 0.55) acts.push(['net', 1, r()]);
      else if (y < 0.65) acts.push(['net', 2, r()]);
      else if (y < 0.75) acts.push(['net', 3, 0]);
      else if (y < 0.85) acts.push(['net', 4, r()]);
      else acts.push(['net', 5, 0]);
    }
    else if (x < 0.84) acts.push(['clock', dev(), pickOf([-40 * DAY, -DAY, DAY, 31 * DAY, 400 * DAY], r())!]);
    else if (x < 0.87) acts.push(['expire', dev()]);
    else if (x < 0.88) acts.push(['clone', dev(), r() < 0.5 ? 1 : 0]);
    else if (x < 0.97) acts.push(['ping', dev(), r()]);
    else acts.push(['reopen', dev()]);
  }
  return acts;
}

/** 사건 열 하나를 처음부터 돌린다 → 불변식 위반 목록 */
export async function runActs(seed: number, acts: readonly Act[]): Promise<{ violations: Violation[]; world: World }> {
  const w = createWorld(seed);
  try {
    for (const a of acts) await apply(w, a);
    await drain(w);
  } catch (e) {
    violate(w, '실행', String((e as Error)?.stack ?? e));
  } finally {
    disposeWorld();
  }
  return { violations: w.violations, world: w };
}

/** 실패 열 줄이기(델타 디버깅 — 덩어리를 빼도 같은 규칙이 깨지면 뺀다) */
export async function shrink(seed: number, acts: Act[], rule: Violation['rule']): Promise<Act[]> {
  // (profile과 무관 — 열 자체를 줄인다)
  const fails = async (a: Act[]) => (await runActs(seed, a)).violations.some((v) => v.rule === rule);
  let cur = acts;
  for (let chunk = Math.ceil(cur.length / 2); chunk >= 1; chunk = Math.floor(chunk / 2)) {
    for (let i = 0; i < cur.length; ) {
      const cand = [...cur.slice(0, i), ...cur.slice(i + chunk)];
      if (cand.length < cur.length && (await fails(cand))) cur = cand;
      else i += chunk;
    }
  }
  return cur;
}

/**
 * 운영 코드에서 찾은 실제 결함(고치지 않고 보고 — C13 원칙). 무작위 시험은 이 모양의 위반을 '알려진 결함'으로 세고 넘어가
 * 다른 결함을 계속 찾는다. 결함이 고쳐지면 c13-sync-property.test.ts의 it.fails 재현이 '통과'로 바뀌어 빨개진다 → 그때 여기서 지운다.
 */
export const KNOWN_DEFECTS: ReadonlyArray<{ id: string; what: string; match: (v: Violation) => boolean }> = [
  {
    id: 'D1',
    what: "되돌리기(맞바꾸기)로 preRestore 칸에 들어간 본(서버·다른 칸 어디에도 없음)을 다음 '서버 본으로 이어 가기'(takeServer)의 keepPreRestore가 덮어 잃는다",
    match: (v) => v.rule === '①유실' && /있던 곳: dev:[A-Z]:pre$/.test(v.msg) && v.settled.some((x) => /:takeServer:synced$/.test(x)),
  },
];

export function splitKnown(vs: readonly Violation[]): { known: Record<string, number>; unknown: Violation[] } {
  const known: Record<string, number> = {};
  const unknown: Violation[] = [];
  for (const v of vs) {
    const k = KNOWN_DEFECTS.find((d) => d.match(v));
    if (k) known[k.id] = (known[k.id] ?? 0) + 1;
    else unknown.push(v);
  }
  return { known, unknown };
}
