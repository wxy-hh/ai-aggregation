---
dev_flow_completion:
  schema_version: "2"
  feature_id: "2026-07-21-ziwei-report-parallel"
  level: "M"
  outcome: "verified"
  completed_at: "2026-07-21T14:20:00Z"
  retention: "compact"
  workflow_version: "1.0.1"
  risk_labels: ["critical_correctness"]
  risk_approval_evidence: "确认"
  risk_verification_summary: "单测 5/5（并行发起/canonical 合并序/单组降级/quick 降级/计费释放/BillingError）+ destiny 回归 12/12 + typecheck 8/8 + lint 7/7 + 运行时 SSE 交错时序（full 46.8s 先于 quick 83.1s，总耗时=max 而非 sum）+ 计费台账 6 笔预留全 settled 无泄漏"
  business_diff_fingerprint: "e245444d2244d4ba7666b2f6d7f08fc51524335c"
  commits: []
  pull_request: "none"
  accepted_risks: []
  process_mode: "normal"
  retrospective_reason: "none"
  retrospective_evidence: "none"
---

# 完成报告 — 紫微斗数排盘接口并行化提速

## 问题

`/api/destiny/ziwei-report` 总耗时过长：两次互不依赖的阻塞式 AI 调用（quick ≤90s + full ≤180s）串行执行，总耗时为两者之和，典型 2~3 分钟，最坏逼近 maxDuration=300s。

## 方案（三刀）

1. **quick ∥ full 并行**：两阶段只消费本地 chartContext、互不依赖，`Promise.all` 并行，各自完成即下发区块，总耗时 `T_quick + T_full` → `max(...)`。
2. **full 拆 2 组并行**：12 宫 + love/health 拆为 A（前六宫+love）、B（后六宫+health）两路并行子调用，canonical 排序合并；单组失败降级（palaceAnalysis 不满 12 项跳过，另一组模块保留）。
3. **profileOverview 本地化**：纯格式化信息改为服务端本地生成，随 chartData 后立即下发，不再占用 quick 阶段 AI 输出预算。

## 改动文件

- `apps/web/src/app/api/destiny/ziwei-report/route.ts`（编排改造 + schema 去重）
- `apps/web/src/app/api/destiny/ziwei-report/route.test.ts`（新增 5 用例）

契约零变化：SSE 事件类型/sectionKey/payload 结构、前端消费逻辑、计费金额计算均不变；计费 requestId 细分为 `:quick`/`:full:a`/`:full:b`。

## 实测效果（dev server + 真实 doubao-seed-2-1-pro）

| 指标 | 改造前（串行基线） | 改造后（实测） |
|------|--------------------|----------------|
| 总耗时 | T_quick+T_full ≈ 130s | max(分支) = 83.1s（**-36%**） |
| full 阶段 | 单次调用 ~90s+ | 两组并行 46.8s |
| profileOverview 到达 | 随 quick ~80s 后 | 0.11s（本地化） |
| 计费预留 | 2 笔串行 | 3 笔并行，全部 settled 无泄漏 |

## 验证

- 单测 5/5 + destiny 域回归 12/12 + typecheck 8/8 + lint 7/7
- 运行时 SSE 交错时序（full 先于 quick 到达 = 并行直接证据）
- 代码审查 full：2 项发现（token 余量、提示词干扰表述）已当场修复复验，无遗留 CRITICAL/HIGH

## 风险与降级语义

- 单组失败 → palaceAnalysis 整体缺失（前端骨架态），love/health 按组保留；quick 失败 → 3 区块缺失但 full 不受影响；BillingError 不降级，显式 error 事件。
- 报告不完整时 UI 以骨架态呈现（与既有 quick 降级行为一致），不静默伪造内容。

## 后续观察项

- 模型返回数量/标签异常时 palaceAnalysis 可能整体跳过（与改造前 all-or-nothing 语义一致）。
- 计费 metadata `stage` 值由 `full` 细分为 `full:a`/`full:b`，如有外部按 stage 聚合报表需知悉。
