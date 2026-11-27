# 技能定制注入清单（Skill Customizations）

本文件描述 `/setup-qa-workflow` 对既有技能和配置的定制。每项必须带 `项目定制` 标记；已存在相同标记时跳过，不重复注入。`{CORE_LINKS}` 必须替换为安装时确认的核心链路。

## 1. `to-spec` —— 后续动作与成本默认值

在“发布 spec 后告知下一步”处注入：

```text
US 按外部可区分的行为完整覆盖，不为实现步骤或参数变体拆条，一个 TC 可覆盖多条 US；已确认的接缝直接引用，未确认时一次性向用户确认。新计划使用 Schema 4 并默认声明 `QA Review Coverage: 2`（兼容 `QA Review Coverage: 1`）；视觉断言冻结 VisualTarget（语义区域与稳定定位器），计划新建白名单路径写入 `## 计划新建路径`。阶段 4 收尾可用 `qa-preflight` 清理字面静态问题。spec 必须包含 Testing Decisions、Out of Scope 和 ## 交付命令（放在 Testing Decisions 之后，用一个代码块逐行写出最终需要真实运行的完整命令，qa-check plan 会核对计划是否原样包含）；推翻既有 ADR、评测结论或默认值时写明被推翻项、依据与各选项代价，宣称质量或性能收益时写明所需效果证据。沿用当前车道，只写一个建议下一步：标准车道 /qa-test-planner，慢车道 /to-tickets，快车道 /implement。只有用户显式 --independent 才增加一个规划子代理，不自动指定或升级模型。仅 QA Kind: fix 要求修复前红灯复现日志；QA Kind: feature 不设修复前复现门禁，所有 QA Kind 的阶段 4 TDD 垂直切片红灯证据要求不变，qa-plan 只测产品外部可观察行为，禁止把 qa-check、截图独立性、review/ 或 handoff.md 合规性写成元用例或在 scripts/ 自写元校验脚本。
```

## 2. `implement` —— 基线、串行冲刺、验收与审查交接

在实现步骤中注入或更新项目段：

```text
已有 _qa/scope.json（规划收口时已 init）时不再 init；没有时在改代码前执行 node tooling/scripts/review-package.mjs init .scratch/<feature> -- <路径白名单> 固化快照并冻结 Schema 4 计划；阶段产物需要纳入时用 add 以 base 为前值扩大范围，禁止手改 _qa/。默认单会话串行完成就绪工单，不自动提交。实现中发现改动已不符合当前车道的判定标准时停下，报告依据与建议车道，按 qa-workflow 车道升级处理。命令证据经 node tooling/scripts/qa-run.mjs .scratch/<feature> <标签> -- <命令> 生成（过程脚本支持 `--script <path>`，`ego-browser` 过程脚本优先 `--executor ego-browser --script <path>`）；进入阶段 5 前必须完成一次 `qa-preflight` 并清除 ERROR；WARN 按规范处置，不能用跳过预检替代语义复核。触及 {CORE_LINKS} 时按 qa-workflow 阶段 5 inline 完成真实浏览器验收，过程脚本放在 scripts/ 并以脚本路径经 qa-run 运行，每条冻结断言硬断言后输出 [TC01-1] PASS 实测：<值>，失败输出 FAIL 标记并非零退出；unit/integration 的 PASS 行在绑定列写 `<测试文件>` › <用例标题>；登录在脚本外完成，过程脚本从已登录状态开始：已有会话直接用，否则由用户在可见窗口登录或用用户提供的专用测试账号在真实登录页登录一次，脚本内不得出现任何登录行为，不得注入 Cookie、直连数据库或签发令牌；环境无法验证 DOM、真实交互或移动几何时记 BLOCKED 或经计划变更转人工，不用低接缝证据替代；plan、acceptance、review 分别经 qa-run 以 gate-plan-*、gate-acceptance-*、gate-review-* 落盘；空项目或 0 项测试触发 EMPTY_EVIDENCE，不能作为绿证据。验收后按 qa-workflow 阶段 6 串联：先 collect（默认运行 `qa-preflight` 与 2s 预检）生成审查包，再用 Skill 工具调用 code-review（参数写明特性目录与轮次），审查子代理的派发、编号与落盘规则只在该技能内，不要用 Agent 工具自行派审查子代理，双轴均达终态前冻结全部输入；两轴落盘后可用 `scaffold-report` 生成骨架，三档分流先分流再修，S-H、P-M、P-W 驳回须引 ADR 或契约；遇三类错误按契约路由：`REVIEWER_EDITABLE`（格式/行号错，同轮最多修正重试 seal 1 次）、`PACKAGE_INVALID`（候选/快照/失鲜包错，立即停止先重建包）、`INFRA_UNAVAILABLE`（配额/服务不可用，停在 WAITING_INFRA 保持待独立审查，不自动换模型或重派）；本次修或 S-H、P-M、P-W 改档后增量复审，自动上限 1 轮（r2，超限需 `--allow-manual-round` 人工授权），判改档不成立的改为本次修、不得再次改档，用尽仍有未修、修错或改档不成立时停在 WAITING_HUMAN，照常完成交付验证交人工裁决。拿不到两份子代理原文时保持待独立审查，不得凭空生成 review/ 原文或 review-report.md；宿主完全没有独立上下文能力时只交付审查包，不运行最终 qa-check review，由独立会话或人工接续。独立审查完成前不把 backlog、计划等文档写成完成态。阶段 7 若因交付命令失败修改代码或契约文档，必须回到阶段 6 复审并重跑受影响验收与全部交付命令；当前独立审查与必要复审完成后才执行最终交付命令，新版双指纹（`evidenceTree` 与 `qaArtifactsDigest`）均未变时既有同 tree 绿日志免除 VERIFICATION_BEFORE_REVIEW 重跑，仅 QA 产物变化报 `STALE_QA_ARTIFACTS`（旧包过早仍报 VERIFICATION_BEFORE_REVIEW）；gate-review-* 保存 qa-check review 输出；结果: PASS 只称机器校验通过，不证明独立来源、不判断证据语义、不构成交付授权，不替代独立审查与人工终审。
```

## 3. `implement-spec` —— 显式并行、合并回归与审查交接

在并发实现步骤中注入或更新项目段：

```text
慢车道由用户调用，按依赖图只对互不阻塞的工单并行，最多 2 个实现子代理，不自动指定模型。已有 _qa/scope.json 时不再 init。主 Agent 串行合并并逐次运行集成测试；合并遵循 Git 确认边界。Worktree 不隔离数据库、Redis、端口或上游额度，高耦合任务回退串行。核心链路验收由主编排 Agent inline 完成。随后在 integration 结果上按 qa-workflow 阶段 6 串联：先 collect（默认运行 `qa-preflight` 与 2s 预检）生成完整改动范围的审查包，再用 Skill 工具调用 code-review（参数写明特性目录与轮次），审查子代理的派发、编号与落盘规则只在该技能内，不要用 Agent 工具自行派审查子代理，双轴均达终态前冻结全部输入；两轴落盘后可用 `scaffold-report` 生成骨架，三档分流先分流再修，S-H、P-M、P-W 驳回须引 ADR 或契约；遇三类错误按契约路由：`REVIEWER_EDITABLE`（格式/行号错，同轮最多修正重试 seal 1 次）、`PACKAGE_INVALID`（候选/快照/失鲜包错，立即停止先重建包）、`INFRA_UNAVAILABLE`（配额/服务不可用，停在 WAITING_INFRA 保持待独立审查，不自动换模型或重派）；本次修或 S-H、P-M、P-W 改档后增量复审，自动上限 1 轮（r2，超限需 `--allow-manual-round` 人工授权），判改档不成立的改为本次修、不得再次改档，用尽仍有未修、修错或改档不成立时停在 WAITING_HUMAN，照常完成交付验证交人工裁决。拿不到两份子代理原文时保持待独立审查，不得凭空生成 review/ 原文或 review-report.md；宿主完全没有独立上下文能力时只交付审查包，不运行最终 qa-check review，由独立会话或人工接续。独立审查完成前不把 backlog、计划等文档写成完成态。阶段 7 若因交付命令失败修改代码或契约文档，必须回到阶段 6 复审并重跑受影响验收与全部交付命令；当前独立审查与必要复审完成后才执行最终交付命令，新版双指纹（`evidenceTree` 与 `qaArtifactsDigest`）均未变时既有同 tree 绿日志免除 VERIFICATION_BEFORE_REVIEW 重跑，仅 QA 产物变化报 `STALE_QA_ARTIFACTS`（旧包过早仍报 VERIFICATION_BEFORE_REVIEW）；gate-review-* 保存 qa-check review 输出；结果: PASS 只称机器校验通过，不证明独立来源、不判断证据语义、不构成交付授权，不替代独立审查与人工终审。
```

## 4. `to-tickets` —— 拆票后的下一步

在“发布工单后告知下一步”处注入：

```text
发布工单后报告当前已完成阶段 3A、车道（沿用当前车道，只写车道名）、本阶段产物（issues 目录与就绪工单）；建议下一步：/qa-test-planner，只写这一个命令。
```

## 5. `handoff` —— 工作区交接

在交接路径规范中注入或更新项目段：

```text
同机断点续接写入 .scratch/<feature>/handoff.md；写入前若同路径文件已存在，先按 YYYYMMDD-HHmmss 时间戳复制到同目录 history/ 历史快照，禁止覆写既有快照，连续两次交接必须保留两份独立历史快照且早期归因可读。处于 QA 工作流中时附 QA 续接快照：阶段与车道、最新 qa-check 与单测的实际命令、日志相对路径和原始结果行、审查轮次与待复审编号、_qa/scope.json 是否已 init；缺少任一项时不得宣称证据绑定完整，标记待补证据。跨人或跨机器交接写入 docs/handoff/<日期>-<slug>.md。只引用 spec、qa-plan、ADR 和 diff 路径，不复制大段正文，不写入 API Key、Token、Cookie 或个人隐私。
```

## 6. `code-review` —— QA 调用时的 diff 来源与原文落盘

`code-review` 已内聚为前后一致的单一中文指令（保留上游署名与 Fowler 坏味道基线），以下项目段描述 QA 工作流调用时的 diff 来源、原文落盘与审查边界；collect、三档分流、增量复审上限与交付由 qa-workflow 阶段 6–7 负责：

```markdown
QA 工作流在审查前不提交代码，因此由它调用本技能时替换 diff 来源与原文落盘方式：

