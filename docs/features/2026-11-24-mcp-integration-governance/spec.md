# 技术规格：个人远程 MCP 扩展与安全治理垂直闭环

Spec Authority: `docs/features/2026-11-24-mcp-integration-governance/spec.md`（唯一事实源；`.scratch/mcp-integration-governance/spec.md` 为供 QA 检查器解析的工作副本）
Status: `ready-for-agent`
ADR: `docs/adr/0064-personal-remote-mcp-governance.md`（关联 ADR-0008、ADR-0011、ADR-0014、ADR-0028、ADR-0041、ADR-0050）
PRD: `docs/prd/04-prd-mcp-integration-governance.md` §0（一期裁决记录）
Glossary: `GLOSSARY.md`（`McpServerConfig`、`McpTool`、`McpToolWhitelist`、`McpToolSnapshot`、`McpToolApprovalPolicy`、`McpUntrustedContent`、`ApprovalRequest`、`ApprovalToken`、`ApprovalResume`、`ToolCallAudit`、`SessionToolOverride`、`CapabilityPack`、`AgentRuntimeContext`、`LiveRun`、`EgressUrlPreflight`、`GuardedWebFetch`）
QA Kind: `feature`
QA 车道：慢车道

---

## Problem Statement

用户想让 Agent 连接自己已有的外部业务系统（代码托管、企业内部查询服务、业务数据接口），但平台目前只有两类能力：写 TypeScript 重新发版才能增加内置工具，或在个人中心逐接口登记 Webhook 工具并手工描述参数。两者都无法直接消费已经按 MCP（Model Context Protocol）标准暴露工具的服务。

更关键的是，用户不敢把外部服务直接挂进对话：不知道服务到底暴露了多少工具、哪些会进入模型上下文、模型会把什么参数发送给第三方、有副作用的调用是否会在自己没看见时执行；服务挂起或频繁报错时，整个对话也可能被拖垮。用户需要的是「我自己登记一个远程 MCP 服务 → 看清它有什么 → 逐个决定信任哪些 → 有副作用的调用先给我看 → 服务异常时对话仍有界」这条可验证的闭环，而不是一个声称什么都能接的通用平台。

## Solution

1. **私有登记与审核**：在个人中心既有「我的工具」区域并列新增 MCP 服务器管理，沿用卡片列表、底部抽屉表单与移动端优先布局。用户填写名称、HTTPS Streamable HTTP 地址与可选的一个静态鉴权头；保存时先做零 I/O 安全校验，随后自动尝试发现工具。发现失败保留配置并显示可重试状态，但无有效快照时绝不挂载任何工具。
2. **快照与白名单**：工具定义以 `McpToolSnapshot` 形式只在添加或用户主动刷新时更新；新发现工具默认停用，用户显式加入 `McpToolWhitelist`（合计最多 8 个）后才进入 Agent 上下文，并逐个设置 `McpToolApprovalPolicy`（默认必须审批）。上游变更不会静默扩大信任。
3. **统一治理管道**：MCP 工具经 `AgentRuntimeContext` 合并进既有工具注册表，调用必须经过 `ToolExecutionPipeline`（参数校验、15 秒超时、运行级连败熔断、工具结果合规过检、审计），不另建执行链。聊天流中展示 `[MCP: <Server>]` 来源徽标、入参摘要、耗时与有界结果。
4. **复用审批协议**：需审批的调用完全复用 ADR-0041 的 `ApprovalRequest` / `ApprovalToken` / `ApprovalResume`。卡片展示 Server 名称、工具名、目标域名、完整参数与 10 分钟倒计时；确认后直接执行被批准的那一次调用并继续 ReAct；拒绝只落盘，不自动调用模型。
5. **不可信边界**：所有出站按 HTTPS-only、禁重定向、每次建连做连接级 DNS/SSRF 防护；工具描述、参数定义与返回内容均按 `McpUntrustedContent` 处理，只回注有界文本与 JSON，不自动下载多模态或嵌入资源。提示注入残余风险在产品中如实披露，不作免疫宣称。
6. **账务、审计与验收**：MCP 调用含在 chat-agent 一口价内，只补充调用元数据；新增独立 MCP 元数据审计，不落原始载荷；使用官方 SDK 构建的受控 HTTPS Streamable HTTP 测试服务完成真实浏览器验收。

## User Stories

**A. 登记、发现与配置生命周期**

