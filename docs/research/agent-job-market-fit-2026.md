# Agent 应用开发岗位匹配度调研：AI 聚合平台项目 vs 国内 2026-10 岗位需求

> 调研日期：2026-10-30
> 调研方式：只读。源码结论以 `文件:行号` 标注；外部岗位事实均取自招聘主体官方招聘系统的接口返回，并记录岗位 ID 与访问日期。
> 结论使用范围：求职材料与补强路线参考。本文不修改任何现有代码，不含提交或推送。

---

## 0. 结论摘要

1. **项目已具备的 Agent 工程骨架在同类个人项目中偏完整**：自写有界多步 Agent Loop、工具治理管道（去重、三重上限、连败熔断、时间预算）、前置规划与质检自愈、写操作人机协同审批（HMAC 一次性凭证）、用户自定义 Webhook 工具（SSRF 与 DNS 重绑定防护）、混合检索 RAG（含 Rerank 与引用契约）、Langfuse 观测封装、配额预留结算。这些与岗位高频词（规划、工具调用、RAG、记忆、评测、可观测、安全权限）有直接对应。
2. **最大的三块缺口是 MCP、沙箱/代码执行、异步长任务与断点恢复**。其中后两项在 Agent 平台与 Runtime 类岗位里属于核心要求，MCP 在 52 个样本岗位中有 11 个明确写出（21%）。项目路线图自己把它们标为未完成。
3. **评测资产多，但可信度要分层**：检索指标（Hit@k、MRR）来自真实数据库与真实 API；报告中“引用准确率 / 拒答准确率 / 注入防御率 = 100%”由脚本内硬编码的模拟答案算出，不能当作模型生成质量；Agent 基线评测以 mock 模型为主。这一点简历和面试里必须主动说明。
4. **文档与代码有几处口径不一致**，其中 Rerank 默认值最严重：评测报告结论为“默认不开启”，代码 `RAG_RERANK_ENABLED = true`。写简历前应先对齐。
5. **工程化短板**：仓库无 CI 流水线文件，生产为单机 Docker Compose，Langfuse 只出现在开发用 compose。自建 QA 工作流（ADR、qa-check、双轴审查）是差异化亮点，但外部招聘方对其认知度低，需要用“可验证的结果”来讲，而不是流程名词。
6. **岗位层级匹配**：最适合投递的是「Agent 应用开发 / AI 全栈 / Agent 开发工程师」类（要求 1-3 年或 2 年以上，Python 或 TS 皆可）；Agent Infra、Runtime、沙箱、Harness 平台类岗位需要补强后才有竞争力。

---

## 1. 方法与证据口径

### 1.1 外部岗位数据来源与可得性

| 招聘主体 | 数据来源（官方招聘系统） | 访问日期 | 取得结果 |
|---|---|---|---|
| 腾讯 | careers.tencent.com 官方 JSON 接口（`Query` 与 `ByPostId`），关键词 Agent，接口显示共 242 条结果 | 2026-10-30 | 取得 10 条完整 JD 原文 |
| 阿里 | talent.alibaba.com `position/search` 官方接口，关键词 Agent，共 215 条结果，取前 20 条 | 2026-10-30 | 20 条列表含职责与要求原文 |
| 字节跳动 | jobs.bytedance.com `api/v1/search/job/posts` 官方接口（`portal_type=2` 社招入口），关键词 Agent，接口返回 count 为 2119（关键词匹配口径，未核实是否含大量弱相关岗位），取前 20 条 | 2026-10-30 | 20 条列表含职责与要求原文 |
| 美团 | zhaopin.meituan.com `getJobList` 官方接口，关键词 Agent，共 432 条，取前 30 条 | 2026-10-30 | 30 条列表含职责与要求原文 |
| MiniMax | 飞书招聘租户子域 `vrfi1sk8a0.jobs.feishu.cn` 的公开搜索接口，关键词 Agent，命中 50 条，取前 20 条 | 2026-10-30 | 归属依据是岗位原文自述“我们是 MiniMax 产品研发团队”及 Talkie/星野/海螺等产品名；**未从 MiniMax 官网核对该子域链接**，证据等级低于前四家 |
| 零一万物 | 飞书招聘租户子域 `01ai.jobs.feishu.cn`，命中 27 条 | 2026-10-30 | 子域由我按公司英文名探测得到，岗位含“绿洲”等零一万物业务线；**未从官网核对入口**，证据等级同上 |
| 商汤 | 飞书招聘租户子域 `sensetime.jobs.feishu.cn`，命中 24 条 | 2026-10-30 | 同上，岗位含“量子城市”“咔皮记账”等商汤业务线 |
| 百度 | talent.baidu.com 接口返回 `need login` | 2026-10-30 | **未能获取**（需登录） |
| 月之暗面、智谱、阶跃星辰、百川、DeepSeek | 按公司名探测飞书招聘子域，月之暗面子域可访问但搜索返回 0 条（未确认原因），其余 404；搜索工具额度不足，网页抓取工具被域名校验拦截；DeepSeek 官网首页无招聘入口 | 2026-10-30 | **未能获取** |

百度与上述五家 AI 创业公司（月之暗面、智谱、阶跃星辰、百川、DeepSeek）没有岗位原文，本报告对它们不作任何断言。

岗位详情页 URL：腾讯使用接口返回的 `PostURL` 字段（形如 `http://careers.tencent.com/jobdesc.html?postId=<id>`），阿里使用接口返回的 `positionUrl`（`https://talent.alibaba.com/off-campus/position-detail?positionId=<id>`）。字节、美团、飞书三家只记录接口返回的岗位 ID，**详情页 URL 未逐条核对**，复核时请用岗位 ID 在对应官网搜索。

### 1.2 统计样本口径（词频数字的来源）

- 从上述全部 151 条岗位中，按以下规则筛出 **52 条**作为“Agent 应用开发类”样本：
  - 标题含 `agent / 智能体 / AI应用 / AI App / 大模型应用 / AI全栈 / AI服务端 / AI架构师 / AI前端`；
  - 排除标题含 产品、运营、销售、实习、算法、研究员、经理、设计师、策略、顾问、SRE、Sandbox、沙箱、Android、测试、解决方案、FDE、咨询、审核、强化学习、Agent安全 等；
  - 发布或最近更新时间在 2026-01-01 之后。
- 样本构成：阿里 12、美团 11、字节 11、腾讯 7、零一万物 4、MiniMax 4、商汤 3。
- 词频按“职责+要求+加分项”全文正则匹配，**只表示岗位是否提及某词，不表示该词是硬性要求**。样本有三处偏差：一是各公司条数不同；二是字节同标题岗位按城市重复发布（火山引擎 3 条、ArkClaw 3 条、豆包 2 条），会抬高字节的权重；三是列表接口按相关度排序，仅取前 20-30 条，不是全量。数字应读作“方向性信号”，不是严格统计。

