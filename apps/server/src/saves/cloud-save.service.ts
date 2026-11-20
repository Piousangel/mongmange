// 맡겨 두기 — 세이브 동기화(architecture.md v2.2 3-4·3-4-1). 통째 + 리비전, 병합 없음, 충돌은 나란히 고르기.
// 잠금 규칙(I4): PUT·restore·POST conflicts는 모두 먼저 saves 행을 FOR UPDATE로 잡는다 → 같은 몽망이의 쓰기는 줄을 서고
// conflict 3·pre_restore 3·weekly 주 1벌이 동시 요청에서도 지켜진다. 이력은 INSERT·DELETE만(UPDATE로 고치지 않음).
// 이력 조회·복원은 언제나 `public_id = $id AND creature_id = $본인` — 남의 것·막 솎인 것은 똑같이 404.
import { ConflictException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  SAVE_DAILY_GZIP_BYTES,
  SAVE_VERSION_KEEP,
  SAVE_VERSION_MAX_DAYS,
  type SaveMeta,
  type SaveVersion,
  type SaveVersionReason,
  type SaveWithBody,
  type SaveWriteResponse,
} from '@mong/contract';
import type { Prisma } from '../generated/prisma/client';
import { Clock, isoWeekUtc, monthStart, utcDay } from '../common/clock';
import { RateLimiter } from '../common/rate-limiter';
import { PrismaService } from '../prisma/prisma.service';
import { prepareSave, unzipSave } from './save-body';

type Tx = Prisma.TransactionClient;

/** PUT 전제 조건: 처음 올림(`If-None-Match: *`) 또는 마지막으로 본 rev(`If-Match`) */
export type Precondition = { kind: 'none' } | { kind: 'match'; rev: number };

interface SaveRow {
  creature_id: string;
  rev: number;
  body_sha256: Uint8Array;
  envelope_ver: number;
  sim_ver: number;
  validated: boolean;
  client_saved_at: Date;
  day_index: number | null;
  strokes_total: number | null;
  quota_day: Date | null;
  quota_bytes: number;
}

/** 사용자당 PUT 60/시간(3-8), conflicts 10/일(3-4-1) */
export const PUT_PER_HOUR = 60;
export const CONFLICTS_PER_DAY = 10;
const HOUR = 3_600_000;
const DAY = 86_400_000;

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

export function metaOf(r: SaveRow): SaveMeta {
  return {
    rev: r.rev,
    sha: hex(r.body_sha256),
    clientSavedAt: r.client_saved_at.toISOString(),
    dayIndex: r.day_index,
    strokesTotal: r.strokes_total,
    envelopeVer: r.envelope_ver,
    simVer: r.sim_ver,
    validated: r.validated,
  };
}

function conflict(server: SaveMeta | null): HttpException {
  return new ConflictException({ code: 'save_conflict', message: '서버에 다른 본이 있습니다', details: { server } });
}

function quotaExceeded(): HttpException {
  return new HttpException({ code: 'save_quota', message: '오늘은 더 맡길 수 없습니다' }, HttpStatus.TOO_MANY_REQUESTS);
}

const SAVE_COLS = `creature_id, rev, body_sha256, envelope_ver, sim_ver, validated, client_saved_at, day_index, strokes_total, quota_day, quota_bytes`;