1. 作为登录用户，我想在个人中心「我的工具」区域看到与 Webhook 工具并列的 MCP 服务器入口，以便集中管理两类扩展而不必记住新菜单位置。
2. 作为登录用户，我想填写名称、HTTPS Streamable HTTP 地址与可选的一个静态鉴权头来保存自己的远程服务，以便标准 MCP 服务无需改平台代码即可接入。
3. 作为登录用户，我想在提交非 HTTPS、私网、回环、云元数据或会重定向的地址时被明确拒绝并看到中文原因，以便平台不成为 SSRF 通道。
4. 作为登录用户，我想在已有 10 个 MCP 服务器时再新增被拒绝并看到上限提示，以便配置规模可预期。
5. 作为登录用户，我想在保存时服务暂时不可达仍保留配置并显示「发现失败」，以便不用重填表单就能稍后重试。
6. 作为登录用户，我想点「刷新工具」后看到该服务暴露的工具名、描述与参数摘要，以便决定信任哪些。
7. 作为登录用户，我想在发现或刷新失败时看到超时、鉴权失败、协议不支持、分页超限或快照过大等明确原因，同时不看到任何密钥，以便排障且不泄凭证。
8. 作为登录用户，我想在填入旧版 HTTP+SSE 服务地址时被明确提示「不支持」，以便不误以为已接入。
9. 作为登录用户，我想编辑时鉴权头取值永不回显、只显示「已配置」，以便密钥不泄漏到前端。
10. 作为登录用户，我想修改 URL 或鉴权配置后旧工具快照与待审批卡片立即失效，以便不会用旧批准执行新目标。
11. 作为登录用户，我想刷新失败时上一次成功快照保持不变，以便临时故障不破坏已启用工具。
12. 作为登录用户，我想刷新后新增工具或 Schema 发生变化的工具回到「停用且默认必须审批」，以便上游变更不会静默扩大信任。
13. 作为登录用户，我想删除服务器时其工具与待审批调用一并失效，以便不存在孤儿工具。
14. 作为登录用户，我想停用服务器后其工具不再进入后续 Agent 会话，以便即时收窄能力。
15. 作为登录用户，我想删除配置后密钥密文与工具定义一并清除，以便不留残留凭证。
16. 作为登录用户 A，我想完全看不到也调用不了用户 B 的 MCP 配置与工具，以便租户隔离成立。

**B. 白名单、信任策略与会话感知**

17. 作为登录用户，我想逐个启用发现到的工具，未启用的工具绝不出现在模型上下文，以便控制上下文与出站面。
18. 作为登录用户，我想在试图启用第 9 个 MCP 工具时被拒绝并看到 8 个上限提示，以便上下文预算可控。
19. 作为登录用户，我想在设置「允许自动执行」时看到它明确表示「信任把模型生成的参数发给该服务」，而不是「只读/安全」，以便做出知情信任决策。
20. 作为登录用户，我想看到服务方给出的 readOnlyHint 与工具名称只作展示、不作为放行依据，以便不被名称或注解误导。
21. 作为登录用户，我想把工具从「自动执行」改回「必须审批」后下一次会话立即生效，以便随时收紧。
22. 作为登录用户，我想在聊天「可用工具」面板看到 MCP 工具分组、Server 来源与数量，以便知道本会话实际能力。
23. 作为登录用户，我想在会话里关闭某 MCP 工具后本会话不再挂载它、重开会话恢复全局白名单，以便临时收窄不污染配置。
24. 作为登录用户，我想在会话面板无法启用一个全局未加入白名单的工具，以便白名单不被绕过。
25. 作为登录用户，我想选用 `CapabilityPack` 时 MCP 工具可用性与 Webhook 一致，以便场景包不产生意外差异。

**C. 调用、审批与运行保护**

