# `qa-workflow` v2.2 第一性原理诊断与 `code-review` 治本最终方案

> **生成与定稿日期**：2026-11-26
> **文档状态**：已拍板执行蓝图（已融合 Kimi 对抗审查并完成 8 项 `/grill-me` 决策锁定；Step 0 已完成 `/tools` 隔离，进入 Phase 1 实施；本文不表示 `v2.2` 已落地）
> **技术基线**：`v2.1 Batch 1`（提交 `1b31f11`，`ADR-0065`）、`docs/plans/2026-11-22-qa-workflow-optimization-plan.md`
> **实证特性**：`.scratch/tools-workbench-ia-migration/`（`v2.1` 上线后首个真实业务标准车道 dogfood，未收口失败样本）
> **对账参考**：`docs/plans/kimi-2026-11-26-qa-workflow-v2.2-code-review-root-cause-and-optimization.md`
> **一手证据**：`.scratch/tools-workbench-ia-migration/` 下 `spec.md`、`qa-plan.md`、`review-report.md`、`review/r{1,2,3}-*.md`（6 份原文 + 3 份 Standards `.source.json`）、`_qa/{scope.json,review-package.json,review-package.diff,spec-review-checklist.json,spec-review-skeleton.md,reconciliation.md}`、`evidence/`（137 份日志，含 16 份 `gate-acceptance-*.log` 与 1 份 `gate-review-01.log`）、`screenshots/`（6 张 PNG）、Claude Code 主会话 JSONL（`~/.claude/projects/<project-slug>/bd8df927-60f3-49cd-a7fe-bc28ecbdbb8f.jsonl`，当前 **5,515 行**；`retro-evidence.md` 的 5,332 行为较早快照）及全部 11 份子代理 JSONL；交叉对照会话导出文本与 `retro-evidence.md`。
> **定稿底线**：保留独立双轴与真实缺陷防线，消灭重复核验、无效审查、流程死锁与失控返工；不以少报缺陷、删减高风险覆盖或伪造 PASS 换取速度。

---

## 零、修订日志：对 Kimi 对抗审查的逐项核验、采纳与克制边界

收到 Kimi 审查报告后，已对全部源码、JSONL 与导出会话文本进行一手复核，本定稿据此完成纠偏、补强与克制收敛：

### 表 0.1：经源码/JSONL 核实并修正的我方初稿偏差（7 项）

| 序号 | 初稿偏差 | 一手源码/数据核实结果 | 本定稿修正 |
| :---: | :--- | :--- | :--- |
| 1 | 记为“18 条唯一编号、`P-M6` 并入 `P-M5`、Standards 10 条” | Standards 实为 **11 条**（`S-H1~S-H3` + `S-J1~S-J8`）；Spec 实为 **至少 8 类语义**（r1 `P-W1/2`、`P-M1~4`；r2 新增 `P-M5` 失鲜与 `P-M6` 截图；r3 prompt 原文手写 `编号从 [P-M5] / [P-W3] / [P-X1] 起`，导致 r3 复用 `P-M5` 记截图）。真实状态是 **至少 19 类语义发现、18 行最终分流、`P-M5` 跨轮主键冲突、r2 失鲜 `P-M5` 与 `P-M6` 漏出最终表** | 全文更正为“至少 19 类语义、18 行最终分流、`P-M5` 冲突”，补入编号冲突根因与注册校验 |
| 2 | `gate-acceptance` 误写“8 PASS / 8 FAIL” | 逐一核对 16 份 `evidence/gate-acceptance-*.log`，实测为 **7 PASS / 9 FAIL** | 统一修正为 **7 PASS / 9 FAIL** |
| 3 | 抬头写 `5,332 行`，分期表格写到 `L5515` | 主会话 JSONL 实测已增长至 **5,515 行**；`retro-evidence.md` 中的 5,332 行为较早快照 | 统一口径为当前 **5,515 行**，标注 5,332 行为早先快照 |
| 4 | 认为 `qa-check.mjs` 构建 `sourceCandidates` “完全只看 `argv`” | `referencedProcessScripts`（`tooling/scripts/qa-check.mjs:482-512`）**已有递归引用闭包**；真正缺口是 `scriptReferenceTargets`（`qa-check.mjs:465-472`）仅认 `$DIR/`、`${DIR}/` 或绝对路径的 `<` 重定向，无法解析原包装器的 `SCRIPT_DIR + BROWSER_SCRIPT` 变量赋值 | 精确重写根因 2 的源码定位与 `P0-2` 修复方案（长期优先 `qa-run` 原生 executor，过渡期补全 `SCRIPT_DIR/BROWSER_SCRIPT` 解析） |
| 5 | 仅指出 r2 一次并发抢跑踩脏工作区 | 核查会话导出文本，**r1（`:6345-6390` 改 `GLOSSARY.md` 与 `spec.md`）、r2（`:8400-8460` `r2-spec` 仍在跑时抢跑改 3 源码）、r4（`:14831-14870` 等待期间改 `spec.md` Out of Scope）三轮均发生审查中改文件** | 根因 1 扩展为全输入可变系统性漏洞，`P0-1` 冻结范围覆盖代码 + 文档 + `spec` + `scope` + `qa-plan` + 脚本与证据 |
| 6 | 笼统宣称“100% 属实 / 全部产品漏洞”，并将 `S-J6` 贬为“纯审美洁癖” | 多数发现有源码/证据依据（事实精度高），但处置归类与跨轮一致性差（如 `P-W2` 系断言形态问题、`S-J8` 混装真 Bug）；核查 `DESIGN.md:155-158` 确已明文禁止 `white/45`、`white/[0.58]` 等档外野值，并要求 `blur + saturate(150%)` 与玻璃后有色可磨 | 升级为**三维准确率审计**；承认 `S-J6` 触及明确规范条款，聚焦“归类失真 + 先驳回后未验证补丁” |
| 7 | 四处方案副作用与对在途业务代码的乐观定性 | ① 机器一刀切锁死所有 `S-J` 会掩盖错标真 Bug（如 `S-J8`）或阻断已接受修复的验证；② `required <= 40%` 与混算总账 `15–35 min` 属古德哈特 KPI；③ 强制 `r2+` 只读 `delta.diff` 易漏交互缺陷；④ 本次无有效 `gate-review`、Spec 三轮无 `.source.json`、r4 撞 429 | 废除一刀切硬锁与古德哈特 KPI；保留不可变全量基线按需回查；诚实定性本次为**未收口失败 dogfood 样本** |

### 表 0.2：全盘采纳的 Kimi 高价值架构补充（7 项）

| 序号 | 采纳项 | 融入位置与作用 |
| :---: | :--- | :--- |
| 1 | **四大基础事实公理** | 第三节顶层公理：**审查对象不可变、证据有内容身份、发现编号稳定、复审只处理变化** |
| 2 | **四口径时间账** | `1.2` 区分主会话阶段 6 活跃账、子代理活跃账、初次 r1 真实用户墙钟等待（`28–30m`）、命令执行账，不再混算 |
| 3 | **原生 executor + 三类错误路由 + 删无限重试** | `P0-2` 明确 `REVIEWER_EDITABLE`（至多 1 次重试）/ `PACKAGE_INVALID`（立刻停并重建包）/ `INFRA_UNAVAILABLE`（立刻停交用户），彻底删除 prompt“直到 `seal` 成功”措辞 |
| 4 | **分组审查工作单 `reviewUnits` + 哈希继承** | `P0-3` 以 `sourceHash / evidenceHash / inheritedFrom` 让全量 40 行持续可追踪的同时做到 `r2+` unchanged 行零重写 |
| 5 | **稳定编号登记器 `FINDING_ID_COLLISION`** | `P0-5` 扫描全部历史原文（含未 `seal`）保留编号空间，禁止主代理在 prompt 手写起始编号 |
| 6 | **正式暂停终态 `WAITING_HUMAN` 与上限 ADR** | `3.2` 根因 7 与 `P0-6` 补齐 `PACKAGE_INVALID / WAITING_INFRA / WAITING_HUMAN` 三暂停终态，破解 `qa-workflow.md:152` 与 `qa-check.mjs:1874-1894` 矛盾（导出 `:13518-13546`）；新立 ADR 修订自动上限 |
| 7 | **规划期减法 + 4 类变异对照 + Batch 0~3 路线图** | `P0-7` 严守 1–3 条核心 browser；`6.2` 植入 4 类已见变异防降负变放水；第五节分批递进实施 |

