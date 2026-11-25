# `qa-workflow` v2.1 第一性原理重构方案与实证评估报告（经对抗审查收敛）

> **版本状态**：v2.1（已吸收对抗审查并修正基线，待人工最终拍板）  
> **生成日期**：2026-11-25  
> **技术基线**：Phase 1（`e4e9c0d`）、Phase 2（`9b51c32`）、优化追踪清单（`76a8b29`，见 `docs/plans/2026-11-22-qa-workflow-optimization-plan.md`）、`ADR-0048`、`ADR-0054`  
> **关联审校**：对抗性审查与消融实验报告 `docs/plans/2026-11-25-qa-workflow-v2-adversarial-review-and-ablation.md`  
> **实证样本**：`.scratch/agent-eval-benchmark-dashboard/`、`.scratch/agent-runtime-resilience/`、`.scratch/agent-runtime-resilience-delivery-closure/`、`.scratch/mcp-integration-governance/`  
> **实施前置条件**：当前工作区存在 `mcp-integration-governance` 未提交在途改动，**Batch 1 改造须待该业务特性收口提交或另起洁净分支后，再按标准车道正式开工**。

---

## v2.0 → v2.1 修订日志（对对抗审查的吸收与回应）

| 类别 | 处理结论 | 具体修订与源码依据 |
| :--- | :--- | :--- |
| **F4 笔误与数字口径（吸收）** | **全部订正** | 更正 `agent-runtime-resilience` r5→r6 字符数笔误：是「刷新前 `128`、刷新后 `441`」变为「刷新前 `138`、刷新后 `261`」（非千分位单数）；更正「阶段 6 普遍反超」为精确表述（`eval`、`closure` 未反超，失控倒挂集中在 `resilience` 与 `mcp`）；明确 `mcp` 的 26.0h 含 1,049.2m 等待用户（隔夜 830.3m），不归因于工作流本身。 |
| **F5 / F9 归因纠偏（吸收）** | **全部订正** | 明确 `agent-eval` 0 子代理却拿 PASS 是**防作弊未闭环**（违规跳过 `code-review` 并冒充 `subagent` 封存，仅出 NOTE 未阻断，违反 `docs/agents/qa-workflow.md:154`）；明确修宽松 4 项只清掉格式假阳性，不消除 `closure` 的 3 项真实 `ASSERTION_BLOCKED` 与 `mcp` 的真实 `[S-H2] 未修`。 |
| **KPI 古德哈特自反噬（吸收）** | **彻底换轴** | 删除违背 `qa-workflow.md:152` 且激励少报 Bug 的「≥80% 1–2 轮收敛率」KPI，全面切换为 `ADR-0054` 的**效率轨 + 质量轨**双指标体系（联同 `QA-WF-01` / `QA-WF-02`）。 |
| **D1 漏洞与 E1 实验盲区（吸收并升级）** | **升级修补** | 吸收 `E2`（`citationIsValid` 放过 `:1` 敷衍）：手抄表改「机器预生成全量结构清单 + 异常/高风险项深度核查」，**同步升级 `citationIsValid` 要求引用行真实命中谓词**；吸收 `E1`（`.scratch/` 不在 `evidenceTree` 内）：在 `review-package.json` 增补轻量 `qaArtifactsDigest` 覆盖 `.scratch/<feat>/scripts/` 与 `qa-plan.md`，**堵住盲区后再安全解除零改动时间戳重跑锁**。 |
| **契约冲突与增法条款（收紧剔除）** | **否决 / 移出 Batch 1** | **否决**「主代理高危快审制度化」（违反 `qa-workflow.md:3` 与 `ADR-0048`）与「429 自动续传」（违反 `.claude/skills/code-review/SKILL.md:59,71` 配额保护）；**移出 Batch 1 暂缓** `Level A/B/C` 单轴豁免（须先走正式 ADR 取代 `ADR-0054` 决策 2）与 `OPT-10` `storageState`（须先补威胁模型与防伪造扫描）。 |
| **MCP r2 性质澄清（反驳 hy `F3`）** | **以源码为准** | `mcp-integration-governance/review-report.md:42`、`r2-standards.md:19` 与 `r2-spec-axis.md:26` 均明确 r2 为**全新 70 文件全量双轴审查**（非范围受限的增量复审）；5 个架构疑点是在 r2 前切换更强模型修复的，故 r2 看不到它们属正常时序，但「70 文件全量跑 47.2m 仅产出 3 个本可 1 秒机检的样式/注释 S-H」的事实依然成立。 |