26. 作为登录用户，我想让 Agent 调用已启用的 MCP 工具时看到 `[MCP: <Server>]` 徽标、入参摘要、耗时与结构化结果，以便透明追踪外部调用。
27. 作为登录用户，我想在模型调用需审批的 MCP 工具时看到审批卡片展示 Server 名称、工具名、目标域名、完整参数与 10 分钟倒计时，且卡片出现前没有任何请求发往外部服务，以便事先知情。
28. 作为登录用户，我想点「确认执行」后系统执行的是卡片上那一次调用且参数不变，随后 Agent 继续完成任务，以便确认不产生二次决策偏差。
29. 作为登录用户，我想点「拒绝」后卡片变为已拒绝、本轮结束、不自动调用模型也不消耗额度，以便随时安全叫停。
30. 作为登录用户，我想快速双击确认或网络重试时该调用只执行一次，以便不产生重复副作用。
31. 作为登录用户，我想在卡片签发后修改 URL、鉴权、Schema 快照、启停或审批策略时，旧卡片在确认时被拒绝并提示重新发起，以便不用旧批准执行新配置。
32. 作为登录用户，我想在审批参数超过硬上限时系统拒绝发起审批而不是截断后展示，以便不出现「只看到一半就批准」。
33. 作为登录用户，我想 MCP 工具超时（15 秒）时在过程卡片看到如实的「用时过长」提示，且本次运行不再发出新工具调用，以便不被挂死。
34. 作为登录用户，我想遇到不稳定服务连续失败时本次运行按既有连败熔断正常结束，且下个运行不继承熔断状态，以便链路有界且行为可解释。
35. 作为登录用户，我想 MCP 调用含在 chat-agent 一口价内、没有单独按次扣费，以便账单口径不碎片化。
36. 作为登录用户，我想模型给出不符合工具 JSON Schema（含 oneOf、条件、本地 `$defs` 引用）的参数时被服务端拒绝并提示修正，以便不把非法参数发给第三方。
37. 作为登录用户，我想遇到带远程 `$ref` 的工具 Schema 时该工具被明确标记不支持，以便平台不自动抓取外部引用。
38. 作为登录用户，我想遇到超大或过深的 Schema、超大响应体时被有界拒绝，以便不被恶意服务耗尽资源。
39. 作为登录用户，我想调用返回图片、音频或嵌入资源的工具时看到明确「未支持」提示且系统不自动下载，以便不产生隐式二次出站。
40. 作为登录用户，我想看到的 MCP 结果经过既有工具结果合规检查与进模型/前端摘要两级截断，以便上下文不被挤占。
41. 作为登录用户，我想被明确告知外部工具描述与结果按不可信数据处理、提示注入风险未被完全消除，以便不误以为平台已免疫。
42. 作为登录用户，我想在未开启 Agent 的普通聊天中完全不受 MCP 影响，以便零打扰。

**D. 审计、失败关闭与验收**

43. 作为平台运营，我想查到每次发现、刷新、真实调用、待审批与安全拦截的元数据记录（用户、Server、工具、域名、快照版本、结果、耗时、响应大小、错误类别），以便安全事故可追溯。
44. 作为平台运营，我想审计中不保存原始参数、返回正文、鉴权头取值或 URL 查询串，以便审计本身不成为泄密面。
45. 作为平台运营，我想在签名密钥缺失或 Redis 不可用时写操作审批失败关闭，以便不降级放行。
46. 作为平台运营，我想审计写库失败只告警、不阻断用户调用，以便存储抖动不放大成用户故障。
47. 作为开发者，我想用官方 SDK 构建的受控 HTTPS Streamable HTTP 测试服务重复验证读调用、写审批、拒绝、超时与 SSRF 拦截，以便发布门禁不依赖第三方公网服务。
48. 作为 QA，我想在真实登录、真实后端与受控服务的浏览器链路中看到「配置 → 发现 → 启用 → 调用 → 审批确认/拒绝」的终态，并确认窄屏抽屉与卡片可用，以便核心链路验收成立。

## Implementation Decisions

### 1. 权威边界与被推翻项

本 spec 以 ADR-0064 与 PRD §0 的 24 项裁决为唯一范围依据。原 PRD §3 技术方案是早期草案，以下条目被明确推翻，实现不得照搬；每项同时记录采用代价与保留原案的代价。