### 表 0.3：针对 Kimi 建议的理性克制与简化边界（3 项，防止过度工程）

| 序号 | Kimi 原建议 | 本定稿的克制简化方案 | 克制理由 |
| :---: | :--- | :--- | :--- |
| 1 | 建议通过内容寻址文件存储（类 CAS 对象库）保存快照 | 沿用 `_qa/` 现有 `prechange` 机制，新增轻量 `_qa/round-snapshots/r<n>/`，**仅快照当轮变更文件、被测脚本、日志与截图 + SHA-256 manifest** | 不复制整仓、不造对象库轮子，即可完全达成“审查对象不可变” |
| 2 | 建议给每条发现新增 6 类结构化字段元数据（`product_behavior / spec_compliance / test_oracle / visual_evidence / process_freshness / maintainability`） | 保留现有 `S-H/S-J/P-M/P-W/P-X` 主框架，将 6 类语义作为 `code-review/SKILL.md` 的**定级与分流指导准则**，**不强迫审查子代理在 Markdown 原文中多手填一层结构化字段** | 避免给审查子代理叠加新的手抄格式税与新的 `seal` 失败面；生命周期/竞态等真缺陷直归 `S-H`/`P-W`、流程失鲜交机器拦截即可解耦 |
| 3 | 建议全面采集细粒度逐动作遥测指标 | 不另建独立遥测系统、不新增 Hook 或守护进程，仅扩展现有 `review-challenge.json`、`.source.json`、`review-package.json`、`qa-run` 日志的轻量字段（`OBS-1`）；并结合已拍板 D8 在 Phase 1 经 `OPT-15` 正式解除 `qa-workflow.md` 180 行硬上限、瘦身 `CLAUDE.md`（`QA-WF-07`）以恢复可读排版 | 控制改造成本与维护面；长篇细则仍下沉 `qa-workflow-guide.md` 与对应技能 `SKILL.md` |

---

## 一、核心结论、四口径时间账与三维“准确率”审计

### 1.1 先答最关心的 4 个核心问题

| 核心问题 | 实证结论 | 关键证据 |
| :--- | :--- | :--- |
| 是不是审查准确率太低，导致耗时和复审这么多？ | **不是主要矛盾。** 原文中绝大多数发现均有代码、规范或日志依据（事实精度高）；真正失灵的是**发现分类、严重度一致性、编号主键管理与修复决策**。且缺少独立真值集，不能宣称“100% 准确”。 | `S-J8` 混装真实生命周期 Bug 与重复代码建议；r2 与 r3 复用不同语义的 `P-M5`；r1 后捆绑修 14 项新引出 `S-H3`/`S-J8`/层叠错位 |
| 是不是检查内容太多？ | **是核心原因之一，且在规划期被放大、在复审期被重复计算。** `40/40` 断言全 `required`、37 条 `P0`、26 条 `browser`、`577,166 B` Diff 每轮重喂，且反复重填 40 行。 | `_qa/spec-review-checklist.json`；`qa-spec-review.mjs:48-54`；`_qa/review-package.diff` |
| 为什么复审次数这么多？ | **七类结构性放大器串联所致**：审查期间反复踩脏工作区、无效包派发 + 无限 `seal` 重试、全量重审无继承、编号与分类无单源、大捆绑先修后分流、上限与 `BLOCKED` 终态矛盾、429 与浏览器环境故障。 | r1/r2/r4 均在审查中改文件；Spec r1–r3 全 `seal` 失败；r3 上限后仍派 r4/r4b；16 次 `gate-acceptance` 失败 9 次 |
| 四小时是否全在等审查模型思考？ | **不是。** 阶段 6 约 239.6 分钟是“审查等待 + 修复编码 + 浏览器重验 + 门禁排障 + 限流等待”的混合总账。6 份有效子代理共 837 次工具调用，Spec 占 597 次，其中 **66 次 `Read` 耗在翻查工具源码排查 `seal` 报错**。 | 主会话与 11 份子代理 JSONL；`review/r{1,2,3}-spec-axis.md` |

**一句话本质**：当前流程在优化“**每一轮表格、凭据和前缀是否齐全**”，而不是“**用最少重复工作降低真实交付风险**”。审查对象、证据身份、编号主键和增量继承没有先建模，后续只能用更多模型调用、更多门禁和更多轮次补偿。

---

### 1.2 全流程真实耗时账本与四口径拆分

按主会话 JSONL（当前 **5,515 行**）事件时间戳计算活跃时长（相邻事件间隔 `<= 30 分钟` 计入活跃，自动剔除中间 13.28 小时编辑器崩溃中断）：

| 阶段 | 会话行段 | 活跃耗时 | 占全流程比重 | 主会话工具调用 | 核心事实 |
| :--- | :--- | :---: | :---: | :---: | :--- |
| 1. `/grill-me` 需求澄清 | `L1..L193` | 16.2 min | 5.2% | 14 | 5 轮决策敲定信息架构与路由 |
| 2. `/to-spec` 编写规格 | `L194..L644` | 10.5 min | 3.4% | 80 | 含排查 Node 18 与存量红灯 |
| 3. `/qa-test-planner` 规划与基线 | `L645..L867` | 4.5 min | 1.4% | 44 | 生成 Schema 4 计划（58 条 US 衍生 40 断言）与 `init` 基线 |
| 4. **纯编码 + 单元测试** | `L868..L1302` | **11.4 min** | **3.7%** | 90 | **真正写业务与单测代码仅 11.4 分钟** |
| 5. 首次浏览器验收 + `gate-acceptance` | `L1303..L2303` | 27.9 min | 9.0% | 205 | 7 套双脚本 + 限流 429 + 多次验收门禁 |
| **前 5 阶段小计（需求 → 首次验收绿）** | `L1..L2303` | **70.6 min** | **22.7%** | **433** | — |
| 6-r1. 审查 r1 + 修复 1 + 重验 | `L2304..L3270` | 70.3 min | 22.6% | 201 | r1 双轴 429 后违规重派 `r1b` + 捆绑修复 14 项 |
| 6-r2. 审查 r2 + 修复 2 + 重验 | `L3271..L4527` | 82.8 min | 26.6% | 257 | `r2-spec` 跑 28.6m / 308 次调用 + 主代理抢跑踩踏 |
| 6-r3. 审查 r3 + 修复 3 + 重验 | `L4528..L5008` | 41.3 min | 13.3% | 98 | r3 双轴 + `gate-review-01` 炸 47 错 + 修截图裁剪 |
| 6-r4. 审查 r4 + 改 `.sh` + 429 撞墙 | `L5009..L5287` | 45.2 min | 14.5% | 56 | 改 7 个 `.sh` 重跑 + r4/r4b 撞 429 被用户打断 |
| **阶段 6 合计（含审查触发的返工重验）** | `L2304..L5287` | **239.6 min（4.0h）** | **77.3%** | **612** | **是纯编码的 21.0 倍、前 5 阶段总和的 3.4 倍**（全流程 16 次 `gate-acceptance` 实测 **7 PASS / 9 FAIL**） |
| 7. `/retro` 复盘（附加） | `L5288..L5515` | 13.6 min | — | 42 | — |

为杜绝后续复盘因停顿阈值或口径不同再次产生矛盾，时间账必须拆分为以下**四种独立口径**：

