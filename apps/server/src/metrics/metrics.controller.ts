// POST /api/v1/ping — 식별자 없는 집계 핑(architecture.md v2.1 3-2·3-6, B0).
// - 인증 없음. 본문은 contract의 pingSchema(모든 객체 strict, 자유 문자열 칸 없음)로만 읽는다.
// - 값 범위 검증에 걸리면(모르는 키·화이트리스트 밖·날짜 ±2일 밖·알려진 출시 판 밖) **조용히 버리고 204** — 조작하는 쪽에 판단 근거를 주지 않는다.
// - 운영자 코드는 IP·UA를 저장하지 않는다: IP는 레이트 리밋 키(가드 메모리 60초 창)로만 쓰이고 이 컨트롤러는 요청 객체를 받지도 않는다.
//   본문·결과는 로그에 남기지 않는다. 다만 Cloud Run 플랫폼 요청 로그에는 IP·UA·경로·시각이 7일 남는다(B6에서 보존 기간 최소화 검토).
// - 쓰기는 메모리 합산 → 요청 안 flush(metric-aggregator.ts). 거절은 까닭별 **개수만** 센다(B4).
// - **서버는 동의를 구별하지 못한다**(B4, architecture.md 3-6-1): 동의·연령은 앱(gate.ts)만 안다. 핑에 동의 칸을 두지 않는다 —
//   위조 가능한 장식이고 '동의 표시가 있으니 괜찮다'는 착시를 만든다. 대신 동의하지 않은 핑이 섞여도 개인 단위로 남는 것이 없게
//   (식별자 0·운영자 코드의 IP·UA 저장 0·칸 합계만·k5 뷰) 만들고, 동의 버그가 있는 앱 판이 퍼지면 METRICS_INGEST=off 또는 METRIC_APP_VERSIONS에서 그 판을 빼
//   받기를 멈춘 뒤 그 판의 칸을 app_ver로 지운다.
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
  private readonly ingest: boolean;

  constructor(
    private readonly agg: MetricAggregator,
    config: ConfigService<Env, true>,
  ) {
    this.versions = new Set(config.get('METRIC_APP_VERSIONS', { infer: true }));
    this.ingest = config.get('METRICS_INGEST', { infer: true }) === 'on';
  }

  @Post('ping')
  @HttpCode(204)
  @Header('cache-control', 'no-store')
  @Throttle({ default: { limit: PING_LIMIT_PER_MIN, ttl: 60_000 } })
  @ApiBody({ schema: z.toJSONSchema(pingSchema as never, { target: 'openapi-3.0', unrepresentable: 'any' }) as object })
  @ApiNoContentResponse({ description: '받음 또는 조용히 버림(둘을 구별하지 않는다)' })
  async ping(@Body() raw: unknown): Promise<void> {
    const r = pingSchema.safeParse(raw);
    if (!this.ingest) this.agg.reject('off');
    else if (!r.success) this.agg.reject('schema');
    else if (!this.versions.has(r.data.appVer)) this.agg.reject('version');
    else if (!pingDateOk(r.data, this.agg.now())) this.agg.reject('date');
    else this.agg.add(pingToCells(r.data));
    await this.agg.maybeFlush();
  }
}
