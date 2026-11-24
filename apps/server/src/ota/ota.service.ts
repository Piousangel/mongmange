// 자체 OTA 고르기·에셋 열기(V21, docs/design/server-v1/ota-self-host.md 3·5절). 읽기 전용 — 게시는 퍼블리시 CLI(ota-cli.ts, ota_publisher 롤)만 한다.
// 이 서비스는 요청 객체를 받지 않는다. 컨트롤러가 고르는 데 필요한 값(채널·런타임·플랫폼·'이미 받았나' 비교용 id)만 넘긴다.
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Readable } from 'node:stream';
import { Clock } from '../common/clock';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { BUCKETS, OBJECT_STORE, type ObjectStore } from '../storage/object-store';
import { bodyBinding, type OtaPlatform } from './protocol';

export interface Release {
  id: string;
  seq: number;
  channel: string;
  kind: 'update' | 'rollback';
  body: string;
  signature: string | null;
  keyId: string | null;
  assetHashes: string[];
}

export type Pick =
  | { kind: 'none' }
  | { kind: 'update'; release: Release }
  | { kind: 'rollback'; release: Release };

/** 같은 (채널·런타임·플랫폼) 결과를 이만큼 인스턴스 메모리에 둔다 — 게시 뒤 최대 이 시간 늦게 보인다 */
export const RELEASE_CACHE_MS = 30_000;
const CACHE_MAX = 1000;

export type AssetOpen =
  | { ok: true; stream: Readable; size: number; contentType: string; encoding: 'br' | 'gzip' | null }
  | { ok: false; why: 'not_found' | 'storage_unavailable' };

/** 고를 때 내보내지 않는 까닭(로그 한 줄 — 행 id·까닭만, 설치·요청 값 없음) */
type Skip = 'unsigned' | 'binding_mismatch' | 'revoked' | 'assets_missing';

@Injectable()
export class OtaService {
  private readonly log = new Logger('ota');
  private readonly cache = new Map<string, { at: number; release: Release | null; skip: Skip | null }>();
  private readonly allowUnsigned: boolean;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORE) private readonly store: ObjectStore,
    private readonly clock: Clock,
    config: ConfigService<Env, true>,
  ) {
    this.allowUnsigned = config.get('OTA_ALLOW_UNSIGNED', { infer: true });
  }

  /**
   * (채널·런타임·플랫폼)의 가장 큰 판 번호 하나 + 내보내도 되는지 판정(캐시). 판정:
   *  ① 서명 원문 안의 seq·channel이 행과 같아야 한다 — 옛 판의 서명 원문을 새 행에 넣어 다시 내미는 재생을 막는다(리뷰 M3)
   *  ② 되돌린 번들(ota_revoked)이면 내보내지 않는다
   *  ③ 업데이트의 에셋이 모두 저장소에 있어야 한다 — 매니페스트만 나가고 에셋이 503이면 기기가 매번 받다 실패한다(리뷰 L4)
   */
  private async latest(channel: string, runtimeVersion: string, platform: OtaPlatform): Promise<{ release: Release | null; skip: Skip | null }> {
    const k = `${channel}\n${runtimeVersion}\n${platform}`;
    const now = this.clock.now();
    const hit = this.cache.get(k);
    if (hit && now - hit.at < RELEASE_CACHE_MS) return hit;
    const row = await this.prisma.otaRelease.findFirst({
      where: { channel, runtimeVersion, platform },
      orderBy: { seq: 'desc' },
      select: { id: true, seq: true, channel: true, kind: true, body: true, signature: true, keyId: true, assetHashes: true },
    });
    const out = { at: now, release: row, skip: row ? await this.skipReason(row) : null };
    if (this.cache.size >= CACHE_MAX) this.cache.clear();
    this.cache.set(k, out);
    return out;
  }

  private async skipReason(r: Release): Promise<Skip | null> {
    const b = bodyBinding(r.body, r.kind);
    if (!b || b.seq !== r.seq || b.channel !== r.channel) return 'binding_mismatch';
    if (r.kind === 'rollback') return null;
    const launch = r.assetHashes[0];
    if (launch && (await this.prisma.otaRevoked.findUnique({ where: { launchHash: launch }, select: { launchHash: true } }))) return 'revoked';
    if (!this.store.configured) return 'assets_missing';
    for (const h of r.assetHashes) if (!(await this.store.stat(BUCKETS.ota, h))) return 'assets_missing';
    return null;
  }

  /**
   * 명세 'Response': 조건을 모두 만족하는 가장 최근 판(판 번호 순 — createdAt도 CLI가 늘 늘게 쓴다). 롤백 지시도 같은 줄에 선다.
   *  - 이미 그 업데이트를 실행 중이면 none(204) / 롤백인데 이미 내장 번들을 실행 중이면 none
   *  - 서명 없는 판은 OTA_ALLOW_UNSIGNED(개발 전용)이고 앱이 서명을 기대하지 않을 때만
   *  - latest의 판정에 걸리면 none + error 로그(행 id·까닭만)
   */
  async pick(q: { channel: string | null; runtimeVersion: string; platform: OtaPlatform; currentUpdateId: string | null; embeddedUpdateId: string | null; wantsSignature: boolean }): Promise<Pick> {
    if (!q.channel) return { kind: 'none' };
    const { release: r, skip } = await this.latest(q.channel, q.runtimeVersion, q.platform);
    if (!r) return { kind: 'none' };
    const why: Skip | null = skip ?? (!r.signature && (q.wantsSignature || !this.allowUnsigned) ? 'unsigned' : null);
    if (why) {
      this.log.error({ release: r.id, why }, 'OTA 판을 내보내지 않음');
      return { kind: 'none' };
    }
    if (r.kind === 'update') return q.currentUpdateId === r.id ? { kind: 'none' } : { kind: 'update', release: r };
    if (q.currentUpdateId && q.embeddedUpdateId && q.currentUpdateId === q.embeddedUpdateId) return { kind: 'none' };
    return { kind: 'rollback', release: r };
  }

  /**
   * 에셋 열기(내용 주소, 스트림 — 리뷰 M5). 무결성은 게시 때 검사(올린 뒤 원본·압축 판을 다시 읽어 해시 대조)와 내용 주소 키로 지킨다.
   * 서버는 내보낼 때 해시를 다시 계산하지 않는다: 서명된 매니페스트가 해시를 담고 앱이 받은 파일의 해시를 반드시 검사한다(명세 MUST)
   */
  async openAsset(hash: string, encoding: 'br' | 'gzip' | null): Promise<AssetOpen> {
    if (!this.store.configured) return { ok: false, why: 'storage_unavailable' };
    if (encoding) {
      const f = await this.store.openRead(BUCKETS.ota, `${hash}.${encoding === 'br' ? 'br' : 'gz'}`);
      if (f) return { ok: true, ...f, encoding };
    }
    const f = await this.store.openRead(BUCKETS.ota, hash);
    return f ? { ok: true, ...f, encoding: null } : { ok: false, why: 'not_found' };
  }

  /** 시험용: 고르기 캐시 비우기(게시 직후 바로 보려면) */
  clearCache(): void {
    this.cache.clear();
  }
}
