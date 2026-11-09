# 0048. 宿主无关的审查来源凭据

* **状态**：已接受
* **日期**：2026-11-09
* **范围**：QA 工作流正本与指南、code-review 技能、`tooling/scripts/review-package.mjs` 与 `qa-check.mjs`、契约与单元测试、安装模板
* **相关**：ADR-0031、ADR-0033、ADR-0035、ADR-0040、ADR-0042、ADR-0044、ADR-0047

## 背景

当前 `qa-check` 的审查来源核验只解析 Claude Code 的 `~/.claude/projects/<项目>/<会话>/subagents/*.jsonl`；review-report 声明非 Claude Code 宿主时跳过核验，只给人工核对 NOTE（ADR-0044 决策 2、ADR-0047 决策 1）。这使非 Claude Code 宿主的机器 PASS 失去来源核验，而本仓库已在 Kimi Code、Kiro 上完成过真实 QA 审查。

2026-11-09 的 `/grill-me` 对齐前核查了本机数据：

- Kimi Code 的子代理转录位于 `~/.kimi-code/sessions/wd_<项目>_<hash>/session_<uuid>/agents/agent-N/wire.jsonl`，含 `QA_REVIEW_BINDING`、最终消息与毫秒事件时间；审查代理可以使用只读的 `explore` profile，也可以选择可写的 `coder` profile。
- 本机 Codex 0.147 的 session 观察为单线程 rollout，未发现子代理转录；有 `codex exec` / `codex review` 无头模式。
- Claude Code 子代理可以使用 Write/Edit/Bash；本机 Cursor、Kiro 也各自保存 JSONL 转录，但格式互不相同。
- Kimi Code、Cursor、Kiro 的转录都是非公开格式，逐宿主适配会产生无界维护，且覆盖不到没有子代理的宿主。

历史约束也要正视：ADR-0035 选择主代理逐字落盘，是因为当时宿主向子代理注入「不写报告类 .md」的规则；ADR-0040 又以「多数宿主子代理只返回文本」否决了宿主工具调用提交；ADR-0042 把「子代理直接写原文」列入明确不做。本决策反转这些选择，理由是跨宿主覆盖目标与可核验产物，而不是宣称能力收益；前置条件与代价见下。

## 决策

坚持「防疏忽，不防对抗；机器只判断可靠事实，语义交人工终审」。

1. **collect 发放 challenge**：`review-package collect` 在 `_qa/review-challenge.json` 写入 nonce、轮次、treeDigest 与打包时间；轮次由 `--round` 指定，未指定时按现有 `review/` 最新轮次推导。nonce 一次性用于该轮审查；再次 collect 生成新 nonce，旧凭据不能用于新轮次。
2. **子代理自写原文**：code-review 的每个审查子代理把最终审查内容直接写入 `review/r<n>-<axis>.md`，再运行 `review-package seal` 生成 `review/r<n>-<axis>.source.json`，并让最终返回包含一行 `QA_REVIEW_RECEIPT: <nonce>|<sha256>`。主代理不转抄、不修改原文。
3. **审查者写权限**：审查子代理必须具备写文件与执行命令权限；只读探索型代理不得担任审查者。不满足时换宿主或改用外部会话，否则保持「待独立审查」；不提供主代理代写兜底。
4. **凭据内容**：最小可核验集为 schemaVersion、feature、round、axis、nonce、reviewerKind（subagent / external-session）、host、reportPath、sha256、completedAt；r2 起增加 pendingIds。不记录模型。
5. **强档**：Claude Code 转录中存在同 nonce 的子代理任务，且最终返回的 `QA_REVIEW_RECEIPT` 与磁盘原文哈希一致、提示词含绑定与 nonce、事件时间不早于 collect 时，按现有转录核验强度处理；复审必交编号仍按转录实际输入判 FAIL。找不到同 nonce 转录时不判失败，降为弱档或人工。
6. **弱档**：只有凭据且内部一致时，`qa-check` 标注「自述凭据（弱）」；PASS / BLOCKED 语义不变，但不得称来源已核验。
7. **异常分级**：哈希与凭据不符 FAIL；凭据 nonce 与当前 challenge 不符 BLOCKED；凭据缺失、格式错、自述时间早于 collect 只给 NOTE 交人工；自述 pendingIds 缺必交编号只给 NOTE（Claude 转录路径仍 FAIL）。
8. **宿主声明降级**：有 challenge 的新轮次里，`审查方式：宿主=<宿主名>` 保留为说明字段，`qa-check` 不再据此选择路径，改为按证据判定；`宿主=` 与凭据 host 不一致时只给 NOTE。无 challenge 的旧轮次仍按 ADR-0044 使用该字段，以保持历史兼容。
9. **取消新协议同轮纠偏**：新协议原文由子代理写，主代理不得改原文或重算凭据；需要修正按新轮次处理。无 challenge 的旧原文仍按 ADR-0047 处理。
10. **外部会话**：Codex 等无子代理宿主由用户手动另开独立会话或终端完成审查，使用同一 nonce 运行 seal，reviewerKind 记为 external-session；主代理不得自动启动无头审查者。
11. **迁移边界**：以 `_qa/review-challenge.json` 是否存在为界。有 challenge 的最新轮次必须带凭据；无 challenge 的历史轮次继续走旧逻辑（Claude Code 全等比对，其他宿主 NOTE），不强制重审。
12. **输出呈现**：`qa-check` 增加「来源核验：转录（强）／自述凭据（弱）／未核验（人工）」一行；不新增 PASS-WEAK 状态。

