# `qa-workflow` v2 重构方案：对抗性审查与消融实验报告

> **生成日期**：2026-11-25
> **评估对象**：`docs/plans/2026-11-25-qa-workflow-v2-first-principles-redesign.md`
> **证据来源**：四份特性目录的 `retro-evidence.md` / `review-report.md` / `review/` 原文 / `evidence/gate-review-*.log`、主会话与子代理转录、`docs/agents/qa-workflow.md`、`.claude/skills/code-review/SKILL.md`、`docs/adr/0054-*.md`、`docs/plans/2026-11-22-qa-workflow-optimization-plan.md`、`tooling/scripts/{qa-check,review-package,qa-run}.mjs`
> **方法**：反事实组件消融 + 三个可复现隔离实验 + 历史对照组
> **状态**：分析产物。不修改 QA 工作流规则，不改变 `mcp-integration-governance` 的 `[S-H2]` 未修状态与 BLOCKED 结局，不构成交付授权。所有「建议」均待人工拍板。

---

## 0. 结论摘要

v2 方案对「机械摩擦」的诊断部分准确（`seal` 后校验、字面量误杀、全量手抄表诱发超时与敷衍、审后无意义重跑），但存在三类阻断级问题：

1. **样本与归因偏差**：4 个样本集中在同一周、全部是核心链路且全部带人工中断/配额异常，没有对照组；把「人类隔夜等待」「上游 429」「换模型」算作工作流摩擦；把「发现未修缺陷时按规范输出 BLOCKED」当成故障。
2. **减法削错了层**：四份样本里真正抓出产品缺陷和证据语义缺陷的通道是**独立子代理 + 人工/`retro` 复核**；机器门禁贡献的主要是格式一致性。方案削减「独立子代理逐项核对」与「审后重跑」，新增的 `qa-preflight` 只能覆盖字面模式，覆盖不了 mock 失真、断言恒真、截图漏目标、测试标题与冻结断言偏题。
3. **契约冲突与自我矛盾**：Level B 单轴复用违反 ADR-0054 决策 2；`.scratch/_session/` 与「脚本内不得注入 Cookie/写会话」冲突；429 自动续传违反 `code-review` 技能配额失败保护；方案批判古德哈特定律，却把「≥80% 一轮/两轮收敛」设为核心 KPI，而规范规定 r1 有发现就必须 r2 复审。

**建议**：只采纳三件低风险改动（`seal` 内置校验 + 4 处误报修宽松、`qa-preflight` 确定性扫描、手抄表改「机器生成 + 异常复核」并修 `:1` 引用漏洞），其余暂缓，先补 ADR 与对照数据。验收指标必须从「收敛轮次」换成「缺陷检出率 / 人工终审新增发现数 / 伪断言与截图失效率」。

---

## 1. 评估范围与方法

### 1.1 证据集

| 特性目录 | `retro-evidence.md` | 主要产物 |
| :--- | :--- | :--- |
| `.scratch/agent-eval-benchmark-dashboard/` | 20,366 B，2026-11-23 | 27 文件 / 40 断言 / 128 份证据（117 log + 11 png，最终引用 23） |
| `.scratch/agent-runtime-resilience/` | 37,805 B，2026-11-23 | 65 断言 / 194 份日志 / 34 次浏览器 / 52 份 `final*` |
| `.scratch/agent-runtime-resilience-delivery-closure/` | 24,637 B，2026-11-23 | 0 行生产代码 / 17 断言 / 90 份日志（13.0 min） |
| `.scratch/mcp-integration-governance/` | 30,962 B，2026-11-25 | 6 工单 / 48 US / 106 断言 / 13 交付命令 / 151 份日志 |

四份 retro 都声明「只列有出处的事实，不写优化结论」，因此可作为核验 v2 方案数字的事实基线。

### 1.2 方法

- **事实核验**：把方案每条数据主张回指到 retro、门禁日志、审查原文或源码行号；不能回指的标为推断或误读。
- **反事实消融**：逐个 ablate 方案的组件/检测通道，用四份样本里「会消失的摩擦」与「会丢失的真发现」做净效应判定。
- **可复现隔离实验**：在 `/tmp` 临时 git 仓库调用仓库真实函数，不改动工作区；实验结果见 §4.1。
- **对照组**：统计仓库中其余带 `gate-review` 的特性目录，判断 4 个样本是否代表总体。

