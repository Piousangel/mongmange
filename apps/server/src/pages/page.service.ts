// 공유 링크(architecture.md v2.2 3-2 링크 행·3-5·3-5-1~3-5-3·3-9). 공개 값은 링크를 켤 때(다시 만들기 때) 고정된다.
//  PUT page:   스냅숏 검증(core parsePublicSnapshot) → 이름 판정(core normalizeName — 3-5-2, 불러오기 검사 nameShape가 아님) →
//              커밋 전 판(pending_*) 잡기 → snap.json을 서버가 **비공개 page-staging**에 직접 쓰기 → 포스터·OG·루프 서명 업로드 URL.
//  commit:     staging 파일 검사(존재·크기·유형·시그니처·해상도, 루프는 faststart·길이·트랙·무음) → public-pages로 옮김 → live.
//              지난 판 경로는 2시간 유예 뒤 지움(storage_gc old_version). 이미 live였던 판을 바꾸면 /m CDN 무효화(이름을 가린 판 포함).
//  DELETE:     링크 끄기 — live → off, 공개 파일 즉시 삭제(실패분은 대기열), CDN 무효화. 격리 중이면 link_enabled만.
//  quarantine: 신고 격리(B5가 부른다) — 공개 파일을 quarantine 버킷으로, CDN 무효화.
// 상태 전이는 3-9 표. 판 번호는 커밋된 판(ver)과 커밋 전 판(pending_ver) 중 큰 값 + 1.
// 로그에는 코드·이름·스냅숏·pageKey를 남기지 않는다(5-2) — 이 파일의 로그는 code(이유 이름)와 개수뿐.
import { randomBytes } from 'node:crypto';
import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parsePublicSnapshot, serializePublicSnapshot, sim, type PublicSnapshot } from '@mong/core';
import {
  PAGE_FILES,
  PAGE_PUT_PER_DAY,
  SNAP_MAX_BYTES,
  UPLOAD_URL_TTL_SEC,
  type CreatureInfo,
  type PageFileKind,
  type PagePutRequest,
  type PagePutResponse,
  type UploadSlot,
} from '@mong/contract';
import type { Prisma } from '../generated/prisma/client';
import { CdnPurgeQueue } from '../cdn/cdn-purge';
import { Clock } from '../common/clock';
import { RateLimiter } from '../common/rate-limiter';
import type { Env } from '../config/env';
import { GcService } from '../deletion/gc.service';
import { PrismaService } from '../prisma/prisma.service';
import { BUCKETS, OBJECT_STORE, pageDir, type ObjectStore } from '../storage/object-store';
import { checkJpeg, checkMp4, HEAD_BYTES } from './media-check';
import { nameBlocked } from './m-copy';

type Tx = Prisma.TransactionClient;
const HOUR = 3_600_000;
/** 커밋하지 않은 업로드 수명(3-5-3 ①) */
export const UNCOMMITTED_MS = 6 * HOUR;
/** 다시 만들기 뒤 지난 판 유예(3-5-3 ⑤ — 캐시된 옛 HTML이 5분 안에 바뀐다) */
export const OLD_VERSION_GRACE_MS = 2 * HOUR;
/** 서명 업로드 URL 최대 수명 — Supabase createSignedUploadUrl 기본 약 2시간으로 알려짐 [확인 필요 — B6 실측]. commit 뒤 staging 청소 시점 */
export const SIGNED_UPLOAD_MAX_LIFE_MS = 2 * HOUR;
/** commit 트랜잭션(검사·이동을 행 잠금 안에서): 파일 넷 이동 + 64KB 읽기 셋 — 넉넉히 30초 */
const COMMIT_TX = { timeout: 30_000, maxWait: 5_000 } as const;

/** public_pages.meta(3-5): snap.json의 같은 필드 복사 — HTML 한 줄·title·og:title에만 쓴다 */
export interface PageMeta {
  snap: 1;
  name?: string;
  ink: PublicSnapshot['ink'];
  texture?: NonNullable<PublicSnapshot['texture']>;
  bornDate: string;
  dayAtPublish: number;
  lang: 'ko' | 'en';
}

