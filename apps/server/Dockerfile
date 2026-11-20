# mong-api 이미지(architecture.md 6-2). 빌드 컨텍스트 = 저장소 루트:
#   docker build -f apps/server/Dockerfile -t mong-api .
# 단계: deps(전체 의존성) → build(prisma generate + tsup 번들, @mong/core는 번들 안으로) → prod-deps(운영 의존성만) → runtime(비루트)
# 컨테이너 시작 때 마이그레이션하지 않는다(2-5). 마이그레이션은 build 단계 이미지로 따로 돌린다(compose의 migrate, CI/배포 단계).

# 베이스 이미지는 다이제스트로 고정(공급망). 올릴 때: docker buildx imagetools inspect node:24-slim
ARG NODE_IMAGE=node:24-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
# 저장소 packageManager와 같은 pnpm
RUN npm install -g pnpm@12.16.1 --no-fund --no-audit && pnpm --version
WORKDIR /repo

# 의존성 매니페스트만 먼저(소스가 바뀌어도 이 층은 캐시). 워크스페이스 전체 lockfile을 쓰되 server와 그 의존(core)만 설치
FROM base AS manifests
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json apps/server/
COPY packages/core/package.json packages/core/
COPY apps/mobile/package.json apps/mobile/

FROM manifests AS deps
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile --filter "server..."

FROM deps AS build
COPY packages/core/tsconfig.json packages/core/
COPY packages/core/src packages/core/src
COPY apps/server apps/server
RUN pnpm --filter server exec prisma generate && pnpm --filter server run build

FROM manifests AS prod-deps
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile --prod --filter server --ignore-scripts && \
    # Prisma 런타임은 DB 엔진마다 쿼리 컴파일러 wasm을 싣는다(약 70MB) — postgresql 것만 남긴다
    find node_modules/@prisma/client/runtime -name 'query_compiler_*' ! -name '*postgresql*' -delete && \
    find node_modules -name '*.map' -delete

FROM ${NODE_IMAGE} AS runtime
ARG APP_VERSION=dev
ENV NODE_ENV=production PORT=8080 APP_VERSION=${APP_VERSION}
WORKDIR /app
# 파일 소유자는 root(읽기 전용으로 쓰임), 실행은 비루트 node — 앱 프로세스가 자기 코드·의존성을 고칠 수 없다
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=build /repo/apps/server/dist ./dist
COPY apps/server/package.json ./package.json
USER node
EXPOSE 8080
# Cloud Run은 이 HEALTHCHECK를 쓰지 않는다(서비스 설정의 startup/liveness probe = /healthz). 로컬·compose용
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "--enable-source-maps", "dist/main.js"]