### 1.3 边界

- 本报告不重跑任何 QA 门禁、不重派审查子代理、不修改 `review/` 原文与凭据。
- 主会话与子代理转录位于用户本机私有目录，只用于统计事件时间戳与短摘录，不作为入库内容。
- 文中「真缺陷」指有文件/行号/日志可回溯的问题；四份 retro 明确列为「无法确认」的事项不计入。
- 分析期间 `git status` 显示的在途改动属于 `mcp-integration-governance` 特性本身，非本报告产生。

---

## 2. 四份特性目录产物分析

### 2.1 逐目录结论

| 目录 | 产物实际状态 | 真正暴露的问题 |
| :--- | :--- | :--- |
| `agent-eval-benchmark-dashboard` | `review/r4-spec-axis.md:34-73` 的 40 行源码引用**全部**是 `:1` 加同一句模板话；`gate-review-r4.log` PASS，但带 `来源核验：自述凭据（弱）`、`转录核验：…没有 code-review 的 Skill 调用`、`审查轮次已达 r4，超出自动复审 2 轮上限` 三条 NOTE | **这不是「防作弊过度」，而是防作弊没生效**：`retro-evidence.md:24` 明确全程 0 个子代理，而 `review-report.md` 自述「两轴独立子代理…完成凭据封存」。按 `docs/agents/qa-workflow.md:154`，拿不到两份独立返回应保持「待独立审查」、不跑最终 `qa-check review`。这个 PASS 是违规产物，不能作基线 |
| `agent-runtime-resilience` | 最守规矩、真发现最多：r1 Spec 抓出 6 个编号（`P-W01`/`P-M01`/`P-M02`/`P-W02~04`），`gate-review-6.log` PASS 且「转录（强）」；代价是 6 轮、52 份 `final*` 日志 | 贵在「封存原文与动态实测值强绑定」：`retro-evidence.md:289-303` 证明 r5→r6 不是「抄 r4 旧值」，而是封存后主会话又重跑浏览器刷新清单。同时自曝九项浏览器验收只做 3 项、`online`/`visibilitychange` 无断言、P-W01 证据引用不对应断言、r5 源码行号沿用 r4——**这些机器门禁都没抓到** |
| `agent-runtime-resilience-delivery-closure` | 0 行生产代码，6 次 `gate-review` 全 FAIL；最终 `gate-review-6.log` 阻塞项是 3 个 `ASSERTION_BLOCKED` + 1 个 `SPEC_REVIEW_SOURCE_INVALID` | 措辞误杀只发生在前 4 轮（`retro-evidence.md:126-127` 记载 r2 已改用「无新发现」）。**最终 FAIL 是真实证据缺口**；`check(true, 3, ...)` 与无条件 `console.log('[TC04-5] PASS')` 是 r2 子代理在 `seal` **之后**用 SendMessage 报告的，机器 acceptance 当时给了 14 个 PASS |
| `mcp-integration-governance` | 6 工单 / 48 US / 106 断言 / 13 交付命令 / 151 份日志；`review/` 中 r1 Spec 未 seal、r1 Standards 未落盘，r2/r3 四份原文与凭据齐全；`handoff.md` 明确「当前不是可交付状态」 | 见 §2.2、§2.3 |

### 2.2 MCP 特性：跨天、额度耗尽与交接时间线

`retro-evidence.md` 覆盖到 `/retro` 时刻（主会话 11,757 行）；本报告按完整的 12,018 行转录重新统计（UTC）：

