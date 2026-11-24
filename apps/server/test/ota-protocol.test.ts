// Expo Updates 프로토콜 v1 순수 부분 + 게시 준비(V21). 정본: docs.expo.dev/technical-specs/expo-updates-1 (2026-08-12 판).
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assetHash,
  manifestSchema,
  multipart,
  negotiate,
  parseManifestRequest,
  pickEncoding,
  bodyBinding,
  rollbackDirective,
  sfvDictionary,
  signatureHeader,
  signBody,
  verifyBody,
} from '../src/ota/protocol';
import { buildManifest, contentTypeOf, insideRepo, prepareExport, sign } from '../src/ota/publish';
import { appHeaders, makeExport, parseMultipart, parseSig, SECRET, testKeys } from './ota-fixtures';

describe('요청 헤더 판정(명세 Request)', () => {
  it('expo-updates 58이 보내는 헤더 묶음 → 고르는 값만 꺼낸다(설치 id·실패 id·오류 텍스트는 결과에 없다)', () => {
    const r = parseManifestRequest(appHeaders({ current: '11111111-2222-4333-8444-555566667777' }));
    expect(r).toEqual({
      ok: true,
      platform: 'android',
      runtimeVersion: 'rv1',
      channel: 'preview',
      currentUpdateId: '11111111-2222-4333-8444-555566667777',
      embeddedUpdateId: SECRET.embeddedId,
      wantsSignature: true,
      format: 'multipart',
    });
    expect(JSON.stringify(r)).not.toContain(SECRET.clientId);
    expect(JSON.stringify(r)).not.toContain(SECRET.failedId);
    expect(JSON.stringify(r)).not.toContain('SECRET_CRASH');
  });
  it('프로토콜 ≠ 1 → 406, 플랫폼 밖 → 400(명세 SHOULD 400/404), 런타임 없음 → 400', () => {
    expect(parseManifestRequest({ ...appHeaders(), 'expo-protocol-version': '0' })).toMatchObject({ ok: false, status: 406 });
    expect(parseManifestRequest({ ...appHeaders(), 'expo-platform': 'web' })).toMatchObject({ ok: false, status: 400, code: 'platform' });
    const { 'expo-runtime-version': _drop, ...noRv } = appHeaders();
    expect(parseManifestRequest(noRv)).toMatchObject({ ok: false, status: 400, code: 'runtime_version' });
    expect(parseManifestRequest({ ...appHeaders(), 'expo-runtime-version': '../../etc' })).toMatchObject({ ok: false, status: 400 });
  });
  it('채널이 없거나 모양 밖이면 null(고를 판 없음), id 모양 밖은 버린다', () => {
    expect(parseManifestRequest(appHeaders({ channel: '' }))).toMatchObject({ ok: true, channel: null });
    expect(parseManifestRequest(appHeaders({ channel: 'Prod uction' }))).toMatchObject({ ok: true, channel: null });
    expect(parseManifestRequest(appHeaders({ current: 'not-a-uuid' }))).toMatchObject({ ok: true, currentUpdateId: null });
  });
  it('accept 협상: 명세 예시 q값 → multipart, JSON만 → json, 맞는 것 없음 → null(406)', () => {
    expect(negotiate('application/expo+json;q=0.9, application/json;q=0.8, multipart/mixed')).toBe('multipart');
    expect(negotiate('multipart/mixed;q=0.1, application/json')).toBe('json');
    expect(negotiate('application/json')).toBe('json');
    expect(negotiate('text/html')).toBeNull();
    expect(negotiate('multipart/mixed;q=0')).toBeNull();
    expect(negotiate(undefined)).toBe('multipart');
  });
  it('accept-encoding: br > gzip > 원본, q=0 거부', () => {
    expect(pickEncoding('br, gzip')).toBe('br');
    expect(pickEncoding('gzip, deflate')).toBe('gzip');
    expect(pickEncoding('br;q=0, gzip')).toBe('gzip');
    expect(pickEncoding('identity')).toBeNull();
    expect(pickEncoding(undefined)).toBeNull();
  });
});