---

## 一、四份真实业务试跑的实证数据矩阵

### 1.1 全景对比表

以下全部数据均直接取自各特性目录的 `retro-evidence.md`、`review-report.md`、`review/` 原文及 `evidence/gate-review-*.log`。

| 特性目录 | 改动规模 / 断言 / 日志 | 审查轮次与耗时分布 | 审查抓出的高价值真缺陷 | 纯内耗 / 形式返工与漏洞 | 最终门禁结局 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `.scratch/agent-eval-benchmark-dashboard/` | 27 文件 / 40 项断言 / 128 份证据（117 log + 11 png，仅引用 23 份） | **r1–r4（4 轮）**；**0 个工作流子代理**（主会话自写自封）；审查窗口约 **22m** vs 前段约 **284m** | **0 个**（真实存在的 `TC08-3` 断言标题偏差未检出） | r1 缺 40 行表 + 时间戳倒挂；r2 删多余导出整轮作废；r4 `r4-spec-axis.md:34-73` 40 行引用**全填 `:1`** + 同一句模板话却顺利过关 | **机器 PASS**（带 `自述凭据（弱）`、无 Skill 调用、r4 超上限三项 NOTE，属违规放行） |
| `.scratch/agent-runtime-resilience/` | 24 文件 / 65 项断言 / 194 份日志（命令墙钟 27.6m，34 次浏览器占 22.6m，52 份 `final*`） | **r1–r6（6 轮）**；9 份审查子代理墙钟求和 **2.19h**（并集 **1.49h**）vs 首轮开发+首验 **79.2m**（**审查明显反超**） | **高价值**：r1 Spec 抓出 `P-W01`、`P-M01`、`P-M02` 三个真功能/UI 缺口及 `P-W02~04` 弱断言 | 65 行表填 `-` 与缺反引号爆百条错；r4 子代理删 `.source.json` 重封；r5 封存后重跑浏览器导致动态字符数 `128/441`→`138/261`、耗时 `5535ms`→`3532ms`，触发 `SPEC_REVIEW_BINDING_MISMATCH` 被迫开 **r6** + `final6-*` | r6 才 **PASS**（`转录（强）`） |
| `.scratch/agent-runtime-resilience-delivery-closure/` | **0 行生产代码**（3 个测试/ADR 文件）/ 17 项断言 / 90 份日志（13.0m） | **r1–r2（2 轮）**；4 份子代理（r1 ~12.6m + r2 ~11.0m）vs 前段约 **203m** | r2 Standards 在 **`seal` 之后**才上报 `check(true, 3, ...)` 与无条件 PASS 伪断言（未入原文） | 前 4 轮因「无新增审查发现」被 `hasNoFinding` 判 `REVIEW_RAW_UNNUMBERED`（r2 改为「无新发现」）；12 条交付命令跑 3 批 36 份；窄屏脚本失败 8 轮 + DPR 裁剪偏移 | 6 次 `gate-review` **全 FAIL**（`gate-review-6.log` 真实阻塞为 3×`ASSERTION_BLOCKED` + `SPEC_REVIEW_SOURCE_INVALID`） |
| `.scratch/mcp-integration-governance/` | **70 文件** / 6 工单 / 48 US / 106 项断言 / 13 交付命令 / 151 份日志（日历 26.0h 含 1,049.2m 用户等待、830.3m 隔夜，Agent `<5m` 活跃下界 462.3m） | **r1–r3（3 轮）**；8 份子代理墙钟求和 **147.8m（2.46h）**（含并行重叠） | **r1 未完成**；r2 全量审查抓出 3 个可静态拦截的样式/注释 S-H；r1 喊停切换强模型后快审补修 5 项架构疑点（未编号/未封存） | r1 Spec 为填 106 行表跑 **70.0m / 282 次调用 / 5.7MB** 崩盘并后半段幻觉；r2 修 3 处样式/注释触发全套重跑；r3 首派两轴同时 429；r3b 因漏改 L292 按钮 `h-10` 耗尽上限，且再踩措辞与路径前缀误杀 | **FAIL / BLOCKED**（按 `qa-workflow.md:153` 预期暂停，经 `handoff.md` 交人工） |