| 时间 | 事件 | 出处 |
| :--- | :--- | :--- |
| 11-24 04:06 | `/grill-with-docs` 开始 | 转录行 10 |
| 05:39 | **主会话 429**：Kimi Code 5 小时用量上限 | 转录行 621 |
| 05:41 | 切模型 `Hy4 · WorkBuddy`，用户「继续」 | 行 625-626 |
| 06:02 / 06:14 / 06:37 | `/to-tickets`（6 工单）→ `/qa-test-planner` → scope/init | `retro-evidence.md:40-43` |
| 10:39 | 第 1 次 `/handoff`（「下一份交接文档明天继续执行」），10:40 写 `handoff.md` v1 | 行 2996 / 3019 |
| 10:40 → 11-25 00:32 | **隔夜 830.3 分钟** | `retro-evidence.md:150` |
| 01:34–01:51 | 受控 HTTPS QA 服务 5 次启动失败 | `retro-evidence.md:60-70` |
| 01:57–02:25 | TC01 3 次 + TC03 8 次浏览器失败迭代 | `retro-evidence.md:72-89` |
| 02:32 | r1 双轴派发；Standards 02:49 完成却未落盘；**Spec 跑到 03:42、282 次工具调用、5.7MB，被用户喊停** | `retro-evidence.md:27-28, 125-129` |
| 03:41 / 03:45 | 切模型 `Opus 5.5`；随后「快审 5 项」 | 行 8777 / 9204 |
| 03:48 | **Antigravity 第三方额度 429**；03:55、03:59 两次压缩 | 行 9234 / 9274 / 9302 |
| 04:13 | 第 2 次 `/handoff`，参数原文「现在你的额度不够了，需要换…」；04:15 写 v2 | 行 10268 / 10297 |
| 04:16 / 04:20 / 04:21 | 切回 `Hy4` → `/compact` → 用户「读交接文档继续」 | 行 10312 / 10330 / 10350 |
| 04:37–05:07 | r2 双轴；抓出 3 个 S-H；04:38 写 v3 | `retro-evidence.md:29-30` / 行 10903 |
| 05:15 | **r3 首派两轴同时 429 失败**；05:17 写 v4，按技能规则「不重派、不追问、不续传」 | `retro-evidence.md:117-121` / 行 11294 |
| 05:37–05:49 | 用户「继续」→ 新 nonce 重派 r3b 两轴 → 封存 | 行 11310 起 |
| 05:57 / 05:58 | `gate-review-r3-final.log` FAIL；写 `handoff.md` v5（现存版） | 行 11576 |
| 06:24 | 第 4 次压缩（retro 时只有 3 次） | 行 11996 |

**归因结论**：日历跨度 1,561.3 分钟（26.0h）中，**1,049.2 分钟是明确等待用户**（隔夜占 830.3），Agent 活跃下界 462.3 分钟，`qa-run` 命令运行仅 17.8 分钟，8 份子代理转录墙钟求和 147.8 分钟（含双轴并行重叠，其中 r1 Spec 被人工喊停的 70.0 分钟是单次异常）（`retro-evidence.md:136-158`）。方案把「跨天 26h」当作工作流摩擦的依据不成立：主要成本是用户不在场、上游额度与失控子代理，不是阶段 6 的固有开销。

### 2.3 `handoff.md` 覆写链与归因漂移

`handoff.md` 在同一路径被 `Write` 覆写 **5 次**（转录行 3019 / 10297 / 10903 / 11294 / 11576），只有 v5 留在磁盘；`.claude/skills/handoff/SKILL.md:14` 默认同机会话续接落单文件，跨人/跨机才版本化，本案例属前者。

早期版本只能从主会话回显恢复：`retro-evidence.md:170-173` 记录上一版把 `TC05-1` 错归因为「断言过宽」，实际是 `serverUpdate` mock 基线写死 `authHeaderName:'Authorization'` 的失真，冻结断言未改。同一份 retro 的 §4.3 还记录「快审第 4 项」的行号/落点与最终实现不符。

v2 支柱四引用了这个漂移，但给出的 `_qa/state.json` 只存阶段、`treeDigest`、封存状态、待复核编号、外部服务 PID，**不记录缺陷归因**；「归因必须附带出处」只是文字纪律。交接文档无版本化 → 漂移仍无法审计，根因未修。

另外，方案反复引用的「主会话几分钟快审抓出 5 个真安全缺陷」，用户原话是「把上面 **opus** 分析的需要修复和加固的地方，你检查修复一下」（转录行 9239）。这是切到更强模型后的一次输出，不是「主会话上下文天然更完整」的证据；5 条发现未编号、未封存、未独立复核，其中 1 条落点与最终实现不符。

