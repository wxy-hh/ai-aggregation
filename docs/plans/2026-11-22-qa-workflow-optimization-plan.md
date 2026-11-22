# QA Workflow 联合审计优化计划与进度追踪（2026-11-22）

> **生成时间**：2026-11-22
> **来源**：主仓 Swarm 四路源码审计 + 外部独立仓架构审计双报告交叉核验，经 7 轮 `/grill-me` 决策收敛
> **当前状态**：**Phase 1（P0，`e4e9c0d`）与 Phase 2（P1，`9b51c32`）已全部完成并通过 381/381 工具单测与双轴独立审查**；暂停继续叠加新门禁，等待真实业务需求多轮试跑（dogfood）收集耗时与误报数据后再推进下一阶段减负。
> **关联文档**：`docs/reports/qa-workflow-evolution-report.md`、`docs/plans/qa-workflow-backlog.md`

---

## 一、总进度一览（21 项全量对账）

| 状态分类 | 数量 | 编号范围 | 说明 |
| --- | --- | --- | --- |
| ✅ **已完成（Phase 1 + Phase 2）** | **13 项** | `OPT-01 ~ OPT-09`、`OPT-11`、`OPT-12`、`OPT-13`、`OPT-17`（部分） | 已落地提交 `e4e9c0d` + `9b51c32`，全量工具单测由 `361` 增至 `381/381` 全绿，5 个核心脚本与安装模板逐字节一致（`OPT-01` 已由用户确认删除本地脚本即可，无需轮换 `xkfy` 凭据） |
| ⏸️ **有意暂缓 / 明确排除（经 `/grill-me` 决策）** | **1 项 + 2 处子项** | `OPT-10`、`OPT-07`（权限不动）、`OPT-11`（`planChangeRecorded` 不动） | 为避免新增防伪复杂度与格式摩擦，维持现有简洁边界 |
| ⏳ **未做 · P2（等真实业务试跑数据后启动）** | **3 项 + 1 处残余** | `OPT-14`、`OPT-15`、`OPT-16`、`OPT-17`（残余清理） | 与 `docs/plans/qa-workflow-backlog.md` 的 `QA-WF-01`/`02`/`07` 联动，数据驱动做减法 |
| 📦 **未做 · P3（仅限外部独立分发包仓库）** | **4 项** | `OPT-18 ~ OPT-21` | `AI-Aggregation` 主仓不适用或已解决，仅同步独立 `qa-workflow` 模板仓时执行 |

---

## 二、已完成项清单（Phase 1 + Phase 2）

### Phase 1：P0 安全止血与确定性 Bug 修复（提交 `e4e9c0d`，特性 `.scratch/qa-workflow-p0-hardening/`）