@Injectable()
export class CloudSaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly limiter: RateLimiter,
  ) {}

  // ───────────── 조회 ─────────────

  async meta(userId: string): Promise<SaveMeta> {
    const row = await this.readRow(userId);
    return metaOf(row);
  }

  async full(userId: string): Promise<SaveWithBody> {
    const c = await this.creatureId(this.prisma, userId);
    const s = await this.prisma.save.findUnique({ where: { creatureId: c } });
    if (!s) throw noSave();
    return {
      ...metaOf({
        creature_id: c,
        rev: s.rev,
        body_sha256: s.bodySha256,
        envelope_ver: s.envelopeVer,
        sim_ver: s.simVer,
        validated: s.validated,
        client_saved_at: s.clientSavedAt,
        day_index: s.dayIndex,
        strokes_total: s.strokesTotal,
        quota_day: s.quotaDay,
        quota_bytes: s.quotaBytes,
      }),
      body: await unzipSave(s.body),
    };
  }

  async versions(userId: string): Promise<SaveVersion[]> {
    const c = await this.creatureId(this.prisma, userId);
    const rows = await this.prisma.saveVersion.findMany({
      where: { creatureId: c },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { publicId: true, reason: true, rev: true, clientSavedAt: true, dayIndex: true, strokesTotal: true, validated: true, createdAt: true },
    });
    return rows.map((v) => ({
      id: v.publicId,
      reason: v.reason,
      rev: v.rev,
      clientSavedAt: v.clientSavedAt.toISOString(),
      dayIndex: v.dayIndex,
      strokesTotal: v.strokesTotal,
      validated: v.validated,
      createdAt: v.createdAt.toISOString(),
    }));
  }

  async version(userId: string, publicId: string): Promise<SaveVersion & { body: string }> {
    const c = await this.creatureId(this.prisma, userId);
    const v = await this.prisma.saveVersion.findFirst({ where: { publicId, creatureId: c } });
    if (!v) throw new NotFoundException();
    return {
      id: v.publicId,
      reason: v.reason,
      rev: v.rev,
      clientSavedAt: v.clientSavedAt.toISOString(),
      dayIndex: v.dayIndex,
      strokesTotal: v.strokesTotal,
      validated: v.validated,
      createdAt: v.createdAt.toISOString(),
      body: await unzipSave(v.body),
    };
  }

  // ───────────── 쓰기 ─────────────

  /** PUT /saves/main — 정본 3-4-1 'PUT 트랜잭션' 표 */
  async put(userId: string, pre: Precondition, body: string, clientSavedAt: string, keepMine: boolean): Promise<SaveWriteResponse> {
    const p = await prepareSave(body);
    if (this.limiter.take([{ name: 'save_put', key: userId, limit: PUT_PER_HOUR, windowMs: HOUR }])) {
      throw new HttpException({ code: 'rate_limited', message: '요청이 너무 잦습니다' }, HttpStatus.TOO_MANY_REQUESTS);
    }
    const now = this.clock.now();
    const sha = hex(p.sha);
    return this.prisma.$transaction(async (tx) => {
      const c = await this.creatureId(tx, userId);
      // 두 바퀴: 첫 PUT이 동시에 둘이면 한쪽 INSERT가 DO NOTHING으로 빈손 → 같은 트랜잭션에서 행을 다시 잡아 '행 있음' 규칙으로(결정적)
      for (let round = 0; round < 2; round++) {
        const row = await this.lockRow(tx, c);
        if (!row) {
          // 행 없음 + If-Match: 서버가 사본을 잃었다(백업 복원 등) → 앱은 If-None-Match: *로 다시
          if (pre.kind === 'match') throw conflict(null);
          if (p.gz.length > SAVE_DAILY_GZIP_BYTES) throw quotaExceeded();
          const ins = await tx.$queryRaw<{ rev: number }[]>`
            INSERT INTO app.saves (creature_id, rev, body, body_sha256, envelope_ver, sim_ver, validated, client_saved_at,
                                   day_index, strokes_total, quota_day, quota_bytes, updated_at)
            VALUES (${c}::uuid, 1, ${p.gz}, ${p.sha}, ${p.envelopeVer}, ${p.simVer}, ${p.validated}, ${new Date(clientSavedAt)},
                    ${p.dayIndex}, ${p.strokesTotal}, ${utcDay(now)}::date, ${p.gz.length}, ${new Date(now)})
            ON CONFLICT (creature_id) DO NOTHING RETURNING rev`;
          if (ins.length) {
            await this.touchActive(tx, userId, now);
            return { rev: 1, sha };
          }
          continue;
        }
        // 빨리 감기(3-4): 서버 본이 내 본과 같으면 충돌이 아니다 — 반쯤 성공한 재전송·같은 본 동시 첫 PUT 포함
        if (hex(row.body_sha256) === sha) return { rev: row.rev, sha };
        if (pre.kind === 'none' || pre.rev !== row.rev) throw conflict(metaOf(row));
        await this.chargeQuota(tx, row, p.gz.length, now);
        await this.archiveCurrent(tx, c, keepMine ? 'conflict' : 'auto', now);
        await tx.$executeRaw`
          UPDATE app.saves SET rev = rev + 1, body = ${p.gz}, body_sha256 = ${p.sha}, envelope_ver = ${p.envelopeVer},
                 sim_ver = ${p.simVer}, validated = ${p.validated}, client_saved_at = ${new Date(clientSavedAt)},
                 day_index = ${p.dayIndex}, strokes_total = ${p.strokesTotal}, updated_at = ${new Date(now)}
           WHERE creature_id = ${c}::uuid`;
        await this.keepNewest(tx, c, 'overwritten');
        await this.keepNewest(tx, c, 'weekly');
        await this.keepNewest(tx, c, 'conflict');
        await this.dropAged(tx, c, now);
        await this.touchActive(tx, userId, now);
        return { rev: row.rev + 1, sha };
      }
      throw new Error('세이브 행 잠금 재시도 초과');
    });
  }

  /** POST /saves/main/conflicts — 서버 본을 고른 뒤 이 기기의 진 본을 30일 맡김 */
  async addConflict(userId: string, body: string, clientSavedAt: string): Promise<{ id: string }> {
    const p = await prepareSave(body);
    if (this.limiter.take([{ name: 'save_conflicts', key: userId, limit: CONFLICTS_PER_DAY, windowMs: DAY }])) {
      throw new HttpException({ code: 'rate_limited', message: '요청이 너무 잦습니다' }, HttpStatus.TOO_MANY_REQUESTS);
    }
    const now = this.clock.now();
    return this.prisma.$transaction(async (tx) => {
      const c = await this.creatureId(tx, userId);
      const row = await this.lockRow(tx, c);
      if (!row) throw noSave(); // 맡긴 본이 없으면 충돌도 없다
      await this.chargeQuota(tx, row, p.gz.length, now);
      const [v] = await tx.$queryRaw<{ public_id: string }[]>`
        INSERT INTO app.save_versions (creature_id, rev, body, body_sha256, envelope_ver, sim_ver, validated, day_index,
                                       strokes_total, client_saved_at, reason, created_at)
        VALUES (${c}::uuid, ${row.rev}, ${p.gz}, ${p.sha}, ${p.envelopeVer}, ${p.simVer}, ${p.validated}, ${p.dayIndex},
                ${p.strokesTotal}, ${new Date(clientSavedAt)}, 'conflict', ${new Date(now)})
        RETURNING public_id::text`;
      await this.keepNewest(tx, c, 'conflict');
      await this.touchActive(tx, userId, now);
      return { id: v!.public_id };
    });
  }

  /** POST /saves/main/versions/{id}/restore — 현재본은 pre_restore로, 고른 이력 본이 새 현재본(rev + 1). 고른 행은 지우지 않는다 */
  async restore(userId: string, publicId: string, ifMatch: number): Promise<SaveWriteResponse> {
    const now = this.clock.now();
    return this.prisma.$transaction(async (tx) => {
      const c = await this.creatureId(tx, userId);
      const row = await this.lockRow(tx, c);
      if (!row) throw noSave();
      if (row.rev !== ifMatch) throw conflict(metaOf(row));
      const [v] = await tx.$queryRaw<{ id: bigint; body_sha256: Uint8Array }[]>`
        SELECT id, body_sha256 FROM app.save_versions WHERE public_id = ${publicId}::uuid AND creature_id = ${c}::uuid`;
      if (!v) throw new NotFoundException();
      await this.archiveCurrent(tx, c, 'pre_restore', now);
      await tx.$executeRaw`
        UPDATE app.saves s SET rev = s.rev + 1, body = v.body, body_sha256 = v.body_sha256, envelope_ver = v.envelope_ver,
               sim_ver = v.sim_ver, validated = v.validated, client_saved_at = v.client_saved_at, day_index = v.day_index,
               strokes_total = v.strokes_total, updated_at = ${new Date(now)}
          FROM app.save_versions v
         WHERE s.creature_id = ${c}::uuid AND v.id = ${v.id}`;
      await this.keepNewest(tx, c, 'pre_restore');
      await this.touchActive(tx, userId, now);
      return { rev: row.rev + 1, sha: hex(v.body_sha256) };
    });
  }

  // ───────────── 안쪽 ─────────────

  private async readRow(userId: string): Promise<SaveRow> {
    const c = await this.creatureId(this.prisma, userId);
    const [row] = await this.prisma.$queryRawUnsafe<SaveRow[]>(`SELECT ${SAVE_COLS} FROM app.saves WHERE creature_id = $1::uuid`, c);
    if (!row) throw noSave();
    return row;
  }

  private async lockRow(tx: Tx, creatureId: string): Promise<SaveRow | undefined> {
    const [row] = await tx.$queryRawUnsafe<SaveRow[]>(`SELECT ${SAVE_COLS} FROM app.saves WHERE creature_id = $1::uuid FOR UPDATE`, creatureId);
    return row;
  }

  private async creatureId(db: Tx | PrismaService, userId: string): Promise<string> {
    const c = await db.creature.findUnique({ where: { userId }, select: { id: true } });
    if (!c) throw new NotFoundException({ code: 'no_creature', message: '맡긴 몽망이가 없습니다' });
    return c.id;
  }

  /**
   * 덮이기 직전 현재본을 이력으로(3-4-1 ①). 'auto' = 이번 ISO 주(서버 UTC)에 weekly가 없으면 weekly, 있으면 overwritten.
   * weekly는 ON CONFLICT … DO NOTHING으로 넣는다 — UNIQUE 위반으로 트랜잭션이 깨지지 않게(I3).
   */
  private async archiveCurrent(tx: Tx, c: string, kind: 'auto' | 'conflict' | 'pre_restore', now: number): Promise<void> {
    const at = new Date(now);
    if (kind === 'auto') {
      const week = isoWeekUtc(now);
      const w = await tx.$queryRaw<{ id: bigint }[]>`
        INSERT INTO app.save_versions (creature_id, rev, body, body_sha256, envelope_ver, sim_ver, validated, day_index,
                                       strokes_total, client_saved_at, reason, iso_week, created_at)
        SELECT creature_id, rev, body, body_sha256, envelope_ver, sim_ver, validated, day_index, strokes_total, client_saved_at,
               'weekly', ${week}, ${at} FROM app.saves WHERE creature_id = ${c}::uuid
        ON CONFLICT (creature_id, iso_week) WHERE reason = 'weekly' DO NOTHING
        RETURNING id`;
      if (w.length) return;
    }
    const reason: SaveVersionReason = kind === 'auto' ? 'overwritten' : kind;
    await tx.$executeRaw`
      INSERT INTO app.save_versions (creature_id, rev, body, body_sha256, envelope_ver, sim_ver, validated, day_index,
                                     strokes_total, client_saved_at, reason, created_at)
      SELECT creature_id, rev, body, body_sha256, envelope_ver, sim_ver, validated, day_index, strokes_total, client_saved_at,
             ${reason}::app.save_version_reason, ${at} FROM app.saves WHERE creature_id = ${c}::uuid`;
  }

  /**
   * 기간 상한(28·30일)을 PUT 안에서도 — pg_cron(app.prune_save_versions)이 빠져도 '최대 4주'가 지켜지는 두 번째 겹(B2 리뷰 I2).
   * 이 몽망이 행만, 인덱스(creature_id, reason, created_at)로 찾는다
   */
  private async dropAged(tx: Tx, c: string, now: number): Promise<void> {
    const d = SAVE_VERSION_MAX_DAYS;
    const before = (days: number) => new Date(now - days * 86_400_000);
    await tx.$executeRaw`
      DELETE FROM app.save_versions WHERE creature_id = ${c}::uuid AND (
        (reason IN ('overwritten', 'weekly') AND created_at < ${before(Math.min(d.overwritten, d.weekly))})
        OR (reason IN ('conflict', 'pre_restore') AND created_at < ${before(Math.min(d.conflict, d.pre_restore))}))`;
  }

  /** 칸마다 최신 N개만(3-4-1 개수 상한). 기간 상한은 dropAged(PUT 안) + app.prune_save_versions(pg_cron) */
  private async keepNewest(tx: Tx, c: string, reason: keyof typeof SAVE_VERSION_KEEP): Promise<void> {
    await tx.$executeRaw`
      DELETE FROM app.save_versions WHERE id IN (
        SELECT id FROM app.save_versions WHERE creature_id = ${c}::uuid AND reason = ${reason}::app.save_version_reason
         ORDER BY created_at DESC, id DESC OFFSET ${SAVE_VERSION_KEEP[reason]})`;
  }

  /** 몽망이당 하루(UTC) 새 본문 4MB(압축 뒤, 3-4-1). 잠근 행 위에서 세므로 동시 요청도 넘지 못한다 */
  private async chargeQuota(tx: Tx, row: SaveRow, bytes: number, now: number): Promise<void> {
    const today = utcDay(now);
    const used = row.quota_day && row.quota_day.toISOString().slice(0, 10) === today ? row.quota_bytes : 0;
    if (used + bytes > SAVE_DAILY_GZIP_BYTES) throw quotaExceeded();
    await tx.$executeRaw`UPDATE app.saves SET quota_day = ${today}::date, quota_bytes = ${used + bytes} WHERE creature_id = ${row.creature_id}::uuid`;
  }

  /** 장기 미사용 판단(5-5): 그달 1일로만, 달마다 최대 한 번 UPDATE */
  private async touchActive(tx: Tx, userId: string, now: number): Promise<void> {
    const m = monthStart(now);
    await tx.$executeRaw`UPDATE app.users SET last_active_month = ${m}::date WHERE id = ${userId}::uuid AND last_active_month IS DISTINCT FROM ${m}::date`;
  }
}

function noSave(): HttpException {
  return new NotFoundException({ code: 'no_save', message: '맡긴 세이브가 없습니다' });
}