### 1.2 专项深度解剖：`.scratch/mcp-integration-governance/`

1. **106 行五列表拖垮 r1 Spec 子代理并引发后半段幻觉**：
   - `agent-a137f65f6605e292c.jsonl` 串行运行 **70.0 分钟**（282 次调用：Read 195 / Bash 87），写入未封存的 `review/r1-spec-axis.md:75-80` 后半段已出现严重错位幻觉（`TC05-1` 超时脱敏被写成协议初始化版本匹配、`TC05-3` >128 工具数被写成 3xx 重定向）；同轮 Standards 跑了 16.3 分钟却 0 次写入原文。
2. **r2 全量 70 文件审查抓到的是 3 个确定性 S-H，却引发核弹级联**：
   - 依 `review-report.md:42`、`r2-standards.md:19` 与 `r2-spec-axis.md:26`，r2 是**完整 70 文件的全新双轴审查**（耗时 47.2m；前述 5 项架构疑点在 r2 前切 `Opus 5.5` 后已修复）。r2 Spec 0 发现，Standards 抓出的 3 个硬违规（`r2-standards.md:66-104`）分别是 **24 处硬编码色值（`S-H1`）、按钮 `h-8/h-10` 不足 44px（`S-H2`）、1 处英文注释 `/** MCP Server ID */`（`S-H3`）**。
   - 修改这 3 处样式/注释引发全套回归、重启 dev server 与受控 HTTPS 服务重跑 TC01–TC03 浏览器与截图、`collect`、r3 429 重试与重跑 13 条交付命令。
3. **漏改 1 行 CSS + 门禁两处死板误杀锁死 r3**：
   - r3 Standards 核实 12 处已登录按钮已改 `h-11`，仅因 `profile-mcp-servers-section.tsx:292` 未登录态「前往登录」按钮遗漏为 `h-10`，按「部分修复写未修」用尽自动上限（属真实红线拦截）；但同时 `gate-review-r3-final.log:13-33` 叠加了 20 条**纯粹源于检查器过严的 FAIL**：`r3-spec-axis.md:32` 写了「无新增审查发现」触发 `REVIEW_RAW_UNNUMBERED`，以及源码列带 `.scratch/mcp-integration-governance/` 前缀触发 19 条 `SPEC_REVIEW_SOURCE_INVALID`。
4. **视觉截图漏检与 `handoff.md` 覆写漂移**：
   - `tc02-mcp-tool-card-desktop.png` 未框进不可信提示、`tc03-approval-card-mobile.png` 含顶部导航栏而裁掉审批卡主体，两轮 Spec 审查仍写吻合 VisualTarget；`handoff.md` 同路径连续覆写 5 次导致早期把 `TC05-1` 错归因为「断言过宽」（实为 mock 失真）。

### 1.3 Phase 1 / Phase 2 优化的实测复核

