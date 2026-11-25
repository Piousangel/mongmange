// 맡겨 두기 가짜 서버(시험 + 웹 확인판 ?screen=cloud 전용 — 제품 경로에서 부르지 않는다).
// 규칙은 apps/server/src/{account,saves} 컨트롤러와 architecture 3-4-1 표를 줄여 옮겼다: rev·sha 전제 조건, 같은 sha 빨리 감기,
// 행 없음 + If-Match → 409 {server:null}, keep_mine → 덮인 본 conflict 칸, 되찾기 → 옛 로그인 410, 글귀 재발급 → 옛 글귀 무효.
// 고장 흉내: offline(연결 실패), delayMs(느린 서버), dropAfterCommit(커밋 뒤 응답 끊김 = 반쯤 성공), failNext(상태 코드 하나).
import { formatRecoveryCode, normalizeRecoveryCode, RECOVERY_ALPHABET, type SaveMeta } from '@mong/contract';
import type { FetchLike } from '../net/http';
import type { CloudAuth } from './api';

interface Row {
  /** 이력 행 id(conflict·pre_restore 칸) */
  id?: string;
  rev: number;
  sha: string;
  body: string;
  clientSavedAt: string;
}
interface User {
  creature: string;
  code16: string | null;
  save: Row | null;
  conflicts: Row[];
}

export interface FakeFaults {
  offline: boolean;
  delayMs: number;
  /** 다음 한 번: 서버는 처리하고 응답은 끊는다(timeout으로 보임) */
  dropAfterCommit: boolean;
  /** 다음 한 번: 이 상태 코드로 실패 */
  failNext: { status: number; code: string } | null;
}

