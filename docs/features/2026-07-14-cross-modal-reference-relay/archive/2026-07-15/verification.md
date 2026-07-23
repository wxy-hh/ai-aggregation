# 跨模态单引用接力 — 完成前验证报告

> 说明：本报告原路径 `docs/reviews/2026-07-14-cross-modal-reference-relay-verification.md`，compact 收尾时被 finalizer 删除后由上下文重建归档于此。

## 结论

接力范围通过；真实模型计费链路与真机移动端未在自动验证中触发，按 accepted 边界记录。

跨模态单引用接力的共享协议、五个模块（对话/图像/视频/语音/命理）接入、替换/失效/来源删除三态、失败保留引用重试、历史派生元数据均已验证。代码审查 6 项 HIGH 全部修复并回归通过，浏览器核心链路逐项实测通过。REQ-013 经 H2 修复后命理类历史项已带派生元数据，覆盖矩阵口径已对齐。

## 输入资产

- 需求说明书：`docs/features/2026-07-14-cross-modal-reference-relay/需求说明书.md`
- 实施计划：`docs/features/2026-07-14-cross-modal-reference-relay/初步实现计划.md`
- 覆盖矩阵：`docs/features/2026-07-14-cross-modal-reference-relay/requirements-coverage.md`
- 回撤清单：`docs/features/2026-07-14-cross-modal-reference-relay/rollback-units.md`
- 代码审查：`docs/reviews/2026-07-15-cross-modal-relay-code-review.md`（含复检更新）
- 手动行为验证：`docs/reviews/2026-07-14-cross-modal-reference-relay-manual-test.md`
- 基线：工作区改动（BASE_SHA `6f88320` + 接力实现 + 审查修复，已 `git add` 未 commit）

## 验证命令和结果

- `pnpm --filter @repo/web exec vitest run`：通过，34 文件 130 测试全绿。
- `pnpm typecheck`：通过，8 包（含 `@repo/shared` relay 协议类型、`@repo/web`）。
- `pnpm lint`：通过，7 包。
- `pnpm --filter @repo/web build`：通过（dev server 启动验证）。
- 浏览器行为验证（Playwright MCP → `http://localhost:3030`）：核心链路逐项通过，详见 manual-test。

## 浏览器行为验证摘要

| 验证点 | 实测 |
| --- | --- |
| 显式「接力」按钮可发现（REQ-002/场景 10） | 操作栏按钮独立完成发起 |
| 菜单「用此继续」4 目标无语音（REQ-003/012） | 对话/图像/视频/命理；URL 仅 relayId |
| 接收恢复 + 刷新恢复（REQ-004） | 引用条渲染来源摘要；reload 后仍在 |
| 移除引用草稿保留（REQ-005/场景 8） | 移除后 draft 保留 |
| 非空不覆盖 + 显式填入（REQ-005/场景 12） | 「填入 Prompt」/「填入输入框」点击填入 |
| 包不存在失效提示（REQ-006） | 「接力内容已失效」不崩溃 |
| 来源删除快照可用（REQ-006/场景 9） | 「来源已删除，快照仍可使用」+ 隐藏查看来源 |
| 命理三术数平级无推荐（REQ-011/场景 4/15） | 八字/紫微「需补资料」，无默认选中 |
| 文本不进出生字段（REQ-011/场景 5） | 选八字后出生字段均空 |
| 图像 Prompt 预填可编辑未自动生成（场景 1） | 预填引用文本，未请求图像 API |

## 真实模型链路与移动端

- 未对真实第三方模型发起付费生成请求；执行边界（prepareExecution 只读派生 / commitExecution 成功才清引用）由代码审查 + 单元测试覆盖。
- 未做真机窄屏验证；移动端抽屉 ≤85vh、热区 ≥44×44、安全区由 Tailwind 断点 + 内联 padding 实现，经代码审查确认。

## 未验证项和原因

- 真实 LLM/图像/视频 API 计费调用：依赖外部凭据与配额成本，不在自动验证中触发。
- 真机移动端窄屏与实时录音中流式生成中等特定运行时态：无真机/需特定状态，由代码审查确认禁用与定位逻辑，记录为 accepted 边界。
