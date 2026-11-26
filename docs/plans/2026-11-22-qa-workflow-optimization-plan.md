# QA Workflow 联合审计优化计划与进度追踪（2026-11-22）

> **生成时间**：2026-11-22
> **最近更新**：2026-11-26（`v2.2` 全周期已落地：Phase 1 `07ef09d` → Phase 2 `d463e90` → Phase 2.5 `9be2aa9`，且已完成 Phase 3 干净会话双对照发布 dogfood，正式摘除 `v2.2`「待发布验收」标注并关闭 `QA-WF-01`、`QA-WF-07`）
> **来源**：主仓 Swarm 四路源码审计 + 外部独立仓架构审计双报告交叉核验（经 7 轮 `/grill-me` 决策收敛）+ 四特性真实业务复盘对抗审查（`ADR-0065`，经 5 轮 `/grill-me` 决策收敛）+ `.scratch/tools-workbench-ia-migration` 实跑复盘（经 8 轮 `/grill-me` 拍板）+ Phase 3 双对照发布验收（经 5 项 `/grill-me` 终审锁定）
> **当前状态**：**`v2.2` 全周期（Phase 1 `07ef09d`、Phase 2 `d463e90`、Phase 2.5 `9be2aa9`）与 Phase 3 干净会话双对照发布验收已全部完成**——对照 A（`/tools` 迁移干净复验，首轮双轴 5.12m、总活跃 32.0m、Rename 压缩 91.13%、`gate-review-01` PASS）与对照 B（4 类变异盲测 `4/4` 阻断级独立检出并两轮闭环、`gate-review-01` PASS）双轨达标，已正式关闭 `QA-WF-01`、`QA-WF-05`、`QA-WF-07` 并摘除 `v2.2` 发布验收暂挂标注；早期 Phase 1（`e4e9c0d`）、Phase 2（`9b51c32`）与 `v2.1 Batch 1`（`1b31f11`，`ADR-0065`）已并入全链路验收；`/tools` 迁移业务改动完整保留于 `phase3/control-a` 供人工单独终审决定合入。
> **关联文档**：`docs/reports/qa-workflow-evolution-report.md`、`docs/plans/qa-workflow-backlog.md`、`docs/adr/0065-qa-workflow-v2-review-ergonomics.md`、`docs/adr/0066-qa-workflow-v2-2-immutable-review-and-incremental-closure.md`、`docs/reports/qa-wf-02-baseline-2026-11-25.md`、`docs/plans/2026-11-25-qa-workflow-v2-first-principles-redesign.md`、`docs/plans/gemini4-2026-11-26-qa-workflow-v2.2-code-review-root-cause-and-optimization.md`、`docs/plans/kimi-2026-11-26-qa-workflow-v2.2-code-review-root-cause-and-optimization.md`

---

## 一、总进度一览（单一追踪视图）

| 状态分类 | 数量 | 编号范围 | 说明 |
| --- | --- | --- | --- |
| ✅ **已完成（早期 Phase 1 + Phase 2）** | **13 项** | `OPT-01 ~ OPT-09`、`OPT-11`、`OPT-12`、`OPT-13`、`OPT-17`（部分） | 已落地提交 `e4e9c0d` + `9b51c32`，全量工具单测由 `361` 增至 `381/381` 全绿（`OPT-01` 已由用户确认删除本地脚本即可，无需轮换 `xkfy` 凭据） |
| ✅ **已完成（v2.1 Batch 1，ADR-0065）** | **1 批 5 项** | `QA-WF-02` 基线 + Batch 1 四大改造与亲自复审 7 项补强 | 已落地提交 `1b31f11`，完成 `QA-WF-02` 四特性基线统计、`qa-preflight.mjs`、`seal` 同步阻断与四处误报修复、`QA Review Coverage: 2` + `±5` 行谓词封堵 `:1`、`qaArtifactsDigest` 双指纹免重跑与 Claude 0 子代理硬拦截（已随 `v2.2` Phase 3 完成发布验收） |
| ✅ **已完成（`v2.2` 全周期 + `v2.1` 主仓残留全清零）** | **1 个前置 + 4 阶段** | Step 0（`b8da019`）→ Phase 1（`07ef09d`）→ Phase 2（`d463e90`）→ Phase 2.5（`9be2aa9`）→ Phase 3（双对照发布 dogfood） | 与 `docs/plans/gemini4-2026-11-26-qa-workflow-v2.2-code-review-root-cause-and-optimization.md` 全量闭环，对照 A 效率轨与对照 B `4/4` 防线盲测双达标，已关闭 `QA-WF-01`、`QA-WF-05`、`QA-WF-07` 并正式摘标 |
| ⏸️ **有意暂缓 / 明确排除（经 `/grill-me` 决策）** | **4 类** | `OPT-10`、`OPT-07`/`OPT-11` 局部、`Level A/B/C` 等暂缓项、快审/自动续传否决项 | 保持简洁边界与规则红线，未满足前置 ADR/安全条件或已明确否决 |
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

