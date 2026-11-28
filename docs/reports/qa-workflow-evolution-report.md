# QA 工作流优化记录

> 生成时间：2026-11-05
> 最近更新：2026-11-28（补录真实慢车道复盘驱动的步骤 2 只读新鲜度预检与 WAITING_HUMAN 白名单 `1f6569f` 及其标准车道 dogfood 发布验收，以及步骤 3 零代码规则与提示收口 `d1f0ff5`，均已本地提交、尚未推送远端）
> 范围：2026-10-08 ~ 2026-11-28 之间以 QA 工作流为主体的 40 次已提交主仓优化（前 37 次已推送 `origin/master_newjob`，第 38–40 次本地已提交）；另记录通用仓同步提交 `d1fc362`
> 数据来源：git 提交历史、提交说明、`docs/adr/` 决策记录、两仓测试与发布 lint；各次真实运行的复盘材料位于本机 `.scratch/`（不入库，见 `docs/agents/issue-tracker.md`）
> 相关文件：正本 `docs/agents/qa-workflow.md`、参考书 `docs/agents/qa-workflow-guide.md`、检查器 `tooling/scripts/qa-check.mjs`（含 `tooling/scripts/qa-check/*.mjs` 六子模块）/ `qa-run.mjs` / `review-package.mjs` / `qa-spec-review.mjs` / `qa-preflight.mjs`、浏览器辅助 `tooling/scripts/qa-browser-helper.mjs`、基线统计 `docs/reports/qa-wf-02-baseline-2026-11-25.md`、契约测试 `tooling/scripts/__tests__/qa-workflow-contract.test.mjs`
> 本轮审计与收敛修复的详细记录：`docs/reports/2026-11-18-qa-workflow-audit-remediation.md`、`docs/plans/gemini4-2026-11-26-qa-workflow-v2.2-code-review-root-cause-and-optimization.md`

## 概览

截至 11-28，共 40 次已提交主仓优化（不含通用仓同步提交）。三个核心产物的规模变化：

| 产物 | 起点 | 现状（11-28） |
| --- | --- | --- |
| 正本 `qa-workflow.md` | 86 行（初版） | 178 行（已于 Phase 1 `OPT-15` 解除 180 行硬锁，保持紧凑清晰） |
| 检查器 `qa-check.mjs` | 0（10-25 随安装模板引入） | 薄入口 153 行 + `tooling/scripts/qa-check/` 6 个无环子模块（工具回归测试 `492/492` 全绿，0 失败 / 0 跳过） |
| QA 相关 ADR | 0 | 16 份：0023、0024、0026、0031、0033、0035、0040、0042、0043、0044、0047、0048、0054、0057、0065、0066 |

每次大改动几乎都源自一次真实运行暴露的问题，而不是预先设计：agent-kb-loop 暴露了审查闭环漏洞（ADR-0033/0035），KB-CHAT-CITE 与知识库预览修复暴露了证据造假路径（ADR-0026），agent-hitl-action 暴露了流程成本倒挂（ADR-0042），一次外部评价暴露了车道与宿主缺口（ADR-0043/0044），四次真实需求复盘又暴露了审查来源、事件时间与正文编号语义边界（ADR-0047 及 ADR-0040 修订），四特性复盘基线驱动了 v2.1 预检前置与防线闭环（ADR-0065），而 `.scratch/tools-workbench-ia-migration/` 的真实 239.6 分钟阶段 6 翻车复盘最终驱动了 v2.2 不可变快照、增量继承、基础设施治本、六模块拆分与 Phase 3 干净会话双对照发布验收（ADR-0066）。本记录按十二个阶段逐次说明。

## 阶段一：奠基与门禁（10-08 ~ 10-16，7 次）

### 1. `6179aee` 添加 Agent 技能规范和 QA 工作流文档（10-08）

- **解决什么**：仓库缺少成文的 Agent 协作规则，开发流程依赖模型自觉。
- **改动**：初版七阶段闭环（需求对齐 → 规格确立 → 任务拆解 → 编码实现 → 浏览器验收 → 代码审查 → 交付沉淀）；CLAUDE.md 增加 QA 默认执行准则（未对齐不写码、双轨规格联动、真实浏览器卡点、快慢车道）；定义 `.scratch/` 本地 issue tracker、分诊标签、领域文档规范。

### 2. `f30406b` 新增 QA 工作流全景实战指南（10-09）

- **解决什么**：正本只有规则没有用法，使用者不知道每个阶段实际怎么操作。
- **改动**：新增 `qa-workflow-guide.md`（阶段详解、避坑指南），新增工作流优化交接文档，明确后续优化方向。

### 3. `b1ab043` 吸收外部工作流对比结论（10-10）

- **解决什么**：初版流程只讲"要做什么"，缺"什么时候停"。
- **改动**：阶段 1 增加需求对齐止损线（不显著改变实现方向即可开工）；阶段 5 增加异步链路终态验收（提交成功不算 PASS，防无限轮询）；阶段 6/7 明确人工终审顺序（测试证据 → 高危雷达 → 不逐行深读）与发现三档分流；剪裁节增加流程自身的减法法则；新增 `prompt-shortcuts.md`。

### 4. `dc21935` 引入双轴代码审查硬门禁（10-12）

- **解决什么**：实现者自审自交，规范与需求无人对账。
- **改动**：中大型改动真机验收后、提交前必须触发 code-review 技能，完成 Standards 规范轴 + Spec 需求轴对账并出具三档分流结论后方可提交；CLAUDE.md 与正本同步审查流程与豁免条件。

### 5. `339f9dd` 流程六键优化、技能随库分发与跨项目 scaffold（10-13）

- **解决什么**：流程在真实运行中暴露的六类操作漏洞，以及流程资产无法跨项目复用。
- **改动**：工单按协作形态条件触发；阶段 5 环境三级自愈（探活、防伪绿锚点、后台拉起，禁止 kill 占用进程）；定位器就地校准护栏（只校准选择器、禁改断言）；`.scratch` 明确为单机工作区，跨人交接经入库的 `docs/handoff/`；`.claude/skills` 随库分发；新增 `setup-qa-workflow` 技能把整套流程模板化安装到其他项目。

### 6. `9a6801f` 重构全景实战指南与教学演练（10-15）

- **解决什么**：guide 与正本脱节、路径占位虚假、使用者无法自检掌握程度。
- **改动**：guide 增加 Matt Pocock 技能体系溯源与对比表、重构流程图、补阶段 4 三大实现范式与阶段 6 坏味道审查说明；handoff 技能交接落盘收敛；升级教学演练页面与互动测验。

### 7. `66d5ac3` 强制 ego-browser 可见窗口（10-16）

- **解决什么**：存在 Playwright MCP 工具时，Agent 擅自降级后台无头运行，真实浏览器门禁被架空（Schema Bias 漏洞）。
- **改动**：CLAUDE.md 与正本规定 macOS 桌面开发机必须且唯一首选 ego-browser 可见窗口；阶段 5 验收前必须命令行探活，未经探活直接调 Playwright 定义为严重流程违规。

## 阶段二：证据链、可移植与审查回归上游（10-25 ~ 10-27，7 次）

### 8. `b926686` code-review 技能增强并行子代理（10-25）

- **解决什么**：审查范围只覆盖已提交变更，未提交的工作区改动游离在审查之外。
- **改动**：基线确定逻辑改进，审查范围扩展到完整未提交交付变更；增强并行子代理处理与审查包构建。**BREAKING**：审查范围语义变化。创建 ADR-0023（证据契约、成本边界与无 Hook 实施策略）。

### 9. `ace1c80` 术语单源化、唯一后继与开工前审查快照（10-25，ADR-0024）

- **解决什么**：领域词汇散在 GLOSSARY 与 CONTEXT 两处漂移；阶段收口给多个并列建议，使用者迷失；`git diff HEAD` 无法区分开工前已存在的未提交改动与本任务改动。
- **改动**：术语默认只写 GLOSSARY.md；收口统一为"当前已完成阶段、车道及理由、本阶段产物、建议下一步"四件；新增 `review-package.mjs`，开工前快照隔离既有改动、零污染 Git index；qa-check 升级 Schema 2，校验审查包 manifest、diff 与 review-report 结构；落地 ADR-0024，补 35 项契约与流程测试。

### 10. `5ec28d4` 完善 QA 证据链与可移植工作流（10-26，ADR-0023/0026 落地）

- **解决什么**："Agent 自述通过"没有机器凭据；流程绑定本仓库无法移植。
- **改动**：新增 `qa-run.mjs`（不可覆盖的证据日志，带 tree 哈希与时间戳）；确立"不宣称模型或截图具有不可绕过的绝对保证"的定位；正本路线改为 init/add + TDD + qa-run 的证据链结构；qa-check、qa-run、review-package 三工具模板化，随 `setup-qa-workflow` 安装到任意项目；创建 ADR-0026（证据绑定与审查完整性）。

### 11. `1dbfbf4` 完善 QA 审查交接与完成语义（10-26）

- **解决什么**：collect、审查、最终交付的职责在 code-review 技能与 QA 工作流之间含糊，两端都以为对方在做。
- **改动**：明确"调用 /code-review → collect + 双轴 → review-report"的串联顺序；ADR-0026 补充：审查报告结构、实现者自查为 BLOCKED、审查来源按宿主能力核对、机器 PASS 只称"机器校验通过"。

