# 统一额度计费复审报告

## 结论

需修复。统一账本、计量分账、初始额度和媒体任务统计的主干实现已具备，但存在一项可绕过扣费的严重幂等缺口，以及一项无法闭环的待补账缺口；在修复前不能宣称“按实际用量完整扣费”。

## 输入资产

- 需求与实施计划：`docs/features/2026-07-14-unified-billing/初步实现计划.md`
- 状态台账：`docs/features/2026-07-14-unified-billing/status.md`
- 回撤清单：`docs/features/2026-07-14-unified-billing/rollback-units.md`
- 基线 SHA：`c58c259838f7d8a0d55ef6e9d49751d1bf330cb9`
- 范围：统一账本、所有 Web/Worker AI 调用入口、用量汇总和额度展示。
- 本轮验证：7 个文件、14 项定向计费测试通过；Web 与 Worker 类型检查通过；`git diff --check` 通过。

## 严重问题（Critical）

### 1. 客户端可复用幂等键，重复调用上游却只结算一次

位置：

- `apps/web/src/lib/billing/request-id.ts`
- `packages/db/src/quota-ledger.ts`
- `apps/web/src/lib/billing/quota-service.ts`
- `apps/web/src/app/api/chat/route.ts`
- `apps/web/src/app/api/voice/transcribe/route.ts`
- `apps/web/src/app/api/video/optimize-prompt/route.ts`

问题：

`idempotency-key` 和部分请求体的 `requestId` 均由客户端提供。`reserveQuota` 找到同一用户、同一请求 ID 的既有预留后，无论其状态是 `reserved`、`settled`、`released` 还是 `billing_pending`，都会直接返回。文本和上传转写路由随后仍会调用供应商；结算因预留已处理而幂等返回，不会再次扣费。并发请求还可同时通过“预留仍是 reserved”的只读校验后并行启动多个供应商调用。

影响：

拥有自身登录令牌的用户可以复用已知请求 ID 或预留 ID 多次调用聊天、视频提示词优化或上传转写上游服务，而账本最多只结算一笔。这直接违反“每次真实接口调用按实际用量扣除”和“请求幂等但不可重复执行”的要求。

建议：

为 `QuotaReservation` 增加原子执行占用状态，例如 `reserved -> processing -> settled | released | billing_pending`。在供应商调用前以条件更新领取执行权；只有领取成功的请求才能调用上游。已 `processing`、`settled`、`released` 或 `billing_pending` 的重复请求必须返回已有结果、处理中状态或明确冲突，绝不能再次调用供应商。批量对比保留“先预留、再逐模型领取”的模式，并补充串行重放、并发重放、已结算重放和失败后重试测试。

## 重要问题（Important）

### 1. Token usage 缺失后的待补账没有真实数据来源，会永久冻结预留额度

位置：

- `apps/web/src/lib/billing/usage-measurement.ts`
- `apps/web/src/lib/billing/quota-service.ts`
- `packages/db/src/quota-ledger.ts`
- `apps/worker/src/index.ts`

问题：

当文本供应商未返回 usage 时，系统正确地不按本地估算结算，而是把预留标为 `billing_pending`，并刻意将 `AIUsageRecord.billableUnits` 与 `totalTokens` 写为 `null`。定时对账只读取这两个字段，没有供应商账单查询、异步 usage 回调或人工补录入口，因此会跳过这类记录。预留既不会结算，也不会因过期自动释放。

影响：

遇到任何缺 usage、流式中断或供应商延迟返回 usage 的真实调用，用户余额会被永久占用；系统既无法按真实成本扣费，也无法可靠退款。

建议：

每个供应商适配层必须提供至少一种可审计的后续事实来源：最终 usage、供应商操作 ID 的账单查询，或供应商异步 usage 回调。将该事实保存后才由对账任务结算；同时提供受保护的运营补录/退款流程和待补账告警。若某供应商根本不能提供真实计量，产品必须明确该能力的可计费单位，不能把“自动对账”当作已实现。

## 次要问题（Minor）

无新增阻塞项。

## 需求覆盖

| 要求 | 结论 | 证据 |
| --- | --- | --- |
| 匿名 3000、注册 20000；身份不改变扣费方式 | 通过 | 所有开户路径建立 `QuotaAccount`；计费代码未以 `isAnonymous` 分支。 |
| 管理员免扣但保留统计 | 通过 | 路由以角色跳过预留，并写入审计用量。 |
| 文本/语音按实际 Token 或真实时长结算 | 需修复 | 正常 usage/时长路径已实现；重放执行和缺 usage 待补账不闭环。 |
| 图片、视频仅按任务次数且不扣文本额度 | 通过 | 媒体任务有独立幂等记录，`quotaUnits` 为 0。 |
| 对话中额度耗尽 | 部分通过 | 预留和输出上限存在；预留与实际不一致时进入待补账，但需要上述闭环。 |
| 用量展示不混合图片/视频与文本额度 | 通过 | 个人中心分别显示 Token、音频秒数和媒体任务次数。 |

## 验证缺口

- 现有 14 项定向测试均通过，但没有覆盖严重问题中的串行或并发请求重放。
- 没有覆盖“Token usage 缺失后由真实供应商事实补账”或“无法取得真实 usage 时的运营处置”场景。
- 本轮按用户要求不把讯飞实时语音转写的供应商协议适配纳入验收；该项应在单独接入时重新做端到端测试。

## 回撤完整性

现有 `rollback-units.md` 仍以基线 SHA 和文件清单为回撤边界；本报告仅记录审查结论，不改变运行时代码或数据库结构。
