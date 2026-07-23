# 紫微斗数排盘接口并行化提速

## 背景

`/api/destiny/ziwei-report` 总耗时过长。根因不是排盘计算（本地 iztro 毫秒级），而是两次互不依赖却串行执行的阻塞式 AI 调用：quick 阶段（≤90s，4 区块）+ full 阶段（≤180s，12 宫 + 2 模块），总耗时为两者之和。

## 方案

1. **quick 与 full 并行**：两者都只消费本地星盘上下文，`Promise.all` 并行执行，各自完成即通过 SSE 下发区块，总耗时从 `T_quick + T_full` 降为 `max(T_quick, T_full)`。
2. **full 阶段 12 宫拆 2 组并行**：A 组（父母/福德/田宅/官禄/命/兄弟 + love）与 B 组（奴仆/夫妻/迁移/子女/财帛/疾厄 + health）并行生成，合并后按 canonical 顺序排序统一下发；单组失败时 palaceAnalysis 整体降级缺失，另一组模块不受影响。
3. **profileOverview 本地化**：纯格式化信息由服务端本地生成，随 chartData 后立即下发，quick 阶段输出预算减重。

## 兼容性

- SSE 事件契约（事件类型、sectionKey、palaceAnalysis ≥12 项守卫）不变，前端零改动。
- 计费按路独立预留/结算（requestId `:quick` / `:full:a` / `:full:b`），BillingError 显式上抛不降级。

## 实测效果

总耗时 ~130s → 83.1s（-36%），full 阶段 ~90s+ → 46.8s；profileOverview 到达时机 ~80s → 0.11s。验证详见 `docs/reviews/2026-07-21-ziwei-report-parallel-verification.md`。
