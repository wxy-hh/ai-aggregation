# 三期 Spec：/chat Agent 用户自定义 webhook 工具

> 盘问十问收敛全部裁决，本文档为实施唯一权威依据。
> 前置：一期（工具调用两段式）与二期（多步自主循环）均已完成并验收（12275a1）。
> 一期 D9 路线图：多步循环 ✓ → **用户 webhook 工具（本期）** → 会话服务端化+长期记忆（独立立项）→ MCP。

## 0. 决策记录（盘问裁决汇总）

| # | 裁决项 | 结论 | 理由（压缩） |
|---|--------|------|--------------|
| D-三期-1 | 范围 | **只做 webhook 主线，零搭车债** | 二期遗留四债逐项拆完：附件输入=独立立项、工具并行=方向存疑（护栏介入点失效）、按步计费=二期已消解、输入放大系数=时机未到（跑量后用现有 AIUsageRecord 评估，零代码） |
| D-三期-2 | 归属模型 | **终端用户自配私有工具**（不做平台全局配置） | 路线图原文即「用户自定义」；平台要加工具直接写代码进注册表（一期熟路），webhook 框架的全部价值在「用户自带」 |
| D-三期-3 | 工具定义面 | **模板化表单**：名称/描述/URL/方法（GET·POST）/鉴权头/参数列表，平台确定性生成 JSON Schema；**10 个/用户** | 平台用户是消费者不是开发者，手写 JSON Schema 是摆设；schema 平台生成保证格式合法，模型调用质量的变量只剩描述质量；10 个上限防上下文窗口与成本被刷 |
| D-三期-4 | SSRF 安全模型 | **黑名单+护栏**，不做域名白名单：复用 url-guard 全套（内网/云元数据拦死、DNS 重绑定防护、fail-closed）+ webhook 专项收紧（**仅 https、禁重定向**）+ **全量审计落库** | 「平台白名单」与「用户自配任意 URL」直接矛盾；url-guard 已有 92 表驱动用例可直接复用；禁重定向因为 301/302 会把 POST 改写成 GET 静默丢 body，是经典坑 |
| D-三期-5 | secret 存储 | **AES-256-GCM 加密存 DB**，主密钥走 env；错密钥/坏数据=解密失败报错，不静默降级；UI 编辑态永不回显 | 仓库零加密设施，这是新地基；webhook 场景必须可逆（调用时要带出），哈希不适用；GCM 自带完整性校验；显式失败防「secret 静默丢失导致请求未鉴权」的幻觉 |
| D-三期-6 | agent 集成 | chat-handler agent 分支**按请求快照加载**用户工具合并进注册表；模型侧命名加前缀防冲突；上下文注入裁成 name+description；**webhook 每请求上限 3 次**（对齐出图上限，超限走 skip）；超时沿用 15s tool-policy | 快照语义=「配了就生效、改了就生效」，零缓存一致性负担；上限缺口是真实成本敞口；护栏体系全部零改动复用 |
| D-三期-7 | UI 触点 | **管理在 profile**（「我的工具」板块+底部抽屉表单）、**感知在 chat**（agent 开关旁一行状态条）、**调试在过程卡片**（复用 tool_result 摘要，不做日志查看器） | chat 页零改动会断发现性与验证环；管理是低频重表单该在 profile；调试通道二期已建成，是三期的直接红利 |
| D-三期-8 | 保存探测 | 保存只做**零 IO 校验**（字面量 guard+https+必填，不阻断保存）；抽屉内「测试连接」按钮=握手级 GET/HEAD（5s 超时、不带 secret、任何 HTTP 响应含 4xx/5xx 判可达）；测试接口限流 ~10 次/分/用户 | 业务探测（带参数 POST）副作用不可控直接排除；自动探测语义泥泞（GET 405 其实证明可达）；测试是给人信心的握手，不是给机器验收的关卡 |
| D-三期-9 | 测试接缝 | **一条主接缝**（HTTP 级复用二期模式，新替身仅 getUserTools + 出站 fetch）+ **三个纯函数下钻**（加密/https-only 收紧/schema 生成）+ route 测试走 auth 先例；不建 webhook 执行器独立单测层 | 沿用一期 D8 纪律；主接缝理想数量是一 |
| D-三期-10 | 计费 | **一口价内，账本零改动**；metadata 留痕 webhook 调用次数 | 与出图工具同口径；feature 继续单列 chat-agent，定价数据连续 |

