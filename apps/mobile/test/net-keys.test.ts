// 앱 번들 공개키 목록(C11 — web-static 리뷰 R3): `src/net/remote-public-keys.json`과 정적 배포의 `apps/web-static/remote-public-keys.json`이
// 같은 키({kid, n, e}, 순서 무관)를 가져야 한다. 다르면 정적 빌드는 통과해도 앱이 그 배포를 unknown_kid로 버린다(끄는 손잡이가 안 닿음).
// 정적 빌드(build.mjs)도 같은 대조를 하지만, 앱 쪽에서도 따로 고정한다(앱만 바꾼 PR이 이 시험에서 걸리게).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { remotePublicKeySchema } from '@mong/contract';
import { describe, expect, it } from 'vitest';
import { parseKeyList, REMOTE_PUBLIC_KEYS } from '../src/net/keys';

const ROOT = join(__dirname, '..');
const read = (p: string) => JSON.parse(readFileSync(p, 'utf8')) as { keys?: unknown };
const appFile = read(join(ROOT, 'src/net/remote-public-keys.json'));
const staticFile = read(join(ROOT, '../web-static/remote-public-keys.json'));
const ids = (keys: unknown) => (keys as Array<{ kid: string; n: string; e: string }>).map((k) => `${k.kid}.${k.n}.${k.e}`).sort();

describe('공개키 두 목록 대조', () => {
  it('두 파일 모두 keys 배열이 있고, 키 모양이 계약(remotePublicKeySchema)에 맞고, kid가 겹치지 않는다', () => {
    for (const f of [appFile, staticFile]) {
      expect(Array.isArray(f.keys)).toBe(true);
      const list = f.keys as unknown[];
      for (const k of list) expect(remotePublicKeySchema.safeParse(k).success).toBe(true);
      expect(new Set(list.map((k) => (k as { kid: string }).kid)).size).toBe(list.length);
    }
  });
  it('앱 목록 = 정적 배포 목록(kid·n·e, 순서 무관)', () => {
    expect(ids(appFile.keys)).toEqual(ids(staticFile.keys));
  });
  it('앱이 실제로 쓰는 목록(REMOTE_PUBLIC_KEYS) = 파일 그대로(조용히 빠지는 키 없음)', () => {
    expect(ids(REMOTE_PUBLIC_KEYS)).toEqual(ids(appFile.keys));
  });
  it('모양이 틀린 키·겹친 kid는 목록에서 빠진다(검사기에 넘기지 않는다)', () => {
    const good = { kid: 'k1', n: 'A'.repeat(342), e: 'AQAB' };
    expect(parseKeyList({ keys: [good, { kid: 'k2', n: 'short', e: 'AQAB' }, { ...good }] })).toEqual([good]);
    expect(parseKeyList({})).toEqual([]);
    expect(parseKeyList(null)).toEqual([]);
  });
});
