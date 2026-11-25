// 계정(architecture.md v2.2 3-3): 필요할 때 익명 → 되찾기 글귀. 서버가 계정을 만드는 길은 bootstrap·recover 둘뿐이다.
//  - 연령: 서버는 연령 확인 판 번호와 '통과한 날짜'만 저장한다(users.age_gate_v·age_confirmed_on). 태어난 해·달은 받지 않는다(3-3 ③).
//  - 되살아남 막기(3-8 I1): 새 기기 로그인을 붙이기 전에 Auth Admin으로 auth.users 존재를 확인하고, 삭제 대기(auth_gc) 중인 sub도 거절한다.
//  - 남용 상한(3-4-1): 새 user_auth를 만드는 요청은 IP 접두당 5/시간·20/일 + 서비스 전체 하루 ACCOUNT_NEW_PER_DAY.
//  - 되찾기(3-3 ⑤): 몽망이·사용자는 그대로, 기기 로그인만 바꾼다(새 sub 연결, 옛 sub revoked → 30일 뒤 삭제). 새 글귀를 주고 옛 해시는 무효.
//    글귀는 HMAC 해시로만 찾는다. 시도 한도 IP 접두당 5/시간·글귀당 10/일 — 맞든 틀리든 센다(무차별 대입 비용).
//  - 되찾기 멱등(B2b): 새 글귀 = HMAC(pepper, 기기 sub + 넣은 옛 글귀)(codes.ts deriveRecoveryCode). 커밋 뒤 응답이 끊겨 같은 기기가
//    같은 글귀로 다시 부르면, 그 기기의 몽망이 글귀 해시가 '이 sub·이 옛 글귀로 만든 값'인지로 같은 대상임을 알아보고 200 + replay를 준다.
//    따로 저장하는 값이 없다. 다른 몽망이의 글귀·틀린 글귀·그 뒤 글귀를 다시 받은 경우는 지금처럼 409 has_creature.
import { timingSafeEqual } from 'node:crypto';
import { ConflictException, HttpException, HttpStatus, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  normalizeCreatureCode,
  normalizeRecoveryCode,
  type AgeGate,
  type BootstrapResponse,
  type RecoverResponse,
  type RecoveryCodeResponse,
} from '@mong/contract';
import type { Prisma } from '../generated/prisma/client';
import { AuthAdmin } from '../auth/auth-admin';
import { movedAway, noAccount, type AuthContext } from '../auth/auth.guard';
import { Clock, monthStart, utcDay } from '../common/clock';
import { RateLimiter, type LimitRule } from '../common/rate-limiter';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { metaOf } from '../saves/cloud-save.service';
import { deriveRecoveryCode, newCreatureCode, newRecoveryCode, recoveryHash } from './codes';
import { RecoveryPepper } from './recovery-pepper';

type Tx = Prisma.TransactionClient;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** 3-4-1·3-8 표의 값 */
export const LIMITS = {
  accountPerIpHour: 5,
  accountPerIpDay: 20,
  recoverPerIpHour: 5,
  recoverPerCodeDay: 10,
  /** 되찾기 재시도(replay)를 받는 기간 — 첫 되찾기(recovery_rotated_at)부터. 글귀는 '한 번만 보여 줌'이 원칙이라 짧게(B2b 리뷰 L1) */
  replayWindowMs: DAY,
} as const;

function tooMany(): HttpException {
  return new HttpException({ code: 'rate_limited', message: '요청이 너무 잦습니다' }, HttpStatus.TOO_MANY_REQUESTS);
}
function hasCreature(): ConflictException {
  return new ConflictException({ code: 'has_creature', message: '이 기기에 이미 몽망이가 있습니다' });
}