### 1.3 源码证据口径

- 优先用 CodeGraph 定位，再回到源码读取行号；文档（CLAUDE.md、路线图、报告）仅作导航，凡与代码冲突的地方以代码为准并在 §5 单独列出。
- 对“仓库里没有”的结论，使用对仓库源码的全文检索（`apps`、`packages`、`tooling`）：MCP 客户端、沙箱/代码执行、多 Agent 委托、OpenTelemetry、上下文压缩、CI 配置文件均无命中。这是“未发现”，不是“证明不存在”，但对一个单仓库项目已足够支持“缺失”判断。

---

## 2. 外部岗位需求归纳

### 2.1 样本中的关键词出现率（52 条）

| 能力维度 | 出现数 | 占比 | 说明 |
|---|---|---|---|
| 任务规划 / 编排 / Workflow | 36 | 69% | 几乎所有岗位都要求 |
| 评测 / Eval / Benchmark / 评估 | 30 | 57% | 从“加分”变为“主要职责”，见下文 |
| 记忆 / Memory | 29 | 55% | |
| 工具调用 / Function Calling / Tool Use | 26 | 50% | |
| 上下文工程 / Context | 24 | 46% | |
| RAG / 知识库 / 检索 / 召回 | 23 | 44% | |
| Multi-Agent / 多智能体 | 21 | 40% | |
| 高并发 / 分布式 / 高可用 | 21 | 40% | |
| 异常恢复 / 容灾 / 兜底 / 断点 / 容错 | 19 | 36% | |
| Harness / Runtime / 运行时 | 16 | 31% | |
| 成本 / Token | 16 | 31% | |
| Tracing / 可观测 | 15 | 29% | |
| 安全 / 权限 / 审计 / 护栏 / 隔离 | 15 | 29% | |
| Skills | 15 | 29% | |
| 主流 Agent 框架（LangGraph、LangChain、AutoGen、Dify、ADK 等） | 12 | 23% | 多数写“有使用或二次开发经验”，部分写“更看重底层机制”（阿里云 100053460002） |
| MCP | 11 | 21% | |
| 开源 / 个人作品 / 个人产品 | 18 | 35% | 常作为加分项，多家明确放宽年限 |
| AI Coding 工具（Claude Code、Cursor、Codex 等） | 13 | 25% | |
| 人机协同 / 审批 / 人工接管 / Human-in-the-loop | 5 | 10% | 数量少，但出现时多为资深或可靠性岗位 |
| CI/CD / 灰度 | 5 | 10% | |
| 沙箱 / Sandbox | 4 | 8% | 另有专门的沙箱岗位未计入样本（美团、MiniMax、腾讯 SRE） |
| 语言：Python / Go / Java / TS 或 Node | 37 / 25 / 19 / 16 | 71% / 48% / 37% / 31% | TS 或 Node 单独要求较少，多数“任一门即可” |

### 2.2 与本项目最相关的岗位原文证据

以下均为官方招聘系统返回的原文摘要，访问日期 2026-10-30。

**腾讯**（`http://careers.tencent.com/jobdesc.html?postId=<id>`）
- Agent开发工程师，IEG，深圳，更新 2026-09-03，postId `2095441701685608448`：要求 TS/JS 加 React/Vue 的全栈能力；理解 Agent Loop、Memory、Tool Calling、RAG、MCP、Planning、Multi-Agent 并有生产落地经验；职责含企业知识库、记忆、工具调用、MCP、Multi-Agent 与人机协作、Benchmark、Tracing、CI/CD、灰度、故障恢复、权限、审计、数据隔离；5 年以上经验，能力和作品突出者可放宽；加分项含“生产级 Agent、开发者工具或企业知识助手的落地经验”“agent/LLM 评测或反馈数据闭环经验”。
- 应用效能技术部 Agent 平台方向，PCG，深圳，2026-09-09，`2097203095237996544`：Go/Java/C++/Python，分布式后台，Agent 编排、模型与工具接入、知识与上下文管理、运行评测及可观测。
- 高级 Agent 工程师，CDG，深圳，2026-10-15，`2108144321000816640`：Agent Harness/Runtime、状态管理、中断恢复、Trace、Eval Case、离线回放。
- 微信游戏 AI Agent 工程师，WXG，2026-10-29，`2110629918290395136`：2 年以上，多 Agent、Skills、MCP 实战。
- 腾讯地图 Agent 工程师，CSIG，2026-10-16，`2110978736655613952`：硕士及以上、2 年以上，工作流编排、工具调用、MCP、skills、评测驱动。
- WorkBuddy Agent Harness 研发工程师，CSIG，2026-09-21，`2098252452842352640`：Rust/Go/C++，Prefix Cache、Programmatic Tool Calling、Context Compaction、Skills、MCP、Memory、Multi-Agent。

**阿里**（接口 `talent.alibaba.com/position/search`，详情页路径为接口返回的 `positionUrl`，下列为 positionId）
- 阿里云智能 AI Agent 研发工程师 AI Native 创新小组，`100053460002`，2026-10-30：2-5 年；Python 或 TypeScript；“对 Agent 循环（规划-工具-记忆-反馈）有清晰的心智模型，使用过至少一个 Agent 框架；相较框架本身，更看重对底层机制的理解”；职责含轨迹追踪与回放、任务级与步骤级评测、监控告警兜底与人工接管、在 Agent 与固定流程间做取舍；加分项“有影响力的 Agent / AI 开源项目或个人作品”。**这条岗位与本项目的匹配度最高。**
- 高德 AI Agent 平台工程师，`100023940003`，2026-10-12：5 年以上；明确写“必须参与过生产环境 AI Agent 系统建设，而非仅完成 Demo 或简单模型调用”；Tracing、重试、降级、幂等、CI/CD。
- 千问事业部 Agent 系统技术专家，`100033920004`，2026-09-28：1 年以上；Agent Runtime、评测基准、代码执行沙箱优先。
- 阿里云智能 Agent 平台技术研发专家，`100016383008`，2026-09-07：5 年以上硕士；上下文工程、Skills、MCP Tools、Memory、知识库；企业知识接入、权限治理、多租户、召回排序。
- 阿里云智能 AI Agent 平台研发（观测、评估、审计），`100052680006`，2026-10-28：3 年以上；Agent 观测、评估、审计、OpenTelemetry 加分。