| 原草案 | 本期裁决 | 推翻依据 | 采用代价 | 保留原案的代价 |
| --- | --- | --- | --- | --- |
| `SSE/HTTP` 混写 + 枚举 `SSE`/`STDIO`，生产「管理员可用 Stdio」 | 仅远程 Streamable HTTP，Stdio 完全排除 | 现行协议已弃用旧版 HTTP+SSE；Stdio 在平台主机启动子进程，管理员权限不等于容器隔离 | 旧版 SSE 服务与本地文件系统示例不能接入 | 必须补进程沙箱、逃逸防护与生产隔离，且无法证明安全 |
| `McpClientManager` 单例、长连接池、心跳 | 发现独立建连；同一 `LiveRun` 内复用，终态可靠关闭；审批恢复另建连接 | 连接池会引入多实例粘滞、配置/凭证更新、旧凭证驻留与持续 SSRF 面 | 每次运行有建连开销，无跨请求复用 | 需分布式连接状态、心跳与淘汰策略，超出垂直闭环 |
| JSON Schema → 标准 Zod Schema 后封装 `CoreTool` | 保留 JSON Schema 2020-12，用 `ai` 的 `jsonSchema()` 挂载 + Ajv 2020 校验 | 2020-12 允许 `oneOf`/`anyOf`/条件/`$ref`/`$defs`，转 Zod 会丢约束或误拒 | 注册表需新增一种规格形态与校验依赖 | 不能声称支持协议合法工具，或把非法参数直接发给第三方 |
| 名称含 `create`/`write`/`delete`/`merge` 判高危 | 新工具默认必须审批，只能显式放行；名称与注解不参与安全判定 | `send`/`transfer`/`run` 等写操作会漏判，不可信服务的注解不可当事实；ADR-0041 已选择显式字段 | 初始确认点击更多，用户需自行判断信任 | 可能把写操作错误放行，安全边界不可证明 |
| `PAUSED_APPROVAL` 新终态 + 拒绝后模型智能降级 | 完全复用 ADR-0041：流正常结束、新请求恢复、拒绝纯前端终止 | ADR-0041 §3/§6 已接受，代码已验收；MCP 专用状态机会分裂语义 | 拒绝后需用户再开口 | 需新增恢复状态机、计费与重连语义，并改变已验收 Webhook 行为 |
| 单 Server 连续 3 次超时/5xx 熔断，后续 0ms 快速失败 | 复用既有运行级连败熔断，不新增 Server 级或跨运行状态 | `ToolExecutionPipeline.shouldHalt()` 是全局连败计数，3 次后往往已先终止运行 | 一个不稳定服务可能终止整个运行；无跨请求快速失败记忆 | 需调整全局管道语义并新增 Redis 分布式状态 |
| `Token & 耗时配额预留`、按工具配额账本 | 沿用 chat-agent 一口价与既有 `QuotaSession` 预留/结算，只补调用元数据 | Webhook spec D-三期-10 已定一口价，账本零改动 | 无法按第三方工具单独计费 | 需定义超时、审批恢复、部分成功的账务规则并改造账本 |
| 单 Server 超 20 工具即需「前置意图筛选器」或会话最多 8 工具 | 发现数可超 20，仅白名单合计 ≤8；快照另有工具数与字节硬上限 | 发现数与上下文挂载是两件事；意图筛选收益无对照评测证据 | 大型服务配置界面需滚动/筛选 | 静默截断导致用户所需工具不可预测，或拒绝合法服务 |
| `mcp-settings-modal.tsx` 独立设置弹窗 | 复用个人中心工具管理区与聊天可用工具面板 | 低频重表单与高频对话分离，且窄屏弹窗难承载工具表格 | 需改造既有工具面板与分组渲染 | 两个管理入口分裂，移动端复杂度上升 |
| 审批弹窗展示「完整参数」无上限 | 完整原始参数 + 8,000 字符硬上限，超限拒绝审批 | 任意 MCP 参数结构会造成大事件、本地快照膨胀与移动端不可用 | 超大参数调用需模型缩减后重试 | 卡片与本地会话快照可被恶意参数撑爆 |
| 验收接官方 SQLite / Fetch Server | 受控 HTTPS Streamable HTTP 测试服务；第三方服务仅可选补充 | 官方示例常依赖 Stdio，与远程边界冲突；GitHub 类服务引入 OAuth 与真实写副作用 | 不能宣称广泛生态兼容 | 验收绕过远程传输、HTTPS、DNS 与连接级 SSRF 核心路径 |

以上均为机制与边界裁决，不宣称对任务成功率、工具匹配精度、延迟或成本有已证实收益；如需此类结论，须另行设计可复现对照评测。

### 2. 模块与接口职责

- **持久化层**：新增 `McpServerConfig` 主表（归属 `User`、名称、HTTPS URL、可选静态鉴权头名与 AES-256-GCM 密文、启用状态、发现状态、最后成功快照标识、时间戳），工具定义快照表（Server 归属、版本号、工具名、描述、`inputSchema`、注解、安全配置指纹），工具策略表或快照内策略字段（启用、是否允许自动执行），以及 MCP 元数据审计表。所有查询按 `userId` 收敛，删除级联，审计实体的 `toolId` 在工具删除后置空而非删除记录。
- **配置 API 模块**：需登录、限流（沿用 `AUTH_RATE_LIMITS` 同款登记表）、逐字段校验与租户归属。提供列表（永不下发密文，只返回「已配置」布尔）、创建、更新、删除、刷新工具、查看工具定义五类操作。创建与刷新先做零 I/O 校验，再走受控发现；发现结果写快照与审计。
- **MCP 客户端适配层**：连接工厂按生命周期创建官方 SDK 客户端与 Streamable HTTP 传输；受控 Fetch；`tools/list` 显式分页；快照规范化与大小/深度校验；`tools/call` 调用适配；结果投影。此层不持有跨请求状态。
- **工具注册表扩展**：`AgentToolSpec` 增加一种「JSON Schema 规格」形态，既可供 AI SDK `jsonSchema()` 挂载，也可供 `validateToolArgs` 调用 Ajv 校验函数；内置工具的 Zod 形态保持不变。`ToolApprovalPolicy` 增加由服务端推导的安全配置指纹字段。
- **Agent 运行时上下文**：在既有 `createAgentRuntimeContext` 中加载当前用户已启用且通过白名单的 MCP 工具规格，合并进注册表；应用 `SessionToolOverride` 只做收窄；`finishMetadata()` 增加 `mcpCalls`；新增幂等 `dispose()` 释放本次运行持有的 MCP 连接。
- **编排器与审批模块**：`runAgent` 的 `buildToolSet` 按注册表规格形态分别用 `zodSchema()` / `jsonSchema()`；审批凭证模块保持 `v: 1` 与既有字段，新增可选 MCP 绑定字段并由服务端推导 expected。SSE 契约在工具调用、结果与审批请求事件中增加可选 Server 来源字段，旧客户端按既有「未知字段忽略」行为兼容。
- **UI 模块**：个人中心工具管理区新增 MCP 分组、卡片、底部抽屉表单与工具列表/启停/策略开关；聊天可用工具面板新增 MCP 分组与来源徽标；工具过程卡片与审批卡片渲染 `[MCP: <Server>]` 徽标，审批卡完整参数使用折叠/滚动区。新增或修改 UI 前必须通读 `DESIGN.md`，遵守移动端红线（热区 ≥44px、安全区、底部抽屉、不依赖 hover）。