### 12. `72866c1` 明确 code-review 纯审查边界（10-27）

- **解决什么**：上一步把"最终交付验证"写在了 code-review 名下，技能越界成总控。
- **改动**：阶段 7 收口改为"QA 工作流最终交付验证"，code-review 只返回两轴发现；契约测试锁定该边界。

### 13. `3fc3f76` 明确独立审查交接与合法暂停（10-27）

- **解决什么**：宿主没有独立上下文能力时流程卡死或造假；审查子代理被误算进"可选实现代理"的成本边界。
- **改动**：拿不到两份真实独立返回时保持"待独立审查"、只交付审查包、由独立会话或人工接续，不自动重试；CLAUDE.md 明确标准/慢车道的双轴审查子代理不属于可选实现代理。

### 14. `4711dd5` qa-workflow 流程大优化（10-27，ADR-0031）

- **解决什么**：前三天的碎片修正需要一次系统整合；同时历史复盘发现个人级技能会遮蔽项目流程技能（ADR-0031 背景），三份历史执行记录加载的都是个人版 code-review，项目定制审查从未生效。
- **改动**：阶段 3B 在 plan 通过后 init 建基线并冻结计划；阶段 6 改为 collect → 调用 code-review（上游双轴）→ 原文落盘 + 三档分流的纯路由；新增"只保证 Claude Code"与同名技能检测（BLOCKED）；tree 不一致 NOTE 按变化性质处置；明确 code-review 使用上游原文、项目定制段只换 diff 来源。创建 ADR-0031。

## 阶段三：Schema 4 与审查闭环（10-28，4 次）

### 15. `953ad60` Schema 4 证据绑定与增量复审（ADR-0033）

- **解决什么**：agent-kb-loop（Schema 4 上线后首个真实需求）复盘暴露：主代理用 Agent 工具自行派审查子代理、code-review 定制段从未加载、原文无编号、编号对账在空输入上静默放行、修复后沿用旧截图。
- **改动**：两轴子代理原文逐字落盘 `review/r<n>-*.md`，编号与三档分流表逐条对账；增量复审自动上限 2 轮，用尽报 `UNRESOLVED_FINDINGS` 交人工；browser/api 断言标记 `[TCxx-n] PASS 实测：`、unit/integration 用例绑定、acceptance 对账表；`scripts/` 静态扫描（绕过登录不可豁免 FAIL，页面内模拟输入只 NOTE）；审查包记录 packagedAt，代码未变时重复 collect 不让原文过期；门禁声明降为只在任务首轮与交付。创建 ADR-0033。

### 16. `9799fda` 审查闭环与修复验证（ADR-0035）

- **解决什么**：复审回放中仍发现原文被截断后追问重写、被主代理加注与还原转义、模型档位被宿主环境变量悄悄覆盖。
- **改动**：子代理只返回、主代理逐字落盘，每轴每轮一个子代理不重派；qa-check 新增 `REVIEW_RAW_UNNUMBERED`、`FIX_UNVERIFIED`、`RECONCILIATION_STALE`；分流表加验证证据列；脚本内登录扫描（密码字面量、登录注册接口、`window.__*` 登录方法）；转录核验 NOTE（原文未匹配、缺转录、缺 Skill 调用、模型不一致只提示）。创建 ADR-0035，部分取代 ADR-0033。

### 17. `da6a755` 分流表与原文一致性校验（10-28，ADR-0035 增强）

- **解决什么**：分流表状态由执行方自填，可能与审查原文结论背离。
- **改动**：分流表最终状态必须与原文最后一次状态词一致，否则 `UNRESOLVED_FINDINGS`；localStorage/sessionStorage 写入纳入模拟输入提示。

### 18. `e525b39` 统一快/标准/慢车道路线与单一建议下一步（10-28）

- **解决什么**：各技能收口给出并列多选建议，车道判定口径不一。
- **改动**：车道在阶段 1 裁决一次，三车道判定表与路线固定（标准：grill → spec → planner → implement；慢：加 to-tickets 与 implement-spec）；每个技能收口只写一个建议下一步；交接归 handoff，与车道无关。

## 阶段四：降噪、唯一状态源与契约防漂移（10-29 ~ 10-30，6 次）

### 19. `5ddd8bf` 规划器收口补开工前基线（10-29）

- **解决什么**：qa-test-planner 收口没有提醒 init 建基线，规划与冻结之间容易漏步；静态证据写法带反引号导致解析歧义。
- **改动**：规划收口写入"init 之前跑 baseline-* 基线"的完整提醒；静态证据写法统一。

### 20. `8a1e043` 审查包标注混入提交、开工前跑基线与技能精简（10-29）

- **解决什么**：白名单内文件被开工后的其他提交改动时，审查者不知情；交付命令到阶段 7 才第一次跑，红灯发现太晚；技能内容冗余膨胀。
- **改动**：collect 在 diff 包头标注被开工后提交改过的文件；plan 通过后、init 前用 qa-run 跑交付命令基线；code-review 一个编号只报一处；qa-test-planner 删除与 Schema 4 冲突的上游模板；阶段技能收口统一四件套；用词统一（分流"核对"、审查包、就绪工单）；根规则门禁字段合并。

### 21. `de33ecd` 驳回与转专项交由下一轮审查者复核（10-29）

- **解决什么**：执行方可以自己改档（把硬违规改成驳回）绕过修复，利益冲突；截图取景问题反复占用审查轮次。
- **改动**：S-H/P-M/P-W 的驳回与转专项由下一轮审查者复核，关闭执行方自行改档放行；截图纳入 Spec 轴审查输入，按冻结断言原文核对。

### 22. `212b3f4` 分流表为唯一状态源、响应注入标注与原子断言（ADR-0040）

- **解决什么**：机器解析审查原文状态词误判频发，并直接诱发主代理改写原文（ADR-0040 背景中的二次回放）。
- **改动**：删除原文状态词解析比对，分流表"处置状态"成为唯一流程状态源，review 输出只读的"原文核对"段交人工；识别过程脚本中的响应注入（`window.fetch` 赋值、路由拦截、MSW 等），对账表标注；真实链路冒烟、原子断言、S-J 默认驳回、P-X 撤回越界、可见性几何断言等写入正本。创建 ADR-0040，部分取代 ADR-0035 决策 4。

### 23. `469dcb9` 修正流程技能衔接矛盾并加契约测试（10-30）

- **解决什么**：多块文档间规则互相矛盾（驳回须引 ADR 的档位、implement-spec 缺工单行为、trigger 无效字段等）。
- **改动**：矛盾逐条对齐；契约测试新增 Schema 示例结构比对与上述约束，把"文档不漂移"交给机器。

### 24. `a63914c` 证据过期前置拦截与审查降噪（ADR-0042）

- **解决什么**：agent-hitl-action 复盘：实现 47 分钟，验收加三轮审查修复约 2.5 小时，主要成本来自流程本身——过期证据只给 NOTE 而被审查者人肉发现、截图取景拖三轮、原文被加工、「无发现」被当编号、S-J 噪声占表。
- **改动**：acceptance 对行为证据 tree 不一致报 `STALE_EVIDENCE`（BLOCKED），备注「不重跑：<理由>」可放行、理由为空仍阻塞；视觉断言以几何硬断言为准；计划变更不得新增呈现要求；「无发现」不编号；S-J 默认驳回不必进表；qa-run 拒绝误用；非 PASS 输出阻塞原因行。创建 ADR-0042，效果以下一次真实需求 dogfood 为证据。

## 阶段五：车道升级与宿主适配（10-31，1 次）

### 25. `820a87e` 车道升级、检查器宿主适用范围与工作区数据存储扫描（ADR-0043、ADR-0044）

- **解决什么**：一份外部工作流评价的核查结论——①车道在阶段 1 裁决后无升级出口，快车道判错的大改动可能不经双轴审查交付；②检查器写死 Claude Code 目录，在 Kimi Code 完成的审查上转录核验必然误报；③防作弊扫描名单不含工作区包，过程脚本可经 `@repo/db` 直连数据库。
- **改动**（19 个文件，+959/-30）：
  - 车道升级：实现中事实不符车道判定时 Agent 停下报告、用户确认后只升不降，补齐新车道阶段（含 `baseline-upgrade-*` 基线、在途改动 init 后 add、已提交改动附 `<起点>..HEAD` diff 等细则）；正本、implement、to-spec/to-tickets/qa-test-planner 收口与安装模板同步，"沿用阶段 1"改为"沿用当前车道"；新增 3 条聚合契约测试。
  - 宿主适配：审查方式行以 `宿主=<宿主名>` 声明，非 Claude Code 跳过转录核验并给人工核对 NOTE，未声明沿用原检查；同名检测提示补充跨宿主说明。取代 ADR-0031 §5，修订 ADR-0033 决策 4，创建 ADR-0044。
  - 工作区扫描：从 `pnpm-workspace.yaml` / `package.json` workspaces 推导 dependencies 直接含数据库驱动的包，包名、子路径、相对与绝对路径导入均不可豁免 FAIL。
- **验证**：216 项测试全量通过（含新增 qa-check-host-scan 20 条），eslint 0，40 条冻结断言全过，r1 双轴审查无发现。已知局限（经应用源码间接导入、命令行客户端）记入待办 `QA-WF-04`。