@Injectable()
export class AccountService {
  private readonly log = new Logger('Account');
  private readonly dailyCap: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly limiter: RateLimiter,
    private readonly admin: AuthAdmin,
    private readonly pepper: RecoveryPepper,
    config: ConfigService<Env, true>,
  ) {
    this.dailyCap = config.get('ACCOUNT_NEW_PER_DAY', { infer: true });
  }

  /** POST /me/bootstrap — 멱등(user_auth PK·creatures UNIQUE(user_id)) */
  async bootstrap(a: AuthContext, ipKey: string, gate: AgeGate): Promise<BootstrapResponse> {
    if (a.revoked) throw movedAway();
    if (a.userId) return this.existing(a.userId);
    await this.assertLiveLogin(a.sub);
    await this.chargeNewLogin(ipKey);
    const now = this.clock.now();
    const userId = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO app.users (id, created_at, last_active_month, age_gate_v, age_confirmed_on)
        VALUES (${a.sub}::uuid, ${new Date(now)}, ${monthStart(now)}::date, ${gate.v}, ${utcDay(now)}::date)
        ON CONFLICT (id) DO NOTHING`;
      await tx.$executeRaw`
        INSERT INTO app.user_auth (sub, user_id, linked_at) VALUES (${a.sub}::uuid, ${a.sub}::uuid, ${new Date(now)})
        ON CONFLICT (sub) DO NOTHING`;
      // 같은 sub의 recover와 겹쳤으면 그쪽 사용자를 따른다
      const link = await tx.userAuth.findUniqueOrThrow({ where: { sub: a.sub }, select: { userId: true, revokedAt: true } });
      if (link.revokedAt) throw movedAway();
      await this.ensureCreature(tx, link.userId);
      return link.userId;
    });
    return this.existing(userId);
  }

  /** POST /recovery-code — 새 글귀(한 번만 보여 줌). 다시 부르면 옛 해시는 무효 */
  async issueRecoveryCode(userId: string): Promise<RecoveryCodeResponse> {
    const { code16, display } = newRecoveryCode();
    const n = await this.prisma.creature.updateMany({
      where: { userId },
      data: { recoveryHash: this.pepper.hash(code16), recoveryPepperV: this.pepper.current.v, recoveryRotatedAt: new Date(this.clock.now()) },
    });
    if (!n.count) throw new NotFoundException({ code: 'no_creature', message: '맡긴 몽망이가 없습니다' });
    return { code: display };
  }

  /** POST /recover — 흐름표 3-3 ⑤ 단계 2~4 */
  async recover(a: AuthContext, ipKey: string, rawCode: string, gate: AgeGate): Promise<RecoverResponse> {
    if (a.revoked) throw movedAway();
    if (this.limiter.take([{ name: 'recover_ip', key: ipKey, limit: LIMITS.recoverPerIpHour, windowMs: HOUR }])) throw tooMany();
    const code16 = normalizeRecoveryCode(rawCode);
    if (!code16) throw notFoundCode();
    // 글귀당 한도의 키도 해시(평문 글귀는 메모리 키에도 두지 않는다)
    if (this.limiter.take([{ name: 'recover_code', key: Buffer.from(this.pepper.hash(code16)).toString('base64url'), limit: LIMITS.recoverPerCodeDay, windowMs: DAY }])) throw tooMany();
    if (a.userId) {
      // 이 기기에 이미 몽망이가 있다 — 그 몽망이를 이 글귀로 되찾은 바로 그 기기의 재시도면 성공(B2b), 아니면 409
      const again = await this.replay(a.sub, code16);
      if (again) return again;
      throw hasCreature();
    }
    // 지금 판 + 옛 판 pepper로 저장된 해시를 모두 대 본다(회전 중에도 옛 글귀가 산다)
    const target = await this.prisma.creature.findFirst({ where: { OR: this.pepper.candidates(code16) }, select: { id: true, recoveryHash: true } });
    if (!target?.recoveryHash) throw notFoundCode();
    const hash = target.recoveryHash;
    await this.assertLiveLogin(a.sub);
    await this.chargeNewLogin(ipKey);
    const now = this.clock.now();
    const pep = this.pepper.current;
    const fresh = deriveRecoveryCode(pep.value, a.sub, code16);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const [c] = await tx.$queryRaw<{ id: string; user_id: string; code: string }[]>`
          SELECT id, user_id, code FROM app.creatures WHERE id = ${target.id}::uuid AND recovery_hash = ${hash} FOR UPDATE`;
        if (!c) throw notFoundCode(); // 같은 글귀로 동시에 되찾으면 먼저 끝난 쪽이 글귀를 바꿨다(같은 기기였으면 아래 catch가 재시도로 본다)
        const at = new Date(now);
        await tx.$executeRaw`UPDATE app.user_auth SET revoked_at = ${at} WHERE user_id = ${c.user_id}::uuid AND revoked_at IS NULL`;
        // 같은 sub로 bootstrap이 먼저 끝났으면(경합) 이 기기에는 이미 몽망이가 있다 — 트랜잭션째 되돌린다
        const linked = await tx.$queryRaw<unknown[]>`
          INSERT INTO app.user_auth (sub, user_id, linked_at) VALUES (${a.sub}::uuid, ${c.user_id}::uuid, ${at})
          ON CONFLICT (sub) DO NOTHING RETURNING sub`;
        if (!linked.length) throw hasCreature();
        await tx.$executeRaw`
          UPDATE app.creatures SET recovery_hash = ${recoveryHash(pep.value, fresh.code16)}, recovery_pepper_v = ${pep.v},
                 recovery_rotated_at = ${at} WHERE id = ${c.id}::uuid`;
        await tx.$executeRaw`
          UPDATE app.users SET age_gate_v = ${gate.v}, age_confirmed_on = ${utcDay(now)}::date,
                 -- 활동 달은 activity.ts와 같은 조건부 갱신(이달보다 앞설 때만 — 시계가 늦은 인스턴스가 되돌리지 못함, V25 리뷰 L2)
                 last_active_month = CASE WHEN last_active_month IS NULL OR last_active_month < ${monthStart(now)}::date
                                          THEN ${monthStart(now)}::date ELSE last_active_month END
           WHERE id = ${c.user_id}::uuid`;
        return { creature: { code: c.code }, save: await this.saveMeta(tx, c.id), newCode: fresh.display };
      });
    } catch (e) {
      // 같은 기기의 같은 요청 둘이 겹쳤으면(앱 재시도·이중 탭) 늦은 쪽도 먼저 끝난 쪽과 같은 결과를 받는다
      if (e instanceof NotFoundException || e instanceof ConflictException) {
        const again = await this.replay(a.sub, code16);
        if (again) return again;
      }
      throw e;
    }
  }

    /** 웹 /delete(3-8 ②): 인장 코드 + 되찾기 글귀가 같은 몽망이를 가리키면 그 사용자 id. 시도 한도는 recover와 같다 */
  async userForWebDeletion(ipKey: string, rawCode: string, rawPhrase: string): Promise<string> {
    if (this.limiter.take([{ name: 'web_delete_ip', key: ipKey, limit: LIMITS.recoverPerIpHour, windowMs: HOUR }])) throw tooMany();
    const code = normalizeCreatureCode(rawCode);
    const phrase = normalizeRecoveryCode(rawPhrase);
    if (!code || !phrase) throw notFoundCode();
    if (this.limiter.take([{ name: 'recover_code', key: Buffer.from(this.pepper.hash(phrase)).toString('base64url'), limit: LIMITS.recoverPerCodeDay, windowMs: DAY }])) throw tooMany();
    const c = await this.prisma.creature.findFirst({ where: { code, OR: this.pepper.candidates(phrase) }, select: { userId: true } });
    if (!c) throw notFoundCode();
    return c.userId;
  }

  // ───────────── 안쪽 ─────────────

  /**
   * B2b: 이 sub에 붙은 몽망이의 지금 글귀 해시가 '이 sub + 이 옛 글귀'로 만든 새 글귀의 해시와 같으면, 그 되찾기의 재시도다.
   * 해시를 쓴 pepper 판(recovery_pepper_v)으로 다시 계산한다 — 그 판이 아직 목록에 있는 동안(회전 절차와 같은 수명).
   * 첫 되찾기 뒤 24시간(replayWindowMs) 안에서만. 아니면 null(지금처럼 409). 아무것도 쓰지 않는다(글귀를 다시 바꾸면 첫 응답의 글귀가 죽는다).
   */
  private async replay(sub: string, code16: string): Promise<RecoverResponse | null> {
    const [row] = await this.prisma.$queryRaw<
      { id: string; code: string; recovery_hash: Uint8Array | null; recovery_pepper_v: number; recovery_rotated_at: Date | null }[]
    >`
      SELECT c.id, c.code, c.recovery_hash, c.recovery_pepper_v, c.recovery_rotated_at
        FROM app.user_auth a JOIN app.creatures c ON c.user_id = a.user_id
       WHERE a.sub = ${sub}::uuid AND a.revoked_at IS NULL`;
    if (!row?.recovery_hash || !row.recovery_rotated_at) return null;
    // 기한은 이미 있는 글귀 바꾼 시각으로만 판단한다(새로 저장하는 값 없음). 다시 받은 글귀는 해시가 무작위라 아래 비교에서 어차피 떨어진다
    if (this.clock.now() - row.recovery_rotated_at.getTime() > LIMITS.replayWindowMs) return null;
    const p = [this.pepper.current, ...this.pepper.previous].find((x) => x.v === row.recovery_pepper_v);
    if (!p) return null;
    const next = deriveRecoveryCode(p.value, sub, code16);
    const want = recoveryHash(p.value, next.code16);
    const have = Buffer.from(row.recovery_hash);
    if (have.length !== want.length || !timingSafeEqual(have, want)) return null;
    return { creature: { code: row.code }, save: await this.saveMeta(this.prisma, row.id), newCode: next.display, replay: true };
  }

  private async saveMeta(db: Tx | PrismaService, creatureId: string): Promise<RecoverResponse['save']> {
    const [s] = await db.$queryRaw<Parameters<typeof metaOf>[0][]>`
      SELECT creature_id, rev, body_sha256, envelope_ver, sim_ver, validated, client_saved_at, day_index, strokes_total, quota_day, quota_bytes
        FROM app.saves WHERE creature_id = ${creatureId}::uuid`;
    return s ? metaOf(s) : null;
  }

  private async existing(userId: string): Promise<BootstrapResponse> {
    const c = await this.prisma.creature.findUnique({ where: { userId }, select: { code: true } });
    if (!c) throw new NotFoundException({ code: 'no_creature', message: '맡긴 몽망이가 없습니다' });
    return { userId, creature: { code: c.code } };
  }

  /** auth.users에 살아 있고 삭제 대기 중이 아닌 sub만 새로 붙인다 */
  private async assertLiveLogin(sub: string): Promise<void> {
    // 토큰은 이미 유효하게 서명됐다(가드) — 그 로그인 자체를 더 쓸 수 없다는 뜻이라 no_account(B2b): 앱은 토큰 갱신이 아니라 새 로그인으로
    if (await this.prisma.authGc.findUnique({ where: { sub }, select: { sub: true } })) throw noAccount();
    if (!(await this.admin.exists(sub))) throw noAccount();
  }

  private async chargeNewLogin(ipKey: string): Promise<void> {
    const rules: LimitRule[] = [
      { name: 'account_ip_hour', key: ipKey, limit: LIMITS.accountPerIpHour, windowMs: HOUR },
      { name: 'account_ip_day', key: ipKey, limit: LIMITS.accountPerIpDay, windowMs: DAY },
    ];
    if (this.limiter.take(rules)) throw tooMany();
    // 그날(UTC) [0시, 다음 날 0시) — 위쪽 끝이 없으면 서버 시계가 뒤로 갔을 때(또는 시험이 시계를 되돌렸을 때) 미래 행까지 센다(B7a)
    const since = new Date(`${utcDay(this.clock.now())}T00:00:00Z`);
    const until = new Date(since.getTime() + DAY);
    const today = await this.prisma.userAuth.count({ where: { linkedAt: { gte: since, lt: until } } });
    if (today >= this.dailyCap) {
      this.log.error({ code: 'account_daily_cap', cap: this.dailyCap }, '하루 새 계정 상한 도달 — 운영 확인 필요');
      throw new ServiceUnavailableException({ code: 'account_cap', message: '잠시 뒤에 다시 해 주세요' });
    }
  }

  /** 인장 코드 충돌(40비트)은 드물지만 다시 뽑는다 */
  private async ensureCreature(tx: Tx, userId: string): Promise<void> {
    for (let i = 0; i < 5; i++) {
      await tx.$executeRaw`
        INSERT INTO app.creatures (id, user_id, code) VALUES (gen_random_uuid(), ${userId}::uuid, ${newCreatureCode()})
        ON CONFLICT DO NOTHING`;
      if (await tx.creature.findUnique({ where: { userId }, select: { id: true } })) return;
    }
    throw new Error('인장 코드 발급 실패');
  }
}

function notFoundCode(): NotFoundException {
  return new NotFoundException({ code: 'not_found', message: '글귀가 맞지 않습니다' });
}
