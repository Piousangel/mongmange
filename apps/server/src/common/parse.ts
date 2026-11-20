// 요청 본문 검사(B2): @mong/contract 스키마(zod/mini)로 읽는다 — 앱·서버가 같은 판정.
// mini의 오류는 'zod'의 ZodError가 아니라 에러 필터가 모른다 → 여기서 400 bad_request 모양으로 바꾼다(값은 싣지 않고 경로·이유만).
import { BadRequestException } from '@nestjs/common';

interface MiniSchema<T> {
  safeParse(v: unknown): { success: true; data: T } | { success: false; error: { issues: ReadonlyArray<{ path: PropertyKey[]; message: string }> } };
}

export function parseBody<T>(schema: MiniSchema<T>, raw: unknown): T {
  const r = schema.safeParse(raw);
  if (r.success) return r.data;
  throw new BadRequestException({
    code: 'bad_request',
    message: '요청 형식이 맞지 않습니다',
    details: r.error.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message })),
  });
}