---

## 1. Problem Statement

agent 模式目前只有两个平台内置工具（出图、网页抓取）。用户想让自己的服务参与对话——「查一下我后台今天的订单」「往我的通知服务发一条消息」——今天完全做不到：他们不会写代码进注册表，平台也不可能替每个用户开发工具。

对平台而言，缺这层能力，agent 就永远是「聊天+画图+抓网页」的演示品，成不了可扩展的执行代理。

## 2. Solution

用户在个人中心「我的工具」板块自助登记 webhook 工具：填表单（名称、给模型看的描述、URL、方法、一个鉴权头、参数列表），平台自动生成合法的 JSON Schema。登记后该用户的 agent 会话即可让模型自主调用这些工具，调用过程在过程卡片中实时可见，失败原因如实展示。

平台不背书任何用户 URL：所有出站调用按不可信地址处理——https-only、内网/云元数据拦死、DNS 重绑定防护、禁重定向、15s 超时、每请求 3 次上限、全量审计落库。secret 加密存储，永不回显。

## 3. User Stories

**登记与管理**

1. 作为已登录用户，我想在 profile 页看到「我的工具」板块，以便集中管理我的 webhook 工具。
2. 作为用户，我想用表单逐项填写工具信息（名称/描述/URL/方法/鉴权头/参数），以便不写 JSON Schema 也能登记工具。
3. 作为用户，我想表单为每个参数提供字段名/类型/必填/描述，以便模型正确理解我的接口入参。
4. 作为用户，我想保存时立即得到格式校验反馈（URL 不合法、非 https、必填缺失、命中黑名单），以便当场修正。
5. 作为用户，我想保存一个暂时不可达的工具不被阻拦，以便先登记后调试。
6. 作为用户，我想在表单里点「测试连接」并看到状态码与耗时（或具体失败原因：DNS/超时/TLS/黑名单），以便确认我的服务可达。
7. 作为用户，我想我的鉴权头被加密存储、编辑时也不回显，以便凭证不泄漏。
8. 作为用户，我想随时停用（不删除）一个工具，以便它不再被 agent 调用但配置保留。
9. 作为用户，我想删除不再需要的工具，以便列表保持干净。
10. 作为用户，我想知道自己最多能登记 10 个工具并在到达上限时得到明确提示，以便理解限制。
11. 作为用户，我想在手机上完成全部登记与管理操作，以便不被桌面端绑死。

**感知与使用**

12. 作为用户，我想打开 agent 开关时看到「已加载 N 个我的工具」（N=0 时提示可去添加），以便知道功能存在且已生效。
13. 作为用户，我想登记后**下一次** agent 请求就能用到新工具（无需等待缓存刷新），以便配了就生效。
14. 作为用户，我想修改工具后下一次请求即用新配置，以便改了就生效。
15. 作为用户，我想模型能根据我写的描述判断何时调用我的工具，以便对话自然触发。
16. 作为用户，我想在过程卡片里看到我的工具被调用的记录与结果摘要，以便确认它真的执行了。
17. 作为用户，我想工具调用失败（超时/4xx/5xx/被拒）时在过程卡片看到如实原因，以便定位是我服务端的问题还是平台的问题。
18. 作为用户，我想单次对话中我的 webhook 最多被调 3 次并在超限后模型被告知，以便成本和时延可控。
19. 作为未开启 agent 的用户，我想普通对话完全不受此功能影响，以便无感知零打扰。

**平台与安全**

20. 作为平台运营，我想每一次 webhook 调用都有审计记录（谁/何时/域名/状态码/耗时/响应大小），以便安全事故可追溯。
21. 作为平台运营，我想内网地址与云元数据地址被无条件拦死（含 DNS 重绑定绕过），以便 SSRF 防线不依赖域名审核。
22. 作为平台运营，我想 webhook 调用含在一口价内不新增计费面，以便账单口径不碎片化。
23. 作为平台运营，我想测试连接接口有限流，以便它不被当成 SSRF 探测工具滥用。
24. 作为系统，我想用户工具的密钥解密失败时显式报错而非静默降级，以便不出现「请求悄悄没带鉴权」的假成功。
25. 作为系统，我想审计写库失败不阻断用户调用（warn 留痕），以便存储抖动不放大成用户故障。