| 编号 | 优化项 | 状态 | 实际落盘与验证结果 |
| --- | --- | --- | --- |
| **OPT-01** | 清理 6 个滞留含凭据历史脚本 | ✅ 已完成 | 已从工作区删除 `ego-mobile-full.mjs`、`ego-mobile-test.mjs`、`ego-ui-deep-test.mjs`、`run-mobile-full-check.mts`、`test-mobile-clean.mts`、`test-knowledge-ui-deep.mts`；不重写 Git 历史，不动 `.scratch/` 历史审计快照（遵守 `QA-WF-03`）。经用户确认本地删除即可，无需轮换 `xkfy` 凭据。 |
| **OPT-02** | 堵住 `AUTH_BYPASS_PATTERNS` 项目认证键盲区 | ✅ 已完成 | `tooling/scripts/qa-check.mjs`（及模板）将本地存储拦截正则从 `token` 扩展至 `(?:token\|auth\|session)`，覆盖 `ai-app-auth` 等持久化认证键；普通键不误报（`P0-TC02-1`）。 |
| **OPT-03** | 修复 r2+ 单轴复用导致「强核验」静默降级 | ✅ 已完成 | 新增 `axisTranscriptTarget` 集中收口单轴转录核验上下文，复用轴按自身 `.source.json` 的 `round`/`nonce` 核对且不被刷新后的当轮 `collect` 时间误杀（`P0-TC03-1`）。 |
| **OPT-04** | 修复 `transcriptTimes` 同 `binding` 覆盖隐患 | ✅ 已完成 | 写入前按 `binding` 统计唯一性，多条命中时不静默覆盖而安全回退 `.source.json` 的 `completedAt`（`P0-TC04-1`）。 |
| **OPT-05** | 修复 `path.posix.matchesGlob` 导致 Node 18/20 崩溃 | ✅ 已完成 | 新增零依赖 `matchPosixGlob` 替换 Node 22.5+ 专有 API，兼容多版本 Node（`P0-TC05-1`）。 |
| **OPT-06** | 解除 `setup-qa-workflow` 对 `triage-labels.md` 初始化死锁 | ✅ 已完成 | `.claude/skills/setup-qa-workflow/SKILL.md` 将 `triage-labels.md` 标为「仅安装 `triage` 技能时必选」（`P0-TC06-1`）。 |
| **OPT-07** | 修复 `qa-workflow-guide.md` 元数据冲突 | ✅ 已完成（按决策纠偏） | 尊重既有契约测试（`qa-workflow-contract.test.mjs:356`）保持 `qa-test-planner` 允许模型调用；将 `/to-tickets` 与 `/retro` 归入人工独占表并从自动调用表移除 `retro`（`P0-TC06-2`）。 |
| **OPT-08** | 清理 `qa:run` 过时提示与 `.claude/rules/` 失效引用 | ✅ 已完成 | `qa-check.mjs`（及模板）3 处 `qa:run` 改为 `node tooling/scripts/qa-run.mjs`；清理 `.claude/rules/security.md` 中不存在的 `security-reviewer` 智能体与 11 种未使用语言扩展名；修正 `.claude/rules/git-workflow.md` 的 `Agents.md` → `AGENTS.md`（`P0-TC06-3/4`）。 |

### Phase 2：P1 浏览器双栈、解析器加固与技能闭环（提交 `9b51c32`，特性 `.scratch/qa-workflow-p1-ergonomics/`）

| 编号 | 优化项 | 状态 | 实际落盘与验证结果 |
| --- | --- | --- | --- |
| **OPT-09** | `qa-browser-helper.mjs` 双栈兼容 Playwright 与 `ego-browser` | ✅ 已完成 | `captureMobileGeometry` 按能力探测兼容 `page.cdp` 与 Playwright `setViewportSize`/`viewportSize`，正常/断言失败/截图失败 `finally` 均恢复原视口，均不支持时抛 `TypeError`；模板逐字同步（`P1-TC01-1/2`）。 |
| **OPT-11a** | 统一支持转义 `\|` 的 `splitMarkdownRow` | ✅ 已完成 | 由 `tooling/scripts/qa-spec-review.mjs` 统一导出并由 `qa-check.mjs` 复用，消除两套拆列实现分裂（`P1-TC02-1`）。 |
| **OPT-11b** | `importedSpecifiers` 支持跨行动态导入与路径拼接 | ✅ 已完成 | 改为全文匹配静态/副作用导入，并复用 `maskStringLiterals` + `inPageSegmentEnd` 提取 `import(...)`/`require(...)` 括号参数，兼顾跨行与 `require(path.join(...))`（`P1-TC03-1` 与 `TC08-1` 双绿）。 |
| **OPT-11c** | `pnpm-workspace.yaml` 注释、多级 glob、`!` 排除与并发扫描 | ✅ 已完成 | 支持行尾 `#` 注释、`packages/**` 多级展开、`!dir` 前缀与 `!dir/**` 通配排除，以及 `Promise.all` 并发目录扫描（`P1-TC04-1`）。 |
| **OPT-11d** | Python 三引号与 JS 模板字符串 `${...}` 词法加固 | ✅ 已完成 | 抽取单一 `scanJsSegment`/`scanTemplateLiteral` 统一 JS 词法单次扫描，消除重复分支与二次扫描；补齐 Python `"""..."""`/`'''...'''` 三引号保护（`P1-TC05-1`）。 |
| **OPT-12** | `r4+` 超上限强 `NOTE` 提醒 + 补全 `WORKFLOW_SKILLS` | ✅ 已完成（克制收敛） | 审查达 `r4+` 输出交人工裁决的强 `NOTE`（不新增硬阻断）；`WORKFLOW_SKILLS` 补全 `grill-me`、`domain-modeling`、`codebase-design`、`setup-qa-workflow`（`P1-TC06-1/2`）。 |
| **OPT-13** | 技能生态精挑补丁与上游保留标记 | ✅ 已完成 | `diagnosing-bugs`（衔接 `QA Kind: fix` `## 修复前复现`）与 `resolving-merge-conflicts`（用户确认后 commit）尾部追加项目定制并同步 `templates/skill-customizations.md`；`deploy-prod` 预检增加终审核对；`ask-matt` 移除 3 个不存在上游技能并补列本仓核心技能；`to-tickets`/`code-review` 补齐「上游升级时保留」标记（`P1-TC07-1~4`）。 |
| **OPT-17**（部分） | 修正 `docs/teach/qa-workflow/GLOSSARY.md` 过时口径 | ✅ 已完成（其余残余见下） | 已将 `docs/teach/qa-workflow/GLOSSARY.md:8` 的「落盘至 CONTEXT.md」修正为「落盘至 GLOSSARY.md」（`P1-TC07-3`）。 |

