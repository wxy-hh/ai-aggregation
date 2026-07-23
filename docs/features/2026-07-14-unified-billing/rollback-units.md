# 统一额度计费改造回撤单元

> 基线 SHA：`c58c259838f7d8a0d55ef6e9d49751d1bf330cb9`
>
> 本次执行不创建任务级 commit。每个任务完成后记录对应 patch、未跟踪文件和回撤后验证。

### Task 1 Rollback Unit

- Purpose: 回撤统一计量类型和计费策略定义。
- Requirement IDs: BILL-001, BILL-002, BILL-003
- Files: `packages/shared/src/types/billing.ts`、`packages/shared/src/types/index.ts`、`apps/web/src/lib/constants/billing-policy.ts`、`apps/web/src/lib/constants/quota.ts`、`packages/shared/src/types/ai-usage.ts`
- Produces: 统一计量类型、usage 测量结构和错误码。
- Consumed by: Task 2、Task 3。
- Commit / Diff range: pending，完成后保存为 `patches/task-1.patch`。
- Revert order: 先撤回未依赖这些类型的业务引用，再删除新增类型文件。
- Revert command or patch strategy: 使用任务 patch 的反向应用；新增文件从 patch 中删除，保留原 `quota.ts` 和 `ai-usage.ts`。
- Post-revert verification: `pnpm --filter @repo/web typecheck`，确认旧额度常量和用量类型仍可编译。
- Risks: 若 Task 2 已经引用新类型，必须先回撤 Task 2 再回撤本任务。

### Task 2 Rollback Unit

- Purpose: 回撤额度账户、预留记录和追加式流水。
- Requirement IDs: BILL-004, BILL-005, BILL-006
- Files: `packages/db/prisma/schema.prisma`、`packages/db/prisma/migrations/20260714120000_unify_quota_billing`、`packages/db/src/quota-ledger.ts`、`packages/db/src/index.ts`、`packages/db/src/quota.ts`、`packages/db/src/token-deduction.ts`
- Produces: `QuotaAccount`、`QuotaReservation`、`QuotaLedgerEntry` 及原子预留/结算服务。
- Consumed by: Task 3、Task 4、Task 5、Task 6、Task 7、Task 8。
- Commit / Diff range: pending，完成后保存为 `patches/task-2.patch`。
- Revert order: 先回撤所有业务路由和查询调用，再回撤服务导出，最后回撤数据库迁移；生产流水表不删除。
- Revert command or patch strategy: 应用任务 patch 反向 patch；数据库只执行反向迁移或保留空表，不删除审计数据。
- Post-revert verification: `pnpm db:generate`、`pnpm --filter @repo/web typecheck`，确认旧 `users.tokens` 读写可用。
- Risks: 已写入的额度流水不能删除；回撤后必须保留余额快照，避免用户余额丢失。

### Task 3 Rollback Unit

- Purpose: 回撤 Web 端计量适配和统一计费封装。
- Requirement IDs: BILL-001, BILL-003, BILL-007
- Files: `apps/web/src/lib/billing`、`apps/web/src/lib/ai-usage.ts`、`apps/web/src/lib/api/quota-helpers.ts`
- Produces: provider usage 归一化、预留/结算/释放调用封装。
- Consumed by: 所有 AI Route Handler。
- Commit / Diff range: pending，完成后保存为 `patches/task-3.patch`。
- Revert order: 先回撤路由调用，再恢复旧 helper 导出，最后删除新增 billing 目录。
- Revert command or patch strategy: 应用任务 patch 反向 patch，保留账本服务代码但解除业务引用。
- Post-revert verification: `pnpm --filter @repo/web test`、`pnpm --filter @repo/web typecheck`。
- Risks: 不能让旧 helper 和新账本同时扣费。

### Task 4-7 Rollback Units

- Purpose: 按功能回撤聊天、比较、其他 AI 路由和个人中心。
- Requirement IDs: CHAT-001 至 UI-003
- Files: 按实施计划对应 Task 4-7 的文件组。
- Produces: 流式结算、批量预留、全功能实际计量、媒体次数统计和新额度展示。
- Consumed by: Task 8、Task 9。
- Commit / Diff range: pending，分别保存 `patches/task-4.patch` 至 `patches/task-7.patch`。
- Revert order: Task 7 → Task 6 → Task 5 → Task 4；Task 2 最后回撤。
- Revert command or patch strategy: 每个任务使用独立 patch 反向应用；不恢复固定 500 竞争扣费作为长期方案。
- Post-revert verification: 类型检查、相关 Vitest 测试、匿名/注册聊天和个人中心人工检查。
- Risks: 回撤过程中必须确保业务路由不会同时调用旧扣费和新结算。

### Task 8-9 Rollback Units

- Purpose: 回撤历史迁移脚本、迁移检查和新增测试资产。
- Requirement IDs: MIG-001 至 TEST-003
- Files: `tooling/scripts/migrate-legacy-quota.ts`、`migrations/001-reconcile-tokens.ts`、迁移检查文档和测试文件。
- Produces: 可重复执行的历史余额迁移和完整验证矩阵。
- Consumed by: 发布和后续代码审查。
- Commit / Diff range: pending，完成后保存任务 patch 和迁移快照路径。
- Revert order: 先停止新迁移入口，再恢复旧脚本文案；不得自动反向修改生产余额。
- Revert command or patch strategy: 使用迁移前快照恢复指定用户余额，保留新账本和流水表作为审计证据。
- Post-revert verification: 迁移 dry-run、余额快照对账、`pnpm --filter @repo/web test`。
- Risks: 历史 9413 Token 不能在回撤或重跑迁移时二次扣费。

## 当前执行状态

- Task 1：已完成共享计费类型、策略和用量字段定义，并删除固定操作成本。
- Task 2：已完成额度账户、预留、结算、释放、待补账、流水和数据库完整性约束；三份迁移均已应用。
- Task 3：已完成 Web/Worker 共用的计量适配与统一额度服务；缺少供应商 usage 时保留待对账，不按字符估算扣费。
- Task 4/5：已完成聊天流式结算、输出上限传递与数据库原子批量预留。
- Task 6：已完成语音、图片、视频、简历、八字、紫微、奇门和命理追问等全部 AI 入口切换；异步奇门 Worker 也已结算。
- Task 7：个人中心只读取 `QuotaAccount`，图片/视频任务次数接口已补齐。
- Task 8/Task 9：已完成测试数据重置迁移、数据库并发预留/结算/幂等验证、Worker 定时对账和完整路由残留扫描。

本轮尚未创建 Git commit。回滚时以基线 SHA 加文件清单为边界执行：

```bash
git diff --binary c58c259838f7d8a0d55ef6e9d49751d1bf330cb9 -- <目标文件>
```

已涉及的主要目标文件包括：`packages/db/prisma/schema.prisma`、`packages/db/prisma/migrations/20260714120000_unify_quota_billing/migration.sql`、`packages/db/src/quota-ledger.ts`、`apps/web/src/lib/billing/*`、`apps/web/src/app/api/chat/*`、`apps/web/src/app/api/voice/*`、`apps/web/src/app/api/image/*`、`apps/web/src/app/api/video/route.ts`、`apps/web/src/app/api/resume/*`、`apps/web/src/app/api/profile/usage/route.ts`、`apps/web/src/app/profile/_components/profile-shell.tsx`。
