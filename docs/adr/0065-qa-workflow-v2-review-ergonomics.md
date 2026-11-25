# 0065. QA 工作流 v2.1 审查降负、预检前置与防线闭环（修订 ADR-0057）

* **状态**：已接受
* **日期**：2026-11-25
* **范围**：`docs/agents/{qa-workflow,qa-workflow-guide}.md`、`.claude/skills/{code-review,qa-test-planner,setup-qa-workflow}/`、`tooling/scripts/{qa-spec-review,qa-preflight,review-package,qa-run,qa-check}.mjs`、测试套件与安装模板
* **相关**：ADR-0048、ADR-0054、ADR-0057

## 背景

`QA-WF-02`（见 `docs/reports/qa-wf-02-baseline-2026-11-25.md`）对四份真实业务试跑的实证分析表明，`ADR-0057` 虽补齐了证据锚定，却在阶段 6 产生四类结构性摩擦与防线漏洞：
1. **计算与认知错配**：`mcp-integration-governance` 70 文件全量双轴耗时 47.2m 仅抓出 3 个可 1 秒机检的样式与英文注释 S-H，且因漏改单行按钮 `h-10` 耗尽 r3 上限；`closure` 出现 `check(true)` 字面伪断言；
2. **Spec 全量抄表反噬与 `:1` 漏洞**：`mcp` r1 Spec 子代理为抄写 106 行五列表耗尽 70.0m / 282 次调用并在后半段出现幻觉；`resilience` 65 行表触发百余条格式/绑定错；与此同时 `agent-eval` 在 `r4-spec-axis.md` 将 40 行全填 `:1` 且 0 工作流子代理自签封存，却因 `citationIsValid` 只查 `line <= 总行数` 且缺子代理硬拦截而放行 `PASS`；
3. **「先封存再检格式」与四处机械误报**：`seal` 后才由 `qa-check` 发现「无新增审查发现」未命中 `hasNoFinding`、`.scratch/<feature>/` 路径前缀未剥离、只读控制台采集钩子误报 `SYNTHETIC_INPUT`、`sh -c` 包装导致命令不匹配；
4. **`.scratch/` 盲区迫使无差别审后重跑**：`evidenceTree` 忽略 `.scratch/` 导致无法感知过程脚本与计划修改，只能依赖 `VERIFICATION_BEFORE_REVIEW` 强制审后重跑全部交付命令，在 `resilience` 触发动态日志字符数漂移死锁。

## 决策（修订并局部取代 ADR-0057）

1. **新增 1 秒本地确定性预检 `qa-preflight.mjs`**：在阶段 4 收尾与 `review-package collect` 默认执行（支持 `--skip-preflight` 应急与 `--strict` 严苛模式）。ERROR 级（退出码 1）拦截 `scripts/` 字面伪断言（`check(true)`、无条件裸 PASS、缺非零退出）及 `spec.md` 与 `qa-plan.md` 交付命令不一致；WARN 级（默认仅高亮列出全量行号）提示 Diff 纯英文注释、非 `DESIGN.md §2.2/§2.3` 白名单十六进制色值与交互按钮 `h-7~h-10` 缺失（同文件一次列全所有行号）。明确定位：**仅清场静态违规，不替代 Spec 轴与人工语义复核**。
2. **封存前同步校验与机械误报修复（修订 ADR-0057 决策 9）**：从 `qa-spec-review.mjs` 导出单一事实源校验供 `review-package seal` 在写入 `.source.json` 前同步调用；不通过即拒绝封存并返回可机读修复指引，子代理同轮改好再封，保留不可篡改封存防线同时消除纯格式废轮。修复 `hasNoFinding` 中文否定变体、路径前缀剥离归一化、`SYNTHETIC_INPUT` 放行只读诊断采集、`qa-run --script <path>`。
3. **升级 `QA Review Coverage: 2` 并封堵 `:1` 敷衍（修订 ADR-0057 决策 1–2）**：保留对 `v1` 历史产物的全量兼容；新计划声明 `QA Review Coverage: 2` 时，`acceptance` 自动按 `changed=true`、`seam` 为 `browser`/`api`、`status≠PASS` 或 `Priority=P0` 标出 `required` 必审行并生成 `_qa/spec-review-skeleton.md`。`v2` Spec 原文使用 4 列表（去掉手工逐字抄录 `actual`），只须逐项覆盖 `required` 行并在存在非 `required` 行时注明抽检范围；同时全版本升级 `citationIsValid`，要求 `unit`/`integration`/`browser`/`api` 的引用行前后 ±5 行窗口内实际命中测试定义或断言谓词。
4. **双指纹新鲜度与免重跑锁（修订 ADR-0057 决策 7）**：`review-package.json` 增补 `qaArtifactsDigest`，哈希 `scripts/`、`screenshots/` 与剔除 `## 交付验证` 段落后的 `qa-plan.md`。仅 `.scratch/` QA 产物变化时 `qa-check review` 报 `STALE_QA_ARTIFACTS`（`BLOCKED`）；当 `evidenceTree` 与 `qaArtifactsDigest` 均未变化时，既有同 `tree`、`exit 0` 且不早于基线的交付日志直接有效，免除 `VERIFICATION_BEFORE_REVIEW` 强制审后重跑（旧包无 `qaArtifactsDigest` 保持原逻辑）。
5. **收紧 Claude Code「0 子代理自签」硬拦截**：当 Claude Code 主会话目录可读且存在本项目主会话转录、任一未复用轴声明 `reviewerKind=subagent`（非其他宿主、非 `external-session`），但 `collect` 后既无 `code-review` Skill 调用又无任何同 nonce 子代理转录时，`qa-check review` 升级为 **`BLOCKED`（`REVIEW_PROVENANCE_UNVERIFIED`）**，CI 空目录与非 Claude 宿主保持「自述凭据（弱）」零误伤。

## 否决 / 暂缓与代价说明

| 方案 / 取舍 | 处置与理由 / 代价 |
| :--- | :--- |
| 主代理高危快审制度化 / 429 自动续传 | **否决**：违背 `qa-workflow.md` 自述不算证据与 `code-review` 配额暂停保护 |
| 单轴豁免（`Level A/B/C`）、`OPT-10` `storageState`、大特性拆审与 `/handoff` 版本化 | **移出 Batch 1 暂缓**：涉及 `ADR-0054` 或登录安全边界，待 Batch 1 双轨验证及专项 ADR 后推进 |
| 保留 `v1` 与无 `qaArtifactsDigest` 旧审查包兼容 | 增加少量分支代码，但确保历史归档和在途特性零破坏 |
| `v2` 非 `required` 行不再逐行机械校验 | **代价**：常规 `unit`/`integration` 非 P0 通过项由抽检覆盖；以全版本 `±5` 行真实谓词检查和核心高风险 100% 必审对冲漏检风险 |

## 验收标准（对齐 ADR-0054 双轨）

- **质量轨**：阶段 6 真缺陷检出密度不低于基线；`:1` 敷衍、0 子代理漏放与字面伪断言归零；阶段 7 晚发现次数不上升；
- **效率轨**：纯格式误报与 `seal` 后重来轮次归零；`qa-workflow.md` 严守 `<= 180` 行契约锁；Batch 1 工具测试全通过且保留「待发布验收（干净会话 `/implement` dogfood）」。