/** 서버 난수 pageKey(128비트). 코드에서 파생하지 않는다 — 파일 주소로 코드를 찾을 수 없게 */
export function newPageKey(): string {
  return randomBytes(16).toString('base64url');
}

/**
 * 이름이 실제로 실리는 조건(3-5-2 nameShown): 이름 공개 켬 + 이름이 왔음 + core normalizeName 통과(숫자 규칙 포함) +
 * 통과값이 받은 문자열과 같음(정규화로 바뀌면 거부) + 금칙어 통과 + (B5) 운영자 가리기 아님.
 */
export function judgeName(nameVisible: boolean, raw: string | undefined): string | null {
  if (!nameVisible || raw === undefined) return null;
  const n = sim.normalizeName(raw);
  if (!n.ok || n.text !== raw) return null;
  if (nameBlocked(n.text)) return null;
  return n.text;
}

function storageDown(): ServiceUnavailableException {
  return new ServiceUnavailableException({ code: 'storage_unavailable', message: '지금은 링크를 만들 수 없습니다' });
}
function blocked(): ConflictException {
  return new ConflictException({ code: 'page_blocked', message: '이 링크는 지금 다시 만들 수 없습니다' });
}

interface PageRow {
  creature_id: string;
  code: string;
  hidden: boolean;
  store_key: string;
  ver: number;
  state: 'live' | 'off' | 'quarantined' | 'removed';
  path_prefix: string | null;
  name_shown: boolean;
  pending_ver: number | null;
  pending_prefix: string | null;
  pending_meta: PageMeta | null;
  pending_name_shown: boolean | null;
  pending_has_loop: boolean | null;
}

