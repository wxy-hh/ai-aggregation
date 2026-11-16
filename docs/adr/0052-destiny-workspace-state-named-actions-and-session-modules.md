# 0052. 命理工作区具名状态迁移与会话命令深模块（评审 C6）

* **编号**：ADR-0052
* **状态**：已接受
* **日期**：2026-11-12
* **决策者**：AI 聚合平台工程团队
* **范围**：`apps/web` 命理模块状态层与网络编排层（`stores/destiny-workspace-store.ts`、`lib/destiny/`、八字/紫微/奇门工作区组件、Relay 提交接缝）

---

## 背景

架构审查报告 C6（`docs/reports/2026-11-10-core-architecture-review.md` 第八节）确认：八字、紫微、奇门三个工作区通过通用 `setWorkspaceState` 匿名 patch 写入核心数据（三文件共 47 处），调用者必须自行掌握领域不变量——八字在流回调内合并锁定分区与完整报告、紫微在页面内归一化宫位标签、奇门在页面内维护 runId/AbortController/递归定时器/三分区终态/防重复历史 ref，其历史保存靠 `useEffect` 监听多个状态字段加六个 ref 推断，竞态与多存漏存风险高；现有 Store 契约测试只覆盖星座寰宇。星座寰宇已通过 ADR-0006 的具名 action 先例完成收编，本 ADR 将已验证原则扩展到其余三学科，经九问拷问（目标形态、字段边界、action 词汇、session 职责、Relay 归属、历史范围、合盘边界、测试策略、分期验收）收敛出本决策。

## 决策

1. **三分类字段模型与具名状态迁移**：每个工作区缓存字段分三类——核心领域数据（八字 `report`/`lockedSections`，紫微 `report`/`chartData`/`lockedSections`，奇门 `analysisId`/`baseResult`/`sections`）与协议运行时状态（`streaming`/`streamStatus`/`blockingLoading`，奇门外加 `baseStatus`/`baseError`/`sectionStatuses`/`sectionErrors`）只能经具名 action 写入；UI 交互状态（`step`/`lastView`/`formData`/`fieldErrors`/`tab`/`activePalaceLabel`/`compatActive` 等）保留通用 patch，`error`/`errorKind` 双轨（表单校验走通用 patch，会话失败经 `failXxxSession`）。每模块 7 个具名 action 对称词汇：`beginXxxSession` / `applyXxxStreamStatus`（奇门为 `applyQimenTaskCreated`+`applyQimenBaseResult`）/ `applyXxxSection`（奇门为 `applyQimenSectionResult` 可判别联合）/ `applyXxxComplete` / `failXxxSession` / `abortXxxSession` / `restoreXxxWorkspace`。迟到分区保护、首宫聚焦、全 settled 推进、complete 合并（`mergeLockedSectionsIntoReport` 读取 store 权威态）等不变量全部内收 action。`fail` 与 `abort` 严格分离：abort 安静释放运行时标志且绝不写 `error`。`markResultReady` 废弃，终态推进原子内收。
2. **取代 ADR-0006 的 Omit 让步，启用编译期类型收敛**：ADR-0006 当时因仅 1/4 模块收编而不做类型强制；本决策落地后四学科全员具备具名 action，通用 patch 调用面已全是 UI 字段，前提消失。`setWorkspaceState` 的 patch 参数按模块以 `Omit` 排他剔除数据与协议字段，**随各工作区迁移完成按模块渐进启用**；测试构造状态经 `_dangerouslySet` 出口或类型断言，不给生产代码留后门；配套 `@ts-expect-error` 类型断言测试锁定防线。
3. **单学科会话命令深模块（Session Command Module）**：每学科建立 `lib/destiny/<module>-session.ts` 模块级闭包单例，闭环请求驱动（SSE 消费或 202 递归轮询）、runId 双哨兵淘汰、AbortController 与定时器清理、历史落盘与 Relay 提交；页面只持有意图接口 `start(formData)` / `cancel()` / `reset()` / `restoreFromHistory(historyId)`，迁移后页面零 `useRef`。`cancel`（切离安静暂停，保留已算盘面，只释放运行时）与 `reset`（弃局重起，失效 runId 并重置 Store）语义严格分开。表单校验留在页面（未入会话生命周期）。历史写入的 `formData` 必须用 `start()` 入参快照，禁止从 Store 读（防等待期脏写）。奇门轮询从裸 `fetch` 收拢为 `authFetch`（统一 mock 面并获 token 刷新，分区端点鉴权现状在 spec 阶段核实）。为测试导出 `_resetXxxSessionForTest()` 隔离钩子。八字因 AI 顾问链路额外暴露 `commitAdvisorRelay()`——基线四法之上的领域特定方法，诚实建模差异，不为形式对称把业务规则藏回视图层。
4. **Relay 两阶段提交在 session 层物理闭环（方案 A）**：经核实 `relay-store` 的两阶段计算是纯快照派生，session 可经命令式助手完成。紫微/奇门在成盘落盘时原子完成 `prepareExecution`+`commitExecution`，页面零感知；八字成盘只 prepare 进历史，commit 延迟到顾问发送成功回调（页面回调退化为单行代理 `baziSession.commitAdvisorRelay()`）；**成盘后未触发顾问即重测/重置，引用与草稿原样保留**（对齐现状语义，REQ-016 失败保留引用）。
5. **历史落盘收进 per-module 薄缝**：`lib/destiny/<module>-history.ts` 纯函数负责历史项组装与 `useHistoryStore` 写入，落地驱动单点可替换。
6. **测试策略**：store 契约测试按学科拆文件（`destiny-workspace-store.<module>.test.ts`，仓库 `[store].[subtopic]` 惯例）；session/history 测试与实现共置；网络统一 `vi.mock('@/lib/api/client')`，SSE 复用 `manualSseStream` 夹具，奇门轮询用 fake timers 验证双哨兵与抢占；Relay 三时序用例（即时闭环/延后闭环/重测保留引用）在命令 seam 零 UI 断言。
7. **分期实施与验收**：慢车道 epic，拆三个串行标准车道工单——Ticket-01 奇门（六 ref 清零、保存 effect 移除、完整端到端冒烟）→ Ticket-02 紫微（差异冒烟：首宫聚焦与即时接力闭环）→ Ticket-03 八字（差异冒烟：顾问延后接力闭环，合盘边界坚挺）。每期门槛含契约/session/类型测试全绿、该模块 Omit 启用、行为对等清单核对；命理生成流、计费配额、统一历史、跨模态接力均属核心链路，阶段 5 真实浏览器卡点不可豁免。

