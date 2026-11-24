// B4 원격 문서 서명 — 서버 쪽 서명(node:crypto)과 계약 쪽 검사(순수 JS, 앱이 쓰는 것)가 같은 판정을 내는지.
// 그럴듯한 오답 판별: 서명 뒤 값 하나 바꾼 문서, 서명을 다른 종류로 옮긴 문서, 저장소 안의 개인키, 스키마가 틀린 문서는 실패해야 한다.
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, mkdtempSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalJson, REMOTE_DEFAULT_LIFETIME_DAYS, remoteConfigStrictSchema, sha256Hex, verifyRemoteDoc, verifyRemoteDocStrict, type RemoteDocKind } from '@mong/contract';
import { beforeAll, describe, expect, it } from 'vitest';
import { generateRemoteKey, publicKeyFromPem, signRemoteDoc } from '../src/remote/remote-sign';
import { runRemoteCli } from '../src/remote/remote-cli';

const key = generateRemoteKey('k1');

describe('SHA-256: 계약(순수 JS) = node:crypto', () => {
  it('길이 0~300 무작위 바이트', () => {
    for (let n = 0; n <= 300; n++) {
      const b = randomBytes(n);
      expect(sha256Hex(new Uint8Array(b)), `len ${n}`).toBe(createHash('sha256').update(b).digest('hex'));
    }
  });
});

describe('서명(서버) → 검사(계약)', () => {
  const rnd = (i: number): Record<string, unknown> => ({
    v: i + 1,
    ttlSec: 60 + i,
    flags: { cloud: i % 2 === 0, link: false, remoteMotifs: i % 3 === 0, webLive: false },
    rollout: { cloud: (i % 10) / 10 },
    minBundle: {},
    minAppBuild: { ios: i, android: i * 2 },
    dreamUnlock: { [`m-${i}`]: i },
    note: 'ㄱ😀"\\\n',
  });

  it('무작위 문서 50개: 통과, 값 하나 바꾸면 거부', () => {
    for (let i = 0; i < 50; i++) {
      const kind: RemoteDocKind = i % 2 ? 'config/v1' : 'content/v1';
      const signed = signRemoteDoc(kind, rnd(i), key);
      expect(verifyRemoteDoc(kind, signed, [key.publicKey])).toBe('ok');
      const tampered = { ...signed, v: (signed.v as number) + 1 };
      expect(verifyRemoteDoc(kind, tampered, [key.publicKey])).toBe('bad');
    }
  });

  it('이미 sig가 있는 문서를 다시 서명하면 옛 sig를 버리고 새로 단다(sig는 맨 끝)', () => {
    const once = signRemoteDoc('config/v1', rnd(1), key);
    const k2 = generateRemoteKey('k2');
    const twice = signRemoteDoc('config/v1', once, k2);
    expect(Object.keys(twice).at(-1)).toBe('sig');
    expect((twice.sig as { kid: string }).kid).toBe('k2');
    expect(verifyRemoteDoc('config/v1', twice, [k2.publicKey])).toBe('ok');
    expect(verifyRemoteDoc('config/v1', twice, [key.publicKey])).toBe('unknown_kid');
  });

  it('RSA 3072·4096 키도 검사한다(키 길이를 앱이 고정하지 않음)', () => {
    for (const bits of [3072, 4096]) {
      const k = generateRemoteKey(`r${bits}`, bits);
      expect(verifyRemoteDoc('config/v1', signRemoteDoc('config/v1', rnd(2), k), [k.publicKey])).toBe('ok');
    }
  }, 60_000);

  it('리뷰 M1: __proto__·constructor가 든 문서는 서명하지 않는다(검사기와 같은 함수)', () => {
    expect(() => signRemoteDoc('config/v1', JSON.parse('{"v":1,"__proto__":{"x":1}}') as Record<string, unknown>, key)).toThrow();
    expect(() => signRemoteDoc('config/v1', { v: 1, flags: { constructor: true } }, key)).toThrow();
  });

  it('PEM 공개키 → 앱에 넣을 {kid,n,e}', () => {
    expect(publicKeyFromPem(key.publicKeyPem, 'k1')).toEqual(key.publicKey);
  });

  it('정규 JSON을 거치지 않은 서명(원문 문자열 그대로 서명)은 키 순서가 바뀌면 깨진다 — 계약이 정규화를 쓰는지 확인', () => {
    const doc = rnd(3);
    const signed = signRemoteDoc('config/v1', doc, key);
    const reordered = Object.fromEntries(Object.entries(signed).reverse());
    expect(canonicalJson(reordered)).toBe(canonicalJson(signed));
    expect(verifyRemoteDoc('config/v1', reordered, [key.publicKey])).toBe('ok');
  });
});