**字节跳动**（接口 `jobs.bytedance.com/api/v1/search/job/posts`，下列为岗位 ID）
- Agent 应用开发工程师 ArkClaw，深圳，`7682807212755093813`，2026-09-07；AI Agent 应用开发工程师/架构师，火山引擎，`7616302352991750453` 等：2 年以上后端或 AI 应用经验；Python/Go/Node.js 任一门；模型适配、记忆库、知识库、Skills、任务规划、性能优化、错误容灾。
- Agent 技术研发工程师，火山方舟，`7654959567977466165`：Agent 运行时与执行引擎、云原生、可观测、资源隔离；开源项目贡献者优先。
- Agent 技术研发工程师，豆包，`7634034954359572741`：Multi-Agent、复杂上下文管理、长任务 Harness、Memory、RAG。

**美团**（接口 `zhaopin.meituan.com/api/official/job/getJobList`，下列为 jobUnionId）
- AI Agent 工程师，`3424768905`，2026-09-14：TypeScript/Node.js 或 Python；Prompt、Tool Use、RAG；多模型调度、Function Calling、上下文管理；浏览器自动化加分。
- Agent 开发工程师，`4869620081`，2026-10-26：3 年以上；MCP、ReAct 与 Plan-and-Execute；上下文工程、记忆与知识库、观测与评测；数据权限管控、输出护栏、操作审计。
- 履约技术 Agent 工程开发，`4767045690`，2026-10-07：“有突出的 Agent 相关开源作品或项目实践者，年限可适当放宽”；人工判断与协作；任务评估方法。
- Agent 工程师（商业智能），`4566998937`，2026-07-26：Agent Loop、上下文压缩、多 Agent、Human-in-the-loop 审批、状态持久化与断点续跑、Sandbox；需阅读过 Claude Code、OpenAI Agents SDK、LangGraph 等 2-3 个框架源码。
- Agent 可靠性技术专家，`4831038591`，2026-10-09：要求主导过 Harness 核心架构并经过生产验证。

**MiniMax / 零一万物 / 商汤**（飞书招聘租户接口，归属依据见 §1.1，证据等级较低）
- MiniMax AI 服务端工程师（Mcode/开平），`7641148041870117126`，2026-05-18：Agent 系统架构、任务调度、上下文管理、工具调用；“有独立开发、开源项目、创业项目或 AI 工具实践者优先”。
- 零一万物 AI Agent 工程师，`7641848138185705755`，2026-05-20：1-3 年；LangGraph/OpenClaw 等；Python 或 JS。零一万物 大模型应用开发专家，`7611016949842135338`，2026-02-26：RAG、GraphRAG、Rerank、Function Calling、CI/CD。
- 商汤 Agent 开发工程师（量子城市），`7670486300911290670`，2026-08-05：Planning、Function Calling、Memory/RAG、Reflection、多 Agent、Evals；TypeScript/Next.js 为加分项。

### 2.3 从岗位原文能读出的三个趋势

1. **“生产级”被反复强调**：高德、腾讯 IEG、美团可靠性岗位均明确区分 Demo 与生产落地。纯功能展示不够，需要故障、治理和数据证据。
2. **评测从加分项变成主要职责**：阿里云、美团、腾讯 CDG 都把离线评测、Trace 回放、Eval Case 写在职责里。
3. **对个人作品的接受度有明确文字依据**：腾讯 IEG（能力和作品突出者可放宽）、美团履约（开源作品或项目实践者年限可放宽）、阿里云（开源项目或个人作品加分）、MiniMax（个人项目优先）。这是项目的主要求职价值所在。

---

## 3. 项目能力全景（源码证据）

路径均相对仓库根目录。行号取自 2026-10-30 的工作区（分支 `master_newjob`，工作区干净）。

### 3.1 规模与形态

| 项 | 数据 | 来源 |
|---|---|---|
| 技术栈 | pnpm 10 Workspace + Turborepo；`apps/web`（Next.js 15、React 19、TS）、`apps/worker`（BullMQ）、`packages/*`、`infra/*` | `docs/project-guide.md:70-92, 156-195` |
| 非测试 TS/TSX/MTS 代码 | 约 148,514 行（`git ls-files` 统计，含脚本与 worker） | 实测 |
| 测试文件 | 261 个（含 `*.test.*`、`*.spec.*`、`__tests__/`） | 实测，`git ls-files` |
| API 路由 | `app/api` 下 76 个 `route.ts` | 实测 |
| 页面 | admin、chat、debug-history、destiny、feedback、history、home、image、knowledge、login、profile、register、reset-password、resume、video、voice 等约 20 个 | `apps/web/src/app/` |
| 异步 Worker | stt、ppt、image、qimen-base、qimen-section、rag-index、memory-index、maintenance 共 8 类 | `apps/worker/src/workers/` |
| 决策记录 | 42 篇 ADR（0001 至 0042） | `docs/adr/` |

说明：测试文件数随统计口径变化（本次含 `__tests__/` 目录与 `.mjs` 测试，调研早期按 `*.test.*` 与 `*.spec.*` 统计为 254）；调研早期还按 `it/test` 计数得到约 2392 个用例，本次未重跑，**不建议写入简历**，除非再次实测并保留命令输出。

### 3.2 Agent 核心