### v2.1 Batch 1：审查降负、预检前置与防线闭环（提交 `1b31f11`，ADR-0065，特性 `.scratch/qa-workflow-v2-batch1/`）

| 切片 / 编号 | 优化项 | 状态 | 实际落盘与验证结果 |
| --- | --- | --- | --- |
| **QA-WF-02 基线** | 四特性真实试跑只读基线统计与 `ADR-0065` | ✅ 已完成 | 输出 `docs/reports/qa-wf-02-baseline-2026-11-25.md` 与 `docs/adr/0065-qa-workflow-v2-review-ergonomics.md`，更新 `qa-workflow-backlog.md` `QA-WF-02` 状态，保留既有契约锚点。 |
| **v2.1-1** | 新增 1 秒确定性预检 `qa-preflight.mjs` 并挂载 `collect` | ✅ 已完成 | ERROR 拦截 `scripts/` 永真伪断言与交付命令不一致；WARN 列出 Diff 英文注释（屏蔽字符串）、非白名单色值（跳过单行注释）与交互按钮 `<44px`（跨行 JSX 开标签追踪）全量行号；支持 `--skip-preflight` 与 `--strict`。 |
| **v2.1-2** | `seal` 同步阻断 + 四处误报修复 + 0 子代理硬拦截 | ✅ 已完成 | `qa-spec-review.mjs` 统一提供 `validateReviewReportForSeal` 在写 `.source.json` 前同步阻断；修复 `hasNoFinding` 中文否定、路径前缀剥离、`SYNTHETIC_INPUT` 只读诊断放行（含 `push` 与只读属性读取）及 `qa-run --script`（含 `--` 防劫持边界）；补齐 Claude Code 单轴/全轴 0 子代理 `REVIEW_PROVENANCE_UNVERIFIED`（`BLOCKED`）。 |
| **v2.1-3** | `QA Review Coverage: 2` 分级对账 + `±5` 行谓词封堵 `:1` | ✅ 已完成 | `acceptance` 按风险标注 `required` 并生成 4 列预填骨架 `_qa/spec-review-skeleton.md`，存在常规项要求真实填写 `## 抽检范围`（禁止空标题或保留 `<请写出...>` 占位）；全版本 `citationIsValid` 校验前后 `±5` 行真实断言谓词与非零退出分支；完全兼容 `v1`。 |
| **v2.1-4 & 复审补强** | `qaArtifactsDigest` 双指纹免重跑 + r3 后亲自复审 7 项补强 | ✅ 已完成（已随 `v2.2` Phase 3 验收） | `review-package.json` 增补 `qaArtifactsDigest` 堵住 `.scratch/` 盲区，双指纹未变免除 `VERIFICATION_BEFORE_REVIEW` 重跑，仅 QA 产物变化报 `STALE_QA_ARTIFACTS`；r1–r3 双轴独立闭环后补齐 7 项边界与 README/技能索引同步，**398/398 全绿**、模板逐字节一致，人工终审后本地提交 `1b31f11`；保留「待发布验收（干净会话 `/implement` dogfood）」。 |

