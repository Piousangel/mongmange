// C13 무작위 시나리오 시험(정본 Q9 기기 이동·충돌, Q5 느린 서버). 세계·불변식은 test/support/c13World.ts.
// 기본 반복은 CI 30초 안(이 파일 약 6초). 긴 반복: C13_RUNS=5000 C13_LEN=120 pnpm --filter mobile exec vitest run test/c13-sync-property.test.ts
// 시드 하나만: C13_SEED=1234 C13_RUNS=1. 실패하면 줄인 사건 열을 찍는다 → 아래 REGRESSIONS에 고정으로 옮긴다.
// 알려진 운영 결함(KNOWN_DEFECTS — 고치지 않고 보고한 것)과 같은 모양의 위반은 세기만 하고 넘어간다. 결함이 고쳐지면 아래 it.fails가 빨개진다.
import { SAVE_KEYS } from '@mong/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { CloudEvent } from '../src/cloud/model';
import { PRE_RESTORE_KEY, readRecord } from '../src/cloud/record';
import { apply, createWorld, disposeWorld, genActs, keyOf, runActs, shrink, splitKnown, type Act, type Violation, type World } from './support/c13World';

const RUNS = Number(process.env.C13_RUNS ?? 500);
const LEN = Number(process.env.C13_LEN ?? 80);
const BASE = Number(process.env.C13_SEED ?? 1);

describe('C13 무작위 사건 열 — 불변식 ①~⑤', () => {
  it(`시드 ${BASE}~${BASE + RUNS - 1}, 사건 ${LEN}개씩`, async () => {
    const fails: Array<{ seed: number; v: Violation }> = [];
    const results: Record<string, number> = {};
    const tasks: Record<string, number> = {};
    const known: Record<string, number> = {};
    let pings = 0;
    for (let seed = BASE; seed < BASE + RUNS; seed++) {
      const { violations, world } = await runActs(seed, genActs(seed, LEN));
      for (const [k, n] of Object.entries(world.stats.results)) results[k] = (results[k] ?? 0) + n;
      for (const [k, n] of Object.entries(world.stats.tasks)) tasks[k] = (tasks[k] ?? 0) + n;
      pings += world.pings.length;
      const sp = splitKnown(violations);
      for (const [k, n] of Object.entries(sp.known)) known[k] = (known[k] ?? 0) + n;
      if (sp.unknown.length) {
        fails.push({ seed, v: sp.unknown[0]! });
        if (fails.length >= 3) break;
      }
    }
    if (process.env.C13_STATS) console.log(JSON.stringify({ known, pings, results, tasks }));
    if (fails.length) {
      const f = fails[0]!;
      const min = await shrink(f.seed, genActs(f.seed, LEN), f.v.rule);
      const again = await runActs(f.seed, min);
      throw new Error(`불변식 위반 ${fails.length}건. 첫 시드 ${f.seed}: ${f.v.rule} ${f.v.msg}\n줄인 사건 열(${min.length}개, 시드 ${f.seed}):\n${JSON.stringify(min)}\n줄인 열의 위반: ${again.violations[0]?.msg}`);
    }
    // 헛도는 무작위 시험 막기: 위험한 길을 실제로 지났는가(기본 반복에서 늘 나오는 결과·작업)
    if (RUNS >= 300) {
      for (const r of ['compare', 'conflict', 'synced', 'recovered', 'deleted', 'moved', 'orphaned', 'failed', 'reverted', 'deleteUnknown', 'forgotten']) expect(results[r] ?? 0, `결과 ${r}`).toBeGreaterThan(0);
      for (const t of ['keepLocal', 'takeServer', 'takeParked', 'retryForgotten', 'revert', 'dropPre']) expect(tasks[t] ?? 0, `작업 ${t}`).toBeGreaterThan(0);
      expect(pings, '닿은 핑').toBeGreaterThan(0);
    }
  }, 120_000);
});

describe('C13 무작위 — 통계 전용(④ 끈 뒤 요청 0, ⑤ 핑 식별자 0)', () => {
  const N = Number(process.env.C13_PING_RUNS ?? 300);
  it(`시드 1~${N}, 사건 60개씩(핑·시계·끊김·지연)`, async () => {
    let pings = 0;
    for (let seed = 1; seed <= N; seed++) {
      const acts = genActs(seed, 60, 'ping');
      const { violations, world } = await runActs(seed, acts);
      pings += world.pings.length;
      if (violations.length) {
        const min = await shrink(seed, acts, violations[0]!.rule);
        throw new Error(`시드 ${seed}: ${violations[0]!.rule} ${violations[0]!.msg}\n줄인 사건 열(${min.length}개):\n${JSON.stringify(min)}`);
      }
    }
    expect(pings).toBeGreaterThan(N / 2); // 실제로 핑이 오갔다
  }, 60_000);
});

/**
 * 줄인 사건 열(고정). 운영 코드에 일부러 넣은 결함(C13 변이 시험) 하나씩을 무작위 시험이 찾아 줄인 최소 재현이다 — 지금 코드에서는 위반 0.
 * 사건 r 값은 c13World의 선택지 표에 묶여 있다: 선택지 표·무게를 바꾸면 이 열의 뜻이 달라지므로 변이를 다시 넣어 다시 줄인다.
 */
