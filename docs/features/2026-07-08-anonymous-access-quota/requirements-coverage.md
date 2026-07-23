# 需求覆盖矩阵：匿名访问 + 设备指纹 + 额度限制

## Feature ID

`2026-07-08-anonymous-access-quota`

## 覆盖矩阵

| 需求 ID | 需求描述 | 实现位置 | 验证方式 | 状态 |
|---------|----------|----------|----------|------|
| FR-1 | 使用浏览器指纹生成稳定设备标识 | `apps/web/src/lib/device-fingerprint.ts` | 代码审查 + 自动化测试 | completed |
| FR-1.1 | deviceId 持久化到 localStorage | `apps/web/src/lib/device-fingerprint.ts` | 代码审查 + 自动化测试 | completed |
| FR-2 | 首次访问自动创建匿名用户 | `apps/web/src/app/api/auth/anonymous/route.ts` | 代码审查 + 自动化测试 | completed |
| FR-2.1 | 匿名用户默认 3000 token | `packages/db/src/quota.ts`、`schema.prisma`、`apps/web/src/lib/constants/quota.ts` | 代码审查 + 自动化测试 | completed |
| FR-3 | 匿名用户通过 JWT 访问 API | `apps/web/src/app/api/auth/anonymous/route.ts` | 代码审查 + 自动化测试 | completed |
| FR-3.1 | 中间件不再强制重定向到登录页 | `apps/web/src/middleware.ts` | 代码审查 + curl 测试 | completed |
| FR-3.2 | 真实登录用户流程不受影响 | `apps/web/src/stores/auth-store.ts` | 代码审查 + 自动化测试 | completed |
| FR-4 | AI 调用前校验额度 | `apps/web/src/app/api/chat/route.ts` 等 AI 路由 | 代码审查 + 自动化测试 | completed |
| FR-4.1 | 额度不足时不调用下游 AI | `apps/web/src/app/api/chat/route.ts` 等 AI 路由 | 代码审查 + 自动化测试 | completed |
| FR-4.2 | 并发扣减不超时 | `packages/db/src/quota.ts` | 代码审查 + 安全审查 | completed |
| FR-5 | 额度耗尽后前端弹框 | `apps/web/src/components/quota-exhausted-dialog.tsx` | 代码审查 | completed |
| FR-5.1 | 弹框文案为中文 | `apps/web/src/components/quota-exhausted-dialog.tsx` | 代码审查 | completed |
| FR-6 | 额度耗尽后仍可查看历史 | `apps/web/src/app/api/history/route.ts` 等 | 代码审查 + 自动化测试 | completed |
| FR-7 | 不修改现有登录认证核心逻辑 | `apps/web/src/app/api/auth/**` | 代码审查 | completed |
| FR-7.1 | 数据库变更可回滚 | `packages/db/prisma/schema.prisma` | 代码审查 | completed |
| FR-8 | 默认首页不再跳转登录页 | `apps/web/src/app/page.tsx` | 代码审查 + curl 测试 | completed |
| FR-9 | 所有 AI/业务接口前端统一带认证调用 | `apps/web/src/app/**/_components/*.tsx` | 代码审查 + 自动化测试 | completed |
| FR-10 | 后端 AI 接口未认证返回 401/403 | `apps/web/src/app/api/**/route.ts` | 代码审查 + 自动化测试 | completed |
| FR-11 | AI 调用失败时按实际扣减金额退款 | `apps/web/src/app/api/chat/route.ts` 等 | 代码审查 + 自动化测试 | completed |
| FR-12 | 后端所有 requireAuth 接口统一返回 401/403 | `apps/web/src/app/api/history/route.ts`、`files/route.ts`、`voice/transcriptions/**`、`profile/**`、`chat/route.ts` | 代码审查 + 自动化测试 | completed |
| FR-13 | 匿名用户禁止修改用户名/自助注销 | `apps/web/src/app/api/profile/update/route.ts`、`profile/delete/route.ts` | 代码审查 + 自动化测试 | completed |
| FR-14 | 非 multipart 语音转写请求优雅返回 400 | `apps/web/src/app/api/voice/transcribe/route.ts` | 代码审查 + 自动化测试 | completed |

## 非功能需求覆盖

| 需求 | 实现位置 | 验证方式 | 状态 |
|------|----------|----------|------|
| 类型安全 | 所有 TypeScript 文件 | `pnpm typecheck` | completed |
| 代码规范 | 所有修改文件 | `pnpm lint` | completed |
| 构建通过 | 全项目 | `pnpm build` | completed |
| 安全：不泄露敏感信息 | `apps/web/src/app/api/auth/anonymous/route.ts` | 代码审查 + 安全审查 | completed |
| 安全：防止额度超扣 | `packages/db/src/quota.ts` | 代码审查 + 安全审查 | completed |
| 安全：认证错误不返回 500 | `apps/web/src/app/api/**/route.ts` | 代码审查 + 自动化测试 | completed |

## 遗留/待决策项

- OPT-1：部分 AI 接口（`destiny/report`、`destiny/ziwei-report`、`qimen/analyze/start`、`image/agnes`、`voice/translate`）使用 `getOptionalUserId`，未登录时不强制 401，也不走 3000 额度限制。这是现有行为，本次未改动。如需统一纳入匿名认证额度体系，需单独产品决策。