| 能力 | 实现 | 证据 |
|---|---|---|
| 自写有界多步 Agent Loop | 用 AI SDK 的 `streamText` 做单步决策，`stopWhen: stepCountIs(1)` 把循环控制权收回自有运行时；工具不带 `execute`，由编排器统一执行 | `apps/web/src/app/api/chat/_lib/agent/agent-runner.ts:159-168`（`buildToolSet`）、`:377`、`:383` |
| 工具执行治理管道 | 去重缓存（键为工具名加稳定序列化入参）、单轮 3 次、全局 10 次、出图 3 次上限、连续失败 3 次熔断、240 秒总预算、合规二道检查；判定顺序固定为中断、全局、单轮、时间、出图 | `apps/web/src/lib/agent/tool-pipeline.ts:173-198`、`:253-279`、`:205-213`；常量 `apps/web/src/app/api/chat/_lib/agent/agent-config.ts:30-118` |
| 单次调用策略 | 默认 15 秒超时、结果截断、错误规范化、区分用户取消与超时 | `apps/web/src/lib/agent/tool-policy.ts:114-183` |
| 工具注册表与参数校验 | zod 作为入参校验与模型可见 JSON Schema 的唯一来源；重名告警 | `apps/web/src/lib/agent/registry.ts:60-120` |
| 前置规划 | 输出 ≤512 token、6 秒超时、zod 校验、失败降级；计划步骤 1 至 8 步，状态 `pending/running/completed/failed/skipped` | `apps/web/src/app/api/chat/_lib/agent/planner.ts:34, 74`；`packages/shared/src/agent-plan.ts:14-37`；编排接入 `agent-runner.ts:338-357` |
| 质检与自愈 | 质检节点 ≤256 token、5 秒超时、失败放行（fail-open）；未通过时最多一次自愈重试，仍不足则把局限性写入收尾提示 | `apps/web/src/app/api/chat/_lib/agent/evaluator.ts:141, 157, 177`；`agent-runner.ts:729-807` |
| 链式上下文 | `ChainedMessageSession` 管理 `previous_response_id` 增量回发与断链回退（仅部分 provider 支持，其余全量回发） | `apps/web/src/lib/agent/chained-session.ts:87-104, 159`；`agent-runner.ts:253` |
| 服务端工具与自有工具统一投影 | `ToolStreamProjector` | `apps/web/src/lib/agent/tool-projector.ts`；调用点 `agent-runner.ts:402` |
| 收尾步 | 不挂 tools，独立输出上限 8192 | `agent-runner.ts:810-895`；`agent-config.ts:24` |
| 异常终态 | 按是否已有输出区分 partial 与 failed，并落 `AgentRun` | `agent-runner.ts:992-1031`；`apps/web/src/app/api/chat/_lib/chat-handler.ts:352` |
| 内置工具 | `web_search`、`web_fetch`、`image_generate`、`knowledge_search`、`knowledge_outline`、`memory_search` 共 6 个 | `apps/web/src/app/api/chat/_lib/agent/tools/*.ts` |
| 运行时收敛 | 按能力包白名单、会话级停用、无知识库自动剔除 `knowledge_search`、记忆开关剔除 `memory_search`、合并用户 Webhook 工具 | `apps/web/src/app/api/chat/_lib/agent/runtime-context.ts:94-170` |
| 能力包 | `deep-research`（最多 8 步）、`visual-report`、`knowledge-qa`（5 步，含防提示注入与 `[^n]` 引用约束） | `packages/shared/src/capability-pack.ts:8, 68-95` |

### 3.3 人机协同与写操作安全

| 能力 | 实现 | 证据 |
|---|---|---|
| 写操作审批暂停 | 工具带 `approval` 声明时，参数校验通过后不执行、不过合规、不进缓存、不计入连败，返回待审批标记；编排器下发 `tool_approval_request` 并结束流 | `apps/web/src/lib/agent/tool-pipeline.ts:294-320`；`agent-runner.ts:523-567` |
| 审批凭证 | HMAC-SHA256 签名，绑定用户、会话范围、工具名、工具 ID、目标域名、参数哈希、10 分钟有效期；`timingSafeEqual` 验签；Redis `SET NX EX` 一次性消费；密钥缺失或 Redis 异常时失败关闭 | `apps/web/src/lib/agent/approval-token.ts:15, 125-223` |
| 恢复请求路径 | 先验签，再预留配额，再消费凭证，再直接执行被批准的调用 | `chat-handler.ts:249-264, 285-302`；`agent-runner.ts:653-708` |
| 用户自定义 Webhook 工具 | `wh_` 前缀；AES-256-GCM 加密凭证；仅 https；`guardedLookup` 防 DNS 重绑定；禁重定向；响应 200KB 上限；全量审计 `WebhookToolCall`；cURL 粘贴导入仅支持 GET 与 POST、头白名单、8KB 输入上限 | `apps/web/src/lib/webhook/executor.ts:1-16, 58`；`apps/web/src/lib/crypto/webhook-secret.ts`；`apps/web/src/lib/agent/guarded-lookup.ts`、`url-guard.ts`、`parse-curl.ts:1-12`；`packages/db/prisma/schema.prisma:428, 455` |
| 前端交互 | 计划卡片、计划干预对话框、审批卡片 | `apps/web/src/components/chat/plan/` |

### 3.4 RAG 与知识库

| 能力 | 实现 | 证据 |
|---|---|---|
| 混合检索 | pgvector 稠密加 jieba 分词与 `ts_rank_cd` 词法，双路各取 Top 20，自研 RRF（k=60）融合；零召回时放宽元数据过滤兜底 | `apps/web/src/lib/rag/hybrid-retrieval.ts:210, 331-372, 390`；`apps/web/src/lib/rag/rrf.ts:60`；`packages/shared/src/rag-config.ts` |
| 可插拔 Rerank | `bge-reranker-v2-m3`，候选上限 30、最低相关度 0.20，失败降级回 RRF；多库检索时各库只粗排，外层统一做一次 Rerank | `packages/shared/src/rag-config.ts:217-219`；`apps/web/src/app/api/chat/_lib/agent/tools/knowledge-search.ts:199, 249-285` |
| 引用契约 | `[^n]` 引用、不可信检索内容隔离包裹、跨用户越权拦截 | `apps/web/src/lib/rag/citation.ts`；`knowledge-search.ts` |
| FAQ 前置短路 | 高置信度直接返回标准答案，零模型消耗 | `chat-handler.ts:182-203`（ADR-0027） |
| 文档处理 | PDF、MD、TXT、DOCX、XLSX、CSV 解析，章节大纲抽取，URL 摄取与 SSRF 防御，异步索引 | `apps/worker/src/workers/rag-index/`；ADR-0028、0029、0036 |
| 容量与多租户 | 每用户 5 库、50 文档、20000 切片；多库越权拦截 | `packages/shared/src/rag-config.ts`（`RAG_CAPACITY_LIMITS`） |
| 会话记忆 | 对话片段向量化入 `ConversationMemoryChunk`，由 `memory_search` 检索；记忆索引走 BullMQ，30 秒防抖 | `packages/db/prisma/schema.prisma:597`；`apps/worker/src/workers/memory-index/processor.ts`；`chat-handler.ts:376-400` |

### 3.5 计费、观测、评测

| 能力 | 实现 | 证据 |
|---|---|---|
| 配额预留与结算 | `QuotaSession.reserve` 后在 `onFinish` 结算或释放；按可负担步数预留，低于 `AGENT_MIN_STEPS=2` 拒绝；Worker 周期对账 | `packages/db/src/billing/quota-session.ts`；`chat-handler.ts:214-237, 285-296`；`agent-config.ts:36, 49-60` |
| 观测封装 | Langfuse 的 Trace、Generation、Span 薄封装；未配置时降级为空实现；脱敏器；usage 区分实测、估算、缺失 | `apps/web/src/lib/observability/langfuse-client.ts:86, 356`；`sanitizer.ts:27, 53` |
| Agent 运行记录 | `AgentRun` 表与 `/api/agent-runs` 查询接口；覆盖实际使用的 provider 与 model | `packages/db/prisma/schema.prisma:493`；`apps/web/src/app/api/agent-runs/route.ts`；`chat-handler.ts:336-337` |
| 评测资产 | Agent 基线评测 7 个用例；RAG 分层评测；32 题数据集；四组对照真实检索脚本；产物补丁评测脚本 | `apps/web/src/eval/agent-baseline.eval.test.ts`；`apps/web/src/eval/datasets/rag-smoke.jsonl`；`tooling/scripts/eval-rag.mts`、`eval-artifact-patch.mts` |
| SSE 事件契约 | `text-delta`、`reasoning-delta`、`agent_note`、`tool_call`、`tool_result`、`plan_created`、`plan_step_update`、`tool_approval_request`、`warning`、`error`、`done`，另含 artifact 三类事件 | `packages/shared/src/chat-stream-contract.ts:49-268` |