| 口径 | 本次实测事实 | 正确与错误解读边界 |
| :--- | :--- | :--- |
| **1. 阶段 6 主会话活跃账** | 以 30 分钟间隔剔除长中断后约 **239.6 分钟**（612 次主会话工具调用） | 包含修复编码、浏览器重验、门禁排障和等待；**不能称为“纯审查推理耗时”** |
| **2. 审查子代理活跃账** | 有效 `r1b/r2/r3` 六轴合计约 **82.3 分钟、837 次工具调用**（Spec 占 597 次 / 57.3m） | 双轴并行执行，各轴活跃之和**不等于用户墙钟等待** |
| **3. 初次 r1 真实用户等待** | 两个 `Opus` 子代理转录首末均跨越 **28–30 分钟**，虽仅产生 20 / 24 次工具调用且无原文产出（各遇 6 次 429） | 不能以“idle”或“活跃仅 6 分钟”掩盖用户真实干等半小时的事实 |
| **4. 命令执行账** | 单轮 Vitest 数秒、单条浏览器脚本数十秒 | 真正昂贵的是**429 限流 `sleep 70`、7 套双脚本整轮重跑、截图裁剪与端口排障**，而非测试命令本身慢 |

---

### 1.3 三维“准确率”审计（取代笼统“100% 属实”）

按三轮 6 份审查原文语义（而非 `review-report.md` 表格行数）重新盘点：

| 审查轴 | 原文实有编号与语义矩阵 | 计数、定性与核心失真 |
| :--- | :--- | :--- |
| **Standards 轴（11 个编号）** | **硬违规（3 条）**：`S-H1`（页头违规 eyebrow 小标签）、`S-H2`（`DESIGN.md §10` 漏登记 `/tools`）、`S-H3`（`useReducedMotion()` 首屏初始 `false` 致减动效偏好失效）。<br>**建议与混合项（8 条）**：`S-J1~3`（抽离重复样式常量）、`S-J4~5`（`font-[var(...)]` 改语义类 `font-heading`）、`S-J6`（纯平底色上用 `GLASS_CARD` 缺少环境光斑与 `backdrop-saturate-150`）、`S-J7`（删零消费兼容再导出）、`S-J8`（**`requestAnimationFrame` 轮询卸载未清理 + 快速切锚点竞态** 与重复代码混写）。 | 共 **11 个编号**。<br>① `S-J8` 将**真实生命周期/竞态缺陷**混进 Fowler `Duplicated Code` 建议中；<br>② 核实 `DESIGN.md:155-158` 确有“禁止档外野值、玻璃公式需 `blur + saturate(150%)`、玻璃后需有色可磨”的明文条款，故 **`S-J6` 并非纯粹主观审美**，问题出在“被放入 `S-J` → 实现方先驳回 → 后修补未验证层叠上下文又修错 → 拖满 4 轮”。 |
| **Spec 轴（至少 8 类语义）** | **r1（6 条）**：`P-W1`（移动锚点挂在 `scrollRef` 使 `window.scrollTo` 死代码）、`P-W2`（抽屉按钮无 `href` 与自点击）、`P-M1`（MCP 10 上限单测缺失错绑）、`P-M2`（旧路径错绑且缺后置日志）、`P-M3`（漏跑 4 个迁移单测）、`P-M4`（433px 假 390px + 429 错误态当正常）。<br>**r2（新增 2 类）**：`P-M5`（**审查包失鲜 / 并发改脏 `treeDigest` 不一致**）、`P-M6`（**截图空白/切头 + 弱验收**）。<br>**r3（撞号复用）**：r3 prompt 手写 `编号从 [P-M5] / [P-W3] / [P-X1] 起`，导致 r3 再次将**截图问题命名为 `P-M5`**。 | 按语义 **至少 8 类问题**。<br>① 最终 `review-report.md` 仅有 **18 行**分流：r2 失鲜 `P-M5` 与 `P-M6` 漏出最终表，r3 `P-M5` 与 r2 `P-M5` 形成**跨轮主键冲突**；<br>② 真实状态是 **至少 19 类语义发现（11 + 8）、18 行最终表、1 个主键跨轮复用冲突**。 |

因此，评价 `code-review` 质量必须使用**三维准确率**：
1. **事实精度（本次高）**：源码、规范或日志均能支撑绝大多数核心陈述（如 `P-W1` 死代码、`S-H3` 减动效时序、`S-J8` 卸载竞态、无效截图）；
2. **处置精度（本次差）**：把真实产品行为漏洞（`P-W1`、`S-H3`、`S-J8`）、规范条款争议（`S-H1/2`、`S-J6`）、测试/断言/截图证据缺陷（`P-W2`、`P-M1~4`、截图 `P-M5/M6`）、流程失鲜（r2 `P-M5`）与可维护性建议（`S-J1~5/7`）全部混在同一条复审轨道上；
3. **跨轮一致性（本次差）**：同一截图缺陷在 r1 仅作附注、r2 升为 `P-M6`、r3 变成新 `P-M5`；主键漂移导致后续自动对账必然出错。

---

### 1.4 真实结局定性与二手复盘（`retro-evidence.md`）纠偏

**真实结局定性**：本次特性的阶段 6 **并未形成有效的终审闭环**——Spec `r1/r2/r3` 均无 `.source.json` 凭据；`r4/r4b` 全因 429 无有效原文；`P-M5` 跨轮撞号且两项发现漏出最终表；`review-report.md:1` 自述“两轴均由 `code-review` 技能派发并 `seal`”，但 `r2/r3/r4` 实际由主代理直接派 `Agent` 且 Spec 从未 `seal`；唯一 `evidence/gate-review-01.log:135-139` 为 FAIL。**因此，本次特性只能定性为“未收口失败 dogfood 样本”，不可宣称“业务已完整交付通过”。**

同时，二手材料 `retro-evidence.md` 存在 4 处必须纠偏的失实或漏报：
1. **掩盖 r1 违规重派**：将 `r1` 两份 Opus 转录轻描淡写为“idle 无产出”；实测两者已活跃运行 `6.8m / 24 次调用` 与 `5.7m / 20 次调用`（用户墙钟跨越 `28–30m`），各自命中 6 次 429 后被主代理擅自换模型重派 `r1b`。
2. **漏报 r1 / r2 / r4 三轮工作区踩踏**：完全未提 r2 `19:11` `r2-spec` 运行途中抢跑改 3 个白名单源码；也漏掉 r1 修改 `GLOSSARY.md/spec.md` 与 r4 修改 `spec.md`。
3. **漏报系统性绕过流程**：未提 `r2/r3/r4` 全程绕过 `Skill(code-review)` 导致 `REVIEW_PROVENANCE_UNVERIFIED`、未按规则交人工却强派 `r4/r4b`。
4. **遗漏 `r2-spec` 308 次调用真相**：`r2-spec` 跨崩溃前 `8.7m / 124 次` + 恢复后 `20.0m / 184 次` = `28.6m / 308 次调用`，其中 **38 次 `Read` 直接耗在翻查 `tooling/scripts/*.mjs` 排查 `seal` 失败**。

---

## 二、全部 11 份子代理转录量化明细

