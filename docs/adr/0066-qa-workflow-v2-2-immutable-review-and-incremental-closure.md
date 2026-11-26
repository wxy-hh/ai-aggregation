# 0066. QA 工作流 v2.2 不可变审查、增量继承与成本闭环（修订 ADR-0033、ADR-0054、ADR-0065）

* **状态**：已接受
* **日期**：2026-11-26
* **范围**：`CLAUDE.md`（及 `AGENTS.md`）、`DESIGN.md`、`docs/agents/{qa-workflow,qa-workflow-guide}.md`、`docs/teach/qa-workflow/`、`.claude/skills/{code-review,implement,implement-spec,qa-test-planner,setup-qa-workflow}/`、`tooling/scripts/{qa-run,qa-check,qa-spec-review,review-package}.mjs` 及契约/回归测试
* **相关**：ADR-0033、ADR-0048、ADR-0054、ADR-0057、ADR-0065

## 背景

首个 `v2.1` 真实业务标准车道 dogfood（`.scratch/tools-workbench-ia-migration/`）的阶段 6 含返工消耗约 `239.6 分钟`（主会话活跃账，有效 6 轴子代理累计 `837` 次工具调用），且最终仍未闭环（Spec `r1~r3` 均无 `.source.json` 凭据，`r4/r4b` 撞 `429`，唯一 `gate-review-01` 为 FAIL）。一手源码、JSONL 与会话导出文本复盘暴露 7 条结构性根因：

1. **可变审查对象导致三轮踩脏**：`r1`（改 `GLOSSARY.md`/`spec.md`）、`r2`（`r2-spec` 仍在运行时抢跑改 3 源码）、`r4`（等待中编辑 `spec.md`）均在审查期间修改工作区。
2. **无效包派发 + Shell 变量闭包缺口 + 无限重试提示**：`qa-check.mjs:465-472` 的 `scriptReferenceTargets` 仅匹配 `$DIR/`、`${DIR}/` 或绝对路径 `<` 重定向，无法解析 `SCRIPT_DIR + BROWSER_SCRIPT` 变量赋值，使 26 条 browser `sourceCandidates` 退化为只含 `.sh`、必然撞碎 `±5` 行谓词校验；派发提示中的“直至打印 `QA_REVIEW_RECEIPT`”进一步诱发 Spec 三轮 100% `seal` 失败与 66 次翻源码排障。
3. **`Coverage v2` 退化为 `40/40` 全必审且无继承**：37/40 标为 `P0`，12 条未改存量回归单测仍落入 `required`，`r2+` 每轮重填 40 行。
4. **无 Rename 折叠与无内容哈希继承**：`_qa/review-package.diff` 因 18 个搬家组件展开膨胀至 `577,166 B`，且复审缺少基于不可变快照的增量包。
5. **编号主键与严重度无单源**：`r3` 主代理手写起始编号造成 `P-M5` 跨轮语义复用冲突、`P-M6` 漏出最终表；`S-J8` 混装真 Bug，`DESIGN.md` 规范红线与视觉配方混在 `S-J` 拉锯四轮。
6. **大捆绑先修后分流**：单轮捆绑修复 14 项新引入 `S-H3`/`S-J8`/层叠错位，阶段 7 一次炸出 17 条 `INVALID_TRIAGE`。
7. **轮次上限与 `BLOCKED` 终态矛盾**：`qa-workflow.md` 原要求停在 `r3`，`qa-check.mjs` 却因后一轮未见编号而永远 `BLOCKED`，无正式人工暂停终态把代理重新推回违规 `r4/r4b`。

## 决策（Phase 1 架构契约与规则演进）

围绕四大基础事实公理（**审查对象不可变、证据有内容身份、发现编号稳定、复审只处理变化**）确立 8 项核心决策：

1. **轻量不可变审查快照与双轴终态冻结屏障（`P0-1`）**：
   - `review-package collect` 生成轻量 `_qa/round-snapshots/r<n>/`（仅快照当轮变更文件、关联脚本、测试、日志、截图与计划文档，配 SHA-256 `manifest.json`，不复制整仓或另建重型 CAS）；`seal` 基于当轮快照验证源码引用。
   - 双轴派发后至两轴全部进入终态（`returned / failed / cancelled`）前，**冻结全部源码、测试、`spec.md`、`scope.json`、`qa-plan.md`、脚本、截图与术语文档**；一方先回只读不修。
   - 若审查途中 live 工作区被修改，子代理仍可基于快照完成 `seal` 留证，但 `qa-check review` 必判该轮 **`SUPERSEDED`（`BLOCKED`）**。