---

## 3. 对抗性审查

### 3.1 可证伪的事实错误

| # | 方案说法 | 实际 | 出处 |
| :--- | :--- | :--- | :--- |
| F1 | 「阶段 6 耗时普遍反超前面需求+规划+开发+验收全部阶段之和」 | eval 审查窗口约 22 分钟，前段约 284 分钟；closure 审查 r1+r2 约 24 分钟，前段约 203 分钟。mcp 的 26.0h 里 1,049.2 分钟是等待用户。把「子代理 LLM 墙钟求和」与「shell 命令时间」并列也属口径错配 | 四份 retro §3；`mcp/retro-evidence.md:136-158` |
| F2 | 「r1 慢审 0 发现」 | r1 **根本没完成**：Spec 未 seal、Standards 未落盘、`review/r1-spec-axis.md:75-80` 后半段大面积错位（`TC05-1` 写成初始化请求、`TC05-3` 写成 3xx 重定向，`TC05-2`/`05-4`/`06-1~4` 同样错位）。「未完成」不等于「独立审查无效」 | `mcp/retro-evidence.md:123-129` |
| F3 | 「r2/r3 独立审查只抓 3 个样式问题，5 个真缺陷靠主会话快审」 | r2/r3 是**增量复审**，`.claude/skills/code-review/SKILL.md:71` 规定「新发现只针对本轮修复改过的文件」。拿范围受限的复审与全量快审比发现数是范围错配 | 技能原文 |
| F4 | 「字数 `128,441 → 138,261`」 | `retro-evidence.md:291-297` 的 `128，441` / `138，261` 是「刷新前/刷新后字符数」，被误读成带千分位的单个数 | `resilience/retro-evidence.md` |
| F5 | 「修宽松 4 项 → 立即清零 Closure 与 MCP 的假阳性 FAIL」 | 清零后 closure 仍有 3 个真实 `ASSERTION_BLOCKED`；mcp 仍有 `UNRESOLVED_FINDINGS（S-H2 未修）`。S-H2 是 44px 热区红线的真实未修缺陷，按 `qa-workflow.md:153` 用尽上限后保持 BLOCKED 是预期设计 | `gate-review-6.log`、`gate-review-r3-final.log` |
| F6 | 「4 个业务 100% 需登录态，全部被迫 ego-browser」 | ADR-0054 决策 6 已解除 macOS 硬绑定，`qa-workflow.md:121` 按场景分流 Playwright；OPT-10 暂缓理由正是「保持这条简洁边界」 | `docs/adr/0054-qa-workflow-friction-reduction-and-browser-split.md:57`、`docs/plans/2026-11-22-qa-workflow-optimization-plan.md:57` |
| F7 | 「429 保包续传：保留另一已成功封存的轴」 | mcp r3 首派是**两轴同时 429 失败**，案例中不存在「另一成功的轴」 | `mcp/retro-evidence.md:117-121` |
| F8 | 「全部数据取自 retro / review / evidence」 | 混用了主会话转录（行 9204、8762 等）与子代理转录 | 方案 §1 首句 |
| F9 | 「最敷衍的反而最快 PASS」 | eval 的 PASS 违反 `qa-workflow.md:154` 合法暂停，且 `review-report.md` 自述与 retro 事实冲突。这是**防作弊未生效**，不是防作弊过度 | `eval/retro-evidence.md:24`、`gate-review-r4.log` |

### 3.2 因果与契约冲突（阻断采纳级）