### 3. 依赖与版本冻结

- 采用 `@modelcontextprotocol/sdk@1.32.2`（npm 当前稳定版），明确不混用 v2 文档行为：`listTools()` 必须显式 `cursor` / `nextCursor` 循环，不能依赖 v2 的自动聚页；`callTool` 使用 `timeout` 与 `signal`；`client.close()` 幂等关闭。旧版 `SSEClientTransport` 不启用。
- 采用 `ajv@8.20.0` 的 JSON Schema 2020-12 专用构建入口，只做同步 `compile` / `validate`：不提供 `loadSchema`、不使用 `compileAsync`、禁用 `$async`、`$data` 与任何远程 `$ref`；本地 `$defs` 允许；编译与校验受预算限制。
- AI SDK 6 使用 `jsonSchema(schema, { validate })` 与既有 `zodSchema()` 并列；不改动内置工具规格，不引入 `@ai-sdk/mcp` 造成双客户端。
- 静态鉴权头加密复用现有 Webhook 的 AES-256-GCM helper 与 `WEBHOOK_SECRET_KEY`；审批签名沿用 `APPROVAL_TOKEN_SECRET`，不新增部署密钥。
- 新增数据库模型需要一次迁移；迁移与生成脚本走既有 `db:generate` / `db:migrate` 入口。

### 4. 有界常量（机制约束，非效果承诺）

以下数值作为单一常量真源登记在既有 agent 配置登记表同款位置，并在服务端复核，前端只做提示：

- 每用户 `McpServerConfig` ≤ 10；全局启用 `McpTool` ≤ 8。
- 发现总超时 10 秒、单页请求 5 秒、分页 ≤ 16 页、发现工具数 ≤ 128、`McpToolSnapshot` 总字节 ≤ 256KB。
- 单工具描述 ≤ 2,000 字符、`inputSchema` ≤ 32KB、Schema 深度 ≤ 16、Ajv 编译预算 ≤ 500ms、单次校验预算 ≤ 100ms。
- 审批参数规范化序列化 ≤ 8,000 字符；超限拒绝签发审批，不截断后批准。
- `tools/call` 原始响应累计 ≤ 200KB（SSE 流同样按字节累计）；进模型 ≤ 8,000 字符、前端摘要 ≤ 240 字符，沿用 `DEFAULT_TOOL_POLICY`。
- 单工具执行 15 秒（沿用 `ToolExecutionPipeline`）；静态鉴权头名 ≤ 100 字符、取值 ≤ 2,000 字符；URL ≤ 2,048 字符。
- 全部超限按失败关闭处理，给出中文原因，不静默截取。

### 5. 发现、快照与审批失效

- 发现使用官方 SDK 显式分页循环，逐页累计工具数与字节；超限立即终止并关闭连接，不写快照、不覆盖旧快照。
- 成功刷新原子写入新版本快照：仅保留仍存在、Schema 与描述未变且未被停用的工具的既有策略；新增工具或 Schema 变化工具一律回到「停用 + 默认必须审批」；被上游删除的工具从白名单移除。
- 修改 URL 或鉴权配置立即清空快照、提升安全配置指纹并作废旧审批；未重新发现前该 Server 不向 Agent 提供任何工具。
- 安全配置指纹由服务端推导：`sha256(规范化 URL + 鉴权头名 + 密文摘要 + 快照版本 + 启用状态 + 审批策略 + 稳定工具标识)`，不接受请求体传入。
- 审批凭证保持 `v: 1` 与既有字段；新增可选 MCP 绑定字段（serverId、snapshotVersion、configFingerprint）。旧 Webhook 凭证不含这些字段，验签时按缺省空值归一，行为不变。expected 绑定一律由服务端从当前用户配置与注册表推导。
- 审批恢复沿用 `ApprovalResume`：验签通过后直接执行被批准调用，模型不重新决策；`enablePlanning: false`；计划沿用既有检查点。