## 阶段六：真实需求复盘与来源核验（11-03 ~ 11-05，1 次）

### 26. `0f2bf82` 审查来源核验、事件时间与分流唯一缺陷清单（ADR-0047，修订 ADR-0035/0040）

- **解决什么**：ARCH-CK-03～06 四次真实需求复盘发现：审查原文与子代理返回失真仍可能机器 PASS；对账表漏 FAIL/BLOCKED 与计划变更后的旧断言；Shell 包装使真正脚本逃过响应注入标注；mtime 合理纠偏触发重跑和 `touch`；占位编号、示例编号与 Markdown 写法制造空复审。本次实施中又发现同一编号“先是示例、后是真实缺陷”会污染首次文本出现锚点，而为区分格式继续补规则违背 ADR-0040。
- **改动**（17 个审查文件，工具测试 266 项）：
  - 创建 ADR-0047：按特性、轮次、轴绑定真实最终返回，已定位失真阻断、同轮可逐字纠偏；完全不读取、比较或提示模型；用可靠事件时间取代 mtime；有限跟随 Shell 标准输入重定向与静态相对导入；对账表覆盖 PASS/FAIL/BLOCKED 并并列冻结与当前断言；可证伪性责任留在 planner 与既有 Spec 轴。
  - 经 r4 后盘问，撤回 `isFindingLine`、TC14-4、`FINDING_NOT_TRIAGED` 与默认驳回自动统计；分流表成为唯一缺陷清单，检查器只核对已列编号有原文依据，漏抄由人工终审对照两轴原文发现；复审轮次与修复事件时间改用既有轮次轨迹，避免示例污染。
  - 同步正本、安装模板、指南、GLOSSARY、ADR-0035/0040/0047、spec 与冻结计划；示例编号不再建档复审，真实缺陷漏复审和时间倒挂证据仍被拦截。
- **验证**：30 条冻结断言通过，266 项工具测试与 ESLint 全过；r1～r5 共 10 个独立 reviewer，r5 判 P-W4 已修且无新发现；最终 `qa-check review` PASS。已知边界：Kimi Code 审查来源需按审查方式行人工核对，干净会话真实 `/implement` dogfood 仍待发布验收。

## 阶段七：宿主无关的审查来源凭据（11-09，1 次）

### 27. 审查来源凭据、强弱档分级与跨宿主交接（ADR-0048，待发布验收）

- **解决什么**：ADR-0047 的强核验只认识 Claude Code 私有转录，Kimi Code 等其他宿主只能得到人工 NOTE；主代理逐字转抄子代理返回又是已证实的失真来源。逐宿主增加转录适配器会持续扩大维护面，也覆盖不了 Codex 这类无子代理宿主。
- **改动**（审查包 19 个变更文件，含新增 ADR-0048）：
  - `review-package collect` 发放一次性 `_qa/review-challenge.json`，以 nonce 绑定特性、轮次、轴与审查包，并记录 treeDigest、packagedAt；再次 collect 更换 nonce，challenge 与 manifest 两项摘要在 seal、qa-check 两侧都校验。
  - 审查者自写 `review/r<n>-<axis>.md`，通过 `review-package seal` 生成同名 `.source.json`；凭据只含路径、宿主、哈希、事件时间等元数据，不含正文、模型或密钥，拒绝覆盖已有凭据；复审按输入顺序保存 pendingIds。新协议取消同轮原文纠偏，主代理不转抄、不改写、不代 seal。
  - `qa-check` 按产物分级：同 nonce 的 Claude 转录与哈希行一致为「转录（强）」，只有内部一致的凭据为「自述凭据（弱）」，两者都没有为「未核验（人工）」。哈希或结构矛盾 FAIL，nonce 过期 BLOCKED，凭据缺失、格式错误、自述时间早于 collect 只给 NOTE；弱档不新增 PASS-WEAK，机器 PASS 仍只表示结构与门禁校验通过。
  - 审查者必须具备写文件与执行命令权限；只读代理不能担任审查者。无子代理宿主由用户手动启动独立会话或终端，以 `external-session` 使用同一 nonce；主代理不得自动启动无头审查者。无 challenge 的旧轮次继续 Claude 全等比对与其他宿主人工 NOTE。
  - 正本、指南、根门禁、code-review 技能、GLOSSARY、安装模板与工具脚本同步；guide 开工前已有的几何断言、车道升级等在途改动按 spec 保留，不与本特性混为新增范围。
- **审查与追加修复**：
  - Claude Code r1 双轴共 29 条编号发现；含 r2 新增 P-W4 在内共 20 项本次修均已修，P-W1、P-W3、P-M5、P-X1 四项驳回经 r2 判改档成立，P-M2（Kimi 弱档真机）转专项。r2 发现单轴原文触发的 `INVALID_INPUT`，补双轴守卫后由 r3 判已修且无新发现；r1 真机还暴露带缩进/反引号的绑定行误降档，已补解析与回归测试。
  - 随后的 Kimi 主会话直接审查发现：非法 pendingIds 类型使弱档复审抛 `TypeError`（P-W5）；强档被额外依赖于 `.source.json` 有效（P-W6）；manifest 双字段负向证据各缺一半（P-M13）；TC01-1 绑定测试未实际使用冻结文字指定的 r2（P-M14）。
  - 经逐项拷问确认四项本次修：非法 pendingIds 整份判 malformed 并 NOTE；完整强转录不再受凭据缺失/malformed 影响，nonce 过期与哈希矛盾仍分别 BLOCKED/FAIL；seal 与 qa-check 均补齐 treeDigest、packagedAt 负向测试；TC01-1 真实覆盖 r2 并保留显式 r1。两项实现修复均先红后绿，最终主会话复核无新增发现；这些直接审查不冒充独立审查凭据。
- **设计边界与终审要点**：方案只防疏忽、不防对抗；弱档是自述证据，强档是 nonce + 哈希行而非全文重复，均不证明作者或独立性。nonce 不做会话 ID 级绑定，QA-WF-06 保持「已实现、待人工终审」。不做宿主转录适配器、HMAC/签名、防篡改、模型记录或自动无头审查；r2/r3 未重复调用 Skill 的 NOTE 不影响已有强转录证据。
- **验证**：追加修复后的 `final4-tooling-tests.log` 为 309 pass / 0 fail，`final4-tooling-eslint.log` 为 exit 0，42 条冻结断言 acceptance PASS，工具脚本与安装模板逐字一致；浏览器验收因不触 UI 与核心链路而豁免。Claude r1～r3 审查已完成，既有最终 r3 机器校验为 PASS、来源核验为转录强档。
- **当前状态**：本次提交包含上述改动，未 push；追加修复后的 r4 审查包已生成，但正式独立复审、Kimi Code 弱档真机 dogfood 与人工终审仍未完成，特性保持「待发布验收」。Codex 已有 external-session fixture 与文档验证，真机未执行。接力与产物入口为 `.scratch/qa-review-source-receipt/handoff.md`、`review-report.md` 和 `_qa/reconciliation.md`。

## 阶段八：减负、浏览器分流与通用性校准（11-17，主仓 1 次 + 通用仓 1 次）

### 28. ADR-0054 与人工审查通用性修复（主仓 `825d021` / 通用仓 `d1fc362`）

- **解决什么**：C1、C3、C6、C7 的真实闭环记录显示，说明文档连坐全量重跑、纯证据轮双轴陪跑、审查者重复执行测试、流程自检写成元用例、浏览器工具硬绑定与检查器误报，已使流程成本高于实际缺陷成本。随后的人工审查又发现：原生 Playwright 示例无法从 `.scratch/` 解析依赖，注释剥离会吞掉 JS 私有字段，浏览器 Helper 可绕过几何断言，中文 `code-review` 丢失普通审查路径，且存在前后台、宿主优先级与图像工具名冲突。
- **主要改动**（主仓 29 个文件，+1518/-244）：
  1. **双树与交付去重**：审查包树继续包含全部文档，行为证据树只豁免根 `GLOSSARY.md`、`CONTEXT.md`、各目录 `README.md`、`docs/adr/` 与 `docs/features/`；其他 Markdown 默认计入，避免运行时内容漏判。最终交付命令收敛到阶段 7，阶段 3B 基线与阶段 4 TDD 红绿证据不变；阶段 7 修码必须回阶段 6。
  2. **增量复审与来源降噪**：`r1` 保持双轴，`r2+` 仅在代码与实质审查输入未变时复用旧轴；执行记录、绑定、日志或截图变化由 Spec 复审，过程脚本变化仍双轴。审查者默认只读静态核对，支持 `no_final_message` 磁盘凭据认领；非 Claude 新协议跳过 Claude 转录扫描。
  3. **计划与分流边界**：`feature` 仅免修复前复现日志，TDD 红灯要求不削弱；禁止工作流元用例；默认驳回的 S-J 不进三档表，但须在 `## 默认驳回` 中列出编号与原文位置。
  4. **浏览器主链路可执行**：阶段 5 默认 1–3 条核心真实浏览器主链路与关键视口，先服从宿主工具优先级，再按登录态与人工接管需求分流 Playwright / `ego-browser`。根 `package.json` 新增 `playwright@^1.61.1` 直接开发依赖，锁文件只保留对应 importer；`dev-port` 增加首个 Next.js JS chunk 探活。
  5. **检查器精确修复**：密码正则不再误伤 `PASS_LABEL`；闭环编号不再反复要求复审；截图增加内容 SHA-256 去重；注释按扩展名分流，Python 保留 `#` 注释、JS 私有字段保留；`inPageSegment` 跳过字符串、注释与正则内部括号。
  6. **Helper 与技能通用性**：`captureMobileGeometry` 的 `assert` 改为必填并等待异步结果，缺失或拒绝均不截图且正确复位。`code-review` 内聚为中文，但普通审查保留用户固定点和 `git diff <fixed-point>...HEAD`，仅 QA 调用使用审查包、nonce、seal 与复审协议，前后台按宿主约束。
  7. **复盘与同步**：`/retro` 按全部关联产物时间检索会话，并用宿主图像读取工具抽查截图和过程脚本；ADR、正本、指南、技能、安装模板与工具实现同步更新。