| 子代理转录 | 实际模型 | 活跃耗时（墙钟备注） | 总轮数 | 工具总数 | `Read` 分布（`diff` / `规范文档` / `scripts` / `tests` / `源码` / `qa产物` / `截图`） | 读 `tooling/scripts` | `seal` 结果 | `429` 次数 |
| :--- | :--- | :---: | :---: | :---: | :--- | :---: | :--- | :---: |
| `standards-r1` | `claude-opus-5-5:max` | 6.8m（墙钟 ~29m） | 47 | 24 | 0 / 3 / 0 / 0 / 0 / 0 / 0（+21 Bash 读规范） | 0 | 未写原文（429） | 6 |
| `spec-r1` | `claude-opus-5-5:max` | 5.7m（墙钟 ~28m） | 32 | 20 | 0 / 0 / 0 / 0 / 0 / 3 / 0（+17 Bash 探目录） | 0 | 未写原文（429） | 6 |
| `standards-r1b` | `gemini-4-hydrogen:xhigh` | 9.4m | 133 | 107 | 9 / 20 / 5 / 5 / 39 / 5 / 0 | 4 | **通过** | 0 |
| `spec-r1b` | `gemini-4-hydrogen:xhigh` | 16.1m | 198 | 164 | 4 / 4 / 31 / 26 / 22 / 50 / 6 | **15** | **失败（无凭据）** | 1 |
| `standards-r2` | `gemini-4-hydrogen:xhigh` | 7.6m | 93 | 70 | 7 / 14 / 0 / 6 / 24 / 7 / 0 | 0 | **通过** | 0 |
| `spec-r2` | `gemini-4-hydrogen:xhigh` | 28.6m | 383 | 308 | 5 / 3 / 80 / 37 / 32 / 114 / 12 | **38** | **失败（无凭据）** | 2 |
| `standards-r3` | `gemini-4-hydrogen:xhigh` | 8.0m | 84 | 63 | 1 / 11 / 8 / 3 / 26 / 5 / 0 | 4 | **通过** | 0 |
| `spec-r3` | `gemini-4-hydrogen:xhigh` | 12.6m | 162 | 125 | 0 / 4 / 29 / 18 / 13 / 40 / 6 | **13** | **失败（无凭据）** | 0 |
| `standards-r4` | `<synthetic>` | 0.1m | 2 | 0 | — | 0 | 失败（429） | 4 |
| `spec-r4` | `<synthetic>` | 0.0m | 1 | 0 | — | 0 | 失败（429） | 2 |
| `standards-r4b` | `<synthetic>` | 0.0m | 1 | 0 | — | 0 | 失败（429） | 2 |

**有效子代理汇总（`r1b + r2 + r3`，6 份）**：
- 总计 **837 次工具调用**、**82.3 分钟子代理活跃耗时**；
- **Spec 轴 3 轮占 597 次调用（71.3%）/ 57.3 分钟**，Standards 轴 3 轮占 **240 次调用 / 25.0 分钟**；
- `DESIGN.md` 在有效 Standards 子代理中仅 `Read` 就被读取 **20 次**（尚不含 Bash `sed`）；`tooling/scripts/*.mjs` 被 3 轮 Spec 子代理排查 `seal` 报错合计读取 **66 次**（`15 + 38 + 13`）。

---

## 三、第一性原理目标函数与完整 7 条根因链

### 3.1 第一性原理目标函数与四大基础事实

QA 闭环的第一性目标，不是表格满分、轮次越少越好或门禁 PASS，而是：

> **在独立审查与核心链路证据不可缺席的前提下，最小化「漏出真实缺陷的预期成本 + 验证成本 + 人与配额的等待成本」。**

阶段 6 的用户感知总成本可精确拆解为：

$$T_{\text{总}} = T_{\text{打包/预检}} + T_{\text{首轮双轴关键路径}} + T_{\text{分流}} + \sum_{\text{轮次}}\Big(T_{\text{修复}} + T_{\text{受影响重验}} + T_{\text{增量复审}}\Big) + T_{\text{工具/配额等待}}$$

当前系统之所以耗时爆炸，核心谬误是把**“覆盖全集”等同于“每轮工作全集”**——让每一轮都机械重跑 `全量 Diff + 全量规范 + 全量 40 行对账 + 全量截图 + 全部待复核编号`。正确的增量复审工作量只能是：`未闭环编号 + 上次已审快照后变化的文件与证据 + 受变化影响的依赖断言 + 按需回查的不可变历史上下文`。

因此，`v2.2` 必须先确立**四大基础事实公理**：
1. **审查对象不可变**：每轮审查绑定的代码、规范、计划、脚本与证据构成不可变快照，审查进行中工作区只读。
2. **证据有内容身份**：断言、测试文件、脚本与截图带内容哈希，内容未变即可合法继承上轮语义结论。
3. **发现编号稳定**：每轴从全历史原文保留唯一主键空间，工具自动分配编号，严禁跨轮复用不同语义。
4. **复审只处理变化**：未变单元机器继承，`r2+` 只核验未闭环编号、变化单元及受影响依赖。

---

### 3.2 完整 7 条结构性根因

1. **根因 1（可变审查对象）：主代理在 r1 / r2 / r4 三轮审查途中反复踩脏工作区**
   - 会话导出文本实证：`r1` 派发后修改 `GLOSSARY.md` 与 `spec.md`（`:6345-6390`）；`r2` 在 `r2-standards` 返回而 `r2-spec` 仍在运行时抢跑修改 3 个白名单源码（`:8400-8460`），直接制造 `treeDigest` 不一致与 `[P-M5]`；`r4` 派发并等待期间再次直接编辑 `spec.md` Out of Scope（`:14831-14870`）。审查者同时读静态 Diff 与 live 工作区，必然互相污染。

2. **根因 2（无效包派发 + Shell 变量闭包缺口 + 无限 `seal` 重试提示）**
   - **精确源码机制**：`qa-check.mjs:482-512` 的 `referencedProcessScripts` 已有递归引用闭包，并非完全“只看 `argv`”；真正缺口在于 `scriptReferenceTargets`（`qa-check.mjs:465-472`）仅识别 `$DIR/`、`${DIR}/` 或绝对路径形式的 `<` 重定向，无法解析原包装器中通过变量拼装的 `SCRIPT_DIR + BROWSER_SCRIPT` 赋值。
   - **死锁连锁**：26 条 browser 断言的 `sourceCandidates` 退化为只含无谓词的 21 行 `.sh`；而 `qa-spec-review.mjs:241-253` 要求候选文件目标行 `±5` 行非注释代码命中 `PREDICATE_KEYWORDS`。两者叠加构成**结构性不可封存包**，而派发 prompt 却诱导“修正后重试，直到打印 `QA_REVIEW_RECEIPT`”，直接诱发 Spec 三轮 `100% seal` 失败与 `66` 次翻源码排障。

3. **根因 3（规划期膨胀 + `Coverage v2` 只减列不减语义核验）**
   - 上游规划将 58 条 US 中的大量未改存量能力泛化成高优追踪，`qa-plan.md` 将 **37/40 条标为 `P0`**；browser 使用了 6 条 TC / 7 套脚本，超出 `qa-test-planner/SKILL.md:62` **默认 1–3 条核心主链路**。
   - 下游 `isRequiredSpecRow` 将 `P0`、`browser/api`、`changed`、`status !== PASS` 全设为必审，导致 12 条未改源码且已通过 `acceptance` 叶子校验的既有 Vitest 单测仍落入 `required`，26 条同脚本断言逐行重填，退化成 **`40/40` 全必审**。

4. **根因 4（无 Rename 折叠 + 无内容哈希继承）**
   - `_qa/review-package.diff` 膨胀至 **577,166 B / 13,531 行**（52 文件），其中 18 个从 `profile/_components/` 搬迁到 `tools/_components/` 的文件被全量展开占掉近 78% 体积；
   - `r2/r3` 缺失基于快照的 `delta.diff` 及 `sourceHash / evidenceHash / inheritedFrom` 继承机制，被迫重喂全量 Diff、重读 `DESIGN.md` 超 20 次、重写完整 40 行。

5. **根因 5（编号、分类与严重度无单一事实源）**
   - `r3` prompt 由主代理手写“新发现从 `[P-M5]` 起”，直接造成与 `r2` 失鲜 `P-M5` 冲突、`r2` 的 `P-M5/P-M6` 漏出 `review-report.md`；`rawIndex`（`qa-check.mjs:1915-1928`）只保留末次出现位置，不检测跨轮语义复用；
   - `S-J8` 混装真 Bug 与重复代码建议、截图缺陷三轮定级漂移、`S-J6` 触及 `DESIGN.md` 明确条款却进 `S-J` 拉锯，导致处置失准。

6. **根因 6（先修后分流 + 大捆绑粗糙补丁制造二次缺陷）**
   - `r1` 后一次性捆绑修改约 14 项，把核心锚点死代码、样式常量、字体类名、测试绑定、视觉配方搅在同一批：`P-W1` 改了 4 轮才稳、补丁直接新引入 `S-H3` 与 `S-J8`；修 `[P-M4]` 连续两轮漏改 `mobile: false`；未经前置校验即手写 `review-report.md`，阶段 7 一次炸出 `17` 条 `INVALID_TRIAGE` + `1` 条 `INVALID_DISPOSITION`；全流程 16 次 `gate-acceptance` 失败 9 次。

