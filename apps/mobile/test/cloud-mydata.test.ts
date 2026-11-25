// C12f '맡긴 것 보기'(처리방침 12절 열람 요구): 불러오기 갈래(가짜 서버로 실제 계약 흐름) + 표시 줄(ko·en) + 화면·진입점 소스 검사.
// 그럴듯한 오답 판별(OPERATING 8-1):
//  - 오프라인·토큰 못 받음·no_account·옮겨 감·서버 503이 한 갈래로 뭉치면 실패(문구가 갈래마다 다르다)
//  - 서버가 계약 밖 칸(본문·이름)을 실어 보내면 받아 주지 않는다(unavailable) — 유저 글자 노출 0
//  - 표시 줄 어디에든 이름·세이브 본문이 나오면 실패 / 크기·벌 수가 서버 값과 다르면 실패
//  - cloud 플래그·서버 연결·켜짐 기록 중 하나라도 없으면 진입점(공방 노트 행) 0
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { MyData } from '@mong/contract';
import { SAVE_KEYS, sim, type KV } from '@mong/core';
import { describe, expect, it } from 'vitest';
import { createCloudApi } from '../src/cloud/api';
import { createFakeServer } from '../src/cloud/fakeServer';
import { initialView, reduce } from '../src/cloud/model';
import { formatBytes, loadMyData, myDataEntry, myDataRows } from '../src/cloud/myData';
import { runTask, type TaskDeps } from '../src/cloud/tasks';
import { tIn } from '../src/i18n';

