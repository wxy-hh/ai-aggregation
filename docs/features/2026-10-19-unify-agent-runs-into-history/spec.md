# 技术规格：智能体运行记录收拢至历史记录大厅与架构解耦 (Unify Agent Runs into History Workspace)

Status: `ready-for-agent`  
ADR: `docs/adr/0019-unify-agent-runs-into-history-workspace.md`  
Glossary: `GLOSSARY.md` (AgentRun, HistoryWorkspace, Artifact, CapabilityPack, ToolCallAudit)

---

## 1. Problem Statement

在 ADR-0015 实施后，系统上线了 `AgentRun` 模型与多步编排审计机制，但前端呈现与历史资产体系存在以下硬伤：
1. **分页缺失与数据截断**：个人中心（`/profile`）写死仅拉取首屏 10 条（`fetchAgentRuns({ page: 1, limit: 10 })`），当用户任务总数达到 14 条或更多时，后续记录因无分页组件完全无法查看；
2. **产品入口认知混淆与冗余**：系统的综合历史中心（`/history`）包含「全部、对话、语音、图片、视频、命理」，唯独缺失智能体任务；而智能体任务记录却放置在个人设置页（`/profile`），导致用户困惑「智能体运行记录与系统总历史记录是否重复、为何两处分散」；
3. **页面层级臃肿**：随着任务增多，长列表严重拉长 `/profile` 页面，推挤了下方的邮箱绑定与安全设置；
4. **管理能力缺失**：个人中心只有「详情」和「重跑」，缺乏清理废弃/测试任务记录的「删除」能力。

---

## 2. Solution

通过对齐决策树（ADR-0019），实施以下端到端收拢与重构：
1. **从个人中心（`/profile`）彻底剥离**：
   - 移除 `ProfileAgentRunsSection` 及其在 `/profile` 中的引用，使个人中心纯化为「个人资料、用量统计、工具管理、账号安全」专区；
   - 彻底消除业务实体在两处呈现的冗余。
2. **在历史记录大厅（`/history`）设立独立的「智能体」Tab 视图**：
   - 扩充 Tab 导航：`tabs = [..., { id: 'agent', label: '智能体' }]`（或支持从 URL `?type=agent` 直达）；
   - 当激活「智能体」Tab 时，无缝渲染专属的 Agent 任务审计看板；
   - 顶部提供状态过滤胶囊（全部 / 成功 / 部分完成 / 失败）；
   - 底部集成完整服务端分页器（上一页 / 页码指示 / 下一页 / 状态重置），彻底解决截断问题。
3. **双轨数据层架构**：
   - 内容资产（本地流）：继续由 Dexie（IndexedDB）承载 5 类本地生成内容；「全部」Tab 保持聚合内容资产；
   - 任务审计（服务端流）：保持以 PostgreSQL 数据库为真实源，在切换到「智能体」Tab 时由服务端分页 API（`GET /api/agent-runs`）按需加载。
4. **补齐卡片交互闭环**：
   - **详情回放**：复用抽屉组件（重命名为 `AgentRunDetailDrawer`），完整展示目标、状态、耗时、配额消耗、工具调用流水（Tool Calls）；
   - **一键重跑**：点击后携带 `goalText` 和 `capabilityPack` 跳转至 `/chat?new=true&agent=true&goal=...`；
   - **单条删除**：实现 `DELETE /api/agent-runs/:id` 服务端路由与前端触发确认弹窗，删除后即时刷新列表。

---

## 3. User Stories