---

## 三、未做项清单（合流后的单一排期）

### 3.1 经 `/grill-me` 决策有意暂缓 / 明确不做的项

| 编号 / 方案 | 原计划内容 | 状态 | 暂缓 / 排除理由 |
| --- | --- | --- | --- |
| **OPT-10** | 为 Playwright 增加「脚本外只读 `storageState`」复用模式 | ⏸️ **有意暂缓** | 保持 `ADR-0054`「需登录态用 `ego-browser`、无需登录态用 Playwright」的简洁边界，须先补专项 ADR 与威胁模型防伪造评估。若后续 dogfood 证实切换 `ego-browser` 摩擦仍过高，再重新评估。 |
| **OPT-11（局部）** | 收窄 `planChangeRecorded` 的粗粒度 `TC01` 一次性全豁免 | ⏸️ **有意暂缓** | `QA Review Coverage: 1/2` 已由 Spec 轴强制逐条复核「变更成立/变更不成立」，再收窄文本匹配易增加写 `## 计划变更` 的格式摩擦。 |
| **Level A/B/C & 大特性拆审** | 按变更规模豁免单轴复审、按体量拆分大特性微检查点 | ⏸️ **有意暂缓** | 单轴豁免与 `ADR-0054` 决策 2 冲突，需待 `v2.1 Batch 1` dogfood 后再以正式 ADR 推进；大特性拆审纳入后续 Batch 2 统筹评估。 |
| **快审制度化 / 429 自动续传** | 允许主代理高危快审替代双轴、遇 429 自动换模型/续传 | 🚫 **明确否决** | 分别违反 `qa-workflow.md`「自述不算证据」与 `code-review/SKILL.md` 配额失败暂停保护。 |

### 3.2 合流后的最终排期路线图（`v2.2` + `v2.1` 残留全清零，已锁板）

| 阶段 | 包含范围与映射关系 | 状态 | 核心交付与边界 | 触发条件 |
| :--- | :--- | :---: | :--- | :--- |
| **Step 0** | `/tools` 业务改动隔离封存 + 两份规划文档回写定格 | ✅ **已完成** | 业务代码封存至 `feat/tools-workbench-ia-migration`（`b8da019`），还原临时 `qa-browser-helper.mjs`，保留 `.scratch/tools-workbench-ia-migration/` 只读副本 | 立即执行（已收口） |
| **Phase 1（一期）** | **`v2.2 Batch 0~2`（`P0-1~P0-6`）+ `OPT-15` + `OPT-17` + `QA-WF-07` + `ADR-0066`** | ✅ **已完成（`07ef09d`）** | ① `ADR-0066`：收紧默认自动上限为 `r1 → r2 → WAITING_HUMAN`，取代 `HR-TC07-7` 启用基于轻量 `_qa/round-snapshots/r<n>/` 的机器 `delta.diff`；② **`OPT-15` & `OPT-17`**：迁移 `qa-workflow-contract.test.mjs` 脆弱措辞正则、解除 `qa-workflow.md` 180 行硬上限、瘦身 `CLAUDE.md`（`QA-WF-07`）、清理 `docs/teach/qa-workflow/` 与空壳 `manifest.json` 并在 `setup-qa-workflow` 补齐技能；③ **`P0-1~6`**：不可变快照与 `SUPERSEDED`、`qa-run --executor ego-browser` + `SCRIPT_DIR` 闭包 + 2s 预检 + 三类错误路由、`Coverage: 2` 平滑扩展分组 `reviewUnits` 与哈希继承、`rename` 折叠、`FINDING_ID_COLLISION` + `scaffold-report`、`DESIGN.md` 分层 | 已通过标准车道双轴终审并提交 `07ef09d` |
| **Phase 2（二期）** | **`v2.2 Batch 3`（`P0-7` + `INFRA-1~6` + `OBS-1`）+ `/handoff` 防覆写 + 弹层预清理（原 `v2.1 Batch 2`）** | ✅ **已完成（`d463e90`）** | ① 规划期减法 + `qa-preflight` 扩充（`§10` 路由/任意字体/重名常量/分流预检）；② `INFRA-1~6`：`locator.screenshot()` + 弹层预清理 + `node:zlib` 跨平台裁剪、390px Playwright 分流、`resolveBaseUrl()` + `engines.node >= 22`、`createMarker` 429 拦截、`parseBinding` 单行修复、修复 `session-state-sync.test.ts`；③ `/handoff` 历史留痕与日志强绑定；④ `OBS-1` 替换 `OPT-16` 耗时猜想（直接写入现有 JSON/日志字段） | 已通过标准车道双轴终审并提交 `d463e90` |
| **Phase 2.5** | **`OPT-14`（拆分单体 `qa-check.mjs` 并日落无 challenge 旧双轨）** | ✅ **已完成（`9be2aa9`）** | 移除无 `review-challenge.json` 旧转录双轨死代码（缺/损坏 challenge 阻断 `MISSING_REVIEW_CHALLENGE`）；拆分单体 `qa-check.mjs` 为 `tooling/scripts/qa-check/` 下 6 个严格无环子模块 + 173 行薄入口；吸收 Phase 1 `S-J1~S-J3` 单源去重；升级安装模板逐字测试为目录级校验 | 已通过标准车道双轴终审并提交 `9be2aa9` |
| **Phase 3（发布验收）** | **真实双对照 Dogfood + 关闭 `QA-WF-01` & 摘除「待发布验收」** | ✅ **已完成（2026-11-26）** | ① **对照 A**（`phase3/control-a`）：干净会话完整复验 `/tools` 迁移，首轮双轴 **5.12m**、全流程活跃 **32.0m**（较旧阶段 6 `239.6m` 降 86.6%）、Rename 压缩 **91.13%** / 纯代码 **82.4%**、`gate-review-01` PASS，业务分支保留供人工单独终审；② **对照 B**（`phase3/control-b`）：4 类变异盲测 **`4/4` 阻断级无提示独立检出**并两轮闭环、`gate-review-01` PASS；③ 关闭 `QA-WF-01`/`QA-WF-05`/`QA-WF-07` 并全仓摘标 | 已达标收口并清理对照 B 临时 worktree |