- Standards 子代理的规范来源必须包含：根及改动所在子目录的 `CLAUDE.md`、`.claude/rules/` 下与改动相关的规则文件；改动 UI 时加 `DESIGN.md`，改动 QA 工作流自身时加 `docs/agents/qa-workflow.md`。`AGENTS.md` 是符号链接，不重复提供。
- 不得为满足字数限制省略、截断或合并编号发现。
- 审查子代理默认只读静态核对，不重跑测试套件、`typecheck`、`lint` 或启动服务；不得读取同轮另一轴原文，也不得跨特性读取其他 `.scratch/` 目录。
- 封存前必须定稿，禁止封存后删除 `.source.json` 重封；子代理报超时或 `no_final_message` 时先核对原文与凭据是否已匹配当前 nonce 与哈希，齐全一致即认领，不追问、不 `resume`。
- `r1` 必须双轴齐全；`r2` 审查包 `treeDigest` 未变且仅修改分流或轨迹文字时，只有存在待复核编号的轴需要产出最新轮原文。执行记录、绑定、日志或截图变化时 Spec 轴必须复审，过程脚本变化时 Standards 与 Spec 双轴必须复审；主代理在复审输入列明 QA 产物变化，检查器不猜测变化语义，由人工终审核对。双轴派发后至均到达终态前冻结全部输入，若 live 工作区偏离快照，允许基于快照完成 `seal` 留证并由 `qa-check` 判定为 `SUPERSEDED`。
- 固定点取 `.scratch/<feature>/_qa/scope.json` 的 `base`；commit 列表仍用 `git log <base>..HEAD --oneline`。
- diff 改用 QA 工作流事先 collect 生成的 `.scratch/<feature>/_qa/review-package.diff`（包含迁移 Rename 折叠与未跟踪文件；`r2` 默认配合 `_qa/review-brief.md` 与相邻快照机器生成的 `_qa/review-package-delta.diff`，并保留不可变全量快照 `_qa/round-snapshots/r<n>/` 按需回查），两个子代理的 diff 输入优先传对应简报/包路径，代替 `git diff <fixed-point>...HEAD`。
- `_qa/review-package.json` 中 `changedFiles` 为空且没有 `unreviewed` 时视为空 diff，按上文在启动子代理前结束。
- manifest 声明 specReviewChecklist 时，Spec 子代理另读 `_qa/spec-review-checklist.json`（及 v2 预填骨架 `_qa/spec-review-skeleton.md`）：v1 原文写 `## 对账覆盖` 五列表并逐字复制 actual；v2 使用四列表按分组 `reviewUnits` 仅响应 `required` / 失效单元，同哈希 `inherited` 与机检存量回归 `sampled` 不必逐行重写（存在常规项时补充 `## 抽检范围`）；全版本源码引用须命中当轮不可变快照目标行前后 ±5 行真实测试/断言谓词（禁止 `:1` 敷衍，兼容 `--executor` 驱动脚本），写已核实/未核实；计划变化判变更成立/不成立，未变化写不适用。VisualTarget 的语义区域和定位器必须与几何及截图一致。
- Standards 无发现只写实际覆盖，不逐文件/逐 hunk 重复；quota、无效模型别名、用户取消或无返回时按 `INFRA_UNAVAILABLE` 立即暂停，不自动换模型、不重派同轴同轮代理，保持待独立审查。`seal` 写凭据前同步校验编号、`FINDING_ID_COLLISION`、`--pending-ids` 与 Spec 对账：格式/行号错属 `REVIEWER_EDITABLE`（同轮最多修正重试 1 次 `seal`），候选/快照/失鲜包错属 `PACKAGE_INVALID`（审查者立即停止交主代理重建包）。
- 不读取、比较或提示模型差异；用户或宿主已配置子代理模型时照用，未配置时按宿主机制继承主会话模型。前台或后台不限。
- 每个子代理 prompt 写入两行：`QA_REVIEW_BINDING: .scratch/<feature>|r<n>|standards`（Spec 轴用 `spec`）与 `QA_REVIEW_NONCE: <nonce>`；nonce 与登记器计算好的 `nextIds` 均从 `_qa/review-challenge.json` 读取，使用仓库相对特性目录与实际轮次，不得省略、手写起始号或复用其他轮次。prompt 同时给出可复制执行的 seal 命令与宿主名。
- 审查子代理必须具备写文件与执行命令权限；只读探索型代理不得担任审查者（如 Kimi Code 的 `explore` profile 不能担任，需选可写的 `coder` 等 profile）。子代理把最终审查内容直接写入 `.scratch/<feature>/review/r<n>-standards.md` 或 `review/r<n>-spec-axis.md`（n 为轮次，首轮 1），再运行 `node tooling/scripts/review-package.mjs seal .scratch/<feature> --round r<n> --axis standards|spec --file review/r<n>-standards.md|review/r<n>-spec-axis.md --reviewer-kind subagent --host "<宿主名>"`（r2 起加 `--pending-ids "<编号,...>"`），让最终返回包含 seal 打印的 `QA_REVIEW_RECEIPT: <nonce>|<sha256>` 一行。
- 主代理可用 `review-package.mjs scaffold-report` 预生成骨架；主代理不转抄、不改写、不重算审查原文，先分流再修且不捆绑 `S-J` 可维护性建议。统一实行 challenge 单轨协议，不允许同轮原文纠偏，不得改原文或重算凭据；原文有问题时按真实返回保留、保持待独立审查，或按新轮次重新审查；缺或损坏 `_qa/review-challenge.json` 时 `qa-check` 阻断为 `MISSING_REVIEW_CHALLENGE`。
- review-report 的审查方式行仍以 `宿主=<宿主名>；` 开头作为说明（如 `审查方式：宿主=Claude Code；…`）。`qa-check` 统一按凭据与转录证据判定，不再依据该字段选择协议分支。
- 每轴每轮只派一个子代理，不重派替代子代理；返回被截断或不完整时保留已写入内容或按原样处理，在 review-report 审查方式行写明该轴不完整，该轮保持待独立审查，不得追问、续传或让子代理重写；某轴失败或没有返回时同样保持待独立审查，主代理不得代写原文或代 seal。
- 派发审查子代理前先选定具备写文件与执行命令权限的 profile；已派发的代理只读或无法执行 seal 时不重派替代代理，按外部会话或待独立审查处理，不增加主代理代写兜底。
- 无子代理的宿主（如 Codex）由用户手动另开独立会话或终端完成一轴审查，使用同一 challenge 与 nonce 运行 seal，`--reviewer-kind external-session`；主代理不得自动启动 `codex exec` 等无头审查者。外部会话是否真正独立由人工终审确认。
- 不得在原文中加头注、还原转义或做任何加工；需要说明的写进 review-report。
- Spec 子代理额外输入 `.scratch/<feature>/_qa/reconciliation.md` 与 `qa-plan.md` 执行记录证据列引用的 `screenshots/` 文件，brief 追加：「逐行核对对账表的实测值或绑定是否证明冻结断言：unit/integration 沿绑定查看叶子测试的实际断言，browser/api 查看过程脚本的硬断言，不能只看用例标题或 PASS 标记；若实现错误而谓词仍会通过，以 `[P-W<n>]` 报告并引用该行；只按冻结断言原文核对截图及其 VisualTarget：目标被替换成标题、状态卡或整页时以 `[P-W<n>]` 报告；同一目标仅取景不全时，沿用「脚本已硬断言、截图只是取景不全时不编号」并写正文；未核实项对应 spec 的 US 或冻结断言时，必须核实或以 `[P-M<n>]` 编号并写明未核实；对账表标注「响应注入」的行，断言涉及工具调用、质检、持久化、计费等服务端行为的以 `[P-W<n>]` 报告；特性触及核心链路却没有任何未标注「响应注入」的 browser 证据时以 `[P-M<n>]` 报告。」
- 每条发现以编号开头：Standards 轴 `[S-H<n>]` 硬违规（含可用性/无障碍/明文禁令与真实产品行为/生命周期/竞态缺陷）、`[S-J<n>]` 判断建议（视觉配方与可维护性重构，默认驳回不捆绑，不做前缀硬锁）；Spec 轴 `[P-M<n>]` 缺失或部分实现、`[P-W<n>]` 实现有误、`[P-X<n>]` 范围蔓延；同轴序号递增，复审新发现严格接续登记器 `nextIds`；一个编号只报一处问题，同类多处分别编号。已证实造成行为错误的问题报 `[P-W<n>]` 或 `[S-H<n>]`，不报 S-J；仅有潜在风险的不升级。与本特性无关的既有工作区状态不编号，只在正文提及。无发现时写「无发现」，「无发现」不带编号。S-J 只报有明确当前成本的问题。
- FindingId 新发现优先写成 Markdown 标题主编号（如 `## S-H1` 或 `## [S-H1]`），历史行首方括号定义继续兼容；标题中段和正文引用不登记、不占新号。复审时方括号编号引用可仅作为响应，无方括号正文提及不算响应。
- 复审（默认自动上限 1 轮 `r2`，超限停在 `WAITING_HUMAN` 或需 `--allow-manual-round` 授权）给子代理 `_qa/review-brief.md`、`_qa/review-package-delta.diff`、不可变全量快照基线（按需回查）、它自己的历次原文、spec、主代理列出的本轮修复改过的文件与 QA 产物变化，以及全部待复核编号与理由：上轮本次修编号，以及上一轮分流表中 S-H、P-M、P-W 类被驳回或转专项的编号与理由；Spec 子代理另给当前的 `screenshots/`；不给实现者的修复尝试记录。子代理对上轮每个本次修编号写 `[编号] 已修`、`[编号] 未修` 或 `[编号] 修错`，对每个给出的驳回或转专项编号核对理由引用的 ADR、契约或源码是否属实且支持该档位，写 `[编号] 改档成立` 或 `[编号] 改档不成立`；部分修复写未修，状态词后尽量不加限定语（残留或原因另起一句），新发现只针对本轮修复改过的文件。每个待复核编号都要在原文中写出；检查器只核对编号是否出现，状态以主代理的分流表为准，由人工终审对照原文核对。有 challenge 的新协议还要求子代理把收到的待复核编号原样写入 seal 的 `--pending-ids`，供 qa-check 在自述凭据路径提示复审输入是否完整。
- 审查期间不执行 `git add`、`git add -N`、commit、stash、reset 或 checkout。
```

## 7. `tdd` —— 复用已确认接缝

在技能末尾追加项目段：

```text
spec 的 Testing Decisions 与已冻结 qa-plan 的 Seam 视为已确认的 Seam，直接在其上写测试；只有找不到、与计划冲突或需要新增 Seam 时才停下确认，确认后在 qa-plan 的 ## 计划变更 记录。
```

## 8. `pr` —— 遗留事项

在 Evidence 段的项目约定后追加：

```text
走过 QA 工作流的 PR 在 Merge Danger 之后追加 ## 遗留事项：原样引用 node tooling/scripts/qa-check.mjs review 的结果行（未运行写“待独立审查”及原因），列出分流表中的待人工裁决编号与未验证项，没有则写“无”。
```

## 9. `docs/agents/issue-tracker.md` —— 跨人交接

若无 `## 跨人交接` 小节则追加：