7. **根因 7（轮次上限与 `BLOCKED` 终态矛盾 + 浏览器/配额基础设施放大器）**
   - `qa-workflow.md:152` 要求 `r3` 后停止，但 `qa-check.mjs:1874-1894` 强制“本次修编号必须出现在后一轮且未闭环则永远 `BLOCKED`”，缺少正式人工交接终态。会话导出（`:13518-13546`、`:14457-14461`）实证主代理曾明确决定“不派 `r4`”，又为让门禁通过而违规强派 `r4/r4b`。
   - 同时叠加 Antigravity 429 违规换模型重派、绕过 `Skill(code-review)`、非 macOS 仍遗留的截图 `clip` 缺陷、`ego-browser` 移动点击失灵与 `433px` 最小宽度、接口 `30 次/60s` 限流与端口漂移，不断放大总时长。

---

## 四、`v2.2` 治本架构蓝图与完整优化清单

> **架构纪律**：① Phase 1/2 期间不提前拆分 `qa-check.mjs` 单体，待一二期规则与状态机稳定后，按已拍板 D8 在独立 **Phase 2.5** 执行 `OPT-14` 单体拆 6 模块与日落无 challenge 旧双轨；② Phase 1 同步执行 `OPT-15`（解耦脆弱措辞正则、解除 `qa-workflow.md` 180 行硬上限、瘦身 `CLAUDE.md`）与 `OPT-17` 残余清理，长篇操作规程仍分层归位至 `docs/agents/qa-workflow-guide.md` 与对应技能 `SKILL.md`。

### A 块：彻底解决 `code-review` 耗时、死锁与多轮内耗（`P0-1 ~ P0-7`）

#### `P0-1`：轻量不可变审查快照 + 全输入双轴终态屏障
- **涉及文件**：`tooling/scripts/review-package.mjs`、`.claude/skills/code-review/SKILL.md`、`.claude/skills/implement/SKILL.md`、`docs/agents/qa-workflow.md`。
- **具体方案**：
  1. **轻量不可变快照（非重型 CAS）**：`collect` 时沿用现有 `_qa/prechange` 思路，新建 `_qa/round-snapshots/r<n>/`，仅复制/锁定本轮变更文件、审查关联脚本、测试、证据日志、截图及 `spec.md / qa-plan.md / scope.json` 并生成 SHA-256 `manifest.json`；子代理核验与 `seal` 校验绑定快照而非 live 工作区。
  2. **全输入双轴终态屏障**：双轴派发后，在 Standards 与 Spec 均进入明确终态（`returned / failed / cancelled`）之前，严禁主代理编辑**任何代码、测试、`GLOSSARY.md`、`spec.md`、`scope.json`、`qa-plan.md`、验收脚本或截图**。一方先回只能只读预览结果，不得抢跑动码。
  3. **失鲜即 `SUPERSEDED`**：若审查运行中 live 工作区被意外踩脏，子代理仍可基于当轮不可变快照完成 `seal` 留证；`qa-check` 一经检测到当前工作区与快照偏差，旧审查结论立刻标为 `SUPERSEDED`，绝不冒充对当前工作区的有效审查。

#### `P0-2`：原生 Executor 契约 + 2 秒预检 + 三类错误路由与有限重试
- **涉及文件**：`tooling/scripts/qa-run.mjs`、`tooling/scripts/qa-check.mjs`、`tooling/scripts/qa-spec-review.mjs`、`tooling/scripts/qa-preflight.mjs`、`tooling/scripts/review-package.mjs`。
- **具体方案**：
  1. **原生 executor + 兼容闭包双轨打通**：首选为 `qa-run` 增加 `--executor ego-browser --script <path>` 原生契约，通过标准输入直接驱动 `ego-browser nodejs` 并记录真实 `.browser.mjs` 路径，彻底淘汰 `.sh + .browser.mjs` 双文件包装；过渡期修补 `qa-check.mjs:465-472` 的 `scriptReferenceTargets`，使其识别 `SCRIPT_DIR` 与 `BROWSER_SCRIPT` 变量赋值并自动解析内部真实的 `.browser.mjs` / `.ts` 进入 `sourceCandidates`。
  2. **`collect` 前 2 秒可封存性预检**：检查各 `required` 单元是否存在至少一个含真实断言谓词的 `sourceCandidates`、checklist 与 skeleton 是否同源、acceptance 与 QA 产物哈希是否新鲜；任一失败**2 秒内阻断并精确报错，审查子代理派发数为 `0`**。
  3. **三类类型化错误路由 + 删除无限重试提示词**：
     - `REVIEWER_EDITABLE`（行号/表格格式可由审查者自修）：允许同轮**最多 1 次** `seal` 重试；
     - `PACKAGE_INVALID`（`sourceCandidates` 缺失、快照缺件、包失鲜）：审查者**立即停止**，退回主代理重建包；
     - `INFRA_UNAVAILABLE`（`429`、模型配额、宿主异常）：**立即暂停并交用户**，严禁同轮擅自换模型或重派 `r1b/r4b`。
     - 彻底删除派发 prompt 中“修正后重试，直到打印 `QA_REVIEW_RECEIPT`”的无限循环措辞。

#### `P0-3`：分组审查工作单（`reviewUnits`）+ 内容哈希继承
- **涉及文件**：`tooling/scripts/qa-spec-review.mjs`、`tooling/scripts/qa-check.mjs`、`.claude/skills/code-review/SKILL.md`。
- **具体方案**：
  1. **全量追踪与分组核验解耦**：继续保留全量 40 行断言索引（不删减覆盖），在其上新增按**过程脚本 / 测试文件**聚合的 `reviewUnits`（支持 1 个脚本的多条相邻断言一次读取、一次谓词评价）：
     ```json
     {
       "unitId": "script:tc03-tools-anchors@<sha256>",
       "rowIds": ["TC03-1", "TC03-2", "TC03-3", "TC03-4"],
       "riskReason": ["browser", "changed", "new-behavior"],
       "sourceHash": "...",
       "evidenceHash": "...",
       "inheritedFrom": "r1-spec@<digest>",
       "verificationStatus": "required | inherited | sampled"
     }
     ```
  2. **区分新增高风险与存量回归**：未改源码、未改测试、仅路径迁移且 `acceptance` 已校验叶子标题与 `exit 0` 的既有回归测试，改为**机器全量核验 + 风险抽检**；安全、权限、隐私、计费、核心主链路、`changed` 与非 `PASS` 项永不被抽检降级。
  3. **哈希继承与最小失效（平滑扩展 `QA Review Coverage: 2`）**：不升 `v3`、向下兼容旧 `v1/v2` 清单；`r2+` 仅当 `sourceHash`、证据日志/截图内容哈希及计划断言语义**全部未变**时，自动继承上轮 `r<n-1>` 结论（`unchanged` 行重写为 `0`）；任一元素改动只精准失效对应 `unitId` 与依赖项。`required` 的语义由“每轮人工重读”转为“**本轮必须拥有有效核验状态（含有效继承）**”。

#### `P0-4`：Rename 感知全量包 + 上轮快照 `delta.diff` + `< 3 KB` 紧凑简报
- **涉及文件**：`tooling/scripts/review-package.mjs`、`.claude/skills/code-review/SKILL.md`、`docs/adr/0066-*.md`。
- **具体方案**：
  1. **搬家 Rename 折叠**：`collect` 对 `prechange` 删除集与新增集执行相似度/行集合比对，匹配成功即输出 `rename from/to + 真实 hunk diff` 与迁移映射清单（确保前后内容可完整重建、不因折叠丢失真实导入/逻辑变化）。
  2. **基于快照的增量包 `delta.diff` + 保留不可变全量基线**：由 `ADR-0066` 正式取代旧契约 `HR-TC07-7`（禁止手写伪增量的历史条文），以 `r<n-1>` 已审快照与当前 `r<n>` 快照为基线机器生成 `_qa/review-package-delta.diff`；**复审默认读 `pendingIds + delta.diff + review-brief.md`，同时保留全量快照基线允许按需回查交互细节**，不搞“强制盲视全量”。
  3. **`< 3 KB` 的 `_qa/review-brief.md`**：精简索引迁移清单、实质变更文件、本轮需核验 `reviewUnits` 与受影响规范路径（无 `apps/web/src` UI 改动时不引导重读整份 `DESIGN.md`）。

