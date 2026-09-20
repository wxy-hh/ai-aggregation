# Destiny 术数模块 — 代码问题修复清单

- 来源：`docs/architecture-review-destiny-2026-08-12.md` 架构审查
- 验证日期：2026-08-21
- 验证结论：**四个候选问题全部属实**，以下按实现难度从易到难分为四级

---

## 难度说明

| 级别 | 含义 | 预估耗时 |
|------|------|---------|
| **XS** | 改动单一、风险极低，可直接动手 | 10–30 分钟 |
| **S** | 涉及少量文件，逻辑清晰，需基本回归验证 | 1–2 小时 |
| **M** | 需跨文件重构，设计共享抽象，需测试覆盖 | 半天–1 天 |
| **L** | 架构级改动，涉及接口设计 + 多处适配 + 逐步迁移 | 1–2 天 |

---

## XS · 手起刀落

### XS-1 · 删除奇门旧 SSE 路由（1288 行死代码）

- **文件**：`apps/web/src/app/api/destiny/qimen/analyze/route.ts`（1288 行）
- **现状**：奇门前端已完全迁移到异步队列流（`/analyze/start` → `/analyze/status` → `/analyze/sections/[key]`），该文件无任何前端调用方
- **改动**：直接删除整个文件，确认构建和 lint 通过
- **收益**：消灭 1288 行死代码、1 个 `UpstreamModelError` 副本、1 个 `mapStreamError` 副本、1 条平行 SSE 流

### XS-2 · 后端 SSE 编码收敛为共享工具函数

- **文件**：`chat/route.ts` · `copilot/route.ts` · `report/route.ts` · `ziwei-report/route.ts` · `qimen/analyze/route.ts`（XS-1 删后剩 4 处）
- **现状**：`data: ${JSON.stringify(payload)}\n\n` 编码模式在 5 处独立实现，其中 chat 和 copilot 各有 `encodeSseEvent()` 辅助函数但未共享，report / ziwei-report / qimen 在 `ReadableStream.start()` 闭包内联
- **改动**：抽取一个 `encodeSseEvent<T>(event: T): Uint8Array` 到 `lib/utils/sse.ts`（或既有 `chat-stream.ts`），5 处替换为调用共享函数
- **收益**：SSE 线协议只此一份，新模块（如星座）直接复用

---

## S · 小刀割肉

### S-1 · 前端 SSE 消费循环收敛为共享泛型消费者

- **文件**：`bazi-workspace.tsx:262-308` · `ziwei-workspace.tsx:155-191`
- **现状**：两处 `parseStreamBlock` + `consumeStream` 算法完全相同（split → filter `data: ` → slice(6) → join → trim → JSON.parse），仅泛型类型不同（`BaziStreamEvent` vs `ZiweiStreamEvent`）；`readErrorMessage` 在 bazi 有独立函数、ziwei 内联实现
- **改动**：抽出 `consumeSse<T>(response: Response, opts: { onEvent: (e: T) => void; onError?: (err: unknown) => void })` 到共享模块，两 workspace 改为调用
- **收益**：客户端 SSE 逻辑只维护一份，新增术数类型零成本接入

### S-2 · 领域 Schema 合并为单一权威定义

- **文件**：`_lib/bazi-section-payload.ts`（667 行）· `_lib/report-normalizer.ts`（956 行）
- **现状**：8 对领域对象（Profile、CoreTone、Pillar、BalanceInsight、PatternInsight、LifeDimension、LifeDimensionHighlights、TenGodDomain、Module、Timeline）在两文件中分别定义 zod schema，字段结构一致，仅校验严格度不同（required vs optional）
- **改动**：抽取 `destiny-domain-schema.ts` 作为唯一 schema 权威源，两文件引用同一套定义；严格度差异通过 `.required()` / `.partial()` 或参数化 schema 生成器解决
- **收益**：领域形状只维护一处，跨 bazi + ziwei 的字段演进无需双处同步

---

## M · 解剖级重构

### M-1 · 命盘报告 Handler 深化（bazi + ziwei）

- **文件**：`report/route.ts`（706 行）· `ziwei-report/route.ts`（827 行）
- **现状**：两个 handler 各承担 7 类职责（认证、校验、配额、prompt 构建、流式解析、fallback、计费），结构高度相似，横切关注点几乎完全一致
- **改动**：抽取 `report-generation` 深模块 — 入参（请求 + 已认证用户 + adapter）→ 输出流；prompt 与 schema 通过 adapter 注入，配额走既有 `quota-service`；bazi 与 ziwei 各一个 adapter
- **收益**：报告编排逻辑只测一个 interface，handler 变薄，prompt 不再内嵌
- **依赖**：建议在 XS-1 / XS-2 / S-1 / S-2 之后执行，此时 SSE 与 schema 已收敛，改造成本显著降低

---

## L · 架构手术

### L-1 · 完整报告路由瘦身（认证 + 配额 + 错误处理横切层）

- **文件**：`report/route.ts` · `ziwei-report/route.ts` 中的认证 / 配额 / 错误映射代码
- **现状**：即使 M-1 抽出了报告生成核心，认证、配额预留/释放/结算、错误映射等横切关注点仍在每个路由文件中内联，两文件重复 6+ 处配额生命周期调用
- **改动**：引入 `withDestinyBilling` 高阶函数或 middleware 模式，将 `withAuth → reserveChatQuota → settleAiQuota / releaseAiQuota → mapStreamError` 链路抽象为统一管线；两个 route handler 只关注业务逻辑
- **收益**：新增术数报告类型（如星座）只需实现业务逻辑，横切关注点零重复
- **依赖**：需要 M-1 先完成报告生成核心的抽取，否则改动面过大

### L-2 · 前端 Workspace 共享骨架抽取

- **文件**：`bazi-workspace.tsx` · `ziwei-workspace.tsx` 及未来的 `constellation-workspace.tsx`
- **现状**：两个 workspace 除了 SSE 消费（S-1 收敛后）外，还共享相似的状态管理模式（loading / streaming / error / report 分段）、section 导航逻辑、移动端适配模式
- **改动**：设计 `DestinyWorkspaceShell<T>` 泛型组件，封装 loading skeleton、section nav、error boundary、report 渲染框架；bazi / ziwei 各自只需提供 adapter（数据映射 + 自定义 section 组件）
- **收益**：新术数类型（星座）接入时，前端只需编写 adapter 而非整套 workspace
- **依赖**：S-1（SSE 收敛）完成后，状态管理部分可独立评估

---

## 执行顺序建议

```
XS-1  删死代码          ← 零风险，立竿见影
 ↓
XS-2  后端 SSE 编码收敛  ← 新增共享工具，改动简单
 ↓
S-1   前端 SSE 消费收敛  ← 与 XS-2 共享模块，趁热打铁
 ↓
S-2   Schema 合并       ← 领域层清理，为 M-1 铺路
 ↓
M-1   报告 Handler 深化  ← 核心架构改进
 ↓
L-1   横切层抽象        ← 依赖 M-1
L-2   前端 Workspace 骨架 ← 与 L-1 并行可做
```

> **原则**：先删除、再收敛、后深化。每一步完成后构建 + lint + 手动回归，确保增量可交付。
