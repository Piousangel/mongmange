// Prisma 7 설정(architecture.md 2-5·6-4). 런타임은 src/prisma/prisma.service.ts가 DATABASE_URL(트랜잭션 풀러 6543)로 어댑터를 만든다.
// DB에 붙는 CLI 명령(migrate·db·studio)은 **DIRECT_URL만** 쓴다 — 세션 풀러(5432) 또는 직접 연결.
// 없거나 트랜잭션 풀러(6543)를 가리키면 실패한다(B1 리뷰 I3: 이름 하나 틀려 마이그레이션이 트랜잭션 풀러로 가는 일을 막음).
// generate·validate·format은 DB가 필요 없어 자리 URL을 쓴다.
// 배포(B6)는 GitHub Environments 비밀 DIRECT_URL_SESSION_POOLER를 이 DIRECT_URL로 넘긴다.
import { defineConfig } from 'prisma/config';

const DB_COMMANDS = new Set(['migrate', 'db', 'studio']);

function migrationUrl(): string {
  const needsDb = process.argv.slice(2).some((a) => DB_COMMANDS.has(a));
  const url = process.env.DIRECT_URL;
  if (!needsDb) return url ?? 'postgresql://offline@localhost:5432/offline';
  if (!url) throw new Error('DIRECT_URL이 없습니다 — 마이그레이션은 세션 풀러(5432)/직접 연결로만 돈다(DATABASE_URL로 대신하지 않음)');
  if (/:6543(\/|$|\?)/.test(url)) throw new Error('DIRECT_URL이 트랜잭션 풀러(6543)를 가리킵니다 — 세션 풀러 5432를 쓰세요');
  return url;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: migrationUrl() },
});