#### `P0-5`：稳定编号登记器 + `DESIGN.md` 显式分层 + `review-report.md` 自动骨架
- **涉及文件**：`tooling/scripts/qa-spec-review.mjs`、`tooling/scripts/qa-check.mjs`、`tooling/scripts/review-package.mjs`、`DESIGN.md`、`.claude/skills/code-review/SKILL.md`。
- **具体方案**：
  1. **全历史稳定编号登记器**：`collect` / `scaffold` 扫描本特性全部历史审查原文（**包括未 `seal` 的原文，如 r2 `P-M6`**）保留已占编号空间，由工具计算下一可用编号并写入 challenge；禁止主代理在 prompt 手写“新发现从 `P-M5` 起”；`qa-check` 检测跨轮同一编号语义跳变，命中即报 **`FINDING_ID_COLLISION`**。
  2. **`DESIGN.md` 显式分层 + 分类指导准则（不做 `S-J` 前缀硬锁、不叠手填结构化字段表）**：保留 `S-H/S-J/P-M/P-W/P-X` 既有主格式，并在 `DESIGN.md` 与 `code-review/SKILL.md` 显式分层与界定边界：
     - **可用性/无障碍/明文禁令**（44px 触控热区、`prefers-reduced-motion`、禁 eyebrow、非白名单硬编码色值、`§10` 登记）与 **真实产品行为/生命周期/竞态缺陷**（如本次 `P-W1`、`S-H3`、`S-J8` 后半部分）直归 **`S-H`** 或 **`P-W`** 阻断，**禁止混入 Fowler `S-J`**；
     - **视觉配方与可维护性建议**（背景光斑搭配、玻璃透明度微调、`font-heading` 别名偏好、`Duplicated Code` 局部常量抽离）明确归为 **`S-J`**，默认进 `## 默认驳回`、不与核心修复捆绑（人工选修时仍可正常复验）；
     - **流程失鲜**交由机器在派发前与 `SUPERSEDED` 拦截，不靠人工在审查原文起编号补救；
     - **截图无效**（空白/错目标）作为验收证据无效，优先在 `collect` 前拦截；仅图像哈希、`VisualTarget` 与断言语义均未变时继承，任一改变必重核。
  3. **自动预生成 `review-report.md` 骨架**：双轴落盘后由脚本一键扫描所有未闭环发现（含未入表旧轮次遗留项），生成带精确枚举注释与合法性防呆的三档分流表骨架，前置消灭阶段 7 的 `17` 条 `INVALID_TRIAGE` + `1` 条 `INVALID_DISPOSITION`。

#### `P0-6`：先分流后修复 + 完整状态机与三个正式暂停终态 + 上限 ADR
- **涉及文件**：`.claude/skills/code-review/SKILL.md`、`.claude/skills/implement/SKILL.md`、`tooling/scripts/qa-check.mjs`、`docs/agents/qa-workflow.md`、新增 ADR。
- **具体方案**：
  1. **先分流、小批量、测试先行修复**：双轴到达终态后先生成并核对分流决策；优先修真实阻断与产品/生命周期缺陷，可维护性 `S-J` 单独处理不与核心修复混批；产品缺陷先补红灯单测证明旧实现失败再做最小修改，只重跑受影响验收脚本，禁止“顺手改视觉配方与无关常量”。
  2. **显式状态机与三个正式暂停终态**：
     - 主线状态机：`COLLECTED → REVIEWING → TRIAGE → FIXING → VERIFYING → REREVIEWING → READY_FOR_HUMAN`；
     - 三个**正式暂停终态**：`PACKAGE_INVALID`、`WAITING_INFRA`、`WAITING_HUMAN`。它们**均不等于交付 PASS**，但机器必须允许 Agent 在此安全停止自动循环，并生成标准化人工决策包（含未闭环编号、最后审查原文、已有修复证据、剩余风险、人工可选动作：接受风险 / 授权追加轮 / 外部独立审查）。
  3. **新立 ADR 收敛自动复审上限**：将现有默认“r2、r3 两轮自动复审”修订为 **默认 `r1` 全量双轴 + 最多 1 次自动增量复审 `r2`**，r2 仍未清零即自动转入 `WAITING_HUMAN`。`collect` 对超限轮次默认硬闸拒绝（仅人工显式授权 `--allow-manual-round` 放行），`r2` 是否单轴仍严格遵守 `ADR-0054` 变化类型规则。

#### `P0-7`：规划期减法 + 高频违规前移 `qa-preflight`
- **涉及文件**：`.claude/skills/qa-test-planner/SKILL.md`、`tooling/scripts/qa-preflight.mjs`。
- **具体方案**：
  1. **规划期减负**：未改动后端/治理能力的已有功能写成「保持契约 + 既有回归测试集合」，不为每个存量能力单列新 US 与人工重审义务；`P0` 严格限定为安全、权限、计费、核心主链路与不可恢复风险；browser 严守**默认 1–3 条核心主链路**（如 `TC10` 纯前端认证引导下沉组件测试），真正把 15 分钟时间盒用作换接缝的停损信号。
  2. **1 秒 `qa-preflight` 机械预检扩充**：新增以下零成本提示/拦截：① `apps/web/src/app/<route>/page.tsx` 新独立路由未在 `DESIGN.md §10` 登记；② 新增 `font-[var(--font-` 任意值类或与 `@/lib/constants/surface-styles` 重名常量；③ `review-report.md` 分流列合法性本地秒级校验。

---

### B 块：实跑暴露的 6 项基础设施痛点 + 轻量成本度量（`P1`）

| 编号 | 实测痛点与证据 | 治本方案 |
| :---: | :--- | :--- |
| **INFRA-1** | **非自定义窗口宿主滚动下 `clip` 拍出 5 张空白/切头图，且临时修复仅靠 macOS `sips`** | 在 `tooling/scripts/qa-browser-helper.mjs` 的 `captureTargetGeometry` 优先使用原生元素 `locator.screenshot()` 并补齐弹层预清理；退化视口裁剪时使用 **纯 Node `node:zlib` 零外部依赖 PNG 视口裁剪**（含 DPR 缩放，遵守不改宿主 `package.json` 边界），彻底替代 `sips` 与错误 `clip` |
| **INFRA-2** | **`ego-browser` 在 `mobile: true` 点击失灵、`mobile: false` 最小宽卡死 `433px`（`P-M4` 跨 3 轮）** | 在 `docs/agents/qa-workflow-guide.md`、`docs/project-guide.md` 与 helper 固化：需要精确 `390px` 视口且含真实点击交互时，优先用**原生 Playwright**（`setViewportSize({ width: 390, height: 844 })`）；仅在需复用桌面登录态时才使用 `ego-browser` |
| **INFRA-3** | **Node 18 跑不起来 Vitest 每次手拼 `PATH`；Dev 端口 `3032→3030` 漂移批量改 7 个脚本** | ① `qa-browser-helper.mjs` 新增 `resolveBaseUrl()`（读 `QA_WEB_URL` 或调 `dev-port.mjs --probe`），禁写死端口；② `qa-run.mjs` 增加 `engines.node >= 22` 前置校验 |
| **INFRA-4** | **本地验收 37 次撞 `429`（反复 `sleep 70`）+ 遗留孤儿 QA 账号（`qa_tools_ia_r2`）** | `createMarker()` 默认内置 429 与「请求过于频繁」页面拦截；通过减少整页重载、串行执行与固定可清理本地 QA 夹具治理，**绝不为验收关闭生产限流或注入假响应** |
| **INFRA-5** | **16 次 `gate-acceptance` 失败 9 次：反引号错位、跳过 `qa-preflight`、全角标点文件编辑反复失败** | ① `implement` 进入阶段 5 前强制完成一次 `qa-preflight`；② `parseBinding` 对误将 `` `file › title` `` 整段加反引号的写法输出精准到行的单行修正提示；③ 文档提示多全角标点文件优先局部切片编辑 |
| **INFRA-6** | **规划期 `## 交付命令` 误含零测试目录（`src/components/layout`）与存量红灯（`session-state-sync.test.ts`）** | ① `qa-check.mjs plan` 对 `## 交付命令` 中列出的目录做含测试文件预检；② 单独开票修复既有失败测试 `apps/web/src/stores/session-state-sync.test.ts`，不再污染后续特性的 `init` 基线 |
| **OBS-1** | **缺少字段级耗时与来源数据，复盘只能用 60s/30m 阈值猜耗时** | **零新增 Hook/框架**，直接扩展 `review-challenge.json`、`.source.json`、`review-package.json`、`qa-run` 日志写入：`nonce`、`round`、`axis`、`snapshotHash`、`dispatchedAt / startedAt / completedAt`、`terminalState`、`errorClass`、`sealAttempts`、`diffBytes`、`reviewUnits{total,inherited,verified}`、`repairAndWaitMs` |