2. **原生 Executor 契约、预检前置与三类错误路由（`P0-2`）**：
   - `qa-run.mjs` 新增 `--executor ego-browser --script <path>` 原生契约，通过标准输入直接驱动 `ego-browser nodejs` 并写入 `# script:` 与 `# executor:`，逐步淘汰 `.sh + .browser.mjs` 双包装；同时修补 `qa-check.mjs` `scriptReferenceTargets` 兼容 `SCRIPT_DIR + BROWSER_SCRIPT` 变量闭包解析。
   - `collect` 前执行 2 秒可封存性预检：无含真实断言谓词的候选或关键产物失鲜即以 `PACKAGE_INVALID` 阻断，不派发审查子代理。
   - 彻底删除 `code-review` 中“直至打印 `QA_REVIEW_RECEIPT`”的无限重试措辞；错误收口为三类：
     - **`REVIEWER_EDITABLE`**：行号或表格格式错，同轮最多重试 **1 次** `seal`；
     - **`PACKAGE_INVALID`**：候选/快照/失鲜包错，审查者立刻停止，退回主代理重建包；
     - **`INFRA_UNAVAILABLE`**：429、配额或宿主故障，立刻停止并保持现状交用户，严禁擅自换模型或重派 `r1b/r4b`。
3. **平滑扩展 `QA Review Coverage: 2`：分组 `reviewUnits` + 哈希继承（`P0-3`）**：
   - 保持 `QA Review Coverage: 2` 协议标识并向下兼容旧 `v1`/`v2` 清单；在 `spec-review-checklist.json` 新增按过程脚本/测试文件聚合的 `reviewUnits`（含 `sourceHash`、`evidenceHash`、`inheritedFrom`、`verificationStatus: required | inherited | sampled`）。
   - 未实质改动源码或测试（含纯搬家改导入）且通过 `acceptance` 叶子标题与 `exit 0` 机检的存量回归单测默认归入 `sampled`（机检全量 + 风险抽检）；安全、权限、隐私、计费、核心主链路、`changed` 与非 `PASS`、`browser`/`api` 项永不被降级。
   - `r2+` 当 `sourceHash`、证据哈希与计划断言语义均未变时自动继承为 `inherited`（`unchanged` 行重写为 0），任一变动仅精确失效对应 `unitId`。不以 `required` 比例作 KPI。
4. **Rename 折叠与基于不可变快照的 `delta.diff`（`P0-4`，取代 `HR-TC07-7`）**：
   - `collect` 对 `prechange` 删除与当前新增文件做相似度匹配，输出 `rename from/to + 真实 hunk diff` 与迁移清单，保持逻辑变更与内容可重建保真。
   - 基于相邻不可变快照（`r<n-1>` 与 `r<n>`）由机器生成 `_qa/review-package-delta.diff` 与 `< 3 KB` 的 `_qa/review-brief.md`；**同时保留全量 `review-package.diff` 与快照基线允许审查者按需回查跨文件交互**，不再强制全量重读。本条正式取代禁止出现增量固定差分文件的旧契约 `HR-TC07-7`。
5. **稳定编号登记器、冲突拦截与自动分流骨架（`P0-5`）**：
   - `collect` 扫描特性目录全部历史审查原文（含未 `seal` 原文）保留已占编号空间，计算 `reservedIds` 与 `nextIds` 写入 `_qa/review-challenge.json`，禁止主代理在 prompt 手写下一编号。
   - 同一编号允许记录同问题的轨迹，禁止跨轮复用不同语义；`seal` 与 `qa-check` 检测冲突即报 **`FINDING_ID_COLLISION`**。
   - 新增 `review-package.mjs scaffold-report` 自动生成无漏项、含枚举说明的 `review-report.md` 分流表与默认驳回骨架（不新增需审查子代理手填的结构化元数据表）。
