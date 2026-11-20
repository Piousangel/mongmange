// 올라온 세이브 본문 준비(B2, architecture.md 3-4 '서버 검증'·3-4-1 '남용 상한'):
//  크기(UTF-8 512KB) → core parseState(inspectSave) → 미래 판 상한(+1까지만) → gzip(256KB) → sha256.
// 서버가 본문에서 꺼내는 값은 버전·dayIndex·strokesTotal뿐이다(5-1). 생활 리듬 값은 열로 꺼내지 않는다.
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { gunzip as gunzipCb, gzip as gzipCb } from 'node:zlib';
import { HttpException, PayloadTooLargeException, UnprocessableEntityException } from '@nestjs/common';
import { SAVE_MAX_BYTES, SAVE_MAX_GZIP_BYTES } from '@mong/contract';
import { SAVE_SCHEMA, SIM_SCHEMA } from '../version';
import { inspectSave } from './inspect-save';

const gzip = promisify(gzipCb);
const gunzip = promisify(gunzipCb);

export interface PreparedSave {
  gz: Buffer;
  sha: Buffer;
  envelopeVer: number;
  simVer: number;
  validated: boolean;
  dayIndex: number | null;
  strokesTotal: number | null;
}

export async function prepareSave(body: string): Promise<PreparedSave> {
  if (Buffer.byteLength(body, 'utf8') > SAVE_MAX_BYTES) throw tooLarge();
  const r = inspectSave(body);
  let meta: Omit<PreparedSave, 'gz' | 'sha'>;
  if (r.kind === 'invalid') throw invalid(r.reason);
  if (r.kind === 'future') {
    // 미래 판은 서버보다 정확히 1 큰 판까지만 원문 보관(3-4-1, A4 리뷰 I6) — 2 이상이면 검증 없는 쓰레기 통로가 된다
    if (r.envelopeVer === null || r.simVer === null) throw invalid('missing_version');
    if (r.envelopeVer > SAVE_SCHEMA + 1 || r.simVer > SIM_SCHEMA + 1) throw invalid('future_too_far');
    meta = { envelopeVer: r.envelopeVer, simVer: r.simVer, validated: false, dayIndex: null, strokesTotal: null };
  } else {
    meta = { envelopeVer: r.envelopeVer, simVer: r.simVer, validated: true, dayIndex: r.dayIndex, strokesTotal: r.strokesTotal };
  }
  const gz = await gzip(Buffer.from(body, 'utf8'));
  // 압축이 안 되는 쓰레기 차단(정상 본은 보통 30KB → gzip 약 15KB)
  if (gz.length > SAVE_MAX_GZIP_BYTES) throw tooLarge();
  return { gz, sha: createHash('sha256').update(body, 'utf8').digest(), ...meta };
}

export async function unzipSave(gz: Uint8Array): Promise<string> {
  return (await gunzip(gz)).toString('utf8');
}

function tooLarge(): HttpException {
  return new PayloadTooLargeException({ code: 'save_too_large', message: '세이브가 너무 큽니다' });
}

function invalid(reason: string): HttpException {
  return new UnprocessableEntityException({ code: 'save_invalid', message: '세이브를 읽을 수 없습니다', details: { reason } });
}
