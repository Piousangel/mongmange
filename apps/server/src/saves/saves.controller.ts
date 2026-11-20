// B1 예시 엔드포인트: core 재사용 확인용. 세이브를 저장하지 않고 검사 결과만 돌려준다.
// B2에서 PUT /api/v1/saves/main(인증·리비전)이 같은 inspectSave를 쓴다. 이 경로는 B2 때 남길지 정한다.
import { Body, Controller, HttpCode, Post, UnprocessableEntityException } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiTags, ApiUnprocessableEntityResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { SAVE_SCHEMA, SIM_SCHEMA } from '../version';
import { inspectSave, SAVE_MAX_CHARS } from './inspect-save';

export const validateSaveBody = z.object({
  /** 앱의 serializeState 결과 문자열 그대로 */
  save: z.string().min(2).max(SAVE_MAX_CHARS),
});

export interface ValidateSaveResponse {
  validated: boolean;
  /** 서버보다 새 버전 세이브(거부 아님) */
  future: boolean;
  envelopeVer: number | null;
  simVer: number | null;
  dayIndex?: number;
  strokesTotal?: number;
  server: { saveSchema: number; simSchema: number };
}

@ApiTags('saves')
@Controller('api/v1/saves')
export class SavesController {
  @Post('validate')
  @HttpCode(200)
  // 파싱이 CPU를 쓰므로 전역 한도보다 낮게
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiBody({ schema: z.toJSONSchema(validateSaveBody, { target: 'openapi-3.0' }) as object })
  @ApiOkResponse({ description: '검증됨 또는 미래 버전(validated=false, future=true)' })
  @ApiUnprocessableEntityResponse({ description: 'save_invalid — 손상·옛 형식·크기 초과' })
  validate(@Body() raw: unknown): ValidateSaveResponse {
    const { save } = validateSaveBody.parse(raw);
    const r = inspectSave(save);
    const server = { saveSchema: SAVE_SCHEMA, simSchema: SIM_SCHEMA };
    if (r.kind === 'invalid') {
      throw new UnprocessableEntityException({ code: 'save_invalid', message: '세이브를 읽을 수 없습니다', details: { reason: r.reason } });
    }
    if (r.kind === 'future') {
      return { validated: false, future: true, envelopeVer: r.envelopeVer, simVer: r.simVer, server };
    }
    return {
      validated: true,
      future: false,
      envelopeVer: r.envelopeVer,
      simVer: r.simVer,
      dayIndex: r.dayIndex,
      strokesTotal: r.strokesTotal,
      server,
    };
  }
}