export interface FakeServer {
  fetch: FetchLike;
  faults: FakeFaults;
  /** 이 기기의 로그인(가짜 익명 세션) */
  authFor(device: string): CloudAuth;
  /** 다른 기기가 올린 것처럼 서버 본을 바꾼다(충돌 만들기) */
  putFromElsewhere(device: string, body: string): Promise<void>;
  peek(device: string): { save: Row | null; conflicts: Row[]; code16: string | null } | null;
  /** 요청 기록(메서드 경로) */
  log: string[];
  /** 이 기기의 지금 토큰을 만료시킨다(refresh 전까지 401) */
  expireSession(device: string): void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createFakeServer(sha256: (s: string) => Promise<string>, seed = 1): FakeServer {
  const users = new Map<string, User>();
  /** token → userId. revoked면 410 */
  const tokens = new Map<string, { user: string | null; revoked: boolean; expired?: boolean }>();
  const sessions = new Map<string, string>();
  let n = seed;
  const rnd = () => {
    n = (Math.imul(n, 1103515245) + 12345) & 0x7fffffff;
    return n;
  };
  const uuid = () => {
    const h = () => ((rnd() >> 8) & 0xffff).toString(16).padStart(4, '0');
    return `${h()}${h()}-${h()}-4${h().slice(1)}-8${h().slice(1)}-${h()}${h()}${h()}`;
  };
  const newCode16 = () => Array.from({ length: 16 }, () => RECOVERY_ALPHABET[(rnd() >> 16) % 32]).join('');
  const faults: FakeFaults = { offline: false, delayMs: 0, dropAfterCommit: false, failNext: null };
  const log: string[] = [];

  const res = (status: number, body: unknown = '') => ({ ok: status >= 200 && status < 300, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
  const err = (status: number, code: string, details?: unknown) => res(status, { error: { code, message: code, ...(details !== undefined ? { details } : {}) } });
  const meta = (r: Row): SaveMeta => ({ rev: r.rev, sha: r.sha, clientSavedAt: r.clientSavedAt, dayIndex: dayOf(r.body), strokesTotal: strokesOf(r.body), envelopeVer: 2, simVer: 1, validated: true });

  async function handle(method: string, path: string, headers: Record<string, string>, bodyText: string | undefined) {
    const tok = (headers.authorization ?? '').replace(/^Bearer /, '');
    const sess = tokens.get(tok);
    if (!sess || sess.expired) return err(401, 'unauthorized');
    if (sess.revoked) return err(410, 'moved');
    const body = bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : {};
    const user = sess.user ? users.get(sess.user) ?? null : null;
    const route = `${method} ${path}`;
    if (route === 'POST me/bootstrap') {
      if (!(body.ageGate as { ok?: unknown } | undefined)?.ok) return err(400, 'bad_request');
      if (!sess.user) {
        const id = `u${rnd()}`;
        users.set(id, { creature: Array.from({ length: 8 }, () => RECOVERY_ALPHABET[(rnd() >> 16) % 32]).join(''), code16: null, save: null, conflicts: [] });
        sess.user = id;
      }
      return res(200, { userId: sess.user, creature: { code: users.get(sess.user)!.creature } });
    }
    if (route === 'POST recover') {
      const code16 = normalizeRecoveryCode(String(body.code ?? ''));
      if (user) return err(409, 'has_creature');
      const hit = [...users.entries()].find(([, u]) => code16 !== null && u.code16 === code16);
      if (!hit) return err(404, 'not_found');
      for (const [t, s] of tokens) if (s.user === hit[0] && t !== tok) s.revoked = true;
      sess.user = hit[0];
      hit[1].code16 = newCode16();
      return res(200, { creature: { code: hit[1].creature }, save: hit[1].save ? meta(hit[1].save) : null, newCode: formatRecoveryCode(hit[1].code16) });
    }
    if (!user) return err(401, 'unauthorized'); // 실서버와 같은 코드: 토큰 문제와 '사용자 없음'을 구별하지 않는다
    if (route === 'POST recovery-code') {
      user.code16 = newCode16();
      return res(200, { code: formatRecoveryCode(user.code16) });
    }
    if (route === 'DELETE me') {
      users.delete(sess.user!);
      for (const s of tokens.values()) if (s.user === sess.user) s.user = null;
      return res(202, { receipt: 'r'.repeat(22) });
    }
    if (route === 'GET saves/main/meta') return user.save ? res(200, meta(user.save)) : err(404, 'no_save');
    if (route === 'GET saves/main') return user.save ? res(200, { ...meta(user.save), body: user.save.body }) : err(404, 'no_save');
    if (route === 'POST saves/main/conflicts') {
      if (!user.save) return err(404, 'no_save');
      const b = String(body.body);
      user.conflicts = [...user.conflicts, { id: uuid(), rev: user.save.rev, sha: await sha256(b), body: b, clientSavedAt: String(body.clientSavedAt) }].slice(-3);
      return res(201, { id: `c${rnd()}` });
    }
    if (route === 'PUT saves/main') {
      const b = String(body.body);
      const sha = await sha256(b);
      const cur = user.save;
      const ifMatch = headers['if-match'] !== undefined ? Number(headers['if-match']) : null;
      if (!cur) {
        if (ifMatch !== null) return err(409, 'save_conflict', { server: null });
        user.save = { rev: 1, sha, body: b, clientSavedAt: String(body.clientSavedAt) };
        return res(200, { rev: 1, sha });
      }
      if (cur.sha === sha) return res(200, { rev: cur.rev, sha });
      if (ifMatch !== cur.rev) return err(409, 'save_conflict', { server: meta(cur) });
      if (body.resolve === 'keep_mine') user.conflicts = [...user.conflicts, { ...cur, id: uuid() }].slice(-3);
      user.save = { rev: cur.rev + 1, sha, body: b, clientSavedAt: String(body.clientSavedAt) };
      return res(200, { rev: user.save.rev, sha });
    }
    if (route === 'GET saves/main/versions') {
      return res(200, user.conflicts.map((c) => ({ id: c.id, reason: 'conflict', rev: c.rev, clientSavedAt: c.clientSavedAt, dayIndex: dayOf(c.body), strokesTotal: strokesOf(c.body), validated: true, createdAt: c.clientSavedAt })));
    }
    const vm = /^(GET|POST) saves\/main\/versions\/([^/]+)(\/restore)?$/.exec(route);
    if (vm) {
      const row = user.conflicts.find((c) => c.id === vm[2]);
      if (!row) return err(404, 'not_found');
      if (!vm[3]) return res(200, { id: row.id, reason: 'conflict', rev: row.rev, clientSavedAt: row.clientSavedAt, dayIndex: dayOf(row.body), strokesTotal: strokesOf(row.body), validated: true, createdAt: row.clientSavedAt, body: row.body });
      const cur = user.save;
      if (!cur || Number(headers['if-match']) !== cur.rev) return err(409, 'save_conflict', { server: cur ? meta(cur) : null });
      user.save = { rev: cur.rev + 1, sha: row.sha, body: row.body, clientSavedAt: row.clientSavedAt };
      return res(200, { rev: user.save.rev, sha: row.sha });
    }
    return err(404, 'not_found');
  }

  const fetch: FetchLike = async (url, init = {}) => {
    const path = url.replace(/^.*\/api\/v1\//, '');
    const method = init.method ?? 'GET';
    log.push(`${method} ${path}`);
    if (faults.delayMs > 0) await sleep(faults.delayMs);
    if (init.signal?.aborted) throw new Error('aborted');
    if (faults.offline) throw new Error('network');
    if (faults.failNext) {
      const f = faults.failNext;
      faults.failNext = null;
      return err(f.status, f.code);
    }
    const r = await handle(method, path, init.headers ?? {}, init.body);
    if (faults.dropAfterCommit) {
      faults.dropAfterCommit = false;
      throw new Error('network');
    }
    return r;
  };

  return {
    fetch,
    faults,
    log,
    authFor(device) {
      return {
        async token() {
          return sessions.get(device) ?? null;
        },
        async signIn() {
          if (faults.offline) return { ok: false, failure: 'offline' };
          const t = `t${device}-${rnd()}`;
          tokens.set(t, { user: null, revoked: false });
          sessions.set(device, t);
          return { ok: true };
        },
        async signOut() {
          sessions.delete(device);
        },
        async refresh() {
          const old = sessions.get(device);
          const s = old ? tokens.get(old) : undefined;
          if (!s || faults.offline) return false;
          const t = `t${device}-${rnd()}`;
          tokens.set(t, { user: s.user, revoked: s.revoked });
          sessions.set(device, t);
          return true;
        },
      };
    },
    expireSession(device) {
      const t = sessions.get(device);
      const s = t ? tokens.get(t) : undefined;
      if (s) s.expired = true;
    },
    async putFromElsewhere(device, b) {
      const t = sessions.get(device);
      const u = t ? tokens.get(t)?.user : null;
      const user = u ? users.get(u) : null;
      if (!user) return;
      const sha = await sha256(b);
      user.save = { rev: (user.save?.rev ?? 0) + 1, sha, body: b, clientSavedAt: new Date(Date.UTC(2026, 10, 25)).toISOString() };
    },
    peek(device) {
      const t = sessions.get(device);
      const u = t ? tokens.get(t)?.user : null;
      const user = u ? users.get(u) : null;
      return user ? { save: user.save, conflicts: user.conflicts, code16: user.code16 } : null;
    },
  };
}

function dayOf(body: string): number | null {
  try {
    const o = JSON.parse(body) as { sim?: { state?: { dayIndex?: unknown } } };
    return typeof o.sim?.state?.dayIndex === 'number' ? o.sim.state.dayIndex : null;
  } catch {
    return null;
  }
}
function strokesOf(body: string): number | null {
  try {
    const o = JSON.parse(body) as { strokes?: unknown[] };
    return Array.isArray(o.strokes) ? o.strokes.length : null;
  } catch {
    return null;
  }
}