const REGRESSIONS: Array<{ name: string; seed: number; acts: Act[] }> = [
  {
    name: 'M1 충돌 시 서버 본 덮기 — 세션까지 따라온 백업 복원 기기와 번갈아 맡기기(시드 17, ①덮임)',
    seed: 17,
    acts: [['ui', 3, 0.28212139988318086], ['play', 1], ['ui', 1, 0.6911484354641289], ['clone', 1, 1], ['play', 2], ['ui', 2, 0.410296329529956], ['ui', 1, 0.3681960680987686], ['ui', 1, 0.034513992723077536]],
  },
  {
    name: 'M2 만료 칸 자동 삭제 — 되찾기 뒤 parked 칸, 시계 +400일(시드 64, ①칸·③)',
    seed: 64,
    acts: [['clone', 3, 0], ['ui', 3, 0.6557798450812697], ['ui', 2, 0.0356529348064214], ['net', 3, 0], ['ui', 0, 0.2614604460541159], ['ui', 3, 0.21338811330497265], ['ui', 0, 0.23082115384750068], ['ui', 0, 0.20544790010899305], ['clock', 3, 34560000000], ['ui', 0, 0.9648138557095081]],
  },
  {
    name: 'M3 끈 뒤 아웃박스 전송 — 이틀 치 두 묶음, 보내기 시작 직후 끄기(시드 1, ④)',
    seed: 1,
    acts: [['ping', 0, 0.042729709995910525], ['ping', 0, 0.6581296445801854], ['tick', 86400000], ['ping', 2, 0.5763414488174021], ['ping', 2, 0.9488812151830643]],
  },
  {
    name: "M4 시간 초과를 '지웠어요'로 — 지연 20초 중 지우기(시드 84, ②)",
    seed: 84,
    acts: [['ui', 0, 0.41093718400225043], ['clone', 1, 1], ['net', 1, 0.871317540993914], ['ui', 3, 0.3709227947983891], ['ui', 3, 0.029742904705926776], ['ui', 3, 0.8493605516850948], ['ui', 3, 0.14595036953687668]],
  },
];

describe('C13 고정 사건 열(변이를 잡던 줄인 재현)', () => {
  for (const r of REGRESSIONS)
    it(r.name, async () => {
      const { violations } = await runActs(r.seed, r.acts);
      expect(violations).toEqual([]);
    });
});

describe('C13 알려진 운영 결함 재현(고치면 이 시험이 빨개진다 → it.fails를 it으로 바꾸고 KNOWN_DEFECTS에서 지운다)', () => {
  afterEach(() => disposeWorld());

  async function ev(w: World, i: number, e: CloudEvent) {
    await apply(w, ['ev', i, e]);
  }

  // D1 — 시드 58(사건 80개, 줄인 열 15개)에서 처음 찾음. 아래는 같은 흐름을 화면 사건으로 그대로 적은 것
  it.fails('D1: 되돌리기로 preRestore 칸에 들어간 본을 다음 takeServer가 덮어 잃는다', async () => {
    const w = createWorld(58, 2);
    // B: 켜기 → 글귀
    await ev(w, 1, { e: 'start', purpose: 'enable' });
    await ev(w, 1, { e: 'age', ok: true });
    const code = w.devs[1]!.view;
    if (code.v !== 'code') throw new Error('켜기 실패');
    await ev(w, 1, { e: 'codeWritten' });
    await ev(w, 1, { e: 'codeCheck', input: code.code.slice(-4) });
    // A: B의 글귀로 되찾기 → 나란히 → '서버 본' 고름(A 본은 서버 conflict 칸 + preRestore)
    await ev(w, 0, { e: 'start', purpose: 'recover' });
    await ev(w, 0, { e: 'age', ok: true });
    await ev(w, 0, { e: 'submitCode', input: code.code });
    const c2 = w.devs[0]!.view;
    if (c2.v !== 'code') throw new Error('되찾기 실패');
    await ev(w, 0, { e: 'codeWritten' });
    await ev(w, 0, { e: 'codeCheck', input: c2.code.slice(-4) });
    await ev(w, 0, { e: 'pick', side: 'server' });
    await ev(w, 0, { e: 'confirmPick' });
    await ev(w, 0, { e: 'confirmPick' });
    expect(w.devs[0]!.view).toEqual({ v: 'on' });
    // A가 하루 키움(서버 본에서 이어 키운 본 S') → '바꾸기 전으로 되돌리기'(맞바꾸기: S'는 preRestore 칸으로)
    await apply(w, ['play', 0]);
    const grown = w.devs[0]!.kv.getString(SAVE_KEYS.main)!;
    await ev(w, 0, { e: 'askRevert', now: null, before: null });
    await ev(w, 0, { e: 'confirmRevert' });
    expect(JSON.parse(w.devs[0]!.kv.getString(PRE_RESTORE_KEY)!).raw).toBe(grown);
    expect(readRecord(w.devs[0]!.kv)!.conflict).toBe(true); // 다음 맡기기 전에 나란히 고르기
    // 켜짐 화면 '다시 고르기' → 이번에도 '서버 본'(S — S'의 조상). S'는 서버에 올라간 적이 없다
    await ev(w, 0, { e: 'continue' });
    await ev(w, 0, { e: 'resolve' });
    await ev(w, 0, { e: 'pick', side: 'server' });
    await ev(w, 0, { e: 'confirmPick' });
    await ev(w, 0, { e: 'confirmPick' });
    // S'는 어디에도 없다: 기기 본(S), preRestore(되돌리기 전 A 본), 서버 본(S), 서버 conflict 칸(A 본 두 번)
    const everywhere = [w.devs[0]!, w.devs[1]!].flatMap((d) => [d.kv.getString(SAVE_KEYS.main), JSON.parse(d.kv.getString(PRE_RESTORE_KEY) ?? 'null')?.raw]).concat(w.srv.dump().flatMap((u) => [u.save?.body, ...u.conflicts.map((c) => c.body)]));
    expect(everywhere.filter((x): x is string => !!x).map(keyOf)).toContain(keyOf(grown)); // ← 지금은 여기서 실패(결함)
    expect(w.violations.filter((v) => v.rule === '①유실')).toEqual([]);
  });
});
