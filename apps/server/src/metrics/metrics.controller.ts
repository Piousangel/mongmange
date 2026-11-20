// POST /api/v1/ping — 식별자 없는 집계 핑(architecture.md v2.1 3-2·3-6, B0).
// - 인증 없음. 본문은 contract의 pingSchema(모든 객체 strict, 자유 문자열 칸 없음)로만 읽는다.
// - 값 범위 검증에 걸리면(모르는 키·화이트리스트 밖·날짜 ±2일 밖·알려진 출시 판 밖) **조용히 버리고 204** — 조작하는 쪽에 판단 근거를 주지 않는다.
// - IP는 레이트 리밋 키(가드 메모리)로만 쓰이고 이 컨트롤러는 요청 객체를 받지도 않는다. 본문·결과는 로그에 남기지 않는다.
// - 쓰기는 메모리 합산 → 요청 안 flush(metric-aggregator.ts).
import { Body, Controller, Header, HttpCode, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBody, ApiNoContentResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { pingDateOk, pingSchema, pingToCells } from '@mong/contract';
import { z } from 'zod';
import type { Env } from '../config/env';
import { MetricAggregator } from './metric-aggregator';

/** IP 접두당 분당 핑 수(v1 3-6: 분당 20). 정상 앱은 하루 몇 번 */
export const PING_LIMIT_PER_MIN = 20;

@ApiTags('metrics')
@Controller('api/v1')
export class MetricsController {
  private readonly versions: ReadonlySet<string>;

  constructor(
    private readonly agg: MetricAggregator,
    config: ConfigService<Env, true>,
  ) {
    this.versions = new Set(config.get('METRIC_APP_VERSIONS', { infer: true }));
  }

  @Post('ping')
  @HttpCode(204)
  @Header('cache-control', 'no-store')
  @Throttle({ default: { limit: PING_LIMIT_PER_MIN, ttl: 60_000 } })
  @ApiBody({ schema: z.toJSONSchema(pingSchema as never, { target: 'openapi-3.0', unrepresentable: 'any' }) as object })
  @ApiNoContentResponse({ description: '받음 또는 조용히 버림(둘을 구별하지 않는다)' })
  async ping(@Body() raw: unknown): Promise<void> {
    const r = pingSchema.safeParse(raw);
    if (r.success && this.versions.has(r.data.appVer) && pingDateOk(r.data, this.agg.now())) this.agg.add(pingToCells(r.data));
    await this.agg.maybeFlush();
  }
}