---

## 五、全周期分阶段执行路线图（Step 0 → Phase 3）

合并 `v2.2` 治本改造与 `docs/plans/2026-11-22-qa-workflow-optimization-plan.md` 主仓残留项（`OPT-15`、`OPT-17`、`/handoff`、弹层预清理、`OPT-14`），按已拍板里程碑推进；**Phase 1 / 2 / 2.5 各自按标准车道完成工具单测 + 契约测试 + 回归 fixture + 独立双轴审查 + 人工终审并本地提交（暂标「待发布验收」），全量落地后统一完成 Phase 3 发布 dogfood 并摘标**：

| 阶段 | 纳入工作项 | 核心目标与完成判据 |
| :--- | :--- | :--- |
| **Step 0：分支隔离与蓝图定格（已完成）** | 切出封存 `/tools` 至 `feat/tools-workbench-ia-migration`，还原临时 `qa-browser-helper.mjs` 修改；同步更新 `v2.2` 与 `v2.1` 两份规划文档 | 回到干净 `master_newjob`（`1b31f11`），保留 `.scratch/tools-workbench-ia-migration/` 只读回归 fixture |
| **Phase 1：一期 · `code-review` 治本与文档解耦** | **Batch 0**（行为止血与 `DESIGN.md` 分层）+ **`OPT-15`**（解耦契约正则、解除 `qa-workflow.md` 180 行硬上限、瘦身 `CLAUDE.md` 关闭 `QA-WF-07`）+ **`OPT-17`** 残余清理 + **新建 `ADR-0066`** + **Batch 1（`P0-1/2/5`）** + **Batch 2（`P0-3/4/6`）** | 消灭无效包派发、工作区踩踏、编号冲突、`seal` 无限重试与全量重审；第 1–7、9–10 项回归全绿、40 行追踪不丢、`r2` unchanged 重写为 0、迁移 Diff 压缩 `>= 80%` |
| **Phase 2：二期 · 基础设施、规划减负、`/handoff` 与度量** | **Batch 3**：`P0-7`（规划减法 + `qa-preflight` 扩充）+ **`/handoff` 历史留痕与日志强绑定** + `INFRA-1~6`（`locator.screenshot` + 弹层预清理 + `node:zlib` 裁剪 / Playwright / 端口与 Node 检查 / 429 与 QA 账号治理 / `parseBinding` / 修复 `session-state-sync.test.ts`）+ `OBS-1` 字段级日志 | 压降浏览器打回重验税，并用精确字段替代复盘猜测；补齐第 8 项截图回归测试、`session-state-sync.test.ts` 与全量工具测试通过 |
| **Phase 2.5：单体拆分与日落旧双轨** | **`OPT-14`**：移除无 `review-challenge.json` 旧转录双轨死代码；拆分 `qa-check.mjs` 为 `tooling/scripts/qa-check/` 下 6 个高内聚子模块 + 薄入口；升级安装模板逐字测试为目录级校验 | 一二期规则稳定后再重构模块结构，避免搬运废弃状态机；全量测试与契约测试无回归 |
| **Phase 3：干净会话双对照真实发布 Dogfood** | ① **对照 A（迁移密集型）**：用新版 `v2.2` 在干净会话复验收口 `feat/tools-workbench-ia-migration`（并授权清理残留 `qa_tools_ia_r2` 数据）；② **对照 B**：真实小特性验证 4 类变异盲测对照；③ 更新演进报告与 backlog，摘除「待发布验收」关闭 `QA-WF-01` | 实测 `OBS-1` 数据达到或合理解释效率与质量双轨 SLO，完成最终闭环发布 |

---

## 六、验证方案、双轨条件化 SLO 与最终完成定义

### 6.1 10 项必测回归用例（`tooling/scripts/__tests__` 脱敏 fixture，不改写本次历史文件）

1. **Shell 闭包与预检**：`SCRIPT_DIR + BROWSER_SCRIPT` 变量赋值能解析出真实 `.browser.mjs`；无有效候选时 `2s` 内阻断且审查派发数为 `0`。
2. **类型化有限重试**：`PACKAGE_INVALID` 只返回一次错误即停止；`REVIEWER_EDITABLE` 至多重试 `1` 次；模拟 `429` 不换模型、不自动重派。
3. **三轮快照竞争隔离**：分别重放 `r1` 改 `GLOSSARY/spec`、`r2` 改 3 源码、`r4` 改 `spec`，均在修改阶段前被屏障阻止；旧快照不受 live 改写影响，变脏必标 `SUPERSEDED`。
4. **编号唯一与不漏项**：重放本次 `r1~r3`，`r2/r3` 的 `P-M5` 冲突必报 `FINDING_ID_COLLISION`；未 `seal` 原文中的 `P-M6` 同样占位保留；自动生成报表无漏项。
5. **分组继承与精准失效**：未变化脚本/测试/截图被合法继承；修改 1 个脚本仅失效其 `rowIds` 与依赖项，其余保持 `inherited`。
6. **Rename 折叠保真**：迁移组件与微改导入折叠后 Diff 显著下降，且可通过快照与补丁完整还原前后内容，逻辑变更不丢失。
7. **正式暂停终态 `WAITING_HUMAN`**：`r2` 仍有未闭环项时直接进入 `WAITING_HUMAN` 并输出人工决策包，不自动产生 `r3/r4`；仅显式 `--allow-manual-round` 可续审。
8. **截图有效性分支**：空白/错目标在 `collect` 前或专用分支拦截；仅图像哈希、`VisualTarget` 与断言语义三同不变时继承，任一变化必重新核验。
9. **高风险覆盖保护**：安全、权限、计费、核心链路及 `changed / non-PASS` 行永不因抽样规则被移出必审。
10. **来源诚实门禁**：缺少双轴独立返回或 `.source.json` 凭据时，`qa-check review` 保持待独立审查状态，报告不能自称完成。

### 6.2 两类真实 dogfood 与 4 类变异植入质量对照

`v2.2` 上线前须完成两类真实小特性验证（仅跑单测不够）：
- **对照组 A（迁移/重命名密集型）**：基于本次特性的脱敏最小副本回放，验证 Diff 体积、继承率与审查时长；
- **对照组 B（含真实行为缺陷的小特性）**：验证测试先行修复、增量复审与 `WAITING_HUMAN`；并**植入本次已实证的 4 类典型缺陷变异作为盲测对照**——**移动锚点滚错宿主**（类 `P-W1`）、**无语义按钮绑定**（类 `P-W2`）、**空白 `VisualTarget` 截图**（类 `P-M5/M6`）、**减动效首次读取错误**（类 `S-H3`）。**只有 4 类变异全部被检出，才能证明降负没有变成放水。**