- **明确起效项**：`OPT-03` 单轴复用（`resilience` r5/r6 沿用 `r4-standards.md`）与 `OPT-12` `r4+` 超上限强 `NOTE` 工作正常；`OPT-01 ~ OPT-08` 安全与基础修复稳定无回归。
- **反例与盲区**：`agent-eval` 证明当主代理违规不调 `code-review` 且自行 `seal` 时，现行门禁仅输出 `NOTE` 仍放行 `PASS`；`OPT-10` 暂缓使全登录态业务仍高度依赖 `ego-browser`，4 份样本均经历了 3–12 轮的浏览器脚本与 DPR 裁剪调试摩擦。

---

## 二、第一性原理根因诊断

> **QA 工作流的第一性目标**：以最低的日历时间、Token 配额与人类注意力成本，最大化「交付代码不带真实功能、安全与回归缺陷」的概率。

结合对抗审查的消融分析（4 份样本中，**独立双轴子代理**贡献了 ~10 条真代码/伪断言缺陷，**人工/图像复核**贡献了 ~15 条证据语义缺陷，**机器门禁**主要输出格式/新鲜度一致性），当前痛点源于 **4 个结构性错配**：

1. **计算与认知错配**：把英文注释、硬编码色值、`h-8/h-10` 按钮热区、`check(true)` 伪断言等 **1 秒就能 100% 机检的规则**，留到阶段 6 让高价 LLM 审查子代理肉眼排查。
2. **古德哈特定律反噬**：强制 Spec 子代理对 40–106 行五列表逐字抄写实测值（`QA Review Coverage: 1`），耗尽了工具预算并诱发幻觉（`mcp` r1），而真正防敷衍的 `citationIsValid` 却只查 `行号 ≤ 文件总行数`，导致 40 个 `:1` 全过（`eval` r4）。
3. **「先封存再检格式」与「新鲜度绑定断裂」**：子代理先 `seal` 锁死原文，后续 `qa-check` 才因四个字的措辞或路径前缀报错，被迫重开一轮审查；而 `.scratch/` 产物未纳入 `evidenceTree`（`E1` 实验证实），导致工作流只能依赖笨重的 `VERIFICATION_BEFORE_REVIEW` 时间戳硬锁，进而制造了 `resilience` r5→r6 的动态数值死锁。
4. **防作弊防线不对称**：对严格遵守规则的大特性施加多轮重跑和机械校验税，却对「0 子代理自签」与「`:1` 敷衍」缺少硬拦截或行级谓词核验。

---

## 三、`qa-workflow` v2.1 收敛重构方案（经对抗审查裁剪）

严格遵守 `docs/plans/2026-11-22-qa-workflow-optimization-plan.md`「暂停盲目叠新门禁」原则，把改造收敛为 **Batch 1 四个无契约冲突、最高确定性行动项**，并将涉及推翻既有 ADR 或安全边界的事项全部后置或否决。

### 3.1 Batch 1：四项高确定性核心改造（立竿见影降摩擦、且增强真实防线）

#### 1. 新增 1 秒本地确定性预检：`tooling/scripts/qa-preflight.mjs`
- **定位**：在阶段 4 写码收尾、`collect` 之前执行（`<2 秒`、零 Token），**明确在文档声明：仅清除字面/静态违规，不替代 Spec 轴与人工的语义复核**。
- **四项确定性扫描（配套完整单测）**：
  1. **Diff 增量英文注释扫描**：检测本次新增/修改行中的纯英文注释；
  2. **Diff 增量 UI 规范扫描**：拦截非 `DESIGN.md §2.2` 白名单的硬编码十六进制色值；扫描新增/修改交互按钮的 `h-7/h-8/h-9/h-10` 热区缺口并**一次性列出同一文件内全部命中行号**（杜绝漏改 L292）；
  3. **过程脚本字面伪断言扫描**：静态拦截 `scripts/` 中的 `check(true, ...)`、无前置布尔条件的裸 `console.log('[TC...] PASS')`、缺少非零退出码分支；
  4. **计划与交付命令一致性预检**：提前核对 `spec.md` `## 交付命令` 与 `qa-plan.md` `## 交付验证` 一致性，并对空操作脚本告警。

