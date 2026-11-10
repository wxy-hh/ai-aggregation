# 0049. 奇门 Worker 一元配额生命周期收口（评审 C3）

* **编号**：ADR-0049
* **状态**：已接受
* **日期**：2026-11-10
* **决策者**：AI 聚合平台工程团队
* **范围**：奇门 Worker（`apps/worker` qimen-section）、一元配额托管管道（`withQuotaUnary`）、奇门模型调用模块（`packages/shared` qimen-analysis）

---

## 背景

奇门 Worker 此前用可变 `billing.session` holder 连接模型钩子的预留、成功钩子的结算与外层 catch 的释放；`qimen-analysis` 为此暴露五个请求阶段钩子，全仓仅奇门 Worker 一个生产使用者。该结构导致：(1) 模型成功即扣费，之后 `saveSectionResult` 失败时终态守卫使释放成为空操作，用户白扣费；(2) 模型调用时序经钩子外泄给计费调用者；(3) `withQuotaUnary` 位于 `apps/web` 且引用 Web 别名，Worker 无法复用。审查报告 C3（docs/reports/2026-11-10-core-architecture-review.md）经五问拷问收敛出本决策。

## 决策

1. **结算边界 = 交付边界**：一元管道 `run` 的边界为「模型生成 + 结果归一化 + saveSectionResult」，整体成功才 `finalize('success')`；保存失败按 `finalize('failed')` 释放预留，**用户不扣费**，平台吸收单次上游成本。遵守 ADR-0002 一元二态语义与 ADR-0001「用户没看到结果就不收钱」的既定契约。
2. **共享管道下沉 `packages/db/src/billing/`**：`withQuotaUnary` 移至 `QuotaSession` 旁，Web 端原路径保留 re-export shim（修订 ADR-0002 位置条款，见 0002 修订附录；语义不变）。
3. **模型 module 回归纯函数契约**：彻底删除 `QimenTraceContext` 的五个钩子与无调用方的 `generateQimenBaseResult`；`generateQimenSectionResult` 改为接收普通输出预算、返回 `{ value, usage }`；观测日志内聚到 qimen-analysis 内部（`@repo/logger`），trace 退化为纯数据上下文。
4. **admin 免计费编码维持隐式协议 + 代码层护栏（A+）**：BullMQ 任务协议不变，「billingRequestId 缺失 = admin」的推断收敛为具名纯函数 `resolveQimenBillingContext`，入队端加「非 admin 必须携带 billingRequestId」的 Fail-Closed 断言；`userRole` 类型收窄为 `'admin' | undefined` 两态，Worker 不透传任意字符串。
5. **测试与验收**：管道层 7 条、Worker 层 7 条红灯用例（含「模型成功但保存失败」「非法模型 JSON」两条报告指定用例）；真实浏览器验收不可豁免，P0 冒烟使用真实扣费的普通用户账户（admin 免扣路径由单测覆盖，不得以 admin 绕过计费链路）。

## 取代与修订

- **取代**：2026-07 过渡实现的「五钩子计费时序」（de facto 约定，无 ADR）——该约定把计费时序泄漏给模型模块的公开钩子，本轮随 C3 退役。
- **修订**：ADR-0002 的位置条款（原载明 `withQuotaUnary` 置于 `apps/web/src/lib/billing/`），按本决策第 2 条下沉至 `@repo/db`，Web shim 兼容。

## 备选方案及否决理由

1. **模型成功即扣费、保存失败不退**：违背 ADR-0001/0002 契约引发扣费客诉，且需保留钩子特化逻辑，C3 收敛目标落空。
2. **新建 `packages/billing`**：为约 30 行高阶函数单建包，过度设计；整体迁移计费域则远超 C3 范围。
3. **管道置于 `packages/shared` 的 `./server` 子路径**：`@repo/db → @repo/shared` 依赖已存在，反向引入构成包级循环依赖，构建 DAG 死锁。
4. **job data 显式增加 `userRole` 字段**：改变 BullMQ 任务协议（C3 红线）；滚动部署期队列混新老任务需双逻辑兼容；特权字符串明文进消息载荷。
5. **瘦身保留三个观测钩子**：回调通道仍在，存在与管道 catch 二次释放竞态、异常掩盖 502/504 映射与破窗风险。

## 后果

- **平台成本**：罕见「模型成功但保存失败」场景下平台吸收单次上游模型成本。
- **重试属性不变**：保存失败的分块无法靠 BullMQ 重试自愈——此属性现状已存在（计费防重放熔断会拒绝同 requestId 的再次执行），本决策未扩大它；由用户手动重新生成（新 requestId）恢复。
- **接口变化**：`qimen-analysis` 删钩子与 `generateQimenBaseResult`，返回形状变化；Worker 观测日志位置内聚（字段、级别、耗时等价）。
- **验收基线**：14 条红灯用例 + 普通账户 P0 真实浏览器冒烟，作为 C3 交付的验收契约（后续 `/to-spec` 与 `/qa-test-planner` 落盘 Schema 4 细节）。