---

## 三、未做项清单（按决策与阶段分类）

### 3.1 经 `/grill-me` 决策有意暂缓 / 明确不做的项

| 编号 | 原计划内容 | 状态 | 暂缓 / 排除理由 |
| --- | --- | --- | --- |
| **OPT-10** | 为 Playwright 增加「脚本外只读 `storageState`」复用模式 | ⏸️ **有意暂缓** | 保持 ADR-0054「需登录态用 `ego-browser`、无需登录态用 Playwright」的简洁边界，避免新增 `storageState` 防伪造扫描规则。若后续真实业务试跑发现受保护页切换 `ego-browser` 摩擦过高，再重新评估。 |
| **OPT-11（局部）** | 收窄 `planChangeRecorded` 的粗粒度 `TC01` 一次性全豁免 | ⏸️ **有意暂缓** | `QA Review Coverage: 1` 已由 Spec 轴强制逐条复核「变更成立/变更不成立」，再收窄文本匹配易增加写 `## 计划变更` 的格式摩擦。 |

### 3.2 P2：架构减负、文档去砖化与实测清债（等真实业务试跑几遍后再做）

| 编号 | 优化项 | 状态 | 涉及文件与具体方案 | 触发条件 |
| --- | --- | --- | --- | --- |
| **OPT-14** | **拆分 3,112 行单体 `qa-check.mjs` 并日落无 challenge 旧双轨** | ⏳ **未做** | ① 移除无 `review-challenge.json` 的旧转录双轨代码；② 拆分为 `tooling/scripts/qa-check/` 下 6 个高内聚子模块（`plan`、`acceptance`、`script-scan`、`review-triage`、`provenance`、`spec-coverage`）+ 薄入口；③ 将模板逐字同步测试升级为目录级校验（或轻量构建拼接脚本）。 | 完成几轮真实业务试跑并确认要删减的低价值门禁后启动，避免把待删规则原封不动搬进新模块。 |
| **OPT-15** | **废除「行数上限」改用可读性/结构契约，解耦 126 处文档正则锁死** | ⏳ **未做** | 将 `qa-workflow-contract.test.mjs` 的自然语言措辞正则逐步迁移为行为/结构契约；将 `CLAUDE.md` 门禁段瘦身为极简指针表（对应 `QA-WF-07`）；解除 `docs/agents/qa-workflow.md` 180 行硬上限导致的单行 1,251B 压缩排版。 | 联动 `QA-WF-01`（dogfood）与 `QA-WF-02`（审查发现分类统计）完成后启动。 |
| **OPT-16** | **建立阶段耗时与阻塞码可观测性指标，清零 4 轮累积 dogfood 债** | ⏳ **未做** | ① 在真实业务核心链路需求中以干净会话跑通完整标准车道（关闭 `QA-WF-01`）并做 `/retro`；② 可选在 `qa-run`/`qa-check` 中记录阶段起止时间与阻塞码分布，量化「编码 vs 验收 vs 复审」耗时比，作为下一轮做减法的直接依据。 | **下一轮真实业务需求立即开始试跑观察**。 |
| **OPT-17**（残余） | **补齐外围文档清理与极小文案同步** | ⏳ **未做** | ① 检查 `docs/teach/qa-workflow/` 其余文件是否仍有两档车道/强制全量截图旧口径；② 补齐 `docs/adr/` 生效状态索引表；③ 清理 `.claude/skills/ego-browser/learnings/*/manifest.json` 指向不存在 `tools/*.js` 的上游空壳清单；④ 顺手将 `.claude/skills/setup-qa-workflow/SKILL.md:45` 的注入清单补上 `diagnosing-bugs` 与 `resolving-merge-conflicts`。 | 随 P2 一并收尾。 |