#### 2. 把校验逻辑前移至 `seal` 内部，并修复 `qa-check.mjs` 四处误报与自签缺口
- **规则单一来源**：从 `qa-check.mjs` 抽离/共享同一套校验函数供 `review-package.mjs seal` 调用（杜绝两套实现分叉）。
- **`seal` 前置同步阻断**：写入 `.source.json` 前即时检查「有效编号或无发现语义」「`--pending-ids` 完备性」「源码引用合法性」「必备章节完整」。任一项不通过则**拒绝生成 `.source.json` 并输出可机读修复指引**，子代理在**同一上下文 5 秒改好再 `seal`**——在**完全保留「封存后不可篡改」防线**的前提下，消灭格式返工轮。
- **修复四处机械误报**：
  1. `hasNoFinding` 兼容常见中文否定（`无发现` / `无新发现` / `无新增审查发现` / `无新增编号`）；
  2. `citationIsValid` 自动剥离 `./` 与 `.scratch/<feature>/` 仓库前缀归一化后再比对 `sourceCandidates`；
  3. `SYNTHETIC_INPUT` 细化键/动作判断，区分业务认证写入与仅用于控制台采集的只读脚本；
  4. `qa-run` 原生支持 `--script <path>`（或解析标准输入脚本路径），避免 `sh -c` 包装导致命令不匹配。
- **补强防自导自演硬防线**：针对 `agent-eval` 暴露的漏洞，当宿主为 Claude Code 且主会话存在转录可查、但 `collect` 后既无 `code-review` Skill 调用也无任何对应 nonce 的子代理独立转录时，不再只给 `NOTE`，按 `qa-workflow.md:154` 输出显式阻断或要求保持「待独立审查」。

#### 3. D1 修正版：废除「全量 N×5 手抄表」，改为「机器预生成清单 + 异常/高风险核查 + 封堵 `:1` 漏洞」
- **分工归位**：
  - **机器承担抄写**：`qa-check acceptance` 生成 `_qa/spec-review-checklist.json` 及预填 Markdown 结构骨架，不再由 Spec 子代理手工逐字抄录 40–106 行 `actual` 实测值；
  - **子代理承担判断**：Spec 原文只须报告三部分——① 全部 `changed: true` 计划变更逐条复核（变更成立/不成立）；② 全部 `browser`、安全、权限、计费与核心链路断言的**真实叶子谓词核对与截图 VisualTarget 核验**；③ 对剩余常规 `unit`/`integration` 按模块抽查代表性叶子断言与发现清单（`[P-M/W/X]` 或 `无发现`），并附实际核查文件范围。
- **同步封堵 E2 暴露的 `:1` 漏洞**：升级 `citationIsValid`，引用 `path:line` 不再仅检查 `1 ≤ line ≤ 总行数`，而必须验证**目标行前后 ±5 行窗口内实际存在测试定义/断言谓词关键字**（如 `check(`、`expect(`、`assert`、`it(`、`test(`），彻底让 `scripts/tc*.mjs:1` 类敷衍引用在 `seal` 和 `qa-check` 当场失败。

#### 4. D2 修正版：新增轻量 `qaArtifactsDigest` 堵住 E1 盲区，再安全解除零改动时间戳重跑锁
- **堵住实验 E1 漏洞**：由于 `.scratch/` 被 `.gitignore` 忽略，`computeEvidenceTreeDigest` 不会感知过程脚本与 `qa-plan.md` 变动。为此在 `review-package.json` 增补一个轻量字段 `qaArtifactsDigest`（仅计算 `.scratch/<feature>/scripts/` 与 `qa-plan.md` 内容哈希，约 15 行代码）。
- **安全解耦时间戳霸权**：
  - 审查期间若 `evidenceTree` 与 `qaArtifactsDigest` 均未变化，既有 `exit === 0` 且 `log.tree === currentEvidenceTree` 的交付验证日志**直接有效，免除 `VERIFICATION_BEFORE_REVIEW` 强制审后重跑**——彻底砍掉 13–52 份冗余重跑日志，同时根治 `resilience` r5→r6 那种「审完重跑浏览器刷新毫秒数导致原文失配」的死锁；
  - 若 `evidenceTree` 或 `qaArtifactsDigest` 任一变化，则必须重新运行受影响验收/交付并做对应确认。