- **通用仓同步边界**：`/Users/weixiaoyu/Desktop/practice/qa-workflow` 只修改 7 个文件，同步根级 Playwright 依赖前置检测、宿主优先级、普通/QA 审查路径兼容、前后台冲突修复与契约测试；不整批移植 ADR-0054，不引入宿主项目路径或修改宿主 `package.json`。发布 lint 跳过 `.workbuddy/` 本地状态目录，原记录未改动。
- **验证**：多组新增行为均先红后绿，含 Playwright 根级解析、JS 私有字段与 Python 注释分流、必填异步几何断言、普通/QA 审查双路径及跨宿主文档契约。最终 `final5-test.log` 为 **336 pass / 0 fail**，`final5-lint.log` 为 exit 0；当前仓 `qa-check plan` 与 `acceptance` 均 PASS，覆盖 TC01–TC09；真实 Playwright ESM 导入及 `chromium.launch` 检查通过。通用仓 **294 pass / 0 fail**，发布 lint PASS（20 个技能、96 个文本文件）。两仓 `git diff --check` 均通过，三个核心脚本与安装模板逐字一致。
- **提交与状态**：主仓提交为 `825d021 feat(qa): 优化工作流证据与浏览器验收`，通用仓提交为 `d1fc362 fix(qa): 提升浏览器依赖与审查兼容性`，均未 push。r1/r2 的七项既有发现已复核修复；后续按用户明确要求改为人工审查、跳过 r3 双轴并直接提交，因此未运行最终 `qa-check review`，独立复审、干净会话真实 `/implement` dogfood 与发布验收仍待完成。无关未跟踪文件与目录未纳入提交。

## 阶段九：C8/C9 语义证据与收口硬化（11-18，ADR-0057，在途）

### 29. Spec 对账覆盖、VisualTarget 与 GateEvidence（待独立审查）

- **真实证据**：C8 最终日志全绿且两轴“无发现”，Spec 原文却引用未进入审查包的 schema/迁移、不存在的 hook、错误 SSE 和另一套 TC 映射；C9 实际为 70 PASS + 4 BLOCKED，原文却写 76 PASS，并把可观察的 RRF 融合结果断言替换为向量召回。两次任务还将结果区/助手消息/对比区域的几何目标缩小为标题或状态卡。C9 的 `No projects matched` 基线 exit 0，两次最终命令均早于独立审查完成。
- **改动**：Schema 4 新计划声明 `QA Review Coverage: 1`；acceptance 生成版本化 SpecReviewChecklist，新 manifest 启用 `## 对账覆盖` 机械完整性、逐字绑定、真实源码位置与计划变更复核，旧包兼容。新增零依赖 `qa-spec-review.mjs` 并随安装器分发。
- **视觉与基线**：Helper 以显式 VisualTarget 绑定 probe、几何硬断言与裁剪矩形，移动视口统一复位；qa-run/qa-check 将空项目、无测试文件和 0 项测试的 exit 0 转为空证据失败；Schema 4 init 对当前/base 均不存在的路径要求 `## 计划新建路径`。
- **收口**：新协议交付日志不得早于当前双轴最晚 completedAt；plan/acceptance/review 经 qa-run 以 `gate-*` 落盘。Standards 无发现降噪，基础设施失败不自动换模型或同轮重派。
- **边界**：不升级 Schema 5，不新增 Hook、HMAC、语义正则裁判或实现代理；不修改 C8/C9 历史正文。结构化覆盖只能防漏行、错绑定和假引用，不能证明审查者语义判断正确。
- **验证与状态**：新增纯函数、真实 CLI、Helper 失败安全和真实 Playwright 目标裁剪证据；最终全量交付、独立双轴、人工终审及下一次干净会话 `/implement` dogfood 分开记录，未完成前保持待审查/待发布验收，不宣称节时收益。

### 30. 双模型审查与安装契约收敛（11-18，ADR-0057 后续）

- **审查输入**：C8/C9 两份真实 `retro-evidence`；r1 双轴由 GPT-5.6-terra（Standards）与 DeepSeek 4.1（Spec）独立完成并封存。Standards 无发现；Spec 报 TC07-5、TC02-7 两项回归保护缺口。
- **交叉质询**：Terra 证伪两项 P-M，确认属于“当前行为正确、未来回归可能静默通过”的测试保护问题；DeepSeek 反查 Standards 无发现，确认安装器与 README 的工具索引漂移，并指出 `pnpm qa:check` 与 gate 日志 argv 形状不一致。
- **修复**：新增 `templates/qa-browser-helper.mjs` 并纳入五脚本逐字同步；README 补 `qa-spec-review.mjs`、`captureTargetGeometry` 与 gate 直调说明；流程模板改为“helper 提供时使用，未提供时按同一契约自写”；新增 TC02-10、TC07-5 正向保护；修正 ADR-0057 决策 10 与 qa-plan 过期计数。
- **验证**：361/361 工具测试、69/69 文档契约、ESLint exit 0、acceptance PASS、真实 Chrome TC09 4/4、五个脚本与模板 `cmp` 全部一致；证据见 `impl-full-tooling-tests-audit.log`、`gate-acceptance-audit-2.log`、`tc09-visual-target-audit.log`。
- **状态**：r2 Spec 轴封存 `[P-M1] 已修`、`[P-M2] 已修`，TC07-5 判“变更成立”；按用户指令未再派 r2 Standards 子代理，主代理直接审查仅修正文档，不构成独立凭据。`qa-check review` 仍因 `REVIEW_RAW_MISSING`、`STALE_REVIEW_PACKAGE`、`MISSING_REVIEW_REPORT` 与 `MISSING_VERIFICATION` 阻塞；详细审计记录见 `docs/reports/2026-11-18-qa-workflow-audit-remediation.md`。

## 阶段十：双报告联合审计硬化与双栈闭环（11-22，2 次）

> 来源：结合主仓 Swarm 四路深度审计与外部独立仓审计报告，经源码逐项复核去伪存真与 7 轮 `/grill-me` 决策收敛，按标准车道分 **Phase 1（P0 止血）** 与 **Phase 2（P1 双栈/解析器/技能闭环）** 两批串行落地；P2 拆单体与 `QA-WF-07` 文档精简继续按 `docs/plans/qa-workflow-backlog.md` 暂缓至真实业务 dogfood 后推进。

### 31. `e4e9c0d` Phase 1：清理含凭据遗留脚本并修复门禁引擎与规则 P0 缺陷（11-22）

- **解决什么**：主仓仍跟踪 6 个含明文账号密码与真实 `refresh_token` 的早期一次性验收脚本；本地存储认证键扫描漏掉本项目 Zustand 认证键 `ai-app-auth`；r2+ 单轴复用时仍用当前轮 challenge 匹配复用轴转录导致「转录（强）」静默降级；`transcriptTimes` 未校验同 `binding` 唯一性存在覆盖风险；`bindingNamedBy` 依赖 Node 22.5+ 专有 `path.posix.matchesGlob` 破坏跨版本可移植；`setup-qa-workflow` 将 `triage-labels.md` 写死为必选造成初始化死锁；`qa-workflow-guide.md` 错标 `retro` 且漏列 `/to-tickets`；`qa-check.mjs` 提示残留不存在的 `qa:run`，`.claude/rules/` 残留不存在的 `security-reviewer` 智能体、未使用语言扩展名与错误大小写 `Agents.md`。
- **主要改动**（14 个文件，+314/-759，特性目录 `.scratch/qa-workflow-p0-hardening/`）：
  1. **安全清理（OPT-01）**：从仓库移除 6 个含明文凭据的历史验收脚本（不重写 Git 历史、不动 `.scratch/` 历史审计快照，凭据轮换列为人工安全动作）。
  2. **引擎止血与模板同步（OPT-02/03/04/05/08）**：`AUTH_BYPASS_PATTERNS` 本地存储键名扫描扩展至 `(?:token|auth|session)`；新增 `axisTranscriptTarget` 集中收口单轴转录核验上下文（复用轴按旧轮 `round`/`nonce` 核对且不被刷新后的当轮 `collect` 时间误杀）；`transcriptTimes` 按 `binding` 唯一性计数保护并回退 `.source.json`；新增零依赖 `matchPosixGlob` 替换 `path.posix.matchesGlob`；3 处 `qa:run` 提示改为 `node tooling/scripts/qa-run.mjs`；逐字同步 `templates/qa-check.mjs`。
  3. **死锁解除与文档/规则对齐（OPT-06/07/08）**：`setup-qa-workflow/SKILL.md` 将 `triage-labels.md` 改为仅安装 `triage` 时必选；尊重既有契约测试保持 `qa-test-planner` 允许模型调用，修正 `qa-workflow-guide.md` 人工独占表补入 `/to-tickets` 与 `/retro`；清理 `.claude/rules/security.md` 与 `git-workflow.md` 模板残留。