### 3.3 P3：独立分发包（Standalone Template / Plugin Repo）专属项

> 以下 4 项在 `AI-Aggregation` 主仓**不适用或已解决**，仅当同步外部独立 `qa-workflow` 分发仓库时执行：

| 编号 | 优化项 | 状态 | 具体改造方案 |
| --- | --- | --- | --- |
| **OPT-18** | 同步主仓 ADR-0054 / ADR-0057 / ADR-0065 与 Phase 1/2/v2.1 Batch 1 成果 | 📦 **未做（外部仓）** | 同步双树豁免、浏览器分流、`maskStringLiterals`、`implement`/`implement-spec` 瘦身、`qa-browser-helper.mjs`、`qa-spec-review.mjs`、`qa-preflight.mjs`、Phase 1/2 修复与 `v2.1 Batch 1` 全套改造。 |
| **OPT-19** | 解决独立包中 `retro` 调用 `writing-great-skills` 权限冲突 | 📦 **未做（外部仓）** | 解除 `writing-great-skills` 的 `disable-model-invocation: true`，或改由 `retro` 按路径读取。 |
| **OPT-20** | 加固独立包 `scripts/lint.mjs`、`uninstall.sh` 与 `.claude-plugin/plugin.json` | 📦 **未做（外部仓）** | 将 `docs/teach/` 纳入 `lint.mjs` 宿主私货扫描；为 `plugin.json` 增加存在性保护；用 Node 替换 `uninstall.sh` 中脆弱的 `sed` JSON 解析。 |
| **OPT-21** | 补全独立包 `.gitignore` 与 `README`/`CHANGELOG` 口径对齐 | 📦 **未做（外部仓）** | 独立包 `.gitignore` 加入 `.scratch/` 与 `.workbuddy/`；对齐 `README.md` Execution Gate 频率与 `CHANGELOG.md` 探活口径。 |