---

### 3.2 明确否决与移出 Batch 1 暂缓项（守住契约底线）

1. **明确否决（不采纳）**：
   - **主代理高危快审制度化**：与 `qa-workflow.md:3`「Agent 自述不算证据」及 `ADR-0048` 冲突，不入制度；
   - **429 配额耗尽自动保包续传**：违反 `.claude/skills/code-review/SKILL.md:59,71` 失败保护，维持「遇 429 暂停，由用户显式决定后续会话并使用新 nonce 重派」。
2. **移出 Batch 1 暂缓（待前置条件满足后在 Batch 2 / 专项 ADR 推进）**：
   - **单轴复审分级豁免（`Level A/B/C`）**：与 `ADR-0054` 决策 2（改源码/文档仍需双轴增量复审）冲突；暂缓至补足 `QA-WF-02` 缺陷分类数据并起草正式取代 ADR、定义出机器可判定的受影响范围规则后再议。
   - **`OPT-10`（Playwright `storageState` 会话复用）**：涉及 `qa-workflow.md:123` 登录安全边界，暂缓走专项 ADR + 威胁模型评估。**Batch 2 优先落地无安全冲突的浏览器改进**：在 `qa-browser-helper.mjs` 修复 DPR 裁剪偏移（支持原生元素 `locator.screenshot()` 与弹层预清理）并规范确定性断言。
   - **大特性切分与 `/handoff` 版本化留痕**：大特性拆审判据调整为按「diff 体积 + 断言数 + 子代理工具调用软告警（如 35 次告警但不硬阻断）」；`/handoff` 考虑历史快照留痕并强绑定日志出处，消除同路径 5 次覆写造成的归因失审计，纳入 Batch 2 / P2（`OPT-14 ~ OPT-17` 拆单体 `qa-check.mjs`、解耦契约正则、精简 `CLAUDE.md`）统筹落地。

---

## 四、减法清单（v2.1 净复杂度控制）

| 序号 | 处置方式 | 具体对象 | v2.1 新机制 |
| :--- | :--- | :--- | :--- |
| 1 | **降负重构** | Spec 审查强制手工逐字抄写 N×5 全量实测表 | 机器预生成结构清单；子代理专注变更复核 + 核心/高风险谓词 + 封堵 `:1` 漏洞 |
| 2 | **消除死锁** | 代码与 QA 产物均零改动时仍强迫审后重跑全部交付命令 | 以 `evidenceTree` + `qaArtifactsDigest` 双指纹共同判定新鲜度 |
| 3 | **防线前移** | 「先封存再检格式，错了只能废轮重写」的时序错位 | 格式/路径校验下沉至 `seal` 内同步即时阻断并共用 `qa-check` 实现 |
| 4 | **认知归位** | 由高价 LLM 审查子代理排查英文注释、十六进制色值、热区尺寸、字面伪断言 | 1 秒确定性 `qa-preflight.mjs` 在阶段 4 提前清场（不替代语义复核） |
| 5 | **修宽松** | `qa-check.mjs` 的 4 项机械误杀（措辞字面量、路径前缀、诊断存储、重定向 argv） | 语义等价与路径归一化、原生 `--script` 支持 |

---

## 五、验收 KPI（全面对齐 `ADR-0054` 双轨口径）

彻底废除易诱导少报缺陷的「收敛轮次 KPI」，Batch 1 落地后依据真实业务试跑（`QA-WF-01` 干净会话 dogfood）与全量缺陷分类统计（`QA-WF-02`）验证以下**双轨指标**：