- **验证与审查**：先红后绿新增 8 条回归与契约测试（`369/369` 全绿，`delivery-01.log`）；Antigravity 宿主下完成 r1/r2 两轮独立子代理双轴审查（r1 捕获并闭环 `[S-J1]` 与 `[P-M1]`，r2 双轴零新发现）；`gate-review-01` 机器校验 `PASS`（来源核验：自述凭据（弱）），经人工终审确认后本地提交 `e4e9c0d`。

### 32. `9b51c32` Phase 2：浏览器双栈兼容、解析器词法加固与技能生态闭环（11-22）

- **解决什么**：`qa-browser-helper.mjs` 的 `captureMobileGeometry` 直接调用 `ego-browser` 专有 `page.cdp`，Playwright 侧无法复用；`splitMarkdownRow` 未支持转义 `\|` 与 `qa-spec-review.mjs` 实现分裂；`importedSpecifiers` 逐行扫描可被跨行动态 `import()`/`require()` 绕过；`pnpm-workspace.yaml` 解析不支持行尾 `#` 注释、多级 glob 与 `!` 排除项；`stripComments` 缺少 Python 三引号与 JS 模板字符串 `${...}` 嵌套注释/引号处理；`r4+` 超上限无提醒且 `WORKFLOW_SKILLS` 遗漏闭环技能；部分技能存在衔接与红线张力（`diagnosing-bugs`、`resolving-merge-conflicts`、`deploy-prod`、`ask-matt`、`to-tickets`、`code-review`）及 `docs/teach/qa-workflow/GLOSSARY.md` 残留 `CONTEXT.md` 旧口径。
- **主要改动**（17 个文件，+852/-132，特性目录 `.scratch/qa-workflow-p1-ergonomics/`）：
  1. **浏览器双栈兼容（OPT-09）**：`captureMobileGeometry` 按能力探测同时兼容 `ego-browser`（CDP）与原生 Playwright（`setViewportSize` + `viewportSize` 在成功与异常 `finally` 复位），均不支持时抛 `TypeError`；按决策维持 ADR-0054 简洁边界，暂不引入 `storageState`。
  2. **解析器加固与并发（OPT-11a~d）**：`qa-spec-review.mjs` 统一导出支持转义 `\|` 的 `splitMarkdownRow` 供 `qa-check.mjs` 复用；`importedSpecifiers` 改为全文匹配静态导入并复用 `maskStringLiterals` + `inPageSegmentEnd` 提取动态 `import(...)`/`require(...)` 括号参数（兼顾跨行与 `require(path.join(...))`）；`workspacePatterns` / `expandWorkspacePatterns` 支持行尾 `#` 注释、多级 glob、`!` 前缀/通配排除项与 `Promise.all` 并发目录扫描；抽取单一 `scanJsSegment` / `scanTemplateLiteral` 统一 JS 词法单次扫描，并为 Python 补齐三引号保护。
  3. **超上限提醒与技能闭环（OPT-12/13）**：`r4+` 轮次输出超自动复审上限强 `NOTE`（不新增硬阻断）；`WORKFLOW_SKILLS` 补全 `grill-me`、`domain-modeling`、`codebase-design`、`setup-qa-workflow`；`diagnosing-bugs` 与 `resolving-merge-conflicts` 尾部追加项目定制并同步 `templates/skill-customizations.md`；`deploy-prod` 预检增加终审状态核对；`ask-matt` 清理 3 个不存在上游技能并补列本仓核心技能；`to-tickets`/`code-review` 补齐上游升级保留标记；修正 `docs/teach/qa-workflow/GLOSSARY.md` 为 `GLOSSARY.md`；全部 5 个核心脚本与安装模板保持逐字节一致。
- **验证与审查**：先红后绿新增 12 条回归与契约测试，全套交付单测 `381/381` 全绿（`delivery-02.log`）；Antigravity 宿主下完成 r1/r2/r3 三轮独立子代理双轴审查（r1 捕获并闭环 `[S-H1]`、`[S-J1]`、`[P-W1]`、`[P-W2]`；`delivery-01` 暴露 `TC08-1` 路径拼接回归后修复并经 r3 双轴零发现闭环）；`gate-review-01` 机器校验 `PASS`（来源核验：自述凭据（弱）），经人工终审确认后提交。本阶段仅优化工具与技能，不冒充 `QA-WF-01` 干净会话业务核心链路 dogfood，发布验收债仍由下一次真实业务需求关闭。

## 阶段十一：真实业务复盘驱动的 v2.1 审查降负与防线闭环（11-25，ADR-0065）

### 33. `1b31f11` v2.1 Batch 1：静态预检前置、`seal` 同步阻断、v2 必审对账、双指纹与 0 子代理硬拦截（已随阶段十二 Phase 3 完成发布验收）

- **解决什么**：聚合四份真实业务试跑（`agent-eval-benchmark-dashboard`、`agent-runtime-resilience`、`agent-runtime-resilience-delivery-closure`、`mcp-integration-governance`）完成只读基线统计（`QA-WF-02`，见 `docs/reports/qa-wf-02-baseline-2026-11-25.md`：14 条唯一编号、40 处 `:1` 引用、1 处 `check(true)` 伪断言、170 条 `SPEC_REVIEW_SOURCE_INVALID`、113 条 `SPEC_PLAN_CHANGE_REVIEW_MISSING`、25 条 `VERIFICATION_BEFORE_REVIEW` 等），并经独立对抗审查与 5 轮 `/grill-me` 决策收敛（`docs/plans/2026-11-25-qa-workflow-v2-first-principles-redesign.md`、`docs/plans/2026-11-25-qa-workflow-v2-adversarial-review-and-ablation.md`），识别阶段 6 四类根因：① **计算与认知错配**：`mcp` 70 文件全量双轴 47.2m 仅抓出 3 处可 1 秒机检的样式与英文注释 S-H，且因漏改单行按钮 `h-10` 用尽 r3 上限；`closure` 出现 `check(true)` 伪断言；② **全量手抄表反噬与 `:1` 漏洞**：`mcp` r1 Spec 抄写 106 行五列表耗尽 70.0m / 282 次调用并在后半段幻觉；`eval` `r4-spec-axis.md` 40 行全填 `:1` 且 0 工作流子代理自签却 `PASS`；③ **先封存再检格式与四处机械误报**：「无新增审查发现」未命中 `hasNoFinding`、`.scratch/<feature>/` 前缀未剥离、只读诊断采集误报 `SYNTHETIC_INPUT`、`sh -c` 包装致命令不匹配；④ **`.scratch/` 盲区死锁**：`evidenceTree` 忽略 `.scratch/` 迫使审后无差别重跑全部交付命令，在 `resilience` 触发动态日志字符数漂移死锁。
- **主要改动**（创建 `ADR-0065` 修订并局部取代 `ADR-0057`，特性目录 `.scratch/qa-workflow-v2-batch1/`）：
  1. **1 秒本地静态预检（`tooling/scripts/qa-preflight.mjs`）**：在阶段 4 收尾与 `review-package collect` 默认执行（支持 `--skip-preflight` 应急与 `--strict`）：ERROR 级拦截 `scripts/` 字面永真伪断言（`check(true)`/`assert(true)`/`assert.ok(true)`/`expect(true).toBe(true)`/缺非零退出）及 `spec.md`/`qa-plan.md` 交付命令不一致或空操作占位；WARN 级提示 Diff 纯英文注释（剥离字符串字面量）、非 `DESIGN.md` 白名单十六进制色值（跳过单行注释）与同文件交互按钮 `<44px`（跨行 JSX 开标签追踪）全量行号。明确仅清场静态违规，不替代 Spec 语义与人工终审。
  2. **封存前同步校验、误报修复与 0 子代理硬拦截**：共享校验逻辑全部收敛至 `tooling/scripts/qa-spec-review.mjs` 供 `review-package.mjs seal` 在生成 `.source.json` 前同步阻断，消灭纯格式废轮；修复 `hasNoFinding` 中文否定变体、路径前缀归一化、`SYNTHETIC_INPUT` 放行只读诊断采集（含挂点初始化、`push` 与只读属性读取）及 `qa-run --script <path>`（仅截获前导入口参数，不劫持普通命令自带的 `--script`）；在 Claude Code 主会话目录可读且存在本项目主会话转录时，若未复用轴自称 Claude `subagent` 却既无 `code-review` 调用又无未复用轴同 nonce 子代理转录，升级为 `BLOCKED`（`REVIEW_PROVENANCE_UNVERIFIED`），对外部宿主与 `external-session` 保持零误伤。
  3. **`QA Review Coverage: 2` 分级对账与封堵 `:1`**：兼容 `v1` 五列表；`v2` 清单按 `changed=true`、`browser`/`api`、`status≠PASS` 或 `Priority=P0` 自动标注 `required` 必审行并由 `acceptance` 生成预填骨架 `_qa/spec-review-skeleton.md`，Spec 原文改为四列表仅核对必审项，存在常规通过项时要求真实填写 `## 抽检范围`（禁止空标题或保留骨架 `<请写出...>` 占位符）；全版本 `citationIsValid` 要求引用目标行前后 `±5` 行窗口（排除 `import` 与注释）命中真实测试或断言谓词及非零退出分支，彻底拦下 `:1` 敷衍。
  4. **`qaArtifactsDigest` 双指纹新鲜度与免重跑**：`review-package.json` 新增 `qaArtifactsDigest`（哈希 `scripts/`、`screenshots/` 与剔除 `## 交付验证` 段的 `qa-plan.md`）；仅 QA 产物变化报 `STALE_QA_ARTIFACTS`（`BLOCKED`）；新版 `evidenceTree` 与 `qaArtifactsDigest` 双指纹均未变时，既有同 tree、`exit 0` 且不早于基线的交付日志免除 `VERIFICATION_BEFORE_REVIEW` 重跑（不绕过门禁日志与人工时序提示）。
  5. **文档与模板同步**：更新正本（179 行 `<= 180`）、指南、`code-review` / `qa-test-planner` / `implement` / `setup-qa-workflow` 技能、`tooling/scripts/README.md`、`skill-customizations.md` 及安装模板 `qa-workflow.md`（180 行）与五个核心工具脚本，并保持与模板逐字节一致。