## 对既有 ADR 的取代与修订

| 被取代或修订项 | 新决策 | 依据 | 其他选项与代价 |
| --- | --- | --- | --- |
| ADR-0035 决策 2：子代理只返回，主代理逐字落盘 | 新协议子代理自写原文；旧协议路径保留 | 转抄是已证实的失真来源（ARCH-CK-05）；子代理自写后该环节消失 | 保留主代理转抄：非 Claude 宿主没有转录可兜底，失真不可核验 |
| ADR-0042「明确不做」中的子代理直接写原文 | 新协议要求子代理写，并要求写权限 | 当时宿主注入禁写规则；Kimi 与 Claude 子代理实测可写，写不了的宿主走外部会话或暂停 | 主代理代写：重新引入转抄失真并让凭据失去意义 |
| ADR-0040 否决「宿主工具调用提交」 | seal 是本地 Node 命令，不是宿主工具调用；仍要求子代理有工具权限 | 任何能运行 node 的宿主都可用，不耦合宿主 API | 每宿主适配工具调用：覆盖有限且随宿主变化 |
| ADR-0040「原文哈希防篡改」 | 哈希只做一致性与先后校验，不宣称防篡改 | 凭据是自述，主代理可写；强度行明示 | 签名 / HMAC：需要主代理不可得的密钥，超出防疏忽边界 |
| ADR-0044 决策 2：宿主声明决定是否核验 | 有 challenge 的新轮次降级为说明字段，按证据判定；无 challenge 的旧轮次保留原分支 | 声明写错会漏检或误报；nonce 精确匹配可替代 | 新轮次保留声明分支：非 Claude 永远只能人工 |
| ADR-0047 决策 1、3：转录全等比对与同轮纠偏 | 强档改用 nonce + 哈希行；新协议取消纠偏；旧路径保留 | 子代理自写后没有转抄环节；最终返回不再是全文 | 继续全文比对：最终返回只剩凭据行 |
| ADR-0031 §5、ADR-0044「明确不做」中的其他宿主适配 | 继续不做宿主适配器；新增宿主无关凭据 | 私有格式维护无界，且无法覆盖无子代理宿主 | 做适配器：覆盖有限、格式会变 |

ADR-0031、ADR-0033、ADR-0040、ADR-0044、ADR-0047 其余条款继续有效。

## 明确不做

- 各宿主的转录适配器（Kimi Code、Cursor、Kiro、Gemini CLI、Codex 等）。
- 主代理自动启动无头审查者（`claude -p`、`codex exec`、`kimi -p` 等）。
- 来源真实性证明、HMAC / 签名、防篡改、模型记录或模型一致性门禁。
- 主代理代写原文或代 seal；只读子代理审查。
- 对无 challenge 的历史轮次强制重审或补凭据。
- 改变产品代码、UI 或核心链路验收方式。

## 实施前验证

- 在 Claude Code 与 Kimi Code 各做一个最小探针：审查子代理在 `.scratch/<特性>/review/` 写文件并运行 `node tooling/scripts/review-package.mjs seal`，确认宿主没有注入禁止写报告的规则。若 Claude Code 仍禁止子代理写报告，Claude Code 继续走旧协议（主代理转抄 + 转录全等比对），不产生弱档凭据；其他可写宿主走新协议。不得因此增加「主代理代写 + seal」的弱档路径。
- 以 Claude Code 强档、Kimi Code 弱档做真机验收；Codex 只做 external-session fixture 与文档验证。

## 后果

- 非 Claude 宿主不再因缺少转录而失去全部来源信号；新宿主只需可写审查者与 Node。
- 弱档是自述证据，不能证明作者或独立性；主代理理论上可以自己 seal；人工终审与强度行仍是最终防线。
- Claude Code 强档保留，旧特性不强制迁移；有 challenge 的新轮次多一份 challenge 与每轴一份凭据，每轴多一次 seal 调用。
- 检查器新增凭据校验分支与 legacy 回退，测试面扩大；`qa-check` 不再依赖宿主声明做路径选择。
- 解决 QA-WF-06（nonce 绑定特性与轮次）；QA-WF-01 的真实 dogfood 仍是发布验收条件。
- 本决策只描述机制，不宣称质量或耗时收益。