### 3.6 业务功能面（作品集展示价值来源）

对话（多模型切换与对比）、图像生成、视频生成（CogVideoX、Agnes）、语音转写（上传与实时网关）、统一历史、知识库管理与检索调试、简历相关页面、命理类功能（八字、奇门、紫微）、用户反馈与管理后台、邮箱与 OAuth 登录、额度计费。来源 `docs/project-guide.md:94-153` 与 `apps/web/src/app/`。除对话、知识库、Agent 外，其余功能与“Agent 应用开发”岗位关联较弱，简历里应压缩篇幅。

### 3.7 工程化与部署

| 项 | 现状 | 证据 |
|---|---|---|
| 测试 | Vitest；Playwright 7 个 spec，`chromium` 与 `Pixel 7` 双项目 | `apps/web/playwright.config.ts:23-25`；`apps/web/e2e/` |
| QA 工作流 | 自建 `qa-check`、`qa-run`、`review-package`，Schema 4 测试计划，双轴审查，配套契约测试 | `tooling/scripts/qa-check.mjs`、`qa-run.mjs`、`review-package.mjs`、`tooling/scripts/__tests__/`；`docs/agents/qa-workflow.md`；ADR-0031、0033、0035、0040、0042 |
| 部署 | 腾讯云单机 Docker Compose：nginx、web（带 healthcheck）、worker | `infra/docker/docker-compose.prod.yml:5-63`（healthcheck 位于 `:38-44`） |
| 开发观测 | Langfuse v3、ClickHouse 等仅出现在开发用 compose | `infra/docker/docker-compose.yml:55-101`；生产 compose 与 `DEPLOYMENT.md` 均无 Langfuse |
| CI | 仓库根目录无 `.github`、`.gitee` 或其它 CI 配置 | 目录检查；`DEPLOYMENT.md` 无 CI 描述 |

---

## 4. 匹配矩阵

**图例**
- 状态：已有 = 源码与测试可验证；部分具备 = 有实现但范围、验证或口径有明显缺口；缺失 = 仓库中未发现；仅文档声称 = 文档写了但代码不支持或口径矛盾。
- 作品集价值：该项在简历与面试里的展示效果（高、中、低）。
- 生产能力：按真实线上运行的可信度打分（可信、有限、无）。当前生产为单机部署，没有公开的用户量数据，所以“可信”只表示机制完整并有测试，不表示经过规模验证。

| # | 岗位能力维度（样本占比） | 项目状态 | 作品集价值 | 生产能力 | 依据与说明 |
|---|---|---|---|---|---|
| 1 | Agent Loop 与有界多步编排（规划/编排 69%） | 已有 | 高 | 有限 | 自写循环加预算、熔断、去重（§3.2）。有 mock 基线与单测，没有线上流量或成功率数据 |
| 2 | 工具调用与参数校验（50%） | 已有 | 高 | 可信 | zod 校验、超时、截断、错误回注（`registry.ts`、`tool-policy.ts`）。工具种类只有 6 个内置加用户 Webhook |
| 3 | 任务规划与反思（Planning、Reflection） | 已有 | 高 | 有限 | 前置规划加质检自愈，均为 fail-open 的单次调用。不是 Plan-and-Execute 的完整重规划，也没有基于失败的动态重排 |
| 4 | RAG 与知识库（44%） | 已有 | 高 | 有限 | 混合检索、Rerank、引用、多租户、容量限制俱全。语料评测仅 41 篇技术文档、635 切片，规模小 |
| 5 | 记忆 / Memory（55%） | 部分具备 | 中 | 有限 | 只有“会话片段向量检索”一种长期记忆，没有记忆写入策略、遗忘、画像或分层。不能写成完整记忆系统 |
| 6 | 上下文工程（46%） | 部分具备 | 中 | 有限 | 有链式回发与断链回退、检索内容隔离、按能力包裁剪工具。**无上下文压缩或摘要**（未检索到 compaction 相关实现），长对话靠截断 |
| 7 | 评测体系（57%） | 部分具备 | 高 | 有限 | 检索评测真实可信；Agent 基线评测以 mock 模型为主；生成质量三项指标为模拟值（见 §5.2）。缺少真实模型的端到端任务集与 LLM-as-judge |
| 8 | Tracing / 可观测（29%） | 部分具备 | 中 | 有限 | Langfuse 封装与脱敏完整，但仅在开发 compose；生产没有看板；无 OpenTelemetry |
| 9 | 安全、权限、审计、护栏（29%） | 已有 | 高 | 可信 | SSRF 与 DNS 重绑定防护、凭证加密、审批凭证、Webhook 全量审计、合规检查。属于本项目最突出的差异点 |
| 10 | 人机协同 / 审批 / 人工接管（10%） | 已有 | 高 | 有限 | HMAC 一次性审批加计划干预（§3.3）。样本占比低，但出现在资深与可靠性岗位，区分度高 |
| 11 | 异常恢复、断点续跑、容灾（36%） | 部分具备 | 中 | 无 | 有失败降级、熔断、partial 终态落盘。**没有运行中检查点与断线恢复**，`docs/reports/agent-baseline-report.md:61, 77` 自己确认“同步长连接易断、缺少运行中检查点快照”，路线图 Phase 2 未勾选 |
| 12 | 异步长任务 / 后台执行 | 缺失（Agent 链路） | 低 | 无 | Worker 存在，但只处理媒体与索引任务；Agent 请求是同步 SSE，不是排队执行 |
| 13 | MCP（21%） | 缺失 | 低 | 无 | 仓库无 MCP 客户端。AI SDK 6 提供 `@ai-sdk/mcp` 的 `createMCPClient`（见 §6），项目未安装 |
| 14 | Skills（29%） | 部分具备 | 低 | 无 | “能力包”是提示词加工具白名单的静态配置，不是可加载的 Skill 包。简历可称“能力包”，不要称 Skills |
| 15 | Multi-Agent（40%） | 缺失 | 低 | 无 | 单 Agent 加规划/质检两个辅助调用，没有委托、并行或协作协议。不要把规划器与质检节点称为多 Agent |
| 16 | Harness / Runtime 工程（31%） | 部分具备 | 高 | 有限 | 管道加预算加熔断加事件契约已具备 Harness 雏形；缺检查点、回放、沙箱 |
| 17 | 沙箱与代码执行（8% 加专门岗位） | 缺失 | 低 | 无 | 无代码执行工具与隔离环境。此项属于基础设施岗位，应用岗要求较弱 |
| 18 | 成本与 Token 控制（31%） | 已有 | 高 | 可信 | 配额预留结算、按可负担步数预留、usage 口径区分、Rerank 成本实测对比 |
| 19 | 高并发、高可用（40%） | 部分具备 | 低 | 无 | 有 Redis 限流、队列、失败关闭策略，但单机部署，无压测、无多副本、无容量数据 |
| 20 | CI/CD、灰度（10%） | 缺失 | 低 | 无 | 无 CI 配置；部署靠人工脚本加 Docker Compose；QA 门禁是本地命令 |
| 21 | 主流框架经验（LangGraph、LangChain 等，23%） | 缺失 | 中 | 无 | 项目刻意不用框架，只用 AI SDK 的 `streamText`。优点是体现底层理解（阿里云 `100053460002` 明确更看重底层机制），缺点是岗位常写“使用过至少一个 Agent 框架”，需要另有一个小样例补足 |
| 22 | 全栈与前端交互（TS/Node 31%，腾讯 IEG 要求） | 已有 | 高 | 可信 | Next.js 15、流式 UI、计划卡片、审批卡片、产物工作台。是相对纯后端候选人的明显优势 |
| 23 | 开源 / 个人作品（35%） | 部分具备 | 中 | 无 | 项目本身是个人作品，但未公开，也没有 README 级对外说明与演示 |
| 24 | AI Coding 与工程方法（25%） | 已有 | 中 | 无 | 大量使用 AI 辅助并配套自建 QA 流程。外部面试官未必认可流程名词，需用结果说话 |
| 25 | 多模型接入与路由 | 已有（范围小于文档） | 中 | 可信 | 对话链路实际接入讯飞、豆包（Ark Responses API，含协议兼容 fetch）、DeepSeek 三家（`packages/providers/src/factory.ts:3, 7-21`；`apps/web/src/app/api/chat/route.ts:22-35`）。文档称“通义千问、智谱 GLM”，对话链路源码中未发现通义/DashScope 相关代码，智谱仅出现在视频生成与鉴权相关文件（`apps/web/src/app/api/video/route.ts`、`apps/web/src/lib/zhipu-auth.ts`）。简历写“接入 3 家模型并处理协议差异”，不要写 4 至 5 家 |
| 26 | 路线图中 Phase 3（RAG）以外的阶段（异步化与 Checkpointer、MCP 与沙箱、Multi-Agent） | 仅文档声称 | 低 | 无 | `docs/agent-engineering-roadmap.md` 的 Phase 2、4、5 为规划，未实现，只能作为“已规划”写，不能写成能力 |