@Injectable()
export class PageService {
  private readonly siteOrigin: string;
  private readonly log = new Logger('Page');

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly limiter: RateLimiter,
    private readonly gc: GcService,
    private readonly cdn: CdnPurgeQueue,
    @Inject(OBJECT_STORE) private readonly store: ObjectStore,
    config: ConfigService<Env, true>,
  ) {
    this.siteOrigin = config.get('SITE_ORIGIN', { infer: true }).replace(/\/+$/, '');
  }

  /** GET /creature — 앱 안 표시(즉시) */
  async info(userId: string): Promise<CreatureInfo> {
    const c = await this.prisma.creature.findUnique({ where: { userId }, select: { code: true, linkEnabled: true, nameVisible: true, page: { select: { ver: true, state: true } } } });
    if (!c) throw new NotFoundException({ code: 'no_creature', message: '맡긴 몽망이가 없습니다' });
    return { code: c.code, linkEnabled: c.linkEnabled, nameVisible: c.nameVisible, page: c.page ? { ver: c.page.ver, state: c.page.state } : null };
  }

  /** PATCH /creature {nameVisible} — 다음 판(다시 만들기)부터 반영. 지금 판은 그대로(3-5-2 '바꿀 때') */
  async patch(userId: string, nameVisible: boolean): Promise<CreatureInfo> {
    const n = await this.prisma.creature.updateMany({ where: { userId }, data: { nameVisible } });
    if (!n.count) throw new NotFoundException({ code: 'no_creature', message: '맡긴 몽망이가 없습니다' });
    return this.info(userId);
  }

  /** PUT /creature/page — 링크 켜기·다시 만들기 */
  async put(userId: string, req: PagePutRequest): Promise<PagePutResponse> {
    if (!this.store.configured) throw storageDown();
    // ① 크기(정규화 전 받은 그대로) ② 형식(모르는 키 하나라도 422)
    if (new TextEncoder().encode(JSON.stringify(req.snapshot)).length > SNAP_MAX_BYTES) {
      throw new PayloadTooLargeException({ code: 'snapshot_too_big', message: '스냅숏이 너무 큽니다' });
    }
    const parsed = parsePublicSnapshot(req.snapshot);
    if (!parsed.ok) throw new UnprocessableEntityException({ code: 'snapshot', message: '스냅숏 형식이 맞지 않습니다', details: { reason: parsed.reason, path: parsed.path } });
    const snap = parsed.snap;
    if (snap.lang !== req.lang) throw new UnprocessableEntityException({ code: 'snapshot', message: '언어가 맞지 않습니다', details: { reason: 'range', path: 'lang' } });
    if (this.limiter.take([{ name: 'page_put', key: userId, limit: PAGE_PUT_PER_DAY, windowMs: 24 * HOUR }])) {
      throw new HttpException({ code: 'rate_limited', message: '요청이 너무 잦습니다' }, HttpStatus.TOO_MANY_REQUESTS);
    }
    // ③ 이름(앱이 스냅숏에 넣은 name은 늘 버린다 — 서버 판정 값만)
    const name = judgeName(req.nameVisible, req.name);
    const body = new TextEncoder().encode(serializePublicSnapshot(snap, name));
    if (body.length > SNAP_MAX_BYTES) throw new PayloadTooLargeException({ code: 'snapshot_too_big', message: '스냅숏이 너무 큽니다' });
    const meta: PageMeta = {
      snap: 1,
      ...(name !== null ? { name } : {}),
      ink: snap.ink,
      ...(snap.texture ? { texture: snap.texture } : {}),
      bornDate: snap.born.date,
      dayAtPublish: snap.dayAtPublish,
      lang: snap.lang,
    };
    const hasLoop = !!req.files.loop;
    const prefix = newPageKey();
    const now = this.clock.now();

    const { ver, code, dir, dropped } = await this.prisma.$transaction(async (tx) => {
      const row = await this.lockPage(tx, userId);
      if (row.hidden || row.state === 'quarantined' || row.state === 'removed') throw blocked();
      const dropped: bigint[] = [];
      // 커밋 전에 새 PUT이 오면 앞의 커밋 전 판은 지금 지운다(staging + 혹시 일부 옮겨진 공개 쪽)
      if (row.pending_prefix) dropped.push(...(await this.dropPending(tx, row, new Date(now))));
      const ver = Math.max(row.ver, row.pending_ver ?? 0) + 1;
      const dir = pageDir(row.store_key, prefix);
      await tx.publicPage.update({
        where: { creatureId: row.creature_id },
        data: { pendingVer: ver, pendingPrefix: prefix, pendingMeta: meta as unknown as Prisma.InputJsonValue, pendingNameShown: name !== null, pendingHasLoop: hasLoop },
      });
      await tx.creature.update({ where: { id: row.creature_id }, data: { nameVisible: req.nameVisible } });
      // 의도 기록(B3 리뷰 I1): 이 판 폴더를 staging·public **두 버킷 모두** 6시간 대기열에 먼저 적는다.
      // commit이 끝까지 성공해야 public 행이 지워진다 — 이동이 일부만 되거나 중간에 죽어도 공개 쪽 파일은 대기열이 지운다
      await tx.storageGc.createMany({
        data: [BUCKETS.staging, BUCKETS.public].map((bucket) => ({ bucket, prefix: dir, creatureId: row.creature_id, reason: 'uncommitted' as const, notBefore: new Date(now + UNCOMMITTED_MS) })),
      });
      return { ver, code: row.code, dir, dropped };
    });
    await this.gc.drainIds(dropped);

    await this.store.put(BUCKETS.staging, `${dir}/snap.json`, body, 'application/json');
    const kinds: PageFileKind[] = hasLoop ? ['poster', 'og', 'loop'] : ['poster', 'og'];
    const upload: Partial<Record<PageFileKind, UploadSlot>> = {};
    for (const k of kinds) {
      const f = PAGE_FILES[k];
      const s = await this.store.signUpload(BUCKETS.staging, `${dir}/${f.name}`, { contentType: f.contentType, maxBytes: f.maxBytes, ttlSec: UPLOAD_URL_TTL_SEC });
      upload[k] = { ...s, contentType: f.contentType, maxBytes: f.maxBytes };
    }
    return {
      ver,
      nameAllowed: name !== null,
      url: `${this.siteOrigin}/m/${code}`,
      upload: { poster: upload.poster!, og: upload.og!, ...(upload.loop ? { loop: upload.loop } : {}) },
    };
  }

  /**
   * POST /creature/page/{ver}/commit. **페이지 행을 잠근 채** 검사 → 이동 → 확정을 한 트랜잭션에서 한다(B3 리뷰 I1·M13):
   * 같은 판의 commit 둘·계정 삭제·새 PUT·격리는 이 행 잠금을 기다리므로 이동과 엇갈리지 않는다. 이동이 실패하면 DB는 되돌려지고
   * 이미 옮겨진 공개 파일은 PUT이 적어 둔 public 대기 행이 지운다(503 storage_unavailable).
   * staging 경로는 commit으로 **한 번만** 인정된다(B3 리뷰 M4): 성공하면 pending이 비어 같은 판 번호는 409, staging 대기 행은
   * 서명 URL 최대 수명(2시간)만큼 남겨 재사용 토큰으로 다시 올린 파일도 지운다.
   */
  async commit(userId: string, ver: number): Promise<{ ver: number; state: 'live' }> {
    if (!this.store.configured) throw storageDown();
    const now = new Date(this.clock.now());
    const { wasLive, drainNow } = await this.prisma.$transaction(
      async (tx) => {
        const cur = await this.lockExisting(tx, userId);
        if (cur.hidden || cur.state === 'quarantined' || cur.state === 'removed') throw blocked();
        if (cur.pending_ver !== ver || !cur.pending_prefix || !cur.pending_meta) throw new ConflictException({ code: 'stale_version', message: '더 새 판이 있습니다' });
        const dir = pageDir(cur.store_key, cur.pending_prefix);
        const kinds: PageFileKind[] = cur.pending_has_loop ? ['poster', 'og', 'loop'] : ['poster', 'og'];
        for (const k of kinds) await this.inspect(dir, k);
        if (!(await this.store.stat(BUCKETS.staging, `${dir}/snap.json`))) throw rejectFile('snap', 'missing');
        try {
          for (const f of [...kinds.map((k) => PAGE_FILES[k].name), 'snap.json']) await this.store.move(BUCKETS.staging, BUCKETS.public, `${dir}/${f}`);
        } catch {
          throw storageDown();
        }
        const drainNow: bigint[] = [];
        if (cur.path_prefix) {
          const oldDir = pageDir(cur.store_key, cur.path_prefix);
          // 지난 판은 2시간 유예(캐시된 옛 HTML이 깨지지 않게). 단 이름이 실렸던 판을 이름 없는 판으로 바꾸면, 유예 중인 더 옛 판까지
          // **이름이 실렸을 수 있는 모든 지난 판**을 바로 지운다(B3 리뷰 I2 — 3-5-2 '가리면 어디에도 0')
          const hideName = cur.state === 'live' && cur.name_shown && !cur.pending_name_shown;
          await tx.storageGc.create({
            data: { bucket: BUCKETS.public, prefix: oldDir, creatureId: cur.creature_id, reason: 'old_version', notBefore: hideName ? now : new Date(now.getTime() + OLD_VERSION_GRACE_MS) },
          });
          if (hideName) {
            await tx.storageGc.updateMany({ where: { creatureId: cur.creature_id, bucket: BUCKETS.public, reason: 'old_version' }, data: { notBefore: now } });
            drainNow.push(...(await tx.storageGc.findMany({ where: { creatureId: cur.creature_id, bucket: BUCKETS.public, reason: 'old_version' }, select: { id: true } })).map((r) => r.id));
          }
        }
        // 의도 확정: 공개 쪽 6시간 행은 지우고, staging 행은 서명 URL 최대 수명 뒤로(재사용 업로드 청소)
        await tx.storageGc.deleteMany({ where: { creatureId: cur.creature_id, bucket: BUCKETS.public, prefix: dir, reason: 'uncommitted' } });
        await tx.storageGc.updateMany({
          where: { creatureId: cur.creature_id, bucket: BUCKETS.staging, prefix: dir, reason: 'uncommitted' },
          data: { notBefore: new Date(now.getTime() + SIGNED_UPLOAD_MAX_LIFE_MS) },
        });
        // 한 문장으로(pending 칸 셋은 함께 비워야 CHECK를 지난다)
        await tx.$executeRaw`
          UPDATE app.public_pages SET ver = ${ver}, state = 'live', meta = pending_meta, name_shown = coalesce(pending_name_shown, false),
                 has_loop = coalesce(pending_has_loop, false), path_prefix = pending_prefix, published_at = ${now}, state_changed_at = ${now},
                 pending_ver = NULL, pending_prefix = NULL, pending_meta = NULL, pending_name_shown = NULL, pending_has_loop = NULL
           WHERE creature_id = ${cur.creature_id}::uuid`;
        await tx.creature.update({ where: { id: cur.creature_id }, data: { linkEnabled: true } });
        return { wasLive: cur.state === 'live', drainNow };
      },
      COMMIT_TX,
    );
    await this.gc.drainIds(drainNow);
    // /m HTML CDN 무효화(1분 묶음): 바꾼 판(이름을 가린 다시 만들기 포함)의 옛 HTML·OG 메타, 처음 켰으면 캐시된 '사라진 링크'.
    // 이미 live로 확정된 뒤라 무효화 요청이 실패해도 응답은 200(바닥 s-maxage 5분, B3 리뷰 L3)
    await this.purgeQuietly(wasLive ? 'remake' : 'first');
    return { ver, state: 'live' };
  }

  /** DELETE /creature/page — 링크 끄기 */
  async disable(userId: string): Promise<void> {
    const out = await this.prisma.$transaction(async (tx) => {
      const c = await tx.creature.findUnique({ where: { userId }, select: { id: true } });
      if (!c) throw new NotFoundException({ code: 'no_creature', message: '맡긴 몽망이가 없습니다' });
      await tx.creature.update({ where: { id: c.id }, data: { linkEnabled: false } });
      const row = await this.lockPage(tx, userId);
      // 격리 중이면 link_enabled만 — 격리본은 운영 판단까지 둔다(3-9)
      if (row.state === 'quarantined') return { ids: [] as bigint[], purge: false };
      const now = new Date(this.clock.now());
      const ids: bigint[] = [];
      if (row.state === 'live' && row.path_prefix) {
        ids.push((await tx.storageGc.create({ data: { bucket: BUCKETS.public, prefix: pageDir(row.store_key, row.path_prefix), creatureId: row.creature_id, reason: 'old_version', notBefore: now }, select: { id: true } })).id);
      }
      if (row.pending_prefix) ids.push(...(await this.dropPending(tx, row, now)));
      const wasLive = row.state === 'live';
      await tx.$executeRaw`
        UPDATE app.public_pages SET state = CASE WHEN state = 'live' THEN 'off'::app.page_state ELSE state END,
               state_changed_at = CASE WHEN state = 'live' THEN ${now} ELSE state_changed_at END,
               path_prefix = CASE WHEN state = 'live' THEN NULL ELSE path_prefix END,
               meta = CASE WHEN state = 'live' THEN NULL ELSE meta END, name_shown = false,
               pending_ver = NULL, pending_prefix = NULL, pending_meta = NULL, pending_name_shown = NULL, pending_has_loop = NULL
         WHERE creature_id = ${row.creature_id}::uuid`;
      return { ids, purge: wasLive };
    });
    // 공개 파일 즉시 삭제(실패분은 대기열 재시도) → CDN 무효화(1분 묶음)
    if (this.store.configured) await this.gc.drainIds(out.ids);
    if (out.purge) await this.purgeQuietly('off');
  }

  /**
   * 신고 격리(3-8 ③, B5가 부른다): 상태 quarantined + 공개 → quarantine 이동을 **대기열 행으로**(B3 리뷰 M5).
   * 요청 안에서 한 번 옮겨 보고, 일부만 되면 행이 남아 Scheduler가 나머지를 옮긴다. CDN 무효화
   */
  async quarantine(creatureId: string): Promise<void> {
    const id = await this.prisma.$transaction(async (tx) => {
      const [r] = await tx.$queryRaw<Array<{ state: string; path_prefix: string | null; store_key: string }>>`
        SELECT state, path_prefix, store_key FROM app.public_pages WHERE creature_id = ${creatureId}::uuid FOR UPDATE`;
      if (!r || r.state !== 'live' || !r.path_prefix) return null;
      const now = new Date(this.clock.now());
      await tx.$executeRaw`UPDATE app.public_pages SET state = 'quarantined', state_changed_at = ${now} WHERE creature_id = ${creatureId}::uuid`;
      return (await tx.storageGc.create({ data: { bucket: BUCKETS.public, prefix: pageDir(r.store_key, r.path_prefix), creatureId, reason: 'quarantine_move', notBefore: now }, select: { id: true } })).id;
    });
    if (id === null) return;
    await this.gc.drainIds([id]);
    await this.purgeQuietly('quarantine');
  }

  // ───────────── 안쪽 ─────────────

  /** 커밋 전 판 버리기: staging·public 두 버킷의 그 판 대기 행을 '지금'으로 바꾸고 id를 돌려준다(요청 안에서 바로 처리) */
  private async dropPending(tx: Tx, row: PageRow, now: Date): Promise<bigint[]> {
    const dir = pageDir(row.store_key, row.pending_prefix!);
    await tx.storageGc.deleteMany({ where: { creatureId: row.creature_id, prefix: dir, reason: 'uncommitted' } });
    const ids: bigint[] = [];
    for (const bucket of [BUCKETS.staging, BUCKETS.public]) {
      ids.push((await tx.storageGc.create({ data: { bucket, prefix: dir, creatureId: row.creature_id, reason: 'uncommitted', notBefore: now }, select: { id: true } })).id);
    }
    return ids;
  }

  private async purgeQuietly(why: 'remake' | 'first' | 'off' | 'quarantine'): Promise<void> {
    try {
      await this.cdn.request();
    } catch (e) {
      this.log.warn({ code: 'cdn_purge_request_failed', why, type: e instanceof Error ? e.name : 'unknown' }, 'CDN 무효화 요청 실패(바닥 s-maxage 5분)');
    }
  }

  private async inspect(dir: string, k: PageFileKind): Promise<void> {
    const f = PAGE_FILES[k];
    const key = `${dir}/${f.name}`;
    const st = await this.store.stat(BUCKETS.staging, key);
    if (!st) throw rejectFile(k, 'missing');
    if (st.size > f.maxBytes) throw rejectFile(k, 'too_big');
    if (st.contentType !== f.contentType) throw rejectFile(k, 'signature');
    const head = await this.store.readHead(BUCKETS.staging, key, HEAD_BYTES);
    const r = k === 'loop' ? checkMp4(head, st.size, f) : checkJpeg(head, f);
    if (!r.ok) throw rejectFile(k, r.reason);
  }

  /** 있는 행만 잠근다(commit — 없으면 404, 계정 삭제와 겹치면 삭제가 먼저 끝난 것) */
  private async lockExisting(tx: Tx, userId: string): Promise<PageRow> {
    const [r] = await tx.$queryRaw<PageRow[]>`
      SELECT c.id AS creature_id, c.code, c.hidden, p.store_key, p.ver, p.state, p.path_prefix, p.name_shown, p.pending_ver, p.pending_prefix,
             p.pending_meta, p.pending_name_shown, p.pending_has_loop
        FROM app.creatures c JOIN app.public_pages p ON p.creature_id = c.id WHERE c.user_id = ${userId}::uuid FOR UPDATE OF p`;
    if (!r) throw new NotFoundException({ code: 'no_creature', message: '맡긴 몽망이가 없습니다' });
    return r;
  }

  /** 행이 없으면 만들고(off, ver 0) 잠근다 */
  private async lockPage(tx: Tx, userId: string): Promise<PageRow> {
    const c = await tx.creature.findUnique({ where: { userId }, select: { id: true } });
    if (!c) throw new NotFoundException({ code: 'no_creature', message: '맡긴 몽망이가 없습니다' });
    await tx.$executeRaw`INSERT INTO app.public_pages (creature_id) VALUES (${c.id}::uuid) ON CONFLICT (creature_id) DO NOTHING`;
    const [r] = await tx.$queryRaw<PageRow[]>`
      SELECT c.id AS creature_id, c.code, c.hidden, p.store_key, p.ver, p.state, p.path_prefix, p.name_shown, p.pending_ver, p.pending_prefix,
             p.pending_meta, p.pending_name_shown, p.pending_has_loop
        FROM app.creatures c JOIN app.public_pages p ON p.creature_id = c.id WHERE c.id = ${c.id}::uuid FOR UPDATE OF p`;
    return r!;
  }
}

function rejectFile(file: string, reason: string): UnprocessableEntityException {
  return new UnprocessableEntityException({ code: 'commit_check', message: '파일 검사에 실패했습니다', details: { file, reason } });
}