- **否决与暂缓边界**：明确否决「主代理高危快审制度化」与「429 自动续传」；将单轴分级豁免（`Level A/B/C`）、`OPT-10` Playwright `storageState`、`qa-browser-helper.mjs` DPR/原生截图修复、大特性拆审与 `/handoff` 版本化留待 Batch 2 / 专项 ADR 推进。
- **审查闭环与亲自复审补强**：
  - 标准车道内经 TDD 先红后绿完成 r1–r3 独立双轴审查闭环（r1 捕获并修复 `[S-H1]`、`[S-J1~S-J3]`、`[P-W1]`、`[P-W2]`，`[S-J4]` 默认驳回；r2 复核 `TC03-2`；r3 双轴判已修且无新发现；`gate-review-2` 机器校验 `PASS`，来源核验：自述凭据（弱））。
  - r3 后规划模型亲自对全部改动做拉网复审，进一步查出并补齐 7 项边界与索引漂移（`qa-run --script` 防误劫持、`qa-spec-review` 中文否定/`process.exitCode = 0` 正则回溯/`## 抽检范围` 防空标题绕过、`qa-check` 单轴复用防逃逸与诊断只读属性放行、`qa-preflight` 永真字面/注释色值/`extractOpeningTagWindow` 跨行按钮窗口，以及 `README.md`、`qa-workflow-guide.md`、`implement/SKILL.md` 与 `skill-customizations.md` 索引同步），补充对应回归测试至全量 **398/398 通过（fail 0）**、ESLint 通过、`qa-preflight` 0 ERROR / 0 WARN、模板与工具逐字节一致（本地提交 `1b31f11`；发布验收已于阶段十二 `v2.2` Phase 3 双对照 dogfood 一并闭环）。

## 阶段十二：真实事故驱动的 v2.2 治本闭环、单体拆分与 Phase 3 双对照发布验收（11-26，ADR-0066，4 次主仓提交）

> 来源：首个 `v2.1` 真实业务标准车道试跑（`.scratch/tools-workbench-ia-migration/`）发生 239.6 分钟阶段 6 耗时倒挂与 Spec 三轮 `seal` 失败，经一手源码与 11 份子代理 JSONL 深度复盘、融合 Kimi 对抗审查并经 8 轮 `/grill-me` 锁板，按 **Step 0（隔离封存 `b8da019`）→ Phase 1（`07ef09d`）→ Phase 2（`d463e90`）→ Phase 2.5（`9be2aa9`）→ Phase 3（双对照发布验收）** 串行收口。

### 34. `07ef09d` v2.2 Phase 1：不可变审查快照、冻结屏障、错误路由、`Coverage: 2` 增量继承、Rename 折叠与 `OPT-15`/`QA-WF-07`（11-26，ADR-0066）

- **解决什么**：根治审查中工作区三轮踩脏、`SCRIPT_DIR + BROWSER_SCRIPT` 变量闭包解析缺口致 Spec 三轮 `seal` 100% 失败、`Coverage v2` 退化 40/40 全必审与 r2 全量重填、577 KB 搬家 Diff 膨胀、`P-M5` 跨轮撞号、`DESIGN.md` 规范红线与视觉配方混为一谈、r3 上限与 `BLOCKED` 终态矛盾，以及 `qa-workflow.md` 180 行硬锁与 `CLAUDE.md` 臃肿。
- **主要改动**（新建 `ADR-0066` 修订 `ADR-0033`/`0054`/`0065`，特性目录 `.scratch/qa-workflow-v2-2-phase1/`）：
  1. **轻量不可变快照与冻结屏障（`P0-1`）**：`review-package collect` 生成 `_qa/round-snapshots/r<n>/` 与 SHA-256 `manifest.json`，`seal` 基于快照校验；双轴全部达终态前冻结全部代码与文档/QA 输入，变脏必判 `SUPERSEDED`（`BLOCKED`）。
  2. **原生 Executor、2 秒预检与三类错误路由（`P0-2`）**：`qa-run --executor ego-browser --script` 原生直驱，修补 Shell 变量闭包解析；删除无限重试提示，收口为 `REVIEWER_EDITABLE`（至多重试 1 次）、`PACKAGE_INVALID`（0 重试停手）与 `INFRA_UNAVAILABLE`（`WAITING_INFRA`）。
  3. **分组对账、哈希继承与 Rename/Delta 折叠（`P0-3`/`P0-4`）**：平滑扩展 `QA Review Coverage: 2` 引入 `reviewUnits` 分组与内容哈希 `unchanged` 继承；`git diff -M` Rename 折叠与相邻快照机器 `delta.diff` 正式取代 `HR-TC07-7`。
  4. **编号防撞、分层指引、`r2` 上限与文档瘦身（`P0-5`/`P0-6`/`OPT-15`/`OPT-17`/`QA-WF-07`）**：新增 `FINDING_ID_COLLISION` 校验与 `scaffold-report` 自动骨架；`DESIGN.md` 显式区分 `S-H` 阻断与 `S-J` 默认驳回；收紧自动上限为 `r1 → r2 → WAITING_HUMAN`（`r3+` 需 `--allow-manual-round`）；解除 `qa-workflow.md` 180 行硬锁并瘦身 `CLAUDE.md`。

### 35. `d463e90` v2.2 Phase 2：规划减负、`qa-preflight` 扩充、`/handoff` 强绑定、基础设施治本与 `OBS-1`（11-26）

- **解决什么**：压降阶段 5 浏览器重验税与历史反复碰壁的 6 类基础设施痛点，补齐 `/handoff` 历史防覆写与日志强绑定，并用零新增框架的字段级度量替代事后猜耗时。
- **主要改动**（特性目录 `.scratch/qa-workflow-v2-2-phase2/`）：
  1. **规划期减法与预检扩充（`P0-7`）**：`qa-preflight` 新增 `DESIGN.md §10` 路由登记、任意字体、重名样式常量与分流预检；`/implement` 阶段 5 前强制预检并提示局部切片编辑。
  2. **6 项基础设施治本（`INFRA-1~6`）**：`locator.screenshot()` + 弹层预清理 + `node:zlib` 跨平台裁剪、390px 移动视口 Playwright 分流、`resolveBaseUrl()` + `engines.node >= 22`、`createMarker` 429 拦截、`parseBinding` 单行修复，并修复存量红灯 `session-state-sync.test.ts`。
  3. **`/handoff` 强绑定与 `OBS-1` 字段级度量**：交接文档改为保留历史节并强绑定最新 `qa-check` 与单测原始日志；在 `review-challenge.json`、`.source.json`、`review-package.json`、`qa-run` 日志直接写入 `dispatchedAt / startedAt / completedAt`、`sealAttempts`、`diffBytes`、`reviewUnits`、`repairAndWaitMs` 等字段。

### 36. `9be2aa9` v2.2 Phase 2.5（`OPT-14`）：拆单体 `qa-check.mjs` 为六子模块、单源去重与日落旧双轨（11-26）

- **解决什么**：消除 3,000+ 行单体 `qa-check.mjs` 的维护瓶颈与无 `review-challenge.json` 历史旧双轨死代码，吸收 Phase 1 `S-J1~S-J3` 跨脚本重复定义。
- **主要改动**（特性目录 `.scratch/qa-workflow-v2-2-opt14/`）：
  1. **无环六模块重构 + 薄入口**：拆分为 `tooling/scripts/qa-check/` 下 6 个严格分层无环子模块（`plan`、`script-scan`、`provenance`、`spec-coverage`、`acceptance`、`review-triage`）+ 173 行薄入口 `qa-check.mjs`，100% 保持原导出与 CLI 兼容、零外部依赖。
  2. **日落旧双轨与单源去重**：移除无 `review-challenge.json` 的旧转录双轨死代码，缺失或损坏 challenge 一律阻断输出 `MISSING_REVIEW_CHALLENGE`（`BLOCKED`）；`PREDICATE_KEYWORDS`/`hasPredicateInText`/`REREVIEW_STATUS_PATTERN` 单源于 `qa-spec-review.mjs`，`sha256`/`sha256FileOrNull` 单源于 `review-package.mjs`；升级安装模板逐字节校验至 `templates/qa-check/` 目录级。

