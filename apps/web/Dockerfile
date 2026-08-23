# ============================================
# Stage 1: 安装依赖 & 构建
# ============================================
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate
WORKDIR /app

# 先复制依赖描述文件，利用 Docker 层缓存
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/providers/package.json packages/providers/
COPY packages/storage/package.json packages/storage/
COPY packages/logger/package.json packages/logger/
COPY packages/db/package.json packages/db/
COPY packages/config-typescript/package.json packages/config-typescript/

RUN pnpm install --frozen-lockfile

# 复制全部源码
COPY . .

# 生成 Prisma Client
RUN pnpm db:generate

# 构建 web 及其依赖包
RUN pnpm turbo build --filter=@repo/web

# ============================================
# Stage 2: 生产运行镜像（standalone）
# ============================================
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# standalone 产物自带 Node.js 子集，但仍需 system 依赖
RUN apk add --no-cache libc6-compat

# 从构建阶段复制 standalone 产物
COPY --from=base /app/apps/web/.next/standalone ./
COPY --from=base /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=base /app/apps/web/public ./apps/web/public

# 复制 node_modules（含 Prisma 引擎）
# 注意：pnpm 的模块结构导致 .prisma / @prisma 不在顶层 node_modules，
# 必须复制整个 node_modules 才能保证 Prisma 运行时引擎可用
COPY --from=base /app/node_modules ./node_modules

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
