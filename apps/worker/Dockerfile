# ============================================
# Stage 1: 安装依赖 & 构建
# ============================================
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/worker/package.json apps/worker/
COPY packages/shared/package.json packages/shared/
COPY packages/providers/package.json packages/providers/
COPY packages/storage/package.json packages/storage/
COPY packages/logger/package.json packages/logger/
COPY packages/db/package.json packages/db/
COPY packages/config-typescript/package.json packages/config-typescript/

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm db:generate
RUN pnpm --filter @repo/worker build

# ============================================
# Stage 2: 生产运行镜像
# ============================================
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache libc6-compat

# 复制 node_modules（含 Prisma 引擎）
# 注意：pnpm 的模块结构导致 .prisma / @prisma 不在顶层 node_modules，
# 必须复制整个 node_modules 才能保证 Prisma 运行时引擎可用
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages ./packages
COPY --from=base /app/apps/worker/dist ./apps/worker/dist
COPY --from=base /app/apps/worker/package.json ./apps/worker/
COPY --from=base /app/pnpm-lock.yaml ./
COPY --from=base /app/package.json ./

EXPOSE 3001

CMD ["node", "--import", "tsx", "apps/worker/dist/index.js"]
