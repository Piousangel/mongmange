// 앱 번들 원격 문서 공개키 목록(B4 보고 3절 6, web-static 리뷰 R3). 정본 파일 = 같은 폴더 remote-public-keys.json({keys:[{kid,n,e}]}).
// apps/web-static/remote-public-keys.json과 같아야 한다 — test/net-keys.test.ts(앱)와 web-static build.mjs(정적)가 둘 다 대조한다.
// 키 교체 = 새 공개키를 OTA로 먼저 넣고(이 파일) 그 뒤 새 키로 서명. 비어 있으면 어떤 원격 문서도 받지 않는다(= 번들 기본값).
import { remotePublicKeySchema, type RemotePublicKey } from '@mong/contract';
import file from './remote-public-keys.json';

/** 모양이 맞는 키만, kid가 겹치면 앞의 것만 */
export function parseKeyList(raw: unknown): RemotePublicKey[] {
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { keys?: unknown }).keys) ? ((raw as { keys: unknown[] }).keys) : [];
  const out: RemotePublicKey[] = [];
  for (const k of list) {
    const r = remotePublicKeySchema.safeParse(k);
    if (r.success && !out.some((o) => o.kid === r.data.kid)) out.push(r.data);
  }
  return out;
}

export const REMOTE_PUBLIC_KEYS: readonly RemotePublicKey[] = Object.freeze(parseKeyList(file));