## 4. Implementation Decisions

### 4.1 数据模型（Prisma，新增两张表）

**`UserWebhookTool`**（用户工具定义）：

| 字段 | 类型 | 说明 |
|---|---|---|
| id | cuid | 主键 |
| userId | FK→User | 归属用户，级联删除 |
| name | string | 显示名（中文可），给用户看 |
| callName | string | 调用名（`^[a-z][a-z0-9_-]{1,30}$`），每用户唯一；模型侧工具名 = `wh_<callName>`，命名空间前缀杜绝与内置工具/其他用户工具冲突 |
| description | string | 给模型看的自然语言描述（进上下文） |
| url | string | 登记时过零 IO 校验（字面量 guard + https-only） |
| method | enum | `GET` / `POST` |
| authHeaderName | string? | 鉴权头名（如 `Authorization`/`X-API-Key`） |
| authHeaderValueEnc | string? | AES-256-GCM 密文（base64，含 iv+tag 打包格式） |
| params | JSON | 参数声明数组 `[{name,type,required,description}]`，type ∈ string/number/boolean；**由它确定性生成 JSON Schema** |
| enabled | boolean | 停用即不进注册表 |
| createdAt/updatedAt | timestamp | 惯例 |

**`WebhookToolCall`**（审计，D-三期-4）：id / userId / toolId / hostname（只存域名不存完整 URL，避免把可能带敏感参数的 query 落库）/ method / statusCode? / durationMs / responseBytes / outcome（success/failed/skipped/blocked）/ errorKind? / createdAt。**审计写入失败不阻断调用，warn 留痕**（故事 #25）。

### 4.2 加密（D-三期-5）

- 新增加密 helper（node:crypto，AES-256-GCM）：`encrypt(plain)→base64(iv‖tag‖cipher)` / `decrypt(payload)→plain`，主密钥从 env `WEBHOOK_SECRET_KEY`（32 字节 hex）读取。
- 启动/调用时密钥缺失或格式错误 = 显式抛错（配置事故快速暴露）；解密失败（错密钥/篡改/坏数据）= 显式报错，**不**静默当无鉴权处理。
- 现有 auth 模块只用哈希/随机数，无可复用设施，此模块为仓库首个可逆加密件，注释写清密钥生成与轮换方式。

### 4.3 API 契约（全部需登录，限流阈值登记进 AUTH_RATE_LIMITS 同款登记表）

| 路由 | 方法 | 语义 |
|---|---|---|
| `/api/agent-tools` | GET | 我的工具列表（**永不返回 authHeaderValue**，密文不出库）；chat 状态条懒加载复用此接口取数量 |
| `/api/agent-tools` | POST | 新建：zod 校验 + 零 IO guard + 10 个上限 + callName 每用户唯一；限流 ~30 次/分 |
| `/api/agent-tools/[id]` | PATCH | 更新（含 enabled 开关）；authHeaderValue 字段缺省=保持不变，显式空串=清除；**配对校验：显式清空 authHeaderName 连带清除密文（清空名称即移除整个鉴权配置），合并后最终态无名称却设密文一律 400**（评审修补：防密文残留导致执行器静默跳过鉴权注入而卡片仍显示已配置） |
| `/api/agent-tools/[id]` | DELETE | 删除 |
| `/api/agent-tools/[id]/test` | POST | 握手级探测（D-三期-8）：完整 guard（含 DNS 重绑定防护）后发 GET/HEAD，5s 超时，**不带 secret 不带 body**；任何 HTTP 响应判可达（回状态码+耗时），**例外：3xx 判不可达「重定向被拒」**（与禁重定向红线自洽）；网络层失败回具体原因；限流 ~10 次/分 |

所有可见文案中文；校验错误逐字段返回，前端表单就地标注。

### 4.4 agent 集成（D-三期-6）

- `ChatHandlerConfig` 新增可选注入点 `getUserTools(userId)`，默认实现查 DB（enabled=true）；agent 分支在分流时**按请求快照加载**并与内置注册表合并。
- 用户工具 → `AgentToolSpec` 适配：name=`wh_<callName>`、description=用户描述、parameters=由 params 生成的 zod schema、execute=webhook 执行器。
- 上下文注入**裁成 name+description**（完整 schema 不进系统提示，SDK tools 通道本就携带参数定义），控制上下文体积。
- **webhook 每请求上限 3 次**（新常量登记 agent-config，对齐出图上限的语义与 skip 机制：不执行、推成对事件、给模型「未执行」结果）。全局 10 次与单轮 3 次限制不变，webhook 计数是独立的第三层。计数语义=**实际派发次数**（先判后增，被上限拦截的调用不计入 metadata.webhookCalls）。
- 超时 15s 沿用 tool-policy 默认，不设工具级覆盖。