describe('응답 꼴(명세 Multipart response·SFV)', () => {
  it('multipart: 파트 머리 content-disposition name·content-type·expo-signature, 본문 그대로', () => {
    const body = JSON.stringify({ a: 1, s: '--not-a-boundary' });
    const m = multipart([{ name: 'manifest', body, signature: 'sig="abc"' }]);
    expect(m.contentType).toMatch(/^multipart\/mixed; boundary=mong-ota-[0-9a-f]{36}$/);
    const parts = parseMultipart(m.contentType, m.body);
    expect(parts).toEqual([
      { headers: { 'content-disposition': 'form-data; name="manifest"', 'content-type': 'application/json; charset=utf-8', 'expo-signature': 'sig="abc"' }, body },
    ]);
  });
  it('SFV 사전: 명세 예시 꼴(sig, keyid), 따옴표·역슬래시 이스케이프, 비ASCII 거부', () => {
    expect(signatureHeader('AbC+/=', 'main')).toBe('sig="AbC+/=", keyid="main"');
    expect(sfvDictionary({ a: 'x"y\\z' })).toBe('a="x\\"y\\\\z"');
    expect(() => sfvDictionary({ a: '한글' })).toThrow();
    expect(() => sfvDictionary({ A: 'x' })).toThrow();
  });
  it('롤백 지시 = rollBackToEmbedded + commitTime(ISO)', () => {
    const d = rollbackDirective(new Date('2026-12-30T01:02:03.004Z'), { seq: 7, channel: 'production' });
    expect(JSON.parse(d)).toEqual({ type: 'rollBackToEmbedded', parameters: { commitTime: '2026-12-30T01:02:03.004Z' }, extra: { seq: '7', channel: 'production' } });
    expect(bodyBinding(d, 'rollback')).toEqual({ seq: 7, channel: 'production' });
  });
  it('서명 원문의 판 번호·채널 꺼내기(매니페스트 metadata) — 모양 밖은 null', () => {
    expect(bodyBinding(JSON.stringify({ metadata: { seq: '3', channel: 'preview' } }), 'update')).toEqual({ seq: 3, channel: 'preview' });
    expect(bodyBinding(JSON.stringify({ metadata: { seq: 3, channel: 'preview' } }), 'update')).toBeNull();
    expect(bodyBinding(JSON.stringify({ metadata: { seq: '0', channel: 'preview' } }), 'update')).toBeNull();
    expect(bodyBinding(JSON.stringify({ metadata: {} }), 'update')).toBeNull();
    expect(bodyBinding('not json', 'update')).toBeNull();
  });
});

describe('서명(코드 서명 — 시험 키쌍)', () => {
  const k = testKeys();
  it('RSA-SHA256 서명은 짝 공개키로만 검증되고, 본문이 한 바이트라도 바뀌면 실패', () => {
    const body = '{"id":"x"}';
    const sig = signBody(body, k.privateKeyPem);
    expect(Buffer.from(sig, 'base64').length).toBe(256);
    expect(verifyBody(body, sig, k.publicKeyPem)).toBe(true);
    expect(verifyBody('{"id":"y"}', sig, k.publicKeyPem)).toBe(false);
    expect(verifyBody(body, sig, testKeys().publicKeyPem)).toBe(false);
  });
  it('게시 서명: 인증서(공개키)와 짝이 아니면 게시 중단', () => {
    expect(sign('{}', { privateKeyPem: k.privateKeyPem, keyId: 'main', certificatePem: k.publicKeyPem }).signature).toBeTruthy();
    expect(() => sign('{}', { privateKeyPem: k.privateKeyPem, keyId: 'main', certificatePem: testKeys().publicKeyPem })).toThrow(/짝이 아니다/);
  });
});