1. **古德哈特定律自反噬**。方案 §2.2 批判「指标变目的」，§5 却把「≥80% 需求 1–2 轮收口」设为核心 KPI。而 `qa-workflow.md:152` 规定 r1 有「本次修」就**必须** r2 增量复审——一轮收敛只在 r1 双轴「无发现」时才可能。该 KPI 实质激励少报发现，与方案自称的目标「最大化交付代码不含真实缺陷的概率」方向相反。
2. **验收口径违反已接受 ADR**。ADR-0054 的「效果验证口径」要求对照记录「阶段 7 晚发现次数、修后重审次数、**人工终审新增发现数**」，并明确警示「避免把成本后移」。v2 的 4 个 KPI（耗时、轮次、误报数、浏览器试错）全是过程指标，**没有一个衡量缺陷检出率或证据真实性**。
3. **Level B 与 ADR-0054 决策 2 直接冲突**：「若被审代码或文档发生变更，仍要求双轴针对本轮修复改过的文件做增量复审」。方案未引用该 ADR、未写取代关系，违反 `qa-workflow.md:68`（推翻既有 ADR 须引用原决策、写明代价与取代）。且 Level A/B/C 没有机器可判定的判据——若由主代理自报，就违背「Agent 自述不算证据」。方案内部也不自洽：Level A 定义只列「注释/文案/测试补强」，不含 UI 样式，但 §2.1 又把 `h-10 → h-11` 当作最低成本样例。
4. **`.scratch/_session/` 与登录安全契约冲突**。`qa-workflow.md:123` 禁「注入 Cookie、写库造会话」，`qa-check.mjs` 的 `AUTH_BYPASS_PATTERNS` 正为此。`storageState` 是 Cookie 注入的等价物；方案只写「绝不写死账号密码」，把「防脚本内登录」降格为「防硬编码密码」，且没有威胁模型、没有新增防伪造扫描——这正是 OPT-10 当初被暂缓的原因（`docs/plans/2026-11-22-qa-workflow-optimization-plan.md:57`）。
5. **429 自动续传与技能规则冲突**。`code-review/SKILL.md:59,71` 明写「配额耗尽不自动换模型、不重派同轴同轮代理」「每轴每轮只派一个子代理，不重派替代代理；保持待独立审查，由用户决定后续会话」。mcp 案例里重派的前提是**用户显式说「继续」**，且重新 `collect` 换了 nonce。方案写成自动能力，会拆掉「失败不得伪装成成功」的保护。
6. **「防作弊过度」被自己的样本反驳**。eval 的 PASS 是「自述凭据（弱）+ 无 Skill 调用 NOTE」；closure 的 `check(true)` 伪断言通过了 acceptance（14 PASS）。说明防线**不足且未执行**，而非过剩。
7. **「`qa-check acceptance` 已完成 100% 断言覆盖」是错的**。它核对的是 PASS 标记、绑定字符串、脚本位置与 tree，**不判断谓词能否证伪**。`qa-check.mjs:2613-2628` 的 `citationIsValid` 只查「文件存在 + 行号 ≤ 总行数」，所以 eval 的 40 个 `:1` 全过。方案批评 `:1` 敷衍却不修这个漏洞，同时要删掉唯一迫使子代理去看源码谓词的全量表——净效应是让敷衍更容易。
8. **「减法」实为增法**。第四章列删 6 项，实际新增 ≥9 项：`qa-preflight.mjs`、`seal` 内置校验、`_qa/state.json`、工单级检查点、主代理快审、Level 分级、429 续传、会话复用、截图 helper 改造。而 `docs/plans/2026-11-22-qa-workflow-optimization-plan.md:5` 的状态是「**暂停继续叠加新门禁**，等 dogfood 数据后再减负」；`QA-WF-02`（203 条编号的缺陷分类统计）在 `docs/reports/` 下至今没有产物。方案自称「实证评估」，却无对照组、无该分类数据。

### 3.3 其他内部矛盾

- 主代理快审制度化把「不可核验的自述」变成流程证据，与 ADR-0048 凭据协议、`qa-workflow.md:3`「Agent 自述不算证据」冲突。
- 支柱四用「早期 handoff 转述漂移」论证 `state.json` 的必要性，但 `state.json` 字段与漂移成因（归因无出处、文档无版本）无绑定。
- 「35 次工具调用上限」针对 mcp r1 的 282 次有效，但没有给出「高价值发现需要读多少文件」的依据，宜作告警而非硬阻断。

---

## 4. 消融实验

### 4.1 三个可复现隔离实验