### 4.5 webhook 执行器（安全红线，D-三期-4）

- 复用 url-guard 判定层与 web-fetch 的 `guardedLookup` 连接模式（校验的 IP 与连接的 IP 同源，杜绝 TOCTOU）。
- **webhook 专属收紧层**（不改 url-guard 本体——web_fetch 仍需 http）：仅 https；**禁重定向**（3xx → 失败结果「目标地址返回重定向，已拒绝」）。
- GET → params 拼 query；POST → params 作 JSON body；鉴权头解密后注入。
- 响应处理：JSON 美化后截断注入模型；非 JSON 按文本截断注入；进模型长度上限沿用 tool-policy 截断机制（8000 字）；**另有单次读取硬上限 200KB——流式累计超限即销毁连接并判失败「响应过大」**（资源红线，比进模型截断更底层，评审补记）。
- 每次调用（含被 guard 拦截、被适配器层 skip）落审计表；调用结果经既有「工具结果合规检查」过检后回注。**审计口径补记**：适配器层 skip（webhook 每请求 3 次上限）落 `outcome='skipped'`；runner 级 skip（单轮/全局工具上限、时间预算跳过）是所有工具共用的编排语义，不落 WebhookToolCall——runner 不掌握工具记录的审计字段，穿层补写不值得（评审裁决）。

### 4.6 UI（D-三期-7；动手前先读 DESIGN.md，全程移动端优先）

- **profile 页新增「我的工具」板块**：卡片列表（显示名/描述/URL 域名/启用开关/编辑/删除），新增与编辑走底部抽屉表单；表单内嵌「测试连接」按钮与结果展示区。
- **chat 页 agent 开关旁一行状态条**：agent 开启时懒加载列表接口，显示「已加载 N 个我的工具 · 去管理」（N=0 显示「可添加我的工具」），点击跳 profile。不碰输入坞布局。
- 匿名/未登录用户：列表为空（getUserTools 返回 []），profile 板块引导登录，不产生任何报错。实现位置：`defaultGetUserTools` 查询带 `user: { isAnonymous: false }` 关系过滤（评审补记）。

### 4.7 计费（D-三期-10）

一口价内，账本零改动；finalize metadata 增加 `webhookCalls` 计数留痕，为后续定价与滥用分析攒数据。

## 5. Testing Decisions

好测试的标准不变：只测外部可观察行为（HTTP 状态/事件序列/落库内容），不测内部实现。

- **一条主接缝（HTTP 级）**：复用二期 chat-handler.agent.test.ts 模式——真实 createChatHandler + runAgent + 真实 webhook 执行器与 tool-policy；替身仅三个：streamText（模型行为）、`getUserTools`（DB 查询）、出站 fetch（webhook 端点行为）。决策→调用用户工具→结果回注→skip 上限→审计落库断言全在真实代码路径上。
- **三个纯函数下钻**：加密 helper（roundtrip/错钥/篡改）；https-only 收紧层（表驱动，并入 url-guard 测试惯例）；params→JSON Schema 生成器（类型映射/必填/非法名拒绝）。
- **route 测试走 auth 先例**：CRUD 的 zod 校验、10 上限、唯一性、**密文断言（写库值不含明文 secret）**、越权访问他人工具 404/403；test 路由的 4xx 判可达/超时判不可达/黑名单拒绝/限流。
- **不建 webhook 执行器独立单测层**（一期 D8 纪律，避免双 seam 漂移）。
- **真机验收**：本地起一个 echo server 作为真实 webhook 端点，跑「登记→chat 触发调用→过程卡片可见→故意填错看失败可见」全链路清单。

先例索引：二期主接缝（chat-handler.agent.test.ts）、url-guard 92 表驱动用例、auth route 测试、agnes-image 出站替身模式。

## 6. Out of Scope

