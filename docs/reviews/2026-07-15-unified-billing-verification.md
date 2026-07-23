# 统一额度计费完成前验证报告

## 结论

计费范围通过；全仓验证为部分通过。

统一额度计费的数据库、并发、失败恢复、内部回填、前端错误反馈和生产构建均已验证。全量 Web 测试仍有 2 项既有命理断言失败，不属于本次计费改动，故不将全仓测试表述为完全通过。

## 输入资产

- 实施计划：`docs/features/2026-07-14-unified-billing/初步实现计划.md`
- 状态台账：`docs/features/2026-07-14-unified-billing/status.md`
- 回撤清单：`docs/features/2026-07-14-unified-billing/rollback-units.md`
- 最终审查：`docs/reviews/2026-07-15-unified-billing-final-code-review.md`
- 基线：`c58c259838f7d8a0d55ef6e9d49751d1bf330cb9`

## 验证命令和结果

- `pnpm db:generate`：通过。
- `prisma migrate reset --force --skip-seed`：通过，11 条迁移可从空库完整重放。
- `prisma migrate deploy` 与 `prisma migrate status`：通过，当前数据库 Schema 已同步。
- `pnpm --filter @repo/web typecheck`：通过。
- `pnpm --filter @repo/worker typecheck`：通过。
- `pnpm lint`：通过。
- `pnpm --filter @repo/web build`：通过。
- `pnpm --filter @repo/web exec vitest run`：106/108 通过；失败的 `bazi-chart.test.ts` 和 `bazi-section-payload.test.ts` 为既有命理问题。
- 计费聚焦 Vitest：8 个文件、21 项通过。
- 真实 PostgreSQL 账本演练：通过；临时用户已清理。
- `git diff --check`：通过。

## 真实账本演练

| 场景 | 实测 |
| --- | --- |
| 余额 100 并发预留两笔 70 | 仅一笔预留成功 |
| 对同一预留并发领取执行权 | 仅一个调用方领取成功 |
| 第一笔按真实 40 Token 结算 | 释放 30 Token 差额 |
| 第二笔预留 10 后进入待补账并按真实 8 结算 | 成功结算并释放 2 Token 差额 |
| 最终账本 | `available=52`、`reserved=0`、`settled=48` |

## 页面或人工检查

- 未执行浏览器端到端测试：本地数据库重建后未配置 `SEED_ADMIN_PASSWORD`，无法创建默认管理员测试会话。
- 已由路由、客户端单元测试和生产构建验证：`QUOTA_INSUFFICIENT` 会触发统一额度不足提示，提示不再写死匿名用户 3000 Token。

## 未验证项和原因

- 未对真实第三方供应商发起付费请求；该类调用依赖外部凭据与成本，不应在自动验证中触发。
- 讯飞实时语音供应商协议接入按用户要求不纳入本轮；本轮只验证其已有计费会话与结算接口。