## 取代与修订

- **扩展**：ADR-0006 的具名 action 原则从星座寰宇平移到八字/紫微/奇门。
- **取代**：ADR-0006「类型层面不做 Omit 强制」的已知让步——依据为收编覆盖面从 1/4 变为 4/4，类型成本前提消失（本 ADR 第 2 条）。
- **不变**：ADR-0005（星座 wheel 深度）、ADR-0018（实名注册制，匿名双轨排除的证据基础）、SSE 协议、历史格式、命理算法、QuotaSession 决策表（0049 的一元生命周期仅作用于奇门 Worker 服务端，与本 ADR 前端会话层正交）。

## 备选方案及否决理由

1. **Zustand 具名 thunk 直接编排跨 Store 副作用**：违背「不把跨 Store 调用藏进状态容器」约束；契约测试失去零 mock 优势；thunk 内藏定时器闭包有泄漏风险。
2. **共享泛型命理会话框架**：SSE 与 202 轮询协议异构、终态语义异构（三分区汇聚 vs 锁区保护）、Relay 时机异构，泛型必然抽象泄漏。
3. **只收 named actions、不动历史/轮询归属**：奇门六 ref 与 effect 推断保存原样保留，治标不治本。
4. **三学科接入匿名临时记录双轨**：经核实 Edge Middleware（`middleware.ts:33`）对 `/destiny` 未登录 302、`/api/destiny/*` 全部 withAuth 401，匿名路径已被 ADR-0018 物理切断；占星临时记录系遗留死逻辑，接入等于编写永远无法执行到的代码。
5. **`baziSession.start` 传 `clearCompat` 回调**：为形式收拢引入控制反转，session 被迫认识合盘概念，破坏三学科接口纯粹性；页面同步一行可完成。
6. **合盘状态提升为全局 Store**：评审 10.3 节明确否决；无缺陷证据的大型特性重构，会翻倍 C6 范围并破坏「一次只迁移一个工作区」红线。

## 后果

- **页面瘦身**：奇门组件预计 661→约 180 行且零 `useRef`；八字/紫微同理；领域不变量获得契约测试 + 类型系统双重守卫，新写入路径在编译期被 `Omit` 拒绝。
- **可测试性**：完整会话生命周期（含 Relay 时序）无需挂载 React 即可在命令 seam 验证。
- **已知限制**：八字合盘历史恢复后重挂载仍存在本地流程态回落（合盘保持页面寄生子流程，留待独立立项）；统一历史仍为客户端 Dexie 存储，服务端持久化待 `/api/history` 立项后从 history 薄缝单点替换。

## 后续修订与勘误（2026-11-16）

- **S-J1 契约扩展**：八字新增 `activeReportHistoryId` 保护字段，`beginBaziSession(historyId)` 要求该 id 与本次历史档案同源，历史恢复也回填该字段。该改动归属 `.scratch/bazi-active-report-archive-link/`，C6 只引用其契约，不把专项改动收编为原 C6 修复项。
- **奇门查询端点鉴权勘误**：备选方案 4 中「`/api/destiny/*` 全部 withAuth 401」的表述与代码事实不符。`middleware.ts` 不对 `/api/*` 统一鉴权；C6 验收时的 TC06 已实测 `qimen/analyze/sections/[sectionKey]` 无鉴权包装，当前 `qimen/analyze/status` 也无 `withAuth`，且 `QimenAnalysisStore` 未保存 `userId`。这不是对匿名产品访问的批准，ADR-0018 的注册用户边界不变。
- **安全修复边界**：本轮复审确认，不在 C6 仅补 `withAuth` 形成仍留登录态越权的半修复；完整登录校验、任务归属与存量无归属任务的失败关闭策略转独立高优安全专项，并作为后续包含该链路的生产部署门禁。C6 验收保留 `grep=0` 的事实记录与风险引用，不将其表述为安全验收通过。
- **失败分区恢复补充（2026-11-16）**：真实重验 TC05-4 发现，局部失败时历史只保存成功分区，未保存 `sectionErrors`，导致失败分区恢复为 `idle` 骨架屏而非诚实失败卡。现以可选 `sectionErrors` 字段贯穿奇门历史载荷与恢复映射：有错误记录的缺失分区恢复为 `failed` 并保留错误文案；旧历史缺少该字段时仍保持原有 `idle` 兼容语义。这是对本 ADR 第 1 条恢复规则的兼容性补充，不改变 SSE 协议、历史主结构或三分区终态语义。