---

## 5. 口径冲突与可信度分层

### 5.1 文档与代码不一致（写简历前必须对齐）

| 项 | 文档说法 | 代码事实 | 处理建议 |
|---|---|---|---|
| Rerank 默认值 | `docs/reports/rag-eval-report.md:59` 与路线图结论为“默认不开启”，`enableRerank: false` | `packages/shared/src/rag-config.ts:201` 为 `RAG_RERANK_ENABLED = true`，`:224` 的注释却写“默认值 false”；`isRagRerankEnabled()` 在未设环境变量时返回 `true`（`:226-232`）。生产是否开启取决于 `RAG_RERANK_ENABLED` 与 `SILICONFLOW_API_KEY` 的实际配置，本次未查看生产环境变量 | 先确认生产真实状态，再统一代码、注释与报告。简历只写“实测对比后可配置开关”，不写“默认关闭” |
| 评测报告“生成质量 100%” | 引用准确率、拒答准确率、注入防御率均为 100% | `tooling/scripts/eval-rag.mts:372-409` 中答案是脚本写死的模拟字符串（例如拒答直接拼“抱歉……予以拒答”，引用答案固定为含 `[^1]` 的句子），注入防御率只检查提示词里是否包含固定包裹文本。三项没有调用任何模型 | 不得作为生成质量证据。可表述为“验证了提示拼装层的隔离与引用格式约束” |
| Agent 基线评测 | 报告称基线评测 | `apps/web/src/eval/agent-baseline.eval.test.ts:32` 对 `ai` 做 `vi.mock`，7 个用例验证编排行为（预算、去重、熔断、审批等），不评价模型任务成功率 | 可称“编排层行为回归测试”，不要称“Agent 能力评测” |
| 检索指标 | 组 C（混合 RRF）相比组 A（纯向量）Hit@3 “提升了 -4.5%”（`docs/reports/rag-eval-report.md:51`） | 同一报告第 35-37 行的表格显示组 A Hit@3 为 59.1%、组 C 为 54.5%、MRR 0.4962 对 0.4576，即混合检索在这套有标注题上**略低于**纯向量，“提升了 -4.5%”的措辞自相矛盾 | 这是真实的负结果，可当作“用数据否定了先验假设”来讲，但不能写“混合检索提升召回” |
| 评测样本量 | 32 题 | `apps/web/src/eval/datasets/rag-smoke.jsonl` 实测 32 行：answerable 16、cross_paragraph 6、unanswerable 6、injection 4。检索指标的百分比均为 1/22 的整数倍（4.5%、18.2%、59.1%），与 16+6=22 道带 `goldenAnchors` 的可答题一致 | 小样本，必须在简历中带样本量 |
| 路线图勾选 | Phase 3 全部勾选 | Phase 1、2、4、5 的验收项大多未勾选，且第 406-428 行简历模板含占位符 N、R、X、Y | 模板里“节点粒度 Checkpointer”“恢复成功率 X%”“故障注入”均未实现，**不得照抄** |
| Provider 描述 | `CLAUDE.md` 与 `docs/project-guide.md:181-188` 称对话接入通义千问、智谱 GLM、DeepSeek、Agnes | 对话链路适配为讯飞、豆包、DeepSeek（见矩阵第 25 行）；`SILICONFLOW`、`ZHIPU` 等仅在图像、视频、语音等其它链路出现 | 简历按代码事实写 |

### 5.2 评测证据的三层分级

1. **可作为实测证据**：检索 Hit@1/3/5、MRR、延迟与成本对照（真实 pgvector、真实 Embedding 与 Rerank API，`tooling/scripts/eval-rag.mts` 可复跑，样本约 22 题，另有 10 题用于拒答与注入）。
2. **只能作为机制测试**：Agent 基线 7 个用例（mock 模型，验证预算、去重、熔断、审批、追踪契约等确定性逻辑）、RAG 分层评测、产物补丁评测。
3. **不得作为能力证据**：报告中的引用、拒答、注入三项 100%。