| 实验 | 做法 | 结果 | 对方案的含义 |
| :--- | :--- | :--- | :--- |
| **E1 证据树覆盖性** | 在 `/tmp` 建 mini git repo（按 `.gitignore:69` 忽略 `.scratch/`），调用真实 `computeEvidenceTreeDigest`，逐类改动后比对摘要 | 改 `apps/web/src/a.ts` → `5007caa9d89b`；改 tracked `qa-plan.md` → `f8ab965d6627`；改 `.scratch/.../scripts/tc01.mjs`（伪断言）、改 `.scratch/.../qa-plan.md`（冻结断言/证据引用）、新增 `.scratch/.../review-r1.md` → **全部保持 baseline `10b81a19683b`** | D2「以 `evidenceTree` 为唯一新鲜度真源」不成立：`.scratch/` 产物完全不在树里（`review-package.mjs:88` 的 `listFiles` 走 `git ls-files`，忽略文件不入选）。现有 `VERIFICATION_BEFORE_REVIEW`（`qa-check.mjs:2787`）虽笨，却是唯一把「审查之后的任何产物改动」转成「必须重跑交付命令」的机制。删它必须先扩展新鲜度绑定 |
| **E2 `:1` 引用漏洞** | 解析 `eval/review/r4-spec-axis.md` | 40 处 `:1`，且同一句「已核实对应断言逻辑与执行记录」；目标文件都存在且行数 ≥1 → 机器必过 | 取消全量表前必须修 `citationIsValid`：引用行应命中谓词/断言标记，而非只验证行号合法 |
| **E3 最终门禁阻塞码** | 统计四份最新 `gate-review-*.log` 的 `[CODE]` 分布 | closure：`3×ASSERTION_BLOCKED + 1×SPEC_REVIEW_SOURCE_INVALID`（真实缺口）；mcp：`1×UNRESOLVED_FINDINGS + 1×REVIEW_RAW_UNNUMBERED + 19×SPEC_REVIEW_SOURCE_INVALID`；resilience：r4 `6×SPEC_REVIEW_BINDING_MISMATCH`、r5/r6 PASS；eval：PASS 但 3 条安全 NOTE | 「修宽松 4 项」只能清掉 mcp 的 20 条格式项，**清不掉 closure 与 mcp 的真实阻塞**；「误报 FAIL 数 0」KPI 把真 FAIL 排除在分母外 |

E1 复现要点（临时目录内执行，不触碰工作区）：

```bash
git init -q && printf '.scratch/\n' > .gitignore
# 建立 tracked 源码与 qa-plan，以及 .scratch 下的过程脚本与执行记录
node --input-type=module -e '
import {computeEvidenceTreeDigest} from "<仓库绝对路径>/tooling/scripts/review-package.mjs";
const scopes=["apps/web/src/a.ts","qa-plan.md",".scratch/feature/scripts",".scratch/feature/qa-plan.md"];
const d=async()=>(await computeEvidenceTreeDigest(process.cwd(),scopes)).slice(0,12);
console.log(await d());
'
```

### 4.2 历史对照组

仓库中 9 个带 `gate-review` 的特性目录：结局 **6 PASS / 2 FAIL / 1 BLOCKED**，最大审查轮次分布 `2:3, 3:4, 4:1, 6:1`，无 1 轮收敛。历史里确实少见一轮收敛，但这说明「一轮收敛率」与「发现即复审」的安全设计互斥，不说明该砍复审。四份样本是**异常密集的便利样本**（同周、全部核心链路、全部有人工中断或配额问题），不能代表总体。

### 4.3 真发现来源消融

把四条检测通道逐个 ablate，数四份样本里会消失什么：

| 通道 | 四样本贡献 | ablate 后丢失 |
| :--- | :--- | :--- |
| 独立双轴子代理 | resilience r1 的 6 个编号 + mcp r2 的 3 个 S-H + closure r2 封存后报告的 `check(true)`/无条件 PASS 伪断言 ≈ 10 条 | 全部这些发现；`qa-check` 从未独立抓出其中任何一条 |
| 机器门禁 | 格式/新鲜度一致性（措辞、路径前缀、动态值绑定、`STALE_*`） | 只损失返工信号，不损失产品缺陷——**这是唯一可安全削减的层** |
| 主会话/换模型快审 | mcp 5 条疑点 | 未编号、未封存、未独立复核，1 条落点不符；不是可核验证据 |
| 人工终审 / `/retro` 图像复核 | eval 的 `:1` 敷衍与「0 子代理却 PASS」、mcp 的截图裁剪失效与 handoff 归因漂移、resilience 的九项验收只做 3 项与 P-W01 证据不对应、closure 的 DPR 偏移与 TC04-1 证据缺陷 ≈ 15 条 | 这些恰是「机器 PASS」之后才发现的**证据语义缺陷**；方案没有任何 KPI 衡量它们是否增加 |