### 37. `12c3cce` Phase 3 干净会话双对照发布 Dogfood 与全仓摘标收口（11-26）

- **验收方式**：另开两场全新独立干净顶级会话，在两个隔离 worktree 中分别执行效率轨与质量防线轨双对照，并与原 `.scratch/tools-workbench-ia-migration/` 事故基线及 `blind-mutation-key.md` 逐项核验：
  - **对照 A（效率轨，`.scratch/tools-workbench-ia-migration-v2-2`，原分支 `phase3/control-a`）**：原题复验 `/tools` 工作台迁移。首轮双轴关键路径 **5.12 分钟**（Standards `3.25m` / 46 次调用 / `sealAttempts: 1`；Spec `5.12m` / 60 次调用 / `sealAttempts: 2` 即格式重试 1 次过、包错 `0` 重试），全流程活跃总耗时 **32.0 分钟**（含规划、搬迁、3 条真实浏览器验收截图、双轴审查与 9 项交付日志，较旧版仅阶段 6 `239.6 分钟` 压缩 **86.6%**）；18 对 Rename 文件压缩 **91.13%**（纯代码不含 28 KB 新增 `spec.md` 压缩 **82.4%**，全包 `121,979 B` 较旧基线压 **78.87%**，经 `/grill-me` 人工裁决确认达标）；`gate-acceptance-01`（139ms）与 `gate-review-01`（109ms）均一次 `PASS`，零工作区踩脏、零编号冲突。经人工终审确认后，业务代码已线性合入 `master_newjob`（`7ff16f1`）并推送远端，临时 worktree 已清理，完整审计证据归档至本机 `.scratch/tools-workbench-ia-migration-v2-2/`。
  - **对照 B（质量防线轨，`.scratch/profile-quick-nav-anchor`，原分支 `phase3/control-b`）**：零剧透植入 4 类历史高发变异（`M1` 移动锚点滚错宿主、`M2` 无语义按钮绑定、`M3` 空白 `VisualTarget` 截图、`M4` 减动效首读错误）。`r1` 独立双轴在无提示下 **`4/4` 全部阻断级独立检出**（`M1` `[S-H2]`/`[P-W5~6]`、`M2` `[P-W1~2]`、`M3` `[P-M1]`/`[P-W7]`、`M4` `[S-H1]`/`[P-W3~4]`），另捕获 2 条真实 `S-H`；`r2` 全修闭环并用 `ego-browser` 真实渲染 `390×844` 截图（`variance=559.4`），四次 `seal` 全部 `1` 次通过，`gate-review-01` `PASS`（86ms），全程活跃 **21.85 分钟**，零踩脏、未越界 `r2`。临时 worktree 已清理，原始审计证据归档至本机 `.scratch/qa-workflow-v2-2-phase3/control-b-archive/profile-quick-nav-anchor/`。
- **收口状态**：经 5 项 `/grill-me` 终审锁定，正式关闭 `QA-WF-01`、`QA-WF-05`、`QA-WF-07`，全仓摘除 `v2.2` 发布验收暂挂标注，形成摘标提交 `12c3cce` 并与 `/tools` 业务合入提交 `7ff16f1` 一并推送至 `origin/master_newjob`。

### 38. `c92f860` 真实慢车道复盘驱动的确定性审查工具修复（步骤 1）与发布 Dogfood（11-28）

- **解决什么**：针对 `.scratch/eval-real-execution-honest-scoping/` 真实慢车道复盘暴露的四类确定性工具缺陷（见 `docs/reports/2026-11-27-qa-workflow-real-slow-lane-optimization.md` §4 步骤 1），在不立 `v2.3`、不改 Schema 4 的前提下一次性修清工具回归问题。
- **主要改动**（特性目录 `.scratch/qa-workflow-v2-2-fix-1/`）：
  1. **单源行锚定 FindingId 解析与整局无发现语义**：`qa-spec-review.mjs` 统一支持 `## S-H1`、`## [S-H1]` 及历史行首 `[S-H1]`，正文引用与示例不参与新发现登记或撞号（既有方括号引用仍可作复审响应）；`hasNoFinding` 仅在零定义时接受整局声明，局部「无发现部分」与例外列表不再吞掉真实发现。
  2. **混合 changed 骨架按行拆组**：同一 `reviewUnit` 中 `changed` 与 `unchanged` 断言拆成独立复核行并分别预填待判值与「不适用」，消除首次 `seal` 矛盾阻断。
  3. **`seal` 写前保护与 `qa-run` 统一错误前缀**：`sealReview` 在写轴指标前检查 `.source.json` 是否已存在，后续失败不再将已 `returned` 终态覆盖为 `failed`；`qa-run` 自身错误统一输出 `[qa-run][ERROR]` 前缀，流程指引禁止管道过滤后读取旧日志 `exit 0`。
- **发布 Dogfood 验收**：2026-11-28 在 Antigravity 宿主下以最小真实非核心修复（`.scratch/agent-doc-tree-fix-1/`，修复 `formatOutlineTreeToMarkdown` 跳级标题深度与缩进，业务提交 `e212b11`）走完标准车道全闭环，r1 独立双轴并行封存且均无发现、`gate-review-final` 机器校验 PASS（来源核验为「自述凭据（弱）」）；未在本次 dogfood 自然触发的异常分支（如混合 changed 骨架拆行、重复 seal 保护、`qa-run` 重名错误等）均由 `470/470` 工具自动化回归与 `254` 份历史原文只读回放覆盖（不宣称全分支真机覆盖）。经人工终审确认后摘除步骤 1「待发布验收」标注。

### 39. `1f6569f` 只读新鲜度预检、WAITING_HUMAN 停手白名单与双轴分歧对照（步骤 2）与发布 Dogfood（11-28）

- **解决什么**：针对真实慢车道复盘暴露的旧验收/旧清单进入新审查包、`WAITING_HUMAN` 后手工改脏产出自造门禁错误、双轴分歧需翻全文以及后台认领真源不清问题（见 `docs/reports/2026-11-27-qa-workflow-real-slow-lane-optimization.md` §4 步骤 2）。
- **主要改动**（特性目录 `.scratch/qa-workflow-v2-2-fix-2/`）：
  1. **只读新鲜度预检**：`qa-spec-review.mjs` 与 `qa-check/spec-coverage.mjs` 在 `_qa/spec-review-checklist.json`（v1/v2）扩展记录 `evidenceTree` 与剔除 `## 交付验证` 后的 `qaPlanDigest`；`review-package.mjs` `checkSealability` 只读校验摘要与按时间+自然文件名序最新一条完整 `gate-acceptance-*.log`，放行合法 `ASSERTION_BLOCKED` 且不在 `collect` 内重跑验收覆写 `_qa/`，对旧树、旧计划、`FAIL` 或 `STALE_EVIDENCE` 一律 `PACKAGE_INVALID` 阻断；`writeAcceptanceArtifacts` 仅在可封存验收时写出清单与骨架。
  2. **`WAITING_HUMAN` 停手白名单与硬防**：不新增 `_qa/waiting-human.json` 或 ADR；`qa-check/review-triage.mjs` 拦截最新轮首次提出未经复审即标「已修」为 `UNREVIEWED_FIX_CLAIM`（`BLOCKED`）并纳入人工决策包；`scaffoldReport` 与 `qa-check` 支持 `## 双轴分歧对照` 并在决策包并列呈现。
  3. **`.source.json` 真源认领与薄入口**：同步文档与技能模板明确 `.source.json` 与原文 SHA-256 为封存真源（已有凭据禁止重派与手改 `_qa/`）；保持 `qa-check.mjs` 薄入口 153 行 ≤ 180 行，全量脚本测试 `483/483` 通过。
- **发布 Dogfood 验收**：2026-11-28 以步骤 3（`.scratch/qa-workflow-v2-2-fix-3/`，本地提交 `d1f0ff5`）走完标准车道全闭环实测验证：`gate-acceptance-1` 成功拦截微调后旧树日志（`STALE_EVIDENCE`），`gate-acceptance-2` 与 `gate-collect-1` 验证通过只读新鲜度预检；`r1` 双轴独立审查均 `sealAttempts: 1` 一次封存并经 `.source.json` 哈希认领；阶段 7 回填 `## 交付验证` 未触发 `STALE_QA_ARTIFACTS`。未在本次 dogfood 自然触发的异常分支（`WAITING_HUMAN`、`UNREVIEWED_FIX_CLAIM` 与合法 `ASSERTION_BLOCKED`）均由自动化回归覆盖（不宣称全分支真机覆盖）。经人工终审确认后摘除步骤 2「待发布验收」标注。

### 40. `d1f0ff5` 零代码规则与提示收口（步骤 3）（11-28）