describe('게시 준비(expo export → 매니페스트)', () => {
  it('파일마다 hash = SHA-256 base64url, key = MD5(export 파일 이름), 중복 에셋 1회, launchAsset은 fileExtension 없음', async () => {
    const dir = makeExport();
    const { launch, assets } = await prepareExport(dir, 'ios');
    expect(assets).toHaveLength(2);
    const meta = JSON.parse(readFileSync(join(dir, 'metadata.json'), 'utf8')) as { fileMetadata: { ios: { bundle: string; assets: Array<{ path: string }> } } };
    const bundle = readFileSync(join(dir, meta.fileMetadata.ios.bundle));
    expect(launch.hash).toBe(createHash('sha256').update(bundle).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
    expect(launch.hash).toBe(assetHash(bundle));
    expect(launch).not.toHaveProperty('fileExtension');
    expect(launch.contentType).toBe('application/javascript');
    expect(assets.map((a) => `assets/${a.key}`)).toEqual(meta.fileMetadata.ios.assets.slice(0, 2).map((a) => a.path));
    expect(assets.map((a) => [a.fileExtension, a.contentType])).toEqual([
      ['.ttf', 'font/ttf'],
      ['.wav', 'audio/wav'],
    ]);
  });
  it('매니페스트는 명세 Manifest 꼴(id UUID·createdAt ISO·url = 에셋 주소/해시)', async () => {
    const { launch, assets } = await prepareExport(makeExport(), 'android');
    const { body, manifest } = buildManifest({ createdAt: new Date('2026-12-01T00:00:00Z'), runtimeVersion: 'rv1', seq: 4, channel: 'preview', launch, assets, assetBaseUrl: 'https://ota.example/api/v1/ota/assets/', expoClient: { name: 'mongmangE' } });
    expect(manifestSchema.parse(JSON.parse(body))).toEqual(manifest);
    expect(manifest.launchAsset.url).toBe(`https://ota.example/api/v1/ota/assets/${launch.hash}`);
    expect(manifest.extra).toEqual({ expoClient: { name: 'mongmangE' } });
    expect(manifest.metadata).toEqual({ seq: '4', channel: 'preview' });
  });
  it('내보내기 폴더 밖을 가리키는 metadata는 거부, 없는 플랫폼도 거부', async () => {
    const dir = makeExport();
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify({ version: 0, bundler: 'metro', fileMetadata: { ios: { bundle: '../../etc/passwd', assets: [] } } }));
    await expect(prepareExport(dir, 'ios')).rejects.toThrow(/밖 경로/);
    await expect(prepareExport(dir, 'android')).rejects.toThrow(/android 번들이 없다/);
  });
  it('MIME 표 밖은 octet-stream, 개인키 경로가 저장소 안이면 거부 대상', () => {
    expect(contentTypeOf('TTF')).toBe('font/ttf');
    expect(contentTypeOf('xyz')).toBe('application/octet-stream');
    expect(insideRepo('/repo/apps/mobile/certs/key.pem', '/repo')).toBe(true);
    expect(insideRepo('/repo', '/repo')).toBe(true);
    expect(insideRepo('/home/me/.mong/ota-key.pem', '/repo')).toBe(false);
    expect(insideRepo('/repo-keys/k.pem', '/repo')).toBe(false);
  });
  it('저장소 밖 심볼릭 링크가 저장소 안 키를 가리키면 안으로 본다(realpath, 리뷰 L1)', () => {
    const repo = mkdtempSync(join(tmpdir(), 'mong-repo-'));
    const outside = mkdtempSync(join(tmpdir(), 'mong-out-'));
    writeFileSync(join(repo, 'key.pem'), 'k');
    symlinkSync(join(repo, 'key.pem'), join(outside, 'link.pem'));
    writeFileSync(join(outside, 'real.pem'), 'k');
    expect(insideRepo(join(outside, 'link.pem'), repo)).toBe(true);
    expect(insideRepo(join(outside, 'real.pem'), repo)).toBe(false);
  });
});

describe('시험 쪽 SFV 파서 자체', () => {
  it('sig·keyid를 읽는다', () => {
    expect(parseSig('sig="a\\"b", keyid="main"')).toEqual({ sig: 'a"b', keyid: 'main' });
  });
});