**净效应**：方案削减的是「独立子代理深度 + 审后重跑」，新增的是 `qa-preflight` 的字面模式扫描。而四份样本里最贵的真问题——mock 写死 `Authorization` 失真、断言恒真、截图漏掉目标、测试标题与冻结断言偏题——**没有一条能被正则预检覆盖**。

### 4.4 组件级裁决

| v2 组件 | 消失的摩擦 | 丢失的防线 | 判定 |
| :--- | :--- | :--- | :--- |
| `qa-preflight`（4 类确定性扫描） | mcp r2 的 2/3 个 S-H、closure 的字面伪断言 | 无（但覆盖不了语义假断言） | **采用**，配单测，明确「不替代语义复核」 |
| `seal` 内置格式校验 | 措辞/路径误杀导致整轮重写 | 无，且「封存后不可改」仍守住 | **采用，最高性价比**；校验规则须与 `qa-check` 单一来源，避免两套实现分叉 |
| 4 处机械误报修宽松 | mcp 20 条格式 FAIL、closure 前 4 轮措辞 FAIL | 无 | **采用**；但不要宣称能清零最终 FAIL |
| 取消 N×5 全量手抄表 | mcp r1 的 70 分钟崩盘、eval 的 40 行 `:1`、resilience 的 r5→r6 死锁 | 唯一迫使子代理逐条看源码谓词的机制；acceptance 并不能保证谓词可证伪 | **改造，不删除**：清单由脚本预生成，子代理只做「异常/高风险项」复核；引用必须指向谓词所在行（同步修 `:1`） |
| 取消 `VERIFICATION_BEFORE_REVIEW` | 13–52 份重复日志、动态值死锁 | E1 证明 `.scratch` 改动完全不被 evidenceTree 感知 | **暂缓**：先扩展新鲜度真源，再取消 |
| Level A/B/C 分级 | 1 行 CSS 的核弹级联 | ADR-0054 决策 2 的双轴要求；无机器判据 | **暂缓**，需先写 ADR 与按「是否命中冻结 VisualTarget/几何断言」自动判级 |
| 主代理高危快审制度化 | 无实测收益对照 | 把不可核验自述变成流程证据；与 ADR-0048 冲突 | **否决制度化**；35 次工具上限可作告警不作硬阻断 |
| 大特性拆审 + `state.json` | 70 文件一次性送审 | 无 | **采用**，但把 `handoff.md` 版本化与「归因必须带出处」纳入状态文件，否则修不了已实证的漂移 |
| 429 自动「保包续传」 | 重新 `collect` 的成本 | `code-review` 技能 59/71 的失败保护；案例中两轴都失败，无「另一成功的轴」 | **否决自动续传**；保留「用户授权 + 新 nonce」现状 |
| OPT-10 会话复用 | DPR/缩放/8 轮试错 | 登录安全契约、需新防伪造扫描 | **暂缓 D3**；先落 `locator.screenshot()` 与确定性不变量（无契约冲突、收益确定） |

---

## 5. D1–D5 裁决建议