### 6.3 质量防线轨（不可退让 + 反古德哈特声明）

- 高风险行有效核验覆盖率不下降，所有 `inherited` 行必须可精确追溯上轮已审快照哈希与原文引用。
- 4 类变异缺陷全部检出；阶段 7 与人工终审新增语义漏检数不得上升。
- 编号冲突、无独立返回却自称完成、无效包派发、审查中改脏工作区、超上限自动续跑全部清零。
- **反古德哈特原则**：**严禁把“发现数下降”“`required` 比例下降”“一轮通过率上升”当作质量或优化成绩。**

### 6.4 效率轨条件化 SLO（同类 fixture 对照目标，非当前已达成承诺）

| 指标 | 条件化 SLO 目标 | 说明 |
| :--- | :--- | :--- |
| 无效审查包阻断 | `<= 2 秒` 失败，子代理派发数 `= 0` | 不再发生无效 `collect` 后硬派子代理空转 |
| 有效包 `seal` 表现 | 首轮一次通过率 `100%`；格式重试 `<= 1` 次，包错误 `0` 次重试 | 根治 Spec 连续三轮 `seal` 失败 |
| `r2` 增量重复工作 | `unchanged` 行重写 `= 0`；仅重审未闭环与失效单元 | 不再每轮重填 40 行 |
| 迁移类 Diff 压缩 | 相对无折叠基线压缩 `>= 80%`，且内容可完整重建保真 | 不损失逻辑变更与跨文件交互上下文 |
| 自动审查轮次 | 默认 `r1 + 最多 1 次 r2`；超限稳定进入 `WAITING_HUMAN` | 复杂疑难允许人工授权追加，不以少报换一轮绿 |
| 审查关键路径耗时（同类） | 首轮双轴关键路径 **`<= 20 分钟`**；`r2` 增量复审 **`<= 10 分钟`** | 超时记录原因并告警，不再开新轮凑 PASS |
| Spec 工具调用软预算 | 首轮 `60` 次、增量 `30` 次触发软告警交人工决策 | 不再重演 `164 / 308 / 125` 次三轮翻工具源码排障 |
| 阶段 6 主会话总账 | **无新增真实产品缺陷时 `<= 45 分钟`** | 出现真实产品缺陷时单列修复与受影响重验耗时，不拿总账考核审查模型 |

### 6.5 最终完成定义（Definition of Done）

只有同时满足以下 6 条，才能宣称“`v2.2` 彻底解决了本次 `code-review` 问题”：
1. 同类迁移 fixture 不再发生 Spec `seal` 结构性失败、审查中工作区踩脏、编号主键冲突与无限重试；
2. `r2` 不再全量重读/重填且高风险覆盖可追溯，`rename` 与 `delta` 体积大幅收敛；
3. 429、无效包与轮次上限稳定停在对应正式暂停终态，主代理不再擅自换模型、直接派 `Agent` 或制造 `r1b/r4b`；
4. 真实缺陷与 4 类变异对照 100% 检出，人工终审未发现因降负导致的漏检；
5. 两类 dogfood 的耗时、工具调用与复审输入均已通过 `OBS-1` 字段级自动记录，达到或合理解释上述 SLO；
6. 最终 `qa-check review` 的机器通过仍仅作门禁事实证据之一，必须经独立双轴审查与人工终审裁决，不把 PASS 当自我授权。

---

## 七、当前在途特性 `.scratch/tools-workbench-ia-migration` 的处置建议

1. **保持诚实状态**：严禁将该特性包装为“已通过审查的成果”，保持“**待独立审查 / 未收口**”状态。
2. **不篡改历史原文**：不可通过回头修改已有 `review/r{1,2,3}-*.md` 原文来人为凑齐 `review-report.md` 一致性。
3. **人工核验与环境清理**：先由人工核对业务改动与现有浏览器/单测证据，并在人工授权后清理本地数据库残留的 QA 测试账号（`qa_tools_ia_r2`）及 6 条测试工具数据（不在本轮工具文档中自动清理）。
4. **留作只读回归样本**：建议将当前 `.scratch/tools-workbench-ia-migration/` 目录作为 `v2.2` 的**只读回归 fixture 来源**，供新工具在脱敏副本上回放验证。
5. **彻底分拆提交**：`v2.2` 流程与脚本改造必须与 `/tools` 迁移业务代码**分开审查、分开提交**，绝不再让工具缺陷修复扩大业务特性的变更爆炸半径。

---

## 八、已拍板的 8 项最终决策（D1–D8 锁板记录）

经过 8 轮 `/grill-me` 决策收敛，以下全部边界裁决已锁定为执行唯一基线：

| 编号 | 决策主题 | 已拍板最终结论 |
| :---: | :--- | :--- |
| **D1** | 工作区与 `/tools` 隔离顺序 | 先切出封存 `/tools` 业务改动至 `feat/tools-workbench-ia-migration`（并还原临时 `qa-browser-helper.mjs`），保留 `.scratch/tools-workbench-ia-migration/` 只读副本作 fixture；在干净 `master_newjob` 完成 `v2.2` 后回头复验收口 `/tools` |
| **D2** | 交付里程碑切分 | 分期推进：**Phase 1（Batch 0 + `OPT-15/17` + `ADR-0066` + Batch 1 + Batch 2）→ Phase 2（Batch 3 + `/handoff` + 弹层预清理 + `OBS-1`）→ Phase 2.5（`OPT-14` 单体拆 6 模块与日落旧双轨）→ Phase 3（双对照发布 dogfood）** |
| **D3** | 自动复审上限与暂停终态 | 新立 `ADR-0066` 收紧默认自动上限为 **`r1` 全量双轴 → 最多 1 轮增量 `r2` → 未清零即停在正式终态 `WAITING_HUMAN`** 交人工决策包（`collect` 硬拒超限续跑除非传 `--allow-manual-round`；`r2` 单/双轴沿用 `ADR-0054`） |
| **D4** | Spec 减负边界与协议版本 | 未实质改动源码/测试且通过 `acceptance` 机检的存量回归单测走机检+风险抽检（安全/权限/隐私/计费/`changed`/非 `PASS`/`browser`/`api` 除外）；同脚本/同测试文件按 `reviewUnits` 合并，`r2+` 按哈希继承；**平滑扩展 `QA Review Coverage: 2`**（不升 `v3`，向下兼容旧 `v1/v2`） |
| **D5** | `DESIGN.md` 分层与 `S-J` 处置 | 不做 `S-J` 前缀机器硬锁；在 `DESIGN.md` 与 `code-review/SKILL.md` 显式分层——可用性/无障碍/明文禁令及真实生命周期/竞态 Bug 归 `S-H` 阻断；视觉配方与可维护性建议归 `S-J` 默认驳回、不与核心修复捆绑（人工选修仍可正常复验） |
| **D6** | 快照语义与 `delta.diff` 契约 | `collect` 生成轻量 `_qa/round-snapshots/r<n>/` + SHA-256 manifest；`ADR-0066` 正式取代 `HR-TC07-7` 启用相邻快照间机器 `delta.diff`（保留全量基线按需回查）；审查中 live 工作区被改脏允许基于快照完成 `seal` 留证，但 `qa-check` 必判 `SUPERSEDED` |
| **D7** | 自身验收与发布 dogfood 时机 | Phase 1 / 2 / 2.5 各自按标准车道走完单测 + 回归 fixture + 独立双轴审查 + 人工终审并本地提交（暂标「待发布验收」）；全量落地后在 Phase 3 统一完成双对照发布 dogfood 并摘标 |
| **D8** | `v2.1` 残留清零范围 | 纳入主仓全部未做项（`OPT-15`、`OPT-17`、`/handoff` 防覆写、弹层预清理、`OPT-14`）；`3.1` 有意暂缓/否决项（`OPT-10`、`Level A/B/C` 等）与 `3.3` 外部独立仓项（`OPT-18~21`）保持排除 |