const sha = async (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const T = Date.UTC(2026, 10, 25, 3, 0);
const TZ = 540;
const NAME = '이름글자노출안됨';

function memKV(): KV {
  const m = new Map<string, string>();
  return { getString: (k) => m.get(k), set: (k, v) => void m.set(k, v), remove: (k) => void m.delete(k) };
}
function mong(seed: number): string {
  return sim.serializeState(sim.createInitial(T, TZ, seed), T);
}
function device(server: ReturnType<typeof createFakeServer>, name: string, raw: string | null) {
  const kv = memKV();
  if (raw !== null) kv.set(SAVE_KEYS.main, raw);
  const auth = server.authFor(name);
  const deps: TaskDeps = {
    api: createCloudApi({ fetch: server.fetch, base: 'https://api.test', auth, timeoutMs: 200 }),
    auth,
    kv,
    sha256: sha,
    now: () => T,
    local: { raw: () => kv.getString(SAVE_KEYS.main) ?? null, adopt: () => true },
  };
  return { kv, deps };
}
async function enabled(server: ReturnType<typeof createFakeServer>, name: string, raw: string) {
  const d = device(server, name, raw);
  const r = await runTask({ t: 'enable' }, d.deps);
  expect(r.r).toBe('enabled');
  expect((await runTask({ t: 'sync' }, d.deps)).r).toBe('synced');
  return d;
}

describe('불러오기 갈래(loadMyData)', () => {
  it('켜져 있으면 ready: 몽망이 1, 맡긴 본 rev·크기, 이력 — 서버 값 그대로', async () => {
    const server = createFakeServer(sha);
    const a = await enabled(server, 'A', mong(3));
    const v = await loadMyData(a.deps);
    expect(v.k).toBe('ready');
    if (v.k !== 'ready') return;
    const peek = server.peek('A')!;
    expect(v.data.creatures).toBe(1);
    expect(v.data.creature?.code).toBe(peek.creature);
    expect(v.data.save?.rev).toBe(peek.save!.rev);
    expect(v.data.save?.bytes).toBe(new TextEncoder().encode(peek.save!.body).length);
    expect(server.log.at(-1)).toBe('GET me/data');
  });
  it('오프라인 → offline (토큰을 못 받아도, 요청이 끊겨도)', async () => {
    const server = createFakeServer(sha);
    const a = await enabled(server, 'A', mong(3));
    server.faults.offline = true;
    expect((await loadMyData(a.deps)).k).toBe('offline');
    // 접근 토큰 만료 + 오프라인 = 토큰 unavailable(세션은 남음) — '로그인 없음'으로 읽지 않는다(C11 N1)
    server.expireSession('A');
    expect((await loadMyData(a.deps)).k).toBe('offline');
  });
  it('서버 503·한도·이상한 모양 → unavailable (오프라인과 다른 문구)', async () => {
    const server = createFakeServer(sha);
    const a = await enabled(server, 'A', mong(3));
    server.faults.failNext = { status: 503, code: 'auth_unavailable' };
    expect((await loadMyData(a.deps)).k).toBe('unavailable');
    server.faults.failNext = { status: 429, code: 'rate_limited' };
    expect((await loadMyData(a.deps)).k).toBe('unavailable');
  });
  it('계약 밖 칸(본문·이름)이 실려 오면 받지 않는다 → unavailable', async () => {
    const server = createFakeServer(sha);
    const a = await enabled(server, 'A', mong(3));
    server.faults.leakMyData = true;
    expect((await loadMyData(a.deps)).k).toBe('unavailable');
  });
  it('맡긴 적 없는 로그인(401 no_account)·세션 없음 → noAccount', async () => {
    const server = createFakeServer(sha);
    const b = device(server, 'B', mong(4));
    expect((await loadMyData(b.deps)).k).toBe('noAccount'); // 세션 없음
    await b.deps.auth.signIn();
    expect((await loadMyData(b.deps)).k).toBe('noAccount'); // 로그인은 있는데 bootstrap 전
  });
  it('되찾기로 옮겨 간 옛 기기(410 moved) → moved', async () => {
    const server = createFakeServer(sha);
    const a = await enabled(server, 'A', mong(3));
    const code = await runTask({ t: 'reissue' }, a.deps);
    expect(code.r).toBe('reissued');
    const b = device(server, 'B', null);
    await b.deps.auth.signIn();
    await b.deps.api.recover((code as { code: string }).code, { v: 2, ok: true });
    expect((await loadMyData(a.deps)).k).toBe('moved');
  });
  it('불러오기는 기기 기록을 바꾸지 않는다(보기만 — no_account에서도 지우거나 끄지 않음)', async () => {
    const server = createFakeServer(sha);
    const a = await enabled(server, 'A', mong(3));
    const before = a.kv.getString('mong.cloud.v1');
    await a.deps.auth.signOut();
    expect((await loadMyData(a.deps)).k).toBe('noAccount');
    expect(a.kv.getString('mong.cloud.v1')).toBe(before);
  });
});

const sample: MyData = {
  account: { createdAt: '2026-11-20T01:00:00.000Z', lastActiveMonth: '2026-11', ageGateVersion: 2, ageConfirmedOn: '2026-11-20', logins: 1, movedLogins: 1, deletionPendingUntil: null },
  creatures: 1,
  creature: { code: 'ABCD2345', createdAt: '2026-11-20T01:00:00.000Z', recoveryCodeSet: true, link: { enabled: true, nameVisible: true, nameShown: true, pageState: 'live', publishedAt: '2026-11-21T01:00:00.000Z' } },
  save: { rev: 4, clientSavedAt: '2026-11-24T01:00:00.000Z', lastSavedAt: '2026-11-24T02:00:00.000Z', dayIndex: 4, strokesTotal: 12, validated: true, bytes: 18_432 },
  versions: [
    { reason: 'weekly', createdAt: '2026-11-23T01:00:00.000Z', clientSavedAt: '2026-11-23T01:00:00.000Z', dayIndex: 3, strokesTotal: 9, bytes: 900 },
    { reason: 'conflict', createdAt: '2026-11-22T01:00:00.000Z', clientSavedAt: '2026-11-22T01:00:00.000Z', dayIndex: 2, strokesTotal: 4, bytes: 512 },
  ],
};

describe('표시 줄(myDataRows) — ko·en', () => {
  it.each(['ko', 'en'] as const)('%s: 몽망이 수·인장 코드·크기·벌 수·마지막으로 맡긴 때·글귀 있음/없음', (loc) => {
    const rows = myDataRows(sample, loc, TZ);
    const by = (id: string) => rows.find((r) => r.id === id);
    expect(by('creatures')?.value).toContain('ABCD2345');
    expect(by('creatures')?.value).toContain('1');
    expect(by('save')?.value).toContain(formatBytes(18_432, loc));
    expect(by('last')?.value).toContain(loc === 'ko' ? '24' : '24');
    expect(by('versions')?.value).toContain('2');
    expect(by('versions')?.value).toContain(formatBytes(1412, loc));
    expect(rows.filter((r) => r.id.startsWith('version-'))).toHaveLength(2);
    expect(by('phrase')?.value).toBe(tIn(loc, 'cloud.view.phrase.set'));
    expect(by('logins')?.value).toContain('1');
    for (const r of rows) {
      expect(r.label.length, r.id).toBeGreaterThan(0);
      expect(r.value.length, r.id).toBeGreaterThan(0);
      // 스크린리더: 줄마다 '이름, 값' 한 덩이
      expect(r.a11y).toBe(`${r.label}, ${r.value}`);
    }
    expect(by('deletion')).toBeUndefined();
  });
  it('맡긴 것이 비었을 때(세이브 없음·이력 없음·글귀 없음·링크 없음)', () => {
    const rows = myDataRows({ ...sample, creature: { ...sample.creature!, recoveryCodeSet: false, link: { enabled: false, nameVisible: false, nameShown: false, pageState: null, publishedAt: null } }, save: null, versions: [] }, 'ko', TZ);
    const by = (id: string) => rows.find((r) => r.id === id);
    expect(by('save')?.value).toBe(tIn('ko', 'cloud.view.save.none'));
    expect(by('last')?.value).toBe(tIn('ko', 'cloud.view.last.never'));
    expect(by('versions')?.value).toBe(tIn('ko', 'cloud.view.versions.none'));
    expect(by('phrase')?.value).toBe(tIn('ko', 'cloud.view.phrase.unset'));
    expect(by('link')?.value).toBe(tIn('ko', 'cloud.view.link.off'));
  });
  it('운영자 삭제 대기면 그 날짜 줄이 보인다', () => {
    const rows = myDataRows({ ...sample, account: { ...sample.account, deletionPendingUntil: '2026-11-28T01:00:00.000Z' } }, 'ko', TZ);
    expect(rows.find((r) => r.id === 'deletion')?.value).toContain('28');
  });
  it('유저 글자 노출 0: 이름·본문 칸이 섞인 데이터를 줘도 줄에 나오지 않는다', () => {
    const leaky = { ...sample, creature: { ...sample.creature!, name: NAME }, save: { ...sample.save!, body: `{"name":"${NAME}"}` } } as unknown as MyData;
    for (const loc of ['ko', 'en'] as const) expect(JSON.stringify(myDataRows(leaky, loc, TZ))).not.toContain(NAME);
  });
  it('크기 표기: 1KB 미만은 바이트, 그 위는 KB 한 자리', () => {
    expect(formatBytes(512, 'ko')).toBe('512B');
    expect(formatBytes(18_432, 'ko')).toBe('18KB');
    expect(formatBytes(1_536, 'en')).toBe('1.5 KB');
  });
});

describe('지우기 길 — 기존 C12 지우기 확인으로 이어진다', () => {
  it('켜짐에서 열면 지우기 확인(인장 코드 끝 네 자)으로, 다른 자리에서는 그 자리 그대로', () => {
    const rec = { creature: 'ABCD2345', sha: null };
    const on = myDataEntry(initialView({ state: 'on' }), rec);
    expect(on).toEqual({ v: 'deleteConfirm', token: '2345', mismatch: false });
    // 확인 낱말을 치면 기존 delete 작업(DELETE /me)
    expect(reduce(on, { e: 'confirmDelete', input: '2345' })).toEqual({ v: 'busy', task: { t: 'delete' }, slow: false });
    // 지우기 결과 확인 중·옮겨 감이면 확인 화면을 새로 열지 않는다(이미 그 길 위에 있음)
    expect(myDataEntry(initialView({ state: 'deleting', deleteTries: 1 }), rec)).toEqual({ v: 'deleteCheck', tries: 1 });
    expect(myDataEntry(initialView({ state: 'moved' }), rec)).toEqual({ v: 'moved' });
  });
});

describe('화면·진입점 소스 검사', () => {
  const src = (p: string) => readFileSync(path.resolve(__dirname, '..', p), 'utf8');
  const sheet = src('src/screens/MyDataSheet.tsx');
  const game = src('src/game/GameApp.tsx');
  const note = src('src/screens/NoteSheet.tsx');
  it('갈래마다 다른 문구·testID(로딩·ready·offline·unavailable·noAccount·moved)', () => {
    for (const k of ['loading', 'ready', 'offline', 'unavailable', 'noAccount', 'moved']) expect(sheet, k).toContain(`testID="mydata-${k}"`);
    for (const k of ['cloud.view.offline', 'cloud.view.unavailable', 'cloud.view.noAccount', 'cloud.view.moved']) expect(sheet, k).toContain(`t('${k}')`);
  });
  it('줄은 스크린리더 한 덩이(accessible + accessibilityLabel), 버튼은 role·라벨, 글자 200%에서 감싸 내려간다', () => {
    expect(sheet).toMatch(/accessible\s+accessibilityLabel=\{r\.a11y\}/);
    expect(sheet).toContain("accessibilityRole=\"button\"");
    expect(sheet).toContain('flexWrap');
    expect(sheet).not.toMatch(/numberOfLines/);
    expect(sheet).not.toMatch(/maxFontSizeMultiplier=\{1\}/);
  });
  it('재촉·공포 문구 0(ko·en): 지금 바로·서두르·위험·경고·영원히·hurry·danger·warning·forever 없음', () => {
    const keys = ['cloud.view.lead', 'cloud.view.offline', 'cloud.view.unavailable', 'cloud.view.noAccount', 'cloud.view.moved', 'cloud.view.deleteHint', 'cloud.view.device'] as const;
    for (const k of keys) {
      expect(tIn('ko', k), k).not.toMatch(/지금 바로|서두르|위험|경고|영원히|즉시/);
      expect(tIn('en', k), k).not.toMatch(/hurry|danger|warning|forever|immediately|right now/i);
    }
  });
  it('진입점: 공방 노트 행은 view가 있을 때만, GameApp은 cloud 플래그·서버 연결·켜짐 기록일 때만 view를 넘긴다', () => {
    expect(note).toMatch(/cloud\.view && \(/);
    expect(note).toContain('testID="note-cloud-view"');
    // GameApp의 view는 cloud 묶음(cloudFlag && cloudDeps) 안에서, 기록이 켜짐일 때만
    const cloudProp = game.slice(game.indexOf('cloud={'), game.indexOf('metrics={'));
    expect(cloudProp).toMatch(/cloudFlag && cloudDeps/);
    expect(cloudProp).toMatch(/view: readRecord\(kv\)\?\.state === 'on'/);
    expect(game).toMatch(/\{cloudFlag && cloudDeps && \(\s*<MyDataSheet/);
  });
});

describe('처리방침 12절 열람 경로 = 이 화면(문구가 한쪽만 바뀌면 실패)', () => {
  const ROOT = path.resolve(__dirname, '../../..');
  const norm = (s: string) => s.replace(/’/g, "'");
  const sec12 = (md: string) => md.slice(md.indexOf('## 12.'), md.indexOf('## 13.'));
  it('ko·en 12절이 공방 노트 행 이름을 그대로 가리키고, 열람을 이메일로만 보내지 않는다', () => {
    const ko = sec12(readFileSync(path.join(ROOT, 'docs/release/privacy-policy.ko.md'), 'utf8'));
    const en = sec12(readFileSync(path.join(ROOT, 'docs/release/privacy-policy.en.md'), 'utf8'));
    expect(ko).toContain(`'${tIn('ko', 'note.cloud.view')}'`);
    expect(norm(en)).toContain(`"${norm(tIn('en', 'note.cloud.view'))}"`);
    expect(ko).not.toContain('| 열람·정정·그 밖의 요청 | 17절 이메일 |');
    expect(en).not.toContain('| Access, correction, other requests | Email in section 17 |');
  });
});