| 维度 | 衡量指标 | 验收目标（相对四份基线） |
| :--- | :--- | :--- |
| **质量防线轨（不可退让）** | 阶段 6 真缺陷检出密度（真问题/特性） | **不低于基线**（不因减少抄表而漏抓业务逻辑/弱断言） |
| **质量防线轨（不可退让）** | 人工终审 & `/retro` 新增语义缺陷数（含伪断言、失效截图、`:1` 敷衍） | **严格下降**（清零字面伪断言、`:1` 引用与 0 子代理漏放） |
| **质量防线轨（不可退让）** | 阶段 7 晚发现次数 | **不上升**（`qaArtifactsDigest` 兜底 `.scratch` 变动） |
| **工程效率轨（直观减负）** | 纯格式误报、`seal` 后重来、样式漏改导致的**无效返工轮次** | **趋近于 0** |
| **工程效率轨（直观减负）** | 阶段 6 审查子代理单轮墙钟耗时 & 交付命令冗余重跑批次数 | 单轮审查显著回落至舒适区（不再 70m 超时）；交付命令不再零改动重复批跑 |

---

## 六、Batch 1 最小可落地行动包（等待用户最终指令）

在 `mcp-integration-governance` 业务分支收口后，按标准车道实施以下 **4 项相互耦合最小的高确定性改动**：

1. **新增 `tooling/scripts/qa-preflight.mjs` + 单测**：实现 4 类确定性预检，写入阶段 4 与 `collect` 前指引；
2. **改造 `review-package.mjs seal` + 修 `qa-check.mjs` 四处误报与自签缺口**：共用校验函数实现 `seal` 内置校验、4 处修宽松、并收紧「0 子代理自签」门禁拦截；
3. **升级 `qa-spec-review.mjs` 与 `code-review` 技能**：取消手抄 N 行实测值，改为机器预生成清单 + 风险分级深度核查，同步升级 `citationIsValid` 封堵 `:1`；
4. **在 `review-package.mjs` 与 `qa-check.mjs` 落地 `qaArtifactsDigest`**：补全 `.scratch/scripts/` 与 `qa-plan.md` 指纹，并取消双指纹未变时的 `VERIFICATION_BEFORE_REVIEW` 强制重跑；同步更新 `docs/agents/qa-workflow.md`、`.claude/skills/setup-qa-workflow/templates/` 及全套脚本单元测试。

---

## 七、后续决策确认清单

| 编号 | 裁决项 | v2.1 收敛方案 | 状态 |
| :--- | :--- | :--- | :--- |
| **D1** | Spec 对账方式 | 机器预生成全量清单 + 子代理聚焦变更与核心/高风险断言谓词 + `citationIsValid` 封堵 `:1` | `[待确认]` |
| **D2** | 零改动审后重跑 | 补齐 `.scratch` 覆盖的 `qaArtifactsDigest` 后，双指纹未变即取消强制时间戳重跑 | `[待确认]` |
| **D3** | `OPT-10` 会话复用 | **暂缓**：先在 Batch 2 做无安全冲突的 `qa-browser-helper.mjs` DPR/原生截图修复；`storageState` 单独走 ADR 评估 | `[待确认]` |
| **D4** | 大特性拆审与交接 | **移入 Batch 2**：按 diff 体积/断言数/工具调用软告警拆工单微检查点，同步改进 `/handoff` 防覆写漂移 | `[待确认]` |
| **D5** | `seal` 内置校验 | **无争议采纳**：与 `qa-check` 共用同一校验实现，`seal` 前同步阻断并返回可机读错因 | `[待确认]` |
| **前置动作** | 是否先补跑 `QA-WF-02` | 建议在业务代码收口时顺带运行只读统计补齐 `QA-WF-02` 缺陷分类数据，作为 Batch 1 上线前后的基准对照组 | `[待确认]` |