### 3.3 P3：独立分发包（Standalone Template / Plugin Repo）专属项

> 以下 4 项在 `AI-Aggregation` 主仓**不适用或已解决**，仅当同步外部独立 `qa-workflow` 分发仓库时执行：

| 编号 | 优化项 | 状态 | 具体改造方案 |
| --- | --- | --- | --- |
| **OPT-18** | 同步主仓 ADR-0054 / ADR-0057 与 Phase 1/2 成果 | 📦 **未做（外部仓）** | 同步双树豁免、浏览器分流、`maskStringLiterals`、`implement`/`implement-spec` 瘦身、`qa-browser-helper.mjs`、`qa-spec-review.mjs` 及本次全部 P0/P1 修复。 |
| **OPT-19** | 解决独立包中 `retro` 调用 `writing-great-skills` 权限冲突 | 📦 **未做（外部仓）** | 解除 `writing-great-skills` 的 `disable-model-invocation: true`，或改由 `retro` 按路径读取。 |
| **OPT-20** | 加固独立包 `scripts/lint.mjs`、`uninstall.sh` 与 `.claude-plugin/plugin.json` | 📦 **未做（外部仓）** | 将 `docs/teach/` 纳入 `lint.mjs` 宿主私货扫描；为 `plugin.json` 增加存在性保护；用 Node 替换 `uninstall.sh` 中脆弱的 `sed` JSON 解析。 |
| **OPT-21** | 补全独立包 `.gitignore` 与 `README`/`CHANGELOG` 口径对齐 | 📦 **未做（外部仓）** | 独立包 `.gitignore` 加入 `.scratch/` 与 `.workbuddy/`；对齐 `README.md` Execution Gate 频率与 `CHANGELOG.md` 探活口径。 |

---

## 四、真实业务试跑观察记录表（供后续做减法与启动 P2 使用）

接下来用 2–3 个真实业务需求完整跑通流程后，建议顺手填下表（重点观察**耗时倒挂**、**浏览器分流顺畅度**、**误报/摩擦规则**），回来即可直接基于数据裁减低价值规则并启动 P2：

| 日期 | 业务特性（`.scratch/<feature>`） | 车道 | 涉及核心链路 | 编码耗时 vs 验收/复审耗时 | 浏览器工具（Playwright / `ego-browser`）与摩擦点 | 审查轮次与真实拦截价值 | 遇到的误报 / 值得删减的规则 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| _待填_ | | | | | | | |
| _待填_ | | | | | | | |
| _待填_ | | | | | | | |
