// contract 스키마(zod/mini) → OpenAPI 3.0 JSON 스키마(@ApiBody용). openapi.json은 CI 산출물(3-2 '계약').
import { z } from 'zod';

export function openApiSchema(schema: unknown): object {
  return z.toJSONSchema(schema as never, { target: 'openapi-3.0', unrepresentable: 'any' }) as object;
}