---

## 6. 补强路线（按求职回报排序）

排序依据：岗位样本出现率、补强成本、能否在面试中被追问验证、是否改变“Demo 还是生产”的判断。预估工作量是粗估，用于排序，不是承诺。

| 优先级 | 事项 | 对应岗位信号 | 为什么排在这里 | 预估工作量 | 验收证据 |
|---|---|---|---|---|---|
| P0-1 | 对齐口径：确认生产 Rerank 实际状态，统一 `rag-config.ts`、注释与评测报告；修正报告中“提升了 -4.5%”措辞；给评测报告的三项模拟指标加醒目的“非模型生成质量”标注 | 阿里云、腾讯、美团均强调“生产落地、评测可信” | 零成本，且能避免面试被一句追问击穿。这是所有简历表述的前提 | 0.5 天 | 代码、注释、报告三者一致；`git diff` |
| P0-2 | 把一次真实模型的端到端 Agent 评测跑起来：固定 20 至 30 个任务，真实调用，记录任务成功率、工具调用次数、token、延迟，并保留逐题原始输出；再做一次“关闭规划/质检”的消融对比 | 评测占样本 57%；阿里 `100053460002`、`100032420003`、腾讯 CDG 均把评测写入职责 | 补上最大的可信度缺口，同时产出“有数据的取舍”故事 | 3 至 5 天 | 逐题原始记录、可复跑脚本、消融表 |
| P0-3 | 生产侧最小观测：让生产 compose 能接 Langfuse（自托管或云）或至少输出结构化 Trace 日志；保留一次真实请求的瀑布图截图 | Tracing 与可观测占 29%；阿里云 `100052680006`、腾讯 CDG、高德 `100023940003` | 当前观测只在开发环境，面试时“你线上怎么排查”答不出 | 1 至 2 天 | 生产 Trace 截图；脱敏抽查 |
| P1-1 | **MCP 客户端接入**：用 AI SDK 6 的 `@ai-sdk/mcp` 提供的 `createMCPClient`（支持 stdio、HTTP、SSE 传输，`client.tools()` 返回可直接交给 `streamText` 的工具集，用完需 `close()`；见 Context7 对 `/vercel/ai` ai_6.0.0 文档的检索结果）接入 1 至 2 个 MCP 服务，并走现有 `ToolExecutionPipeline` 的校验、超时、审批和审计。**需要把 MCP 工具纳入现有 SSRF、写操作审批与审计边界，而不是裸挂** | MCP 占 21%，在腾讯 IEG、美团、阿里云、字节方舟的 JD 中直接点名 | 与现有治理管道天然咬合，补齐成本低，且能讲“MCP 工具的安全边界”这一有深度的话题 | 2 至 4 天 | 一个可演示的 MCP 工具；对应的管道单测和审批用例 |
| P1-2 | 长任务异步化与检查点：把 Agent 运行放到 BullMQ Worker，运行状态与增量输出落库，前端断线后凭 `runId` 补拉；对写操作副作用做幂等键 | 异常恢复占 36%；腾讯 CDG“中断恢复”、美团“状态持久化与断点续跑”、阿里“异常恢复”；`docs/reports/agent-baseline-report.md:61` 已把它认定为缺陷 | 把“Demo”升级为“可恢复的运行时”，是区分度最高的一项，但改动面大 | 7 至 12 天 | 故障注入记录（刷新、断网、Worker 重启）；恢复成功率与重复副作用次数的原始数据 |
| P1-3 | 上下文压缩：对长会话做摘要或滑窗，保留工具结果引用；用评测对比压缩前后任务成功率和 token | 上下文工程占 46%；腾讯 WorkBuddy 点名 Context Compaction，美团点名压缩策略 | 与 P0-2 的评测配套，补上上下文工程里目前最空的一块 | 3 至 5 天 | 压缩前后对照数据 |
| P1-4 | CI 流水线：把 lint、typecheck、单测、QA 门禁的关键步骤放进托管 CI（仓库托管在 Gitee，需选其流水线或另配镜像仓库） | CI/CD 与灰度占 10%，但腾讯 IEG 与高德把它列为生产工程标志 | 成本低，补齐“工程化”叙事 | 1 天 | 流水线运行记录截图 |
| P2-1 | 多 Agent 的最小可信实现：只做“主 Agent 委托只读子 Agent 并行检索”一种模式，带预算继承与结果汇总，不做通用多 Agent 框架 | Multi-Agent 占 40% | 岗位出现率高，但容易做成花架子；放在 P2 是因为 P0 与 P1 完成后才有评测手段证明它有收益 | 5 至 8 天 | 同一任务集上单 Agent 与多 Agent 的对比数据 |
| P2-2 | 记忆升级：区分情景与语义记忆，增加写入策略、过期与用户可见的记忆管理界面 | Memory 占 55% | 目前只有检索型记忆，补强后可以放心写“记忆系统” | 4 至 6 天 | 记忆读写评测 |
| P2-3 | Skills：把能力包升级为可按需加载的 Skill 目录（描述、入口、资源），由模型按描述选择加载 | Skills 占 29% | 概念迁移成本低，但效益依赖 P0-2 的评测 | 3 至 4 天 | 加载策略对照 |
| P3 | 沙箱、Kubernetes、OpenTelemetry 自建采集 | 沙箱 8%，主要在基础设施岗位 | 与“应用开发”定位偏离，除非目标岗位就是 Agent Infra，否则不建议投入 | 不排期 | 无 |
| P3 | 引入 LangGraph 等框架重写 | 框架经验 23% | 与项目的差异化（底层机制自研）冲突。更便宜的做法是单独写一个 200 行以内的 LangGraph 对照小样例，用来回答“你用过框架吗” | 1 至 2 天 | 小样例仓库 |

**不建议做的事**
- 不要为凑关键词补一个“多 Agent 平台”或“沙箱”；这两项没有评测支撑时，面试一追问就暴露。
- 不要把命理、图像、视频等业务功能继续扩张。它们对 Agent 岗位的边际价值很低（§3.6）。
- 不要继续扩写 QA 流程文档。流程本身对外部面试官的说服力远低于“一份可复跑的评测加一组故障注入数据”。