### 6. 出站安全（禁止「假复用」）

- 现有 `GuardedWebFetch` 是 GET/缓冲式抓取器，**不能**直接当作 MCP SDK 所需的 POST/流式 `FetchLike` 复用；本期新建 MCP 专用受控 Fetch，基于 Node 原生 `http/https` 请求与既有 `guardedLookup`（连接级 DNS 锁定，防重绑定 TOCTOU）。
- 每个请求（initialize、`tools/list` 分页、`tools/call`、GET SSE、`terminateSession`）都必须经过同一个受控 Fetch：先 `validateUrlLiteral` + HTTPS-only，再 `guardedLookup`，`redirect: manual`，任何 3xx 一律失败关闭，响应体按字节流式累计并截断，`AbortSignal` 全程贯通。
- 官方 SDK 1.32.2 的默认 `redirectPolicy: 'same-origin'` 仍会跟随同源跳转，因此不能只靠该默认值；必须验证 SDK 的所有请求分支都走注入的 `fetch`。若发现 SDK 存在绕过注入 Fetch 的路径，该 Server 判为不可用（失败关闭），不得降级为普通 `fetch`。
- 保存/刷新时的零 I/O 校验只作前置；DNS 与 SSRF 防护在每次实际建连时重新执行，禁止私网、回环、云元数据地址与重定向到内网。
- 静态鉴权头只在服务端注入请求头，永不进入前端响应、SSE 事件、审批卡片、审计记录或本地会话快照。

### 7. 命名、连接生命周期与关闭责任

- 模型侧工具名由 Server 稳定标识与原始工具名确定性派生为 `mcp_<serverKey>_<toolName>`，保留「模型名 → Server + 原始工具名」映射用于 `tools/call`；跨 Server 重名不覆盖，注册表沿用既有重名告警。Server 改名或重名冲突导致工具名变化时视为快照版本变更，作废旧审批。
- 发现连接由配置 API 创建，在 `finally` 中幂等关闭。
- 运行连接由 `AgentRuntimeContext` 创建，仅在本次 `LiveRun` 内复用；`runAgent` 在流正常完成、失败、`Abort`、审批暂停终态时通过 `dispose()` 关闭。
- `chat-handler` 在配额预留之前创建运行时上下文，因此**创建后但尚未进入 runner 的异常路径**（验签拒绝、额度不足、活跃运行冲突、注册容量不足、预留失败、后续任何提前 return 或 catch）也必须调用 `dispose()`；关闭失败只告警、不阻断用户响应，且不得留下可复用的连接。
- 审批恢复按新运行重新建连，不复用暂停前的连接；不做全局长连接池、心跳或跨请求缓存。

### 8. 结果、审计与账务

- `tools/call` 结果只投影文本与 `structuredContent`/JSON；图片、音频、嵌入资源明确标记「未支持」且不下载；`isError` 按失败回注。结果经既有工具结果合规检查后按上限截断，工具描述、Schema 与结果统一按 `McpUntrustedContent` 标注，不新增 MCP 专属污点模式。
- 新增 MCP 元数据审计实体，`eventType` 区分 discover / refresh / call / pending_approval / blocked，`outcome` 区分 success / failed / skipped / blocked / pending_approval；记录用户、Server、工具、域名、快照版本、HTTP 状态、耗时、响应大小与错误类别；覆盖鉴权建连失败与安全拦截；不记录原始参数、返回正文、鉴权头或 URL 查询串；写库失败 warn 不阻断。
- `pending_approval` 排除在成功率分母之外；暂停不计入实际派发次数，恢复执行的那一次计入新请求。
- 一口价内不改 `QuotaSession` 与 `ChatCompletionLifecycle` 账务；`finishMetadata` 增加 `mcpCalls` 作为结算 metadata 留痕。

### 9. UI 与交互

- 管理复用个人中心既有工具管理区，不新增独立设置弹窗；聊天复用可用工具面板，过程与审批卡增加 Server 徽标；审批卡完整参数用折叠/滚动区，超限文案明确要求模型缩减后重试。
- 所有可见文案中文；错误逐字段标注；密钥编辑不回显；发现失败状态可编辑可重试；白名单与审批策略变更即时生效。
- 新增 MCP 工具不改变普通聊天、Webhook 工具或 `CapabilityPack` 对用户扩展工具的既有语义。

## Testing Decisions

### 什么是好的测试