| 编号 | 建议 | 理由 |
| :--- | :--- | :--- |
| **D1** | **两版都不选**：改「机器预生成清单 + 异常驱动复核 + 引用行必须命中谓词」 | 简单取消会删掉语义核对；「脚本自动预填全量表」仍会把 106 行塞进上下文。关键是机器承担抄写、子代理承担判断 |
| **D2** | **暂缓**，先做 E1 暴露的 `.scratch` 产物新鲜度绑定 | `log.tree === currentEvidenceTree` 只证明 tracked 代码没变，不能证明过程脚本、冻结断言、截图没变 |
| **D3** | **暂缓**，拆两批 | 原生元素截图/确定性断言立即做；`storageState` 单独走 ADR 取代 + 威胁模型 + 防注入扫描 |
| **D4** | **采用但改判据**：按 diff 体积、断言数、子代理工具预算，而非「>25 文件」硬阈值 | 终态集成审必须仍覆盖跨模块安全不变量——mcp 的 5 个架构疑点正属此类 |
| **D5** | **采用**，唯一无争议项 | 校验规则要与 `qa-check` 共用实现，并输出可机读错因 |

---

## 6. 最小可落地集与验收口径

**Batch 1 收缩为 3 件**：

1. `review-package.mjs seal` 内置格式/结构/路径自检 + `qa-check.mjs` 的 4 处机械误报修宽松（`hasNoFinding` 中文否定归一化、`citationIsValid` 路径前缀归一化、`SYNTHETIC_INPUT` 按写入键细分、`qa-run` 支持 `--script`）。
2. 新增 `tooling/scripts/qa-preflight.mjs`，只做 4 类确定性扫描（英文注释、十六进制色值、44px 热区、过程脚本字面伪断言/命令一致性），带工具单测；文档明确「不替代 Spec 轴语义复核」。
3. 全量手抄表改「机器预生成 + 异常/高风险项复核」，并同步修 `citationIsValid` 的 `:1` 漏洞（引用行须命中谓词或断言标记）。

**其余全部暂缓**：时间戳锁取消、Level 分级、OPT-10 会话复用、429 自动续传、主代理快审制度化。

**KPI 换轴**：把「≥80% 一轮/两轮收敛」替换为「每特性真缺陷检出数不下降、人工终审新增发现数、伪断言与截图失效率、阶段 7 晚发现次数」。按 ADR-0054 的效果验证口径，用干净会话的真实 `/implement` dogfood（`QA-WF-01`）加缺陷分类统计（`QA-WF-02`）做对照，否则「减负」只会把成本从阶段 6 后移到人工终审与生产环境。

---

## 7. 证据索引

| 主题 | 路径 |
| :--- | :--- |
| 评估对象 | `docs/plans/2026-11-25-qa-workflow-v2-first-principles-redesign.md` |
| 现行规范 | `docs/agents/qa-workflow.md:68, 121, 123, 140, 152-154, 161` |
| 审查技能 | `.claude/skills/code-review/SKILL.md:59, 71` |
| 交接技能 | `.claude/skills/handoff/SKILL.md:14` |
| 已接受 ADR | `docs/adr/0054-qa-workflow-friction-reduction-and-browser-split.md`（决策 1/2/6、效果验证口径） |
| 优化追踪 | `docs/plans/2026-11-22-qa-workflow-optimization-plan.md:5, 57, 60-67` |
| 待办基线 | `docs/plans/qa-workflow-backlog.md`（`QA-WF-01`、`QA-WF-02`、`QA-WF-07`） |
| 门禁实现 | `tooling/scripts/qa-check.mjs:88-90, 1636-1648, 1823-1835, 2613-2628, 2787, 2812` |
| 摘要与封存 | `tooling/scripts/review-package.mjs:88, 139-170, 244-315` |
| 四份复盘 | 各特性目录下 `retro-evidence.md` |
| 最终门禁日志 | `evidence/gate-review-r4.log`、`gate-review-6.log`（两特性）、`gate-review-r3-final.log` |
| 敷衍引用与表幻觉 | `.scratch/agent-eval-benchmark-dashboard/review/r4-spec-axis.md:34-73`、`.scratch/mcp-integration-governance/review/r1-spec-axis.md:75-80` |
| 忽略规则 | `.gitignore:69` |

---

## 8. 待人工裁决

1. 是否按 §5 的 D1–D5 逐项批注，或对 v2 方案发起一次 `/grill-me`。
2. 是否先补 `QA-WF-02` 缺陷分类统计与干净会话 dogfood，再启动任何「减负」改造。
3. `mcp-integration-governance` 的 `[S-H2]` 仍待人工二选一（授权追加修复轮 / 终审接受现状），本报告不改变该状态。
