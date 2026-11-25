// '맡긴 것 보기'(로드맵 C12f, 처리방침 12절 열람 요구) — GET /api/v1/me/data.
// 서버가 이 계정에 대해 쥔 것을 **메타로만** 보여 준다: 세이브·이력 본문(gzip)은 읽지 않고 octet_length만 센다(본문이 이 프로세스
// 메모리에 올라오지 않는다). 이름(public_pages.meta.name)·글귀 해시·sub·userId·sha는 응답 계약(@mong/contract myDataSchema, strict)에
// 칸이 없다. 본인 것만: 모든 조회가 가드가 확인한 userId 하나로 묶인다.
// 한도: 전역 IP 분당 한도(throttler.guard) + 사용자당 시간 MY_DATA_PER_HOUR(rate-limiter, 키 = userId — 메모리, 로그에 싣지 않음).
// 감사: 요청 로그 한 줄(route 템플릿·상태 — logging.ts 규칙 1~3). 식별자 로깅 0(c12f.db.test.ts가 실제 로그로 단언).
import { HttpException, HttpStatus, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ACCOUNT_DELETION_WAIT_HOURS, MY_DATA_PER_HOUR, myDataSchema, type MyData, type PageState, type SaveVersionReason } from '@mong/contract';
import { noAccount } from '../auth/auth.guard';
import { RateLimiter } from '../common/rate-limiter';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const HOUR = 3_600_000;
const month = (d: Date | null) => (d ? d.toISOString().slice(0, 7) : null);
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

interface AccountRow {
  created_at: Date;
  last_active_month: Date | null;
  age_gate_v: number | null;
  age_confirmed_on: Date | null;
  delete_requested_at: Date | null;
  logins: number;
  moved_logins: number;
}
interface CreatureRow {
  id: string;
  code: string;
  created_at: Date;
  has_recovery: boolean;
  link_enabled: boolean;
  name_visible: boolean;
  page_state: PageState | null;
  name_shown: boolean | null;
  published_at: Date | null;
}
interface SaveRow {
  rev: number;
  client_saved_at: Date;
  updated_at: Date;
  day_index: number | null;
  strokes_total: number | null;
  validated: boolean;
  bytes: number;
}
interface VersionRow {
  reason: SaveVersionReason;
  created_at: Date;
  client_saved_at: Date;
  day_index: number | null;
  strokes_total: number | null;
  bytes: number;
}

@Injectable()
export class MyDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limiter: RateLimiter,
  ) {}

  async view(userId: string): Promise<MyData> {
    if (this.limiter.take([{ name: 'me_data', key: userId, limit: MY_DATA_PER_HOUR, windowMs: HOUR }])) {
      throw new HttpException({ code: 'rate_limited', message: '요청이 너무 잦습니다' }, HttpStatus.TOO_MANY_REQUESTS);
    }
    // 네 조회를 한 스냅숏으로(리뷰 L2): 도중에 지우기·되찾기가 끼어도 섞인 응답(계정은 있는데 몽망이는 없음)이 나가지 않는다
    const out = await this.prisma.$transaction(async (tx) => this.read(tx, userId), { isolationLevel: 'RepeatableRead' });
    // 응답 계약을 직렬화 전에 런타임으로 검사한다(리뷰 L1) — 칸이 하나라도 더 붙거나 모양이 틀리면 내보내지 않고 500.
    // 오류 메시지에 응답 내용·검사 결과를 싣지 않는다(500 로그는 err.type·message·stack뿐 — logging.ts 규칙 4)
    const checked = myDataSchema.safeParse(out);
    if (!checked.success) throw new InternalServerErrorException({ code: 'internal', message: '응답을 만들지 못했습니다' });
    return checked.data;
  }

  private async read(tx: Prisma.TransactionClient, userId: string): Promise<MyData> {
    const [acc] = await tx.$queryRaw<AccountRow[]>`
      SELECT u.created_at, u.last_active_month, u.age_gate_v, u.age_confirmed_on, u.delete_requested_at,
             (SELECT count(*)::int FROM app.user_auth a WHERE a.user_id = u.id AND a.revoked_at IS NULL) AS logins,
             (SELECT count(*)::int FROM app.user_auth a WHERE a.user_id = u.id AND a.revoked_at IS NOT NULL) AS moved_logins
        FROM app.users u WHERE u.id = ${userId}::uuid`;
    // 가드와 이 조회 사이에 지워졌다 — 그 로그인에 사용자가 없다는 같은 갈래(B2b)
    if (!acc) throw noAccount();
    const [c] = await tx.$queryRaw<CreatureRow[]>`
      SELECT c.id, c.code, c.created_at, (c.recovery_hash IS NOT NULL) AS has_recovery, c.link_enabled, c.name_visible,
             p.state::text AS page_state, p.name_shown, p.published_at
        FROM app.creatures c LEFT JOIN app.public_pages p ON p.creature_id = c.id
       WHERE c.user_id = ${userId}::uuid`;
    const [s] = c
      ? await tx.$queryRaw<SaveRow[]>`
          SELECT rev, client_saved_at, updated_at, day_index, strokes_total, validated, octet_length(body)::int AS bytes
            FROM app.saves WHERE creature_id = ${c.id}::uuid`
      : [];
    const versions = c
      ? await tx.$queryRaw<VersionRow[]>`
          SELECT reason::text AS reason, created_at, client_saved_at, day_index, strokes_total, octet_length(body)::int AS bytes
            FROM app.save_versions WHERE creature_id = ${c.id}::uuid ORDER BY created_at DESC, id DESC`
      : [];
    return {
      account: {
        createdAt: acc.created_at.toISOString(),
        lastActiveMonth: month(acc.last_active_month),
        ageGateVersion: acc.age_gate_v,
        ageConfirmedOn: day(acc.age_confirmed_on),
        logins: acc.logins,
        movedLogins: acc.moved_logins,
        deletionPendingUntil: acc.delete_requested_at ? new Date(acc.delete_requested_at.getTime() + ACCOUNT_DELETION_WAIT_HOURS * HOUR).toISOString() : null,
      },
      creatures: c ? 1 : 0,
      creature: c
        ? {
            code: c.code,
            createdAt: c.created_at.toISOString(),
            recoveryCodeSet: c.has_recovery,
            link: {
              enabled: c.link_enabled,
              nameVisible: c.name_visible,
              nameShown: c.name_shown === true,
              pageState: c.page_state,
              publishedAt: c.published_at ? c.published_at.toISOString() : null,
            },
          }
        : null,
      save: s
        ? {
            rev: s.rev,
            clientSavedAt: s.client_saved_at.toISOString(),
            lastSavedAt: s.updated_at.toISOString(),
            dayIndex: s.day_index,
            strokesTotal: s.strokes_total,
            validated: s.validated,
            bytes: s.bytes,
          }
        : null,
      versions: versions.map((v) => ({
        reason: v.reason,
        createdAt: v.created_at.toISOString(),
        clientSavedAt: v.client_saved_at.toISOString(),
        dayIndex: v.day_index,
        strokesTotal: v.strokes_total,
        bytes: v.bytes,
      })),
    };
  }
}