6. **`DESIGN.md` 显式分层与 6 类语义分类指引（不做前缀硬锁）**：
   - 保留 `S-H/S-J/P-M/P-W/P-X` 主前缀，**不做机器按 `S-J` 前缀一刀切禁入复审的硬锁**；在 `DESIGN.md` 与 `code-review/SKILL.md` 显式分层：
     - 可用性/无障碍/明文禁令（44px 触控热区、`prefers-reduced-motion`、禁止 eyebrow、非白名单硬编码色值、`§10` 登记）及真实产品行为/生命周期/竞态缺陷直归 **`S-H`** 或 **`P-W`** 阻断；
     - 视觉配方偏好（背景光斑搭配、玻璃透明度微调、语义字体别名）与纯可维护性建议（`Duplicated Code`、局部常量抽离）归 **`S-J`** 默认驳回、不与核心修复捆绑（人工选修仍可正常复验）。
7. **收紧默认自动复审上限为 1 轮（`r2`）并确立三大正式暂停终态（`P0-6`）**：
   - 修订 `ADR-0033` / `ADR-0054` 原“自动上限 2 轮（`r2`、`r3`）”契约：默认 **`r1` 全量双轴 → 最多 1 轮自动增量复审 `r2`**（`r2` 单/双轴判定延续 `ADR-0054` 规则）。
   - 确立正式主线状态机与三大**暂停终态**：**`PACKAGE_INVALID`**、**`WAITING_INFRA`**、**`WAITING_HUMAN`**。`r2` 仍未清零即停在 `WAITING_HUMAN`（机器结果仍为 `BLOCKED`）并输出标准化人工决策包（未闭环编号、最后原文、修复证据、剩余风险、可选动作）。
   - `collect` 对超默认上限轮次（`r3+`）默认拒绝，仅当显式传入 **`--allow-manual-round`** 时由人工授权放行。
8. **`OPT-15` 契约解耦与 `QA-WF-07` 文档瘦身**：
   - 将 `qa-workflow-contract.test.mjs` 的脆弱措辞正则迁移为结构与行为契约；正式**解除 `docs/agents/qa-workflow.md` 的 180 行硬上限**以恢复可读排版（详细操作手册继续归位 `qa-workflow-guide.md` 与技能文档），并将 `CLAUDE.md` 门禁段瘦身为原则指针表（保留 Execution Gate 与独立审查红线）。

## 对既有 ADR 与规则的取代与修订

| 被取代或修订项 | 新决策 | 依据与已评估代价 |
| :--- | :--- | :--- |
| `HR-TC07-7`（禁止增量 diff 文件） | 正式取代，改为基于相邻不可变快照机器生成 `_qa/review-package-delta.diff` 并保留全量快照基线 | 消除 577 KB 重复重喂，同时有不可变快照 + SHA-256 保真不会产生旧式“手写伪 diff” |
| `ADR-0033`/`ADR-0054`：自动上限 2 轮（r2、r3） | 默认收紧为 **1 轮（`r2`）**，超限停止并进入 `WAITING_HUMAN`（人工可用 `--allow-manual-round` 追加） | 消除无休止 `r3/r4` 内耗与修补引入新 Bug 后的盲目续跑；代价是疑难复杂单可能需要多一次人工拍板确认 |
| `ADR-0065` 决策 3：只要 `Priority=P0` 即全必审、`v2` 无继承 | 平滑扩展 `Coverage: 2`：未改存量回归机检+抽检，增加 `reviewUnits` 与哈希继承 | 避免 `40/40` 逐行重填与 `r2` 重复审计；代价是未实质改动源码的纯回归由机检与抽检兜底（安全/权限/计费/changed/非 PASS 永不降级） |
| `OPT-15` 前遗留：`qa-workflow.md <= 180` 行硬锁 | 正式解除 180 行硬锁，瘦身 `CLAUDE.md` 门禁段 | 消除正本被迫压缩成超长单行不可读文本的结构矛盾 |

## 效果验证口径（机制描述，待 Phase 3 dogfood 实测）

上述设计对压缩审查包体积（目标迁移 Diff `>= 80%`）、实现 `r2` `unchanged` 零重写、消除 `seal` 结构性死锁与 `180s`/4 小时耗时爆炸的预期均基于机理推导与脱敏 fixture 回放；后续须完成 Phase 1/2/2.5 全部工具单测与 10 项回归用例，并在 Phase 3 通过干净会话双对照真实 dogfood（含 4 类变异对照：移动锚点死代码、无语义绑定、空白 `VisualTarget`、减动效首读错误）实测验证后，方可摘除「待发布验收」标签。