**按目标岗位类型的投递建议**
- 目标「Agent 应用开发 / AI 全栈」（阿里云 `100053460002`、字节方舟与 ArkClaw 应用开发、美团 `3424768905`、零一万物、商汤）：当前即可投，先完成 P0 三项。
- 目标「Agent 平台 / Runtime / Harness」（高德 `100023940003`、阿里云 `100016383008`、字节方舟 `7654959567977466165`、腾讯 CDG `2108144321000816640`）：需要先完成 P0 与 P1-2，且多数要求 3 至 5 年以上经验，作品只能起到放宽年限的作用，不能替代。
- 目标「Agent Infra / 沙箱」：不建议用本项目作为主要证据。

---

## 7. 简历表述边界

### 7.1 可以安全写的内容（均有源码与测试可复核）

1. 设计并实现有界多步 Agent 运行时：基于 AI SDK 的单步决策加自有编排循环，内置工具去重、单轮与全局调用上限、连续失败熔断、总时间预算，并有 7 个编排行为回归测试（`agent-runner.ts:383`、`tool-pipeline.ts:173-213`、`agent-baseline.eval.test.ts`）。
2. 实现写操作人机协同审批：HMAC-SHA256 签名凭证绑定用户、工具、目标域名与参数哈希，10 分钟有效，Redis 一次性消费，密钥或 Redis 不可用时失败关闭（`approval-token.ts`）。
3. 实现用户自定义 Webhook 工具及其出站安全：仅 https、DNS 重绑定防护、禁重定向、200KB 响应上限、凭证 AES-256-GCM 加密、全量审计（`executor.ts`）。
4. 实现带引用的混合检索知识库：pgvector 加全文检索，RRF 融合，可插拔 Cross-Encoder 精排与失败降级，多租户与容量限制；并用 22 道标注题做过四组对照实测，**结果显示在该小语料上混合检索与精排没有带来净收益**（`hybrid-retrieval.ts`、`rag-eval-report.md`）。这条“用数据否定先验假设”的表述比“提升了召回”更站得住。
5. 实现配额预留与结算以控制 Agent 成本：按可负担步数预留，低于下限拒绝（`quota-session.ts`、`agent-config.ts:49-60`）。
6. 全栈实现：Next.js 15 流式对话界面、计划卡片、审批卡片、产物工作台，SSE 事件契约在前后端共享（`chat-stream-contract.ts`）。
7. 独立完成 Langfuse 观测封装与脱敏（开发环境）。

### 7.2 需要带限定语才能写

| 表述 | 必须附加的限定 |
|---|---|
| “规划与质检自愈回路” | 写成“前置规划加一次质检重试，均为失败放行的单次模型调用”，不要写成通用 Plan-and-Execute 或 Reflexion 框架 |
| “评测体系” | 写成“RAG 检索离线评测（22 题标注集，真实检索）”与“编排层确定性回归测试”；不要写“Agent 能力评测”或“生成质量 100%” |
| “记忆” | 写成“基于向量检索的会话记忆工具”，不要写“长期记忆系统” |
| “可观测” | 写成“Langfuse 链路追踪封装，用于开发环境”，除非完成 P0-3 |
| “多模型” | 写成“接入豆包（Responses API）、DeepSeek、讯飞三家并处理协议差异”，不要写通义、智谱 |
| “生产运行” | 写成“部署在单机 Docker Compose”；没有用户量与可用性数据时，不要写“高并发、高可用” |

### 7.3 不能写的内容

- MCP、沙箱、代码执行、多 Agent 协作、Skills 体系、上下文压缩、断点续跑、Checkpointer、异步长任务恢复（均未实现，见 §4）。
- 路线图第五章的简历模板里涉及“节点粒度 Checkpointer”“恢复成功率 X%”“故障注入 R 次”的任何句子。
- “引用准确率、拒答准确率、提示注入防御率 100%”。
- “Rerank 默认关闭”或“默认开启”（在 P0-1 完成前）。
- 测试用例总数（约 2392）和 148,514 行代码这类数字，除非重新实测并保留命令输出；这类大数字更容易被追问细节，价值也低。
- 任何未经 §1 方法核实的外部岗位结论，例如“百度、智谱、月之暗面要求……”。

---

## 8. 局限与未验证项

1. **外部数据覆盖**：百度需登录，月之暗面、智谱、阶跃星辰、百川、DeepSeek 未取得岗位原文；MiniMax、零一万物、商汤取自飞书招聘租户子域，归属为推断，证据等级低于大厂官方接口。
2. **样本偏差**：只取接口相关度排序的前 20 至 30 条，字节存在同标题多城市重复；词频是“是否提及”，不是“是否必须”；52 条样本不代表全市场。
3. **岗位时效**：腾讯的“更新日期”是接口 `LastUpdateTime`；字节为 `publish_time`；阿里为 `modifyTime`；美团为 `refreshTime`；含义不完全一致，不要当作同口径的发布日期。
4. **JD 与真实用人要求**：JD 里的年限与学历常被放宽，本报告引用的“放宽”文字仅限岗位原文明确写出的几条（腾讯 IEG、美团履约、阿里云、MiniMax）。
5. **源码侧**：未运行测试与评测脚本，未启动应用，未查看生产环境变量与数据库，因此“生产 Rerank 是否开启”“线上 Agent 成功率”均无法判断。测试文件数 261 与此前统计的 254 口径不同，用例数未重算。
6. **“缺失”结论**依赖对仓库的全文检索与目录检查，没有读取每个文件；极少数以别名实现的能力可能被漏掉，但对 MCP、沙箱、多 Agent、CI 这类有明确特征词的项，可信度较高。
7. **未覆盖**：前端可访问性与移动端表现、数据库迁移质量、`apps/web` 内非 Agent 业务的代码质量，均不在本次范围内。
8. **MCP 补强建议**依据 Context7 检索到的 Vercel AI SDK 6.0.0 文档片段；项目当前 `ai` 依赖为 `^6.0.50`（`apps/web/package.json`），未安装 `@ai-sdk/mcp`，接入前需要核对该包与当前版本的兼容性。

---

## 9. 附录：外部数据抓取方式（便于复核）

- 腾讯：`careers.tencent.com/tencentcareer/api/post/Query`（列表）与 `.../ByPostId`（详情），JSON。
- 阿里：`POST talent.alibaba.com/position/search?_csrf=<XSRF-TOKEN cookie>`，先 GET 招聘页取 cookie。
- 字节：先 `POST jobs.bytedance.com/api/v1/csrf/token` 取 token 与 cookie，再 `POST /api/v1/search/job/posts?portal_type=2&portal_entrance=1`，请求头带 `x-csrf-token`。
- 美团：`POST zhaopin.meituan.com/api/official/job/getJobList`，请求头带 `Origin`。
- 飞书招聘租户：同字节的 csrf 与搜索接口形式。
- 原始响应暂存于本机 `/tmp/jd-research/`，不在仓库内；统计脚本逻辑已在 §1.2 描述，复核时可按同一筛选规则重跑。
