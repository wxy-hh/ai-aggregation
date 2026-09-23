# 0003. 路由测试的计费断言收敛于 finalize 接缝（决策表测试单源化）

* **状态**：已接受
* **日期**：2026-09-23
* **决策者**：AI 聚合平台工程团队
* **范围**：`apps/web` 全部路由测试（现有与未来新增）

---

## 背景

`QuotaSession`（`@repo/db`）内部依赖包内相对路径的 `quota-service` / `ai-usage`，apps/web 的测试无法通过 mock `@/lib/billing/quota-service` 等 shim 路径拦截其下层依赖。为断言计费行为，多个路由测试各自复刻了 `MockQuotaSession` 的完整决策表（failed→release、admin→safeRecordAiUsage、partial→settle status、兜底 token 估算），每份 60~90 行。

实锤的漂移：真实实现的 admin 归档字段演进（补 requestId/meterType/billableUnits/billingStatus/status）后，astrology 两份复刻仍停留旧版，而测试全绿——复刻的 mock 验证的是 mock 自己，属于假保护；决策表演进时需人工同步 N 处，且漂移无法被测试发现。

---

## 决策

路由测试的计费断言面收敛于 **`QuotaSession` 接缝本身**（"the interface is the test surface"）：

1. **路由测试只断言路由职责**：`reserve` 的调用参数、`finalize(outcome, ctx)` 的终态与上下文（action/requestId/usage/outputText/reason）、HTTP 响应、SSE 事件、错误映射。断言方式为「空壳 session + finalize spy」，空壳由共享工厂 `apps/web/src/lib/billing/testing/fake-quota-session.ts` 提供。
2. **决策表行为单源测试**：`packages/db/src/__tests__/billing/quota-session.test.ts` 的决策矩阵是 QuotaSession 内部行为（failed→release、admin→归档、兜底估算、幂等）的唯一权威测试。路由测试**禁止**再断言 `settleAiQuota` / `releaseAiQuota` / `safeRecordAiUsage` 等下层函数。
3. **禁止复刻决策表**：任何路由测试不得再以 mock 形式复制 QuotaSession 的分支逻辑；新增路由测试一律复用共享工厂。

---

## 备选方案及否决理由

1. **共享 MockQuotaSession 工厂（复刻收编为一处）**：漂移面从 N 收 1，但复刻本质仍在，真实实现演进时仍需人工同步，且其验证的依然是 mock 自己。
2. **真实 QuotaSession + mock 包内下层模块**：`@repo/db` 的 package.json exports 仅暴露 `"."` 入口，mock 包内相对路径模块在 vitest 下无可靠机制，工程风险大。

---

## 后果

### 正面收益

- 决策表漂移问题根除：真实实现演进只需维护 `quota-session.test.ts` 一处；
- 路由测试聚焦路由职责，行数净减约 308 行（4 个测试文件），可读性与意图表达提升；
- 新增路由的测试有标准件（共享工厂 + 既定断言模式），上手成本降低。

### 潜在代价与应对

- 路由层不再端到端覆盖「outcome → 下层计费函数」的集成路径；**应对**：该集成由 `quota-session.test.ts` 的决策矩阵覆盖，且 `finalize` 接口契约（outcome 三态 + QuotaFinalizeContext 字段）由 TypeScript 类型在编译期强制。
