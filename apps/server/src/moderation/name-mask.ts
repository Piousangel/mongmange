// 운영자 이름 가리기의 파일 쪽(architecture.md v2.2 3-5-2 '이름 가리기' ②③, B5). SQL 함수 app.mask_name이 DB 쪽(name_blocked·
// name_shown = false·meta에서 name 삭제·meta.ogPoster)을 끝내고 storage_gc(name_mask) 대기 행을 남기면, 대기열 처리기(gc.service)가 이 함수를 부른다.
//  ① 페이지 행을 잠근다(commit·PUT·격리와 줄을 선다). 격리·복원 이동이 아직 남았으면 나중에(파일이 두 버킷에 흩어져 있다)
//  ② 지금 판이 그 대기 행의 판이 아니면(주인이 다시 만듦 — 새 판은 가려진 뒤 판정이라 이름이 없다) 할 일 없음
//  ③ 새 pageKey 폴더에 포스터·루프를 그대로 복사하고 snap.json을 **이름 없이** 다시 쓴다(core serializePublicSnapshot(…, null)).
//     og.jpg는 복사하지 않는다(앱이 이름을 그려 넣었을 수 있다) — /m은 meta.ogPoster를 보고 og:image에 포스터를 쓴다
//  ④ path_prefix = 새 키, ver + 1, 옛 폴더는 지금 지우는 대기 행(old_version)으로 → 부르는 쪽이 바로 지운다
// 파일은 판마다 새 경로라(immutable 캐시) 같은 경로를 덮어쓰지 않는다. 실패하면 새 폴더를 지우고 대기 행은 재시도.
import { parsePublicSnapshot, serializePublicSnapshot } from '@mong/core';
import { PAGE_FILES, SNAP_MAX_BYTES } from '@mong/contract';
import type { PrismaService } from '../prisma/prisma.service';
import { BUCKETS, newPageKey, pageDir, type Bucket, type ObjectStore } from '../storage/object-store';

const TX = { timeout: 30_000, maxWait: 5_000 } as const;

export type MaskResult = { kind: 'later' } | { kind: 'noop' } | { kind: 'done'; drain: bigint; live: boolean };

/** snap.json 본문에서 이름을 뺀다. core가 읽지 못하는 옛 본문이면 name 키만 지운다(이름이 남는 쪽으로 실패하지 않게) */
export function snapWithoutName(raw: Uint8Array): Uint8Array {
  const json = JSON.parse(new TextDecoder().decode(raw)) as Record<string, unknown>;
  const parsed = parsePublicSnapshot(json);
  if (parsed.ok) return new TextEncoder().encode(serializePublicSnapshot(parsed.snap, null));
  delete json.name;
  return new TextEncoder().encode(JSON.stringify(json));
}

export async function rewritePageWithoutName(
  prisma: PrismaService,
  store: ObjectStore,
  job: { id: bigint; creatureId: string | null; prefix: string },
  now: Date,
): Promise<MaskResult> {
  if (!job.creatureId) return { kind: 'noop' };
  let newDir: string | null = null;
  let bucket: Bucket = BUCKETS.public;
  try {
    return await prisma.$transaction(async (tx) => {
      const [p] = await tx.$queryRaw<Array<{ state: string; store_key: string; path_prefix: string | null; has_loop: boolean }>>`
        SELECT state, store_key, path_prefix, has_loop FROM app.public_pages WHERE creature_id = ${job.creatureId}::uuid FOR UPDATE`;
      if (!p || !p.path_prefix || (p.state !== 'live' && p.state !== 'quarantined')) return { kind: 'noop' as const };
      const moving = await tx.storageGc.count({ where: { creatureId: job.creatureId, reason: { in: ['quarantine_move', 'restore_move'] } } });
      if (moving) return { kind: 'later' as const };
      const oldDir = pageDir(p.store_key, p.path_prefix);
      if (oldDir !== job.prefix) return { kind: 'noop' as const };
      bucket = p.state === 'live' ? BUCKETS.public : BUCKETS.quarantine;
      const key = newPageKey();
      newDir = pageDir(p.store_key, key);
      const snap = await store.readHead(bucket, `${oldDir}/snap.json`, SNAP_MAX_BYTES + 1);
      await store.put(bucket, `${newDir}/snap.json`, snapWithoutName(snap), 'application/json');
      for (const f of p.has_loop ? [PAGE_FILES.poster, PAGE_FILES.loop] : [PAGE_FILES.poster]) {
        const body = await store.readHead(bucket, `${oldDir}/${f.name}`, f.maxBytes + 1);
        if (!body.length) throw new Error('빈 파일');
        await store.put(bucket, `${newDir}/${f.name}`, body, f.contentType);
      }
      await tx.$executeRaw`
        UPDATE app.public_pages SET path_prefix = ${key}, ver = ver + 1, name_shown = false,
               meta = CASE WHEN meta IS NULL THEN NULL ELSE (meta - 'name' - 'snapPending') || '{"ogPoster": true}'::jsonb END
         WHERE creature_id = ${job.creatureId}::uuid`;
      const old = await tx.storageGc.create({
        data: { bucket, prefix: oldDir, creatureId: job.creatureId, reason: bucket === BUCKETS.public ? 'old_version' : 'quarantine_expiry', notBefore: now },
        select: { id: true },
      });
      return { kind: 'done' as const, drain: old.id, live: p.state === 'live' };
    }, TX);
  } catch (e) {
    // 새 폴더에 일부만 쓰였으면 지운다(DB는 되돌려졌다 — 지금 판은 옛 폴더 그대로)
    if (newDir) await store.removePrefix(bucket, newDir).catch(() => undefined);
    throw e;
  }
}