- 平台/管理员全局工具（需要时直接写代码进注册表）
- OpenAPI/Swagger 导入（内部数据结构已兼容，未来只加解析前端）
- GET/POST 以外方法、多鉴权头、OAuth 客户端流转、请求体自由模板
- agent 附件输入（独立立项）、工具并行执行（方向存疑）、按步计费（已消解）
- 调用日志的用户可见查询界面（调试走过程卡片；审计表面向运营）
- 平台级域名白名单开关（企业场景到来时再加 env 过滤层）
- inbound webhook（外部事件触发平台动作）与 MCP（路线图下一站的前置就是本期安全模型跑通）
- 会话服务端化与长期记忆（独立立项）

## 7. Further Notes

- `WEBHOOK_SECRET_KEY` 部署备忘：32 字节随机 hex 生成，进 env 不进仓库；轮换=双密钥过渡窗口（旧密钥解密、新密钥加密），具体流程轮换时再定。
- 输入放大系数（多步重发累积上下文）：二期预留冗余吸收中；跑量约一个月后用 AIUsageRecord 现有字段（reserve 估算 vs finalize 实际）评估是否加系数，零新代码。
- 用户工具 schema 会进每次 agent 请求的上下文，10 个上限+注入裁剪是成本控制的第一道闸；若实测上下文水位仍高，下一步是「按对话相关性动态挂载」而非提高上限。
- UI 实施前必须通读根目录 DESIGN.md（AGENTS.md 强制）；全部注释与可见文案中文。

## 8. 验收结果（2026-10-02 真机验收）

验收方式偏差说明：§5 原计划「本地起 echo server」，实际改用公网回声端点 `https://postman-echo.com/post`（回显请求头与请求体，可同时验证鉴权头注入），免本地起服务，验证效力等同。

**已通过（8 项，全部真人浏览器操作 + DB 核对）**：

1. profile「我的工具」匿名引导态正确（上限插值「最多 10 个」生效）。
2. 抽屉登记工具全链路：「回声测试」`wh_echo_test` / POST postman-echo / 鉴权头 + 1 个 string 参数登记成功；DB 核对密文为 60 字符 base64（AES-256-GCM 输出）、不含明文、`enabled=true`。
3. 「测试连接」probe 真实出站成功：`连通成功 · HTTP 404 · 耗时 1220ms`（GET 探测打 POST 端点返回 404，属「收到任何 HTTP 响应即判可达」口径，证明 DNS/TCP/TLS/HTTP 全链路通）。
4. chat 页开启 agent 状态条双确认：「Agent 模式 · 已切换至豆包 Seed · 额度消耗更高」+「已加载 1 个我的工具 · 去管理」。
5. 编辑抽屉密文不回显：secret 输入框值为空、占位符「已配置，输入新值可覆盖」；鉴权头名称回填；PATCH 配对校验文案（清空名称连带清密文）在案。
6. 停用开关：卡片即时变「已停用」；chat 状态条同步变为「可添加我的工具，让 Agent 调用你的服务」——`enabled=false` 过滤端到端生效。
7. 删除二次确认弹窗文案正确（明示鉴权信息无法恢复）；确认后 UI 计数归 0/10，DB 核对 0 行（记录与密文一并清除）。
8. 意外收获的真实验证：ark 网络失败时编排器「编排失败」→ 预留额度正确释放，二期 reserve/finalize 回滚链路在真实故障下运转正常。

**受环境限制未验（1 项）**：

- chat 端到端真实模型决策调用 webhook 工具：验收时本机直连 `ark.cn-beijing.volces.com`（与 `dashscope.aliyuncs.com`）TLS 握手失败（curl exit 35），而 api.deepseek.com / postman-echo.com 正常，判定为本机网络路径限制。agent 提供方硬锁定为 doubao（`AGENT_PROVIDER`/`AGENT_MODEL` 常量，`ProviderName` 仅 xunfei/doubao），为验收临时加 provider 属规格外改动，未做。
- 遮挡风险评估：模型决策→用户工具接线有 `chat-handler.agent-webhook.test.ts` 8 用例覆盖；ToolSet 呈现与二期已真机验收的 image_generate 共用 `buildToolSet` 同一路径；webhook 出站执行器已由 probe 真机验证。遗留风险低。
- 复验方法：网络可达 ark 的环境（或开启代理）下，登记任一 echo 工具后在 chat 开 agent 发送「用回声工具测试一下」，观察过程卡片出现 `wh_echo_test` 调用与结果即可。