describe('remote-cli', () => {
  let dir: string;
  let cfgPath: string;
  const out: string[] = [];
  const io = { log: (s: string) => out.push(s), err: (s: string) => out.push(s) };
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'mong-remote-'));
    cfgPath = join(dir, 'v1.json');
    writeFileSync(
      cfgPath,
      JSON.stringify({ v: 1, ttlSec: 3600, flags: { cloud: false, link: false, remoteMotifs: false, webLive: false }, rollout: {}, minBundle: {}, minAppBuild: { ios: 0, android: 0 }, dreamUnlock: {} }),
    );
  });

  it('keygen → sign → verify, 개인키 0600, 공개키 JSON은 앱에 넣는 모양', async () => {
    expect(await runRemoteCli(['keygen', '--kid', 'prod-1', '--out', dir], io)).toBe(0);
    const priv = join(dir, 'prod-1.private.pem');
    expect(statSync(priv).mode & 0o777).toBe(0o600);
    const pub = JSON.parse(readFileSync(join(dir, 'prod-1.public.json'), 'utf8')) as Record<string, string>;
    expect(Object.keys(pub).sort()).toEqual(['e', 'kid', 'n']);

    expect(await runRemoteCli(['sign', '--kind', 'config/v1', '--in', cfgPath, '--key', priv, '--kid', 'prod-1'], io)).toBe(0);
    const signed = JSON.parse(readFileSync(cfgPath, 'utf8')) as Record<string, unknown>;
    expect(remoteConfigStrictSchema.safeParse(signed).success).toBe(true);
    expect(verifyRemoteDoc('config/v1', signed, [pub as never])).toBe('ok');
    expect(await runRemoteCli(['verify', '--kind', 'config/v1', '--in', cfgPath, '--pub', join(dir, 'prod-1.public.json')], io)).toBe(0);
    // 다른 종류로 검사하면 실패
    expect(await runRemoteCli(['verify', '--kind', 'content/v1', '--in', cfgPath, '--pub', join(dir, 'prod-1.public.json')], io)).toBe(1);
  });

  it('sign은 expiresAt = 지금 + 14일(기본)을 서명 안에 넣고, 앱 검사(strict)를 통과한다. 30일 넘는 수명은 거부', async () => {
    const signed = JSON.parse(readFileSync(cfgPath, 'utf8')) as Record<string, unknown>;
    const exp = Date.parse(signed.expiresAt as string);
    expect(Math.round((exp - Date.now()) / 86_400_000)).toBe(REMOTE_DEFAULT_LIFETIME_DAYS);
    const pub = JSON.parse(readFileSync(join(dir, 'prod-1.public.json'), 'utf8')) as never;
    expect(verifyRemoteDocStrict('config/v1', signed, [pub], { nowMs: Date.now() })).toMatchObject({ ok: true, version: 1 });
    const priv = join(dir, 'prod-1.private.pem');
    expect(await runRemoteCli(['sign', '--kind', 'config/v1', '--in', cfgPath, '--key', priv, '--kid', 'prod-1', '--ttl-days', '31'], io)).toBe(1);
  });

  it('리뷰 M5: --prev보다 판이 크지 않으면 거부, 크면 통과', async () => {
    const priv = join(dir, 'prod-1.private.pem');
    const prev = join(dir, 'prev.json');
    writeFileSync(prev, readFileSync(cfgPath, 'utf8')); // v 1
    expect(await runRemoteCli(['sign', '--kind', 'config/v1', '--in', cfgPath, '--key', priv, '--kid', 'prod-1', '--prev', prev], io)).toBe(1);
    const doc = JSON.parse(readFileSync(cfgPath, 'utf8')) as Record<string, unknown>;
    writeFileSync(cfgPath, JSON.stringify({ ...doc, v: 2 }));
    expect(await runRemoteCli(['sign', '--kind', 'config/v1', '--in', cfgPath, '--key', priv, '--kid', 'prod-1', '--prev', prev], io)).toBe(0);
  });

  it('리뷰 L5: 매니페스트 --prev와 같은 (언어, 판)에 다른 sha256이면 거부', async () => {
    const priv = join(dir, 'prod-1.private.pem');
    const lex = (sha: string) => ({ lang: 'ko', lexVer: 3, minAppBuild: 0, url: '/content/lex/ko-3.aaaaaaaa.json', sha256: sha, bytes: 10 });
    const prev = join(dir, 'man-prev.json');
    const next = join(dir, 'man-next.json');
    writeFileSync(prev, JSON.stringify({ v: 1, seq: 1, motifs: [], revoked: [], lex: [lex('a'.repeat(64))] }));
    writeFileSync(next, JSON.stringify({ v: 1, seq: 2, motifs: [], revoked: [], lex: [lex('b'.repeat(64))] }));
    expect(await runRemoteCli(['sign', '--kind', 'content/v1', '--in', next, '--key', priv, '--kid', 'prod-1', '--prev', prev], io)).toBe(1);
    writeFileSync(next, JSON.stringify({ v: 1, seq: 2, motifs: [], revoked: [], lex: [lex('a'.repeat(64))] }));
    expect(await runRemoteCli(['sign', '--kind', 'content/v1', '--in', next, '--key', priv, '--kid', 'prod-1', '--prev', prev], io)).toBe(0);
  });

  it('리뷰 L4: 키 파일 권한이 0600이 아니면 경고(서명은 함)', async () => {
    const priv = join(dir, 'prod-1.private.pem');
    chmodSync(priv, 0o644);
    out.length = 0;
    expect(await runRemoteCli(['sign', '--kind', 'config/v1', '--in', cfgPath, '--key', priv, '--kid', 'prod-1'], io)).toBe(0);
    expect(out.join('\n')).toContain('0600');
    chmodSync(priv, 0o600);
  });

  it('스키마가 틀린 문서는 서명하지 않는다(플래그 오타)', async () => {
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, JSON.stringify({ v: 1, ttlSec: 3600, flags: { cloud: false, link: false, remoteMotifs: false, webLive: false, clowd: true }, minAppBuild: { ios: 0, android: 0 } }));
    expect(await runRemoteCli(['sign', '--kind', 'config/v1', '--in', bad, '--key', join(dir, 'prod-1.private.pem'), '--kid', 'prod-1'], io)).toBe(1);
    expect(readFileSync(bad, 'utf8')).not.toContain('"sig"');
  });

  it('저장소 안의 개인키는 거부한다(커밋 사고 방지)', async () => {
    const inRepo = new URL('../package.json', import.meta.url).pathname;
    expect(await runRemoteCli(['sign', '--kind', 'config/v1', '--in', cfgPath, '--key', inRepo, '--kid', 'prod-1'], io)).toBe(1);
    expect(await runRemoteCli(['keygen', '--kid', 'x', '--out', new URL('.', import.meta.url).pathname], io)).toBe(1);
  });

  it('리뷰 L4: 저장소 안을 가리키는 링크 아래의 새 폴더에도 keygen하지 않는다', async () => {
    const repoTmp = mkdtempSync(join(new URL('../', import.meta.url).pathname, '.tmp-keylink-'));
    const link = join(dir, 'into-repo');
    symlinkSync(repoTmp, link);
    try {
      expect(await runRemoteCli(['keygen', '--kid', 'y', '--out', join(link, 'new-sub')], io)).toBe(1);
      expect(() => statSync(join(repoTmp, 'new-sub', 'y.private.pem'))).toThrow();
    } finally {
      (await import('node:fs')).rmSync(repoTmp, { recursive: true, force: true });
    }
  });

  it('빌드된 CLI 파일 자리(tsup 엔트리)', () => {
    const tsup = readFileSync(new URL('../tsup.config.ts', import.meta.url), 'utf8');
    expect(tsup).toContain("'remote-cli': 'src/remote/remote-cli.ts'");
  });

  it('도움말·모르는 명령은 2', async () => {
    expect(await runRemoteCli([], io)).toBe(2);
    expect(await runRemoteCli(['nope'], io)).toBe(2);
  });
});