1. 作为一名在对话中使用过 Agent 模式的登录用户，当我在左侧导航进入「历史记录」（`/history`）时，我希望在顶部看到「智能体」Tab，以便我能在一个统一的入口找到所有历史任务。
2. 作为一名拥有 10 条以上 Agent 运行记录的用户，当我在「智能体」Tab 浏览时，我希望通过底部的分页控制器（如「上一页 / 下一页」）翻阅更早的任务记录，而不会被截断在第 10 条。
3. 作为一名需要排查特定任务的用户，我希望在「智能体」Tab 顶部点击「成功 / 部分完成 / 失败」胶囊，快速过滤筛选出失败的任务进行分析。
4. 作为一名需要对账和审计的用户，我希望在「智能体」卡片上点击「详情」，呼出抽屉查看这次任务究竟调用了哪些工具、每步耗时多久、消耗了多少点数。
5. 作为一名希望重现效果的用户，我希望在卡片上点击「重跑」，系统自动为我打开 `/chat` 会话并预填原任务目标与能力包。
6. 作为一名希望清理测试记录的用户，我希望在卡片上点击「删除」，经过确认后将该条运行记录从云端数据库中永久删除，并更新列表总数。
7. 作为一名访问个人中心（`/profile`）的用户，我希望看到清晰、简洁的个人资料、用量统计看板和工具设置，页面不再被长长的运行记录列表拉扯变形。

---

## 4. API & Component Design

### 4.1 后端 API 接口契约

1. **获取运行记录列表（已有，保持兼容）**：
   - `GET /api/agent-runs?page=1&limit=10&outcome=success`
   - 返回：`{ success: true, data: { runs: AgentRunRecord[], total: number, page: number, limit: number } }`
2. **删除单条运行记录（新增）**：
   - `DELETE /api/agent-runs/[id]`
   - 鉴权校验：必须为当前登录用户，且 `agentRun.userId === user.id`；若非本人或不存在返回 404；
   - 成功返回：`{ success: true, data: { id: string } }`

### 4.2 前端组件架构与变动清单

- **重构/移动组件**：
  - `apps/web/src/components/history/agent-run-history-view.tsx`（新增：承载智能体 Tab 的状态筛选、卡片网格、分页器）
  - `apps/web/src/components/history/agent-run-card.tsx`（新增/迁移：展示单条 AgentRun，含状态、步数、耗时、目标、消耗、详情、重跑、删除）
  - `apps/web/src/components/history/agent-run-detail-drawer.tsx`（从 profile 抽屉复用迁移）
- **修改已有组件**：
  - `apps/web/src/types/history.ts`：将 `'agent'` 扩充至 `HistoryType`，增加 AgentRun 视图相关状态类型；
  - `apps/web/src/app/history/history-workspace.tsx`：扩充 Tab 定义，当 `activeTab === 'agent'` 时渲染 `AgentRunHistoryView`；
  - `apps/web/src/app/profile/_components/profile-shell.tsx`：移除 `ProfileAgentRunsSection` 挂载；
  - `apps/web/src/lib/api/agent-runs.ts`：补充 `deleteAgentRun(id: string)` 客户端方法。

---

## 5. Acceptance Criteria

1. **AC-1（入口统一）**：访问 `/history`，Tab 栏包含「全部、对话、语音、图片、视频、命理、智能体」，点击「智能体」正常切换并显示任务统计徽章。
2. **AC-2（完整分页）**：在「智能体」Tab 下，当总任务数超过每页条数（如每页 8 或 10 条）时，底部分页控制器准确显示总页数，支持点击下一页/上一页并正确拉取新数据。
3. **AC-3（状态过滤）**：点击「全部 / 成功 / 部分 / 失败」胶囊，能按 `outcome` 过滤且重置回第 1 页。
4. **AC-4（审计详情）**：点击卡片「详情」按钮，平滑弹出抽屉，完整展示目标、指标统计与工具调用序列。
5. **AC-5（一键重跑）**：点击卡片「重跑」按钮，成功唤起 `/chat?new=true&agent=true&goal=...` 并带入原任务参数。
6. **AC-6（记录删除）**：点击卡片「删除」按钮，弹出确认对话框，确认后服务端成功物理删除，列表刷新，总任务数减 1。
7. **AC-7（Profile 瘦身）**：访问 `/profile`，页面不再渲染原有的智能体运行记录长列表，基本资料与下方的邮箱/安全卡片自然衔接，无视觉断层。
8. **AC-8（测试覆盖）**：新增 `DELETE /api/agent-runs/[id]` 接口单元测试、前端组件单元测试，既有测试保持全绿通过。