---

## 四、真实业务试跑观察记录表（`v2.1` 事故基线 vs `v2.2` Phase 3 双对照实测）

下表记录真实业务干净会话实跑观测数据（含旧版失败基线与 `v2.2` Phase 3 对照 A / 对照 B 实测）：

| 日期 | 业务特性（`.scratch/<feature>`） | 车道 | 涉及核心链路 | 编码耗时 vs 验收/复审耗时 | `qa-preflight` / `v2` 对账体感与误报 | 浏览器工具（Playwright / `ego-browser`）与截图/交接摩擦 | 值得删减或调整的规则 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-11-26 | `.scratch/tools-workbench-ia-migration`（未收口失败样本，业务改动已封存至 `feat/tools-workbench-ia-migration`） | 标准车道 | tools/MCP 路由与工作台迁移 | 纯编码 11.4m vs 阶段 6 含返工 239.6m（有效 6 轴 837 调用 / 82.3m） | `Coverage v2` 退化 `40/40` 全必审；`.sh` 变量赋值致 Spec 3 轮 `seal` 100% 失败并翻源码 66 次；577 KB 搬家 Diff | `ego-browser` 移动点击失灵/433px 窄屏、自定义容器 `clip` 拍出 5 张空白图、37 次 429 限流、r1/r2/r4 三轮踩脏工作区 | 直接触发 `v2.2`（`ADR-0066`）全量治本与 `v2.1` 残留全清零（对照详见 `gemini4-*.md`） |
| 2026-11-26 | `.scratch/tools-workbench-ia-migration-v2-2`（Phase 3 对照 A · 隔离分支 `phase3/control-a`） | 标准车道 | `/tools` 工作台、`/profile` 入口、`/chat` 锚点、移动端 390×844 | 全流程活跃 **32.0m**（含规划+搬迁+3 条浏览器验收+双轴+9 项交付）；首轮双轴关键路径 **5.12m**（Standards 3.25m/46 调用，Spec 5.12m/60 调用），较旧阶段 6 `239.6m` 降 **86.6%** | `qa-preflight` 前置把关 0 无效包派发；`gate-acceptance-01` 1 次 PASS（139ms）；18 对 Rename 压缩 **91.13%**（纯代码 **82.4%**，全包含 28 KB 新增 `spec.md` 为 78.87%）；`reviewUnits` 合并为 23 组；Standards `seal` 1 次过、Spec 格式重试 1 次过；`gate-review-01` **PASS**（109ms） | 3 条原生浏览器验收脚本均产清晰非空白目标截图（桌面工作台、聊天锚点、390×844 卡片）；全程零工作区踩脏、零编号冲突、无违规 429 自动重派 | 后续评估非代码纯文档（如 28 KB 新增 `spec.md`）是否单独统计 diff 压缩率口径；其余规则保持稳定 |
| 2026-11-26 | `.scratch/profile-quick-nav-anchor`（Phase 3 对照 B · 4 类变异零剧透盲测） | 标准车道 | 个人中心快捷锚点导航（桌面容器 + 390×844 移动端文档滚动） | 全流程活跃 **21.85m**（`r1` 双轴 4.50m + 修复重验 + `r2` 增量复审 2.68m）；四次 `seal` 全部 `1` 次通过 | **`4/4` 变异全部 `r1` 无提示阻断级独立检出**（`M1` 滚错宿主 `[S-H2]`/`[P-W5~6]`、`M2` 无语义绑定 `[P-W1~2]`、`M3` 空白图 `[P-M1]`/`[P-W7]`、`M4` 减动效首读 `[S-H1]`/`[P-W3~4]`），另检出 2 条真实 `S-H`；`r2` 全闭环，`gate-review-01` **PASS**（86ms） | `r1` 精准揭穿纯 Node 伪造空白 PNG；`r2` 经 `ego-browser` 真实渲染 390×844 截图（`variance=559.4`）并实测避让固定顶栏；零踩脏、未越界 `r2` | 防线未因减负而放水，当前规则边界有效，无需新增复杂度 |