1. **只测外部可观察行为**：断言 HTTP 状态与错误码、SSE 事件序列、数据库落库内容、审批卡片与工具面板的用户可见终态、审计记录字段；不测试私有函数、内部循环变量或 SDK 内部状态。
2. **确定性与隔离**：模型决策、外部网络、Redis/数据库通过既有注入点替换为可控替身；每个用例独立租户，产出数据可清理；不以真实模型输出的非确定性分支作硬断言。
3. **失败关闭可观察**：每个安全边界都要有「越界输入 → 明确拒绝且无出站请求」的断言，而不是只测正常路径。

### 主接缝（唯一一条 HTTP 级主接缝）

以「配置保存 → 工具发现 → 白名单挂载 → Agent 调用 → 审批签发 → 确认恢复 / 拒绝 → 配置变更失效 → 超时与运行级熔断 → 审计落库」为一条主接缝：真实运行配置 API、`createChatHandler`、`AgentRuntimeContext`、工具注册表、`ToolExecutionPipeline`、MCP 适配层与官方 SDK。替身仅保留既有 I/O 边界：模型 `streamText`、外部网络（以官方 SDK 1.32.2 构建的进程内/本地受控 Streamable HTTP 服务或受控 Fetch）、Redis/数据库注入点。不得把主逻辑拆成多个适配器私有接缝。

主接缝需覆盖：无鉴权读工具成功回注；需审批写工具出站前暂停且无外部请求；确认后执行原参数、拒绝后不产生恢复请求；重复确认只执行一次；URL/鉴权/快照/启停/策略变更后旧凭证失效；非法参数与远程 `$ref` 在服务端的拦截；15 秒超时与连败熔断终止运行；发现失败保留配置且不覆盖旧快照；审计元数据完整且不含原始载荷；跨租户越权 404；一口价结算不被改写。

### 纯函数下钻（表驱动）

- 受控 Fetch 与 SSRF：HTTPS-only、私网/回环/元数据/DNS 重绑定、3xx 全拒绝、响应字节上限、Abort 传递。
- JSON Schema 边界：`oneOf`/`allOf`/条件/本地 `$defs` 合法校验，远程 `$ref`、`$async`、`$data`、深度与大小超限拒绝，编译/校验预算。
- 快照规范化与版本：新增/变更工具回落默认停用、删除工具移除白名单、刷新失败原子性、安全配置指纹推导与审批失效判定。
- 审批参数上限与工具命名映射：完整展示、超限拒绝、跨 Server 重名不覆盖。

### 路由与组件级

- 配置 API：未登录拒绝、越权隔离、限流、10 个上限、密文不回显与写库无明文、URL 零 I/O 校验、刷新失败状态。
- 组件：审批卡 Server 徽标与完整参数/超限提示；可用工具面板 MCP 分组、会话只收窄不能扩大、窄屏热区与抽屉。
- 既有回归：`tool-pipeline.test.ts`、`runtime-context.test.ts`、`approval-card.test.tsx` 追加 MCP 相关用例，确认 Webhook 与内置工具行为不变。

### 真实浏览器验收（阶段 5）

触及认证、对话、审批、历史与计费核心链路，必须完成阶段 5：以官方 SDK 构建的受控 HTTPS Streamable HTTP 测试服务为后端，真实登录 → 个人中心登记 → 发现 → 启用白名单 → 对话触发读调用 → 触发写调用并确认/拒绝 → 查看过程卡片与审批卡 → 窄屏视口复核。按宿主工具优先级选择；本项目 macOS 环境按既有铁律先探活 `ego-browser` 并使用可见窗口复用登录态，无 GUI 或探活失败时经说明后按 `qa-workflow.md` 降级。至少一条 `RealLinkSmoke` 走真实登录、真实输入与真实后端，只断言本次新产生的用户可见终态；响应注入只用于构造故障态并标注，不替代真实链路。证据为带 `AssertionMarker` 的日志与目标区域截图，经 `qa-run` 落盘。

### 类似测试先例

`chat-handler.agent-webhook.test.ts`（HTTP 主接缝）、`tool-pipeline.test.ts`（治理管道）、`approval-card.test.tsx` 与 `chat-store.approval.test.ts`（审批卡片）、`agent-tools` 路由测试（鉴权/限流/密文断言）、`url-guard` 表驱动用例、`chat-handler.agent-resilience.test.ts`（审批恢复与中止）、`agent-eval-benchmark-dashboard` spec 的测试组织方式。

`QA Kind: feature`：阶段 4 的 TDD 垂直切片红灯证据照常要求；不设置「修复前复现日志」验收或审查项。

## 交付命令

> 说明：web 包包含既有未配置外部环境的历史测试，本次交付验证聚焦本特性新增与直接回归的定向测试文件。浏览器验收属于阶段 5 的 `qa-run` 过程脚本证据，由 `qa-plan.md` 冻结并落盘，不列入交付命令，以免阶段 3B 基线对尚不存在的过程脚本产生红灯；其证据仍是交付卡点。

