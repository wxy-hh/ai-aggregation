# 0024. 领域产物单源化、阶段唯一后继与开工前审查快照

* **状态**：已接受
* **日期**：2026-10-25
* **决策者**：AI 聚合平台工程团队
* **范围**：`docs/agents`、`.claude/skills`、`tooling/scripts/qa-check.mjs`、`tooling/scripts/review-package.mjs`

## 背景

真实流程运行暴露三个问题：`domain-modeling` 已只要求 GLOSSARY，但旧入口文档仍引导同步 CONTEXT；阶段结束后给出 ADR、Spec、直接实现等并列建议，使用者看不到当前阶段、车道或唯一后继；`review-base + git diff` 只能相对 HEAD 比较，不能区分开工前已有未提交 hunk 与本任务 hunk。新增文件未进入审查时，仅有 Spec 对账表也不足以证明双轴审查发生。

## 决策

### 1. 领域术语只写 GLOSSARY

`grill-with-docs` 与 `domain-modeling` 的领域术语统一维护在 `GLOSSARY.md`。`CONTEXT.md` 只保存稳定架构背景，不再是阶段 1 的默认产物，只有用户明确要求同步时才更新。ADR 继续按真实 trade-off 惰性创建，不与 `/to-spec` 竞争成为可选下一步。

### 2. 阶段收口只给一个后继

每个阶段结束统一输出：当前已完成阶段、车道及理由、本阶段产物、当前动作、唯一下一步。默认导航为：阶段 1 → `/to-spec`（快车道除外）→ `/qa-test-planner` → `/implement` → 验收 → `/code-review` → 人工终审。只有用户明确选择独立 QA 或并行时才改变路径，不把多个泛化建议并列给使用者。

### 3. 用开工前内容快照区分差异归属

`review-package init` 在开工时记录 HEAD 与范围内文件内容，`collect` 在审查时逐文件比较开工前和当前内容。只有发生变化的文件才进入 `review-package.diff`，因此开工前已有但未继续修改的 hunk 不会混入。新增、修改、删除及未跟踪文本都通过 `git diff --no-index` 形成补丁，禁止 `git add -N` 或临时提交。

秘密文件、二进制和超大文件不读取进包，列入 unreviewed。快照只解决开工前已有改动的归属；开工后其他 Agent 对同一文件的写入无法可靠区分作者，必须默认串行或隔离。

### 4. Schema 2 增加审查执行产物，Schema 1 保持兼容

新计划使用 Schema 2。除原有 Spec 对账外，`qa-check review` 还要求 manifest、非空变更补丁（有变更时）及含 Standards、Spec、三档分流的 `review-report.md`。存在 unreviewed 文件不得判完整通过。Schema 1 继续执行原规则，不批量迁移，不新增 Hooks。

## 影响评估与收益

- 消除领域文档双写和阶段导航歧义，降低使用者判断成本。
- 在不改变 Git index、不默认增加代理的前提下，使未提交和新增文件可审查，并排除开工前差异。
- 将“只有表格”与“至少有审查包和双轴报告”区分开，提升交付证据可核查性。

## 代价与边界

- 快照与 manifest 仍需 Agent 如实生成，不能证明报告内容本身正确；人工仍需抽查 diff 和原始断言。
- 范围白名单必须在开工时确定，后续新增范围需要显式补充而不是重置基线。
- 快照只能按时间切分差异，不能识别开工后其他写入者的作者身份。