```markdown
## 跨人交接

`.scratch/` 是单机工作区且被 `.gitignore` 排除——工单、spec、qa-plan、截图、执行记录均不出本机。跨人交接时：

- 正式载体为已入库的 `docs/handoff/<日期>-<slug>.md` 和 PR 描述，由交接方提炼关键决策、状态快照与验收证据，而非直接共享工作区；
- Epic 级特性需要共享看板时，在交接文档附工单清单与状态快照；
- 同机会话续接仍直接读写 `.scratch/`。
```

## 10. `diagnosing-bugs` —— 衔接修复轮红灯复现

在技能末尾追加项目定制段（上游升级时保留本节）：

```text
在 QA 工作流内修复已交付特性（QA Kind: fix）时，将 Phase 1 构造出的最小红灯复现命令经 node tooling/scripts/qa-run.mjs .scratch/<feature>-fix-<n> red-<标签> -- <命令> 落盘，并绑定到 qa-plan.md 对应 TC 的 ## 修复前复现 行；修复后用完全相同的命令参数再跑绿灯验证，确保红绿日志 argv 全等、红日志更早且代码树不同。
```

## 11. `resolving-merge-conflicts` —— 遵守提交确认边界

在技能末尾追加项目定制段（上游升级时保留本节）：

```text
遵守 .claude/rules/git-workflow.md 的提交与推送边界：完成冲突解决与自动化检查后，先向用户展示变更文件、检查结果与建议提交说明，须经用户确认后再执行 git add / git commit 或 git rebase --continue 提交；不得未经确认自动 commit 或 push。
```
