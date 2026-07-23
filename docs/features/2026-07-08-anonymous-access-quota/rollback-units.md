# 回撤单元：匿名访问 + 设备指纹 + 额度限制

## Feature ID

`2026-07-08-anonymous-access-quota`

## 回滚目标

本需求是临时方案，后续需要恢复登录认证。回滚时应满足：

1. 未登录用户重新被重定向到 `/login`。
2. 真实登录用户流程完全不受影响。
3. 匿名用户数据可保留或清理（视业务决定）。
4. 数据库新增字段可保留（不影响登录逻辑），或后续通过迁移删除。

## 回撤单元清单

### RU-1：中间件重定向回滚

**文件**：`apps/web/src/middleware.ts`

**回滚操作**：
- 恢复 `PUBLIC_PATHS` 为原列表（`/login`、`/register`、`/forgot-password`、`/reset-password`）。
- 恢复“未登录用户访问受保护页面重定向到登录页”的逻辑。

**验证**：
- 未登录用户访问 `/chat` 被 302 到 `/login`。
- 已登录用户访问 `/login` 被 302 到 `/home`。

### RU-2：认证 Store 初始化回滚

**文件**：`apps/web/src/stores/auth-store.ts`

**回滚操作**：
- 移除 `anonymousSignIn` action。
- `initialize()` 恢复为先 `refreshAccessToken()`，失败则清除状态。
- 移除设备指纹相关的 localStorage key（`ai-device-id`）读取逻辑。

**验证**：
- 清除 cookie 和 localStorage 后访问页面，不再自动创建匿名用户。
- 已登录用户仍能通过 refresh token 自动登录。

### RU-3：匿名认证 API 回滚

**文件**：`apps/web/src/app/api/auth/anonymous/route.ts`

**回滚操作**：
- 删除该路由文件。

**验证**：
- 访问 `/api/auth/anonymous` 返回 404。

### RU-4：设备指纹客户端代码回滚

**文件**：`apps/web/src/lib/device-fingerprint.ts`

**回滚操作**：
- 删除该文件。
- 移除 `package.json` 中 `@fingerprintjs/fingerprintjs` 依赖（如不再需要）。

**验证**：
- 项目中无设备指纹相关引用。

### RU-5：额度校验与弹框回滚

**文件**：
- `packages/db/src/quota.ts`
- `apps/web/src/components/quota-exhausted-dialog.tsx`
- 各 AI 调用入口中的额度检查代码

**回滚操作**：
- 删除 `packages/db/src/quota.ts`。
- 删除 `apps/web/src/components/quota-exhausted-dialog.tsx`。
- 从各 AI 调用入口移除 `checkAndDeductTokens` 调用和 `QUOTA_EXHAUSTED` 错误处理。
- 从 `apps/web/src/lib/api/client.ts` 移除 `QUOTA_EXHAUSTED` 事件触发。

**验证**：
- AI 调用不再检查 `tokens` 余额。
- 前端不再监听/触发额度耗尽弹框。

### RU-6：数据库字段回滚（可选）

**文件**：`packages/db/prisma/schema.prisma`

**回滚操作**（如果需要彻底清理）：
- 移除 `User.isAnonymous` 字段。
- 移除 `User.deviceHash` 字段（如果添加了）。
- 生成并执行新的迁移脚本删除对应列。

**注意**：
- 删除列会丢失匿名用户标记信息。
- 如果保留匿名用户数据，可以只回滚应用层代码，不删除数据库字段。

**验证**：
- `prisma migrate status` 显示无待执行迁移。
- `User` 表结构恢复（或保留新增字段但业务层不使用）。

## 回滚执行顺序

建议按以下顺序执行，避免中间状态用户无法访问：

1. RU-5：移除额度校验（避免登录恢复后真实用户被误拦截）。
2. RU-3：删除匿名认证 API。
3. RU-4：删除设备指纹代码。
4. RU-2：恢复 Store 初始化逻辑。
5. RU-1：恢复中间件重定向。
6. RU-6（可选）：清理数据库字段。

## 回滚验证清单

- [ ] 未登录用户访问 `/chat` 被重定向到 `/login`。
- [ ] 已登录用户正常访问所有页面。
- [ ] AI 调用不再检查额度。
- [ ] 不再自动创建匿名用户。
- [ ] `pnpm typecheck` 通过。
- [ ] `pnpm lint` 通过。
- [ ] `pnpm build` 通过。