```bash
pnpm --filter @repo/shared test
pnpm --filter @repo/shared type-check
pnpm --filter @repo/db generate
pnpm --filter @repo/web exec vitest run src/app/api/mcp-servers
pnpm --filter @repo/web exec vitest run src/app/api/chat/_lib/chat-handler.agent-mcp.test.ts
pnpm --filter @repo/web exec vitest run src/lib/agent/mcp
pnpm --filter @repo/web exec vitest run src/app/api/chat/_lib/agent/runtime-context.test.ts
pnpm --filter @repo/web exec vitest run src/lib/agent/tool-pipeline.test.ts
pnpm --filter @repo/web exec vitest run src/components/chat/plan/approval-card.test.tsx
pnpm --filter @repo/web exec vitest run src/components/chat/session-tools-panel.test.tsx
pnpm --filter @repo/web type-check
pnpm --filter @repo/web lint
pnpm --filter @repo/web build
```

## Out of Scope

1. **Stdio 与本地进程托管**：不在平台主机启动任何 MCP 子进程，不提供生产沙箱例外，也不支持本地文件系统示例作为能力证明。
2. **旧版 HTTP+SSE**：不实现 `SSEClientTransport`、自动回退双栈或长驻 SSE 监听。
3. **其他协议能力面**：`resources`、`prompts`、采样、任务型长调用、`input_required` 多轮交互与服务端主动通知均不接入。
4. **认证扩展**：不做 OAuth 授权码、动态客户端注册、令牌刷新、回调、多鉴权头或凭证轮换。
5. **平台化能力**：不做管理员共享 Server、全局配置、Server 市场、租户间分发或独立 MCP 设置弹窗。
6. **连接基础设施**：不做全局长连接池、心跳、跨请求复用、断线自动重连与多实例粘滞。
7. **智能筛选**：不做前置意图筛选器、自动工具推荐或按对话动态挂载；不声称提高工具匹配精度。
8. **审批协议分叉**：不新增 `PAUSED_APPROVAL` 终态、MCP 专用暂停状态机或「拒绝后自动调用模型降级」；不改变 ADR-0041 已验收的 Webhook 行为。
9. **风险自动分级**：不按工具名关键词或 MCP 注解自动判定只读/放行，不把注解当可信事实。
10. **熔断与计费扩展**：不做 Server 级或跨运行熔断、不承诺 0ms 快速失败、不做按工具配额预留或独立计费账务。
11. **数据与内容边界**：不保存原始参数/返回正文/鉴权信息/URL 查询串到审计；不自动下载图片、音频或嵌入资源；不新增全局外部内容污点管控；不宣称提示注入已完全消除。
12. **Schema 有损转换**：不把 2020-12 JSON Schema 转成 Zod，不自动解引用远程 `$ref`。
13. **验收边界**：不以本地 Stdio 官方示例或 GitHub 等第三方公共服务作为发布门禁；不宣称广泛生态兼容性。
14. **效果宣称**：不宣称任务成功率、延迟、Token 成本或上下文占用的已证实收益；相关结论需另立可复现对照评测。

## Further Notes

- **求职与答辩口径**：可以讲「标准 MCP 协议接入 + 不可信外部工具的边界治理（SSRF、HITL 审批、白名单、有界输出、元数据审计）」；不能讲「通用 MCP 平台」「支持本地文件系统」「已解决提示注入」「0ms Server 熔断」「按工具计费」。
- **部署**：新增一次 Prisma 迁移；不新增环境变量密钥（复用 `WEBHOOK_SECRET_KEY` 与 `APPROVAL_TOKEN_SECRET`）；升级后存量 Webhook 审批行为必须保持不变。
- **失败关闭兜底**：若官方 SDK 1.32.2 无法让全部请求经过受控 Fetch，或存在绕过 DNS/重定向防护的分支，则该 Server 一律不可用，不得降级为普通 `fetch`；此情形下不交付远程 MCP 能力，而不是放宽安全边界。
- **连接泄漏卡点**：实现与验收都必须覆盖「运行时创建后未进入 runner」的提前退出路径、`Abort`、审批暂停、审批恢复与关闭异常；`dispose()` 必须幂等。
- **版本边界**：npm 稳定版为 `@modelcontextprotocol/sdk@1.32.2`，其分页为显式 `cursor`/`nextCursor`；在线 v2 文档的自动聚页行为不属于本期依赖，实现前须按锁定的 1.32.2 源码复核 Fetch 注入、重定向与关闭能力。
- **单一事实源**：术语以 `GLOSSARY.md` 为准；范围以 ADR-0064 与 PRD §0 为准；本文与两者冲突时以两者为准，并须回写修订记录，不得长期分叉。