- **解决什么**：在不修改核心 `.mjs` 工具脚本、不立 `v2.3` 且保留 `grilling` 一次一问协议与 `baseline-upgrade-*` 规则的前提下，落盘优化方案 §4 步骤 3 的五项规则与提示减负及三条停止条件（特性目录 `.scratch/qa-workflow-v2-2-fix-3/`）。
- **主要改动**：
  1. **基线默认只读、一次聚合汇报**：明确阶段 3B 无关既有红标注为既有失败后继续，修改 git tracked 文件离开本特性另起任务，不改变 tracked 文件的本机环境恢复经一次明确确认后可就地执行。
  2. **测试假绿定级与夹具边界**：`code-review` 等文件明确测试使用生产不存在事件或形状导致假绿（或实现声明代替真实可观测结果）归 `[P-W<n>]` 或 `[S-H<n>]`、不得归作 `S-J`；夹具优先共享强类型契约和有出处的生产形状样本，不跨 app 强引内部构造器，也不规定所有低风险测试都走真实工厂。
  3. **需求与规格减法**：保留 `.claude/skills/grilling/SKILL.md` 一次一问协议，选项涉及生产事件、持久化 schema 或公共契约时先读实现再问人；`to-spec` 明确删除实现步骤型 US；`qa-test-planner` 与工作流明确 `init` 冻结前自查断言互斥与可证伪性。
  4. **单批交付面、Advisor 边界与状态播报收口**：控制单批审查交付面不捆审多个高风险独立主题；`prompt-shortcuts.md` 等限定 Advisor 仅在设计冻结前寻找核心反例且截断、不可用或额度耗尽时不自动重取；`CLAUDE.md`（保持 61 行）等将推进中状态变化收口为只写一行中文。
  5. **模板同步与契约测试**：4 份安装模板同步更新且保持零本仓私货，在 `qa-workflow-contract.test.mjs` 新增 `S3-TC01-1` 至 `S3-TC05-1` 共 9 条契约测试（全量 `492/492` 通过，ESLint 0 错误，r1 双轴无发现）。

## 规律小结

1. **改动由真实运行驱动**：截至 11-28 全部 40 次主仓演变中，绝大部分关键改造直接源自真实需求复盘、跨视角审计、定量基线统计与双对照实测（本地 `.scratch/` 复盘、`QA-WF-02` 基线报告、Phase 3 实测与 ADR 背景均可查证）。
2. **文档、预检与门禁按计算/认知成本分层**：规则先写进正本，由契约测试防止多处副本漂移；纯字面静态规则前移至 1 秒确定性 `qa-preflight` 与 `seal` 同步阻断；Spec 审查按 `required` 风险分级、`reviewUnits` 分组与哈希继承减负并核验 `±5` 行真实谓词；不可变快照与双指纹封堵踩脏和无效重跑；语义真伪判断继续交给独立子代理与人工终审。
3. **降噪与防线必须双轨验证**：0033/0035 加门禁，0040/0042 与 ADR-0047 做减法，ADR-0054 减少无意义重跑，ADR-0065 清理机械误报并补 `:1`/0 子代理防线，ADR-0066 则用效率轨（对照 A，总账降 86.6%）与 4 类变异盲测（对照 B，`4/4` 阻断级全检出）反制古德哈特效应，实证减负并未导致放水。
4. **通用性来自路径与依赖边界**：普通 `code-review` 与 QA 专用协议并存，原生 Playwright 由宿主根项目声明直接依赖，全部核心工具脚本及 `qa-check/` 六子模块与安装模板始终逐字节同步；项目定制可保留，但不进入通用仓。
5. **遗留事项**：`QA-WF-01`、`QA-WF-05`、`QA-WF-07` 已于 2026-11-26 随 `v2.2` Phase 3 双对照验收关闭；其余低优/条件触发事项（`QA-WF-03` 清理规则、`QA-WF-04` 命令行客户端识别、`QA-WF-08` CI 门禁）与外部独立分发包仓库项（`OPT-18 ~ OPT-21`）继续在 `docs/plans/qa-workflow-backlog.md` 与优化计划中跟踪。

## 附：提交速查表

| # | 日期 | 提交 | 主题 | 关联 ADR |
| --- | --- | --- | --- | --- |
| 1 | 10-08 | `6179aee` | 初版七阶段闭环与 Agent 规范 | — |
| 2 | 10-09 | `f30406b` | 全景实战指南 | — |
| 3 | 10-10 | `b1ab043` | 止损线/终态验收/终审分流/减法法则 | — |
| 4 | 10-12 | `dc21935` | 双轴审查硬门禁 | — |
| 5 | 10-13 | `339f9dd` | 六键优化、技能随库分发、setup-qa-workflow | — |
| 6 | 10-15 | `9a6801f` | guide 重构与教学演练 | — |
| 7 | 10-16 | `66d5ac3` | ego-browser 可见窗口强制 | — |
| 8 | 10-25 | `b926686` | code-review 并行子代理与未提交覆盖 | 0023 |
| 9 | 10-25 | `ace1c80` | 术语单源、唯一后继、开工前快照 | 0024 |
| 10 | 10-26 | `5ec28d4` | qa-run 证据链与可移植 | 0023/0026 |
| 11 | 10-26 | `1dbfbf4` | 审查交接与完成语义 | 0026 |
| 12 | 10-27 | `72866c1` | code-review 纯审查边界 | 0026 |
| 13 | 10-27 | `3fc3f76` | 独立审查交接与合法暂停 | 0026 |
| 14 | 10-27 | `4711dd5` | 流程大优化与同名技能检测 | 0031 |
| 15 | 10-28 | `953ad60` | Schema 4 证据绑定与增量复审 | 0033 |
| 16 | 10-28 | `9799fda` | 审查闭环与修复验证 | 0035 |
| 17 | 10-28 | `da6a755` | 分流表与原文一致性 | 0035 |
| 18 | 10-28 | `e525b39` | 三车道统一与单一后继 | — |
| 19 | 10-29 | `5ddd8bf` | 规划器补基线提醒 | — |
| 20 | 10-29 | `8a1e043` | 混入提交标注、开工前基线、技能精简 | — |
| 21 | 10-29 | `de33ecd` | 改档复核与截图入 Spec 轴 | 0040 前奏 |
| 22 | 10-29 | `212b3f4` | 分流表唯一状态源与响应注入标注 | 0040 |
| 23 | 10-30 | `469dcb9` | 技能衔接矛盾修正与契约测试 | — |
| 24 | 10-30 | `a63914c` | 证据过期前置拦截与审查降噪 | 0042 |
| 25 | 10-31 | `820a87e` | 车道升级、宿主适配、工作区扫描 | 0043/0044 |
| 26 | 11-05 | `0f2bf82` | 审查来源核验、事件时间与分流唯一缺陷清单 | 0047（修订 0035/0040） |
| 27 | 11-09 | `d550e7e` | 宿主无关审查来源凭据、强弱档分级与跨宿主交接 | 0048（已随 Phase 3 验收） |
| 28 | 11-17 | `825d021` | 工作流减负、浏览器分流与通用性校准 | 0054（已随 Phase 3 验收） |
| 29-30 | 11-18 | `5d05aaa` | ADR-0057 语义证据硬化与双模型审计收敛 | 0057（已随 Phase 3 验收） |
| 31 | 11-22 | `e4e9c0d` | 双报告联合审计 Phase 1：含凭据脚本清理与 P0 门禁/规则止血 | — |
| 32 | 11-22 | `9b51c32` | 双报告联合审计 Phase 2：浏览器双栈、解析器加固与技能闭环 | — |
| 33 | 11-25 | `1b31f11` | v2.1 Batch 1：预检前置、`seal` 阻断、v2 必审对账、双指纹与 0 子代理硬拦截 | 0065（修订 0057，已随 Phase 3 验收） |
| 34 | 11-26 | `07ef09d` | v2.2 Phase 1：不可变快照、冻结屏障、错误路由、`Coverage: 2` 继承、Rename 折叠与 `OPT-15`/`QA-WF-07` | 0066（修订 0033/0054/0065） |
| 35 | 11-26 | `d463e90` | v2.2 Phase 2：规划减负、`qa-preflight` 扩充、`/handoff` 留痕强绑定、`INFRA-1~6` 与 `OBS-1` | 0066 |
| 36 | 11-26 | `9be2aa9` | v2.2 Phase 2.5（`OPT-14`）：拆 `qa-check.mjs` 为 6 子模块、单源去重与日落旧双轨 | 0066 |
| 37 | 11-26 | `12c3cce` | v2.2 Phase 3：干净会话双对照发布验收回填、关闭 `QA-WF-01`/`05`/`07` 与全仓摘标 | 0066（发布验收闭环） |
| 38 | 11-28 | `c92f860` | 真实慢车道复盘步骤 1：单源 FindingId 解析、混合骨架拆行、seal 写前保护与 qa-run 错误前缀（已随 `e212b11` dogfood 验收） | 0048/0065/0066 |
| 39 | 11-28 | `1f6569f` | 真实慢车道复盘步骤 2：只读新鲜度预检、WAITING_HUMAN 停手白名单、双轴分歧对照与真源认领（已随 `d1f0ff5` dogfood 验收） | 0048/0065/0066 |
| 40 | 11-28 | `d1f0ff5` | 真实慢车道复盘步骤 3：零代码规则与提示收口、假绿定级、需求与播报减法及 9 条契约测试 | 0043/0054/0066 |

通用仓同步提交：`d1fc362 fix(qa): 提升浏览器依赖与审查兼容性`（不计入主仓 40 次已提交序号；对照 A 业务合入提交 `7ff16f1` 属业务特性，不计入工作流优化序号）。
