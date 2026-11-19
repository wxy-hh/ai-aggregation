# 技术规格：聊天请求传输契约与输入解析边界（评审 C4）

Status: `ready-for-agent`
ADR: `docs/adr/0050-chat-request-wire-contract.md`
Glossary: `GLOSSARY.md`（ChatRequestContract、WireMessage、RequestProjection、BatchReservation、ApprovalResume、ArtifactContextInjection）
报告来源: `docs/reports/2026-11-10-core-architecture-review.md` 第五节 C4

---

## Problem Statement

从用户视角，现状有四个真实痛感：

1. **Agent 模式下重新生成丢失能力包**：用户在 Agent 模式选定场景能力包或临时停用某工具后点击「重新生成」，该轮请求漏传 capabilityPack 与 disabledToolKeys，模型行为与发送时不一致——这是 4+1 个客户端组装点内联拼装造成的漂移实证，用户看到的就是「重新生成不按我选的配置来」。
2. **畸形输入无防护**：聊天输入方向没有运行时契约——逐条消息的 role/content/附件形状零校验、无长度与数量上限。非法 provider 值被静默路由到 GenericAdapter 形成隐藏失败；超长粘贴内容可直接进入合规检测与 token 估算，是真实的服务资源消耗面。
3. **历史污损会砖化会话的隐性风险**：本地持久化的历史消息若出现附件数据残缺，任何「严格校验」式的改造都会让整场会话永久无法继续；而现状的零校验又让损坏数据长驱直入模型上下文，两者都是用户不可接受的。
4. **维护者被迫理解前端快照**：服务端聊天路由、Provider adapter 与 eval 脚本反向依赖前端 Store 的完整消息类型（含流式状态、推理、计划、审批等 UI 字段），新增一个请求字段要同步改 4+1 个组装点，测试必须为每个组装点构造完整快照——请求字段的正确性没有单一事实源。

## Solution

建立聊天请求契约（ChatRequestContract），把输入方向收敛为与输出流契约（ADR-0045）对称的共享传输契约：

1. 所有聊天请求经白名单运行时解析：消息窄化为 WireMessage，未知字段静默剥离，已知字段畸变得到带错误码的中文 400 提示——坏输入快速失败且可定位，合法输入逐字节兼容。
2. 历史消息中的残缺附件在源头自愈（客户端投影剥离 + 服务端兜底剥离），当前轮附件损坏在发送前硬阻断——会话永不因历史污损死锁，用户也永远不会遇到「发了图模型却说看不见」。
3. 客户端经请求投影（RequestProjection）从会话快照明确生成请求：审批卡片与凭证绝不进历史，4+1 个组装点收编为唯一出口，reload 漏传能力包的漂移 Bug 随之修复。
4. 批量预留（BatchReservation）获得双向契约：请求与响应形状同一事实源，空模型列表与超上限请求被明确拒绝。

## User Stories

1. 作为一名普通用户，我发送纯文本消息时，请求被正常接受并以 SSE 流返回，以便我获得与现状一致的对话体验。
2. 作为一名普通用户，我只发一张图片不配文字时，请求被接受，以便我可以纯图文交互。
3. 作为一名普通用户，我发送「图片 + 文字」混合消息时，模型正确收到图片与文本，以便多模态回答贴合我的输入。
4. 作为一名普通用户，我发送空文本且无任何附件时，收到明确的中文 400 提示，以便我不会发起无意义的 token 消耗。
5. 作为一名移动端用户，我的浏览器缓存了旧版前端、发送携带 UI 状态字段的快照消息时，服务端静默剥离后正常处理，以便我在版本滚动期不被误伤。
6. 作为一名用户，当请求中混入 truthy 脏布尔值（如 agent: 1）时，服务端将其安全降级为普通对话，以便我不会被意外切入高计费的 Agent 模式，也不会被粗暴拒绝。
7. 作为一名用户，当我请求了平台不支持的 provider 值时，收到明确的 400 提示，以便失败可见而非被静默路由到通用适配器产生怪异回答。
8. 作为一名用户，当我粘贴超长内容或携带超限附件时，收到明确的 400 提示，以便服务资源不被滥用、我的意图被清晰告知。
9. 作为一名 Agent 模式用户，我选定场景能力包并临时停用工具后发送消息，服务端按门控规则正确识别这些选项，以便我的配置意图生效。
10. 作为一名 Agent 模式用户，我在非 Agent 会话中即使误带 capabilityPack 等字段，服务端也会将其剥离，以便普通会话不受 Agent 选项污染。
11. 作为一名审批流程用户，我确认写操作审批后发起 ApprovalResume（携带审批凭证），服务端验签后执行被批准的那一次调用，以便人机协同流程闭环。
12. 作为一名审批流程用户，审批恢复请求形状非法时，我收到既有的中文 400 提示（「审批恢复请求格式不正确，请重新提出需求」），以便我知道该如何恢复。
13. 作为一名用户，审批卡片与其凭证在任何路径下都不会进入回传历史与模型上下文，以便写操作授权边界不被扩大（ADR-0041 语义在契约层固化）。
14. 作为一名用户，我拒绝审批后，下一轮模型以上下文可见的一句系统提示知晓该拒绝，以便模型不会重复发起被我否决的操作。
15. 作为一名用户，当我的历史消息中某条附件数据残缺时，对话不中断——该附件被剥离、消息文本保留，以便我上百轮的重要会话不会因单条历史污损而永久无法继续。
16. 作为一名用户，当我当前要发送的附件未就绪或已损坏时，客户端在发送前阻断并明确提示，以便我绝不会遇到「发了图、模型却说看不见」的静默失败。
17. 作为一名 Agent 模式用户，我点击「重新生成」时，该轮重新携带我选定的能力包与会话级工具覆盖，以便重新生成与首次发送行为一致（漂移修复）；同时重新生成维持不带附件的既有行为不变。
18. 作为一名对比模式用户，我发起多模型对比时，批量预留按模型数为我冻结额度，响应回传各模型独立的幂等标识与预留号，以便各模型分支的计费互不串扰。
19. 作为一名对比模式用户，批量预留请求中模型列表为空或超过上限（8 个）时，我收到明确的 400 提示，以便非法批量请求不再被静默放行或无防护地打向数据库。
20. 作为一名超长会话用户，我拥有数百条历史的会话可以正常继续对话，不会因消息条数硬上限被砖化，以便我的存量会话不受损。
21. 作为一名维护者，我为 Provider adapter 编写测试时只需构造窄 WireMessage，而不必组装完整前端快照，以便测试成本与心智负担下降。
22. 作为一名维护者，我新增一个聊天请求字段时只需修改契约 module 一处，4+1 个组装点即受类型与运行时双重约束，以便请求规则不再漂移。
23. 作为一名排障开发者，我从 400 响应中的机器错误码、errorId 与 details 路径快速定位非法输入的位置，而用户只看到友好中文，以便排查效率与用户体验兼得。
24. 作为一名安全审视者，我确认审批凭证与 UI 状态在任何路径下都不会混入普通历史消息或模型上下文，以便传输层不存在授权泄漏面。

## Implementation Decisions

1. **契约 module 归属 `@repo/shared`，与输出流契约同包邻接**：定义并导出 WireMessage / WireAttachment / ChatRequestBody / ApprovalResumePayload 形状与解析入口 `parseChatRequestBody`、投影函数 `projectWireHistory`、附件窄化 `toWireAttachment`；批量预留的 `parseBatchReserveBody` 与响应形状 `BatchReserveResponseBody` 同契约定义。契约形状（API contract，拷问阶段确认的决策形态）：

   ```ts
   interface WireAttachment { type: 'image' | 'file'; imageUrl?: string; fileId?: string; name?: string /* ≤255 字符，服务端截断 */ }
   interface WireMessage { role: 'user' | 'assistant' | 'system'; content: string; attachments?: WireAttachment[] }
   ```

   完整 Message 快照类型不得搬进共享包（Q1 红线）；前端 UI 类型不得进入契约入参（projectWireHistory 只用窄鸭子类型入参）。

2. **解析 = 白名单静默剥离（strip）+ 两段式**：schema 只校形状；normalize 纯函数固化平台不变量（agent/thinking 只认严格 true，其余脏值归一化 false 且不 400——B-7 计费安全语义；非 agent 模式剥离 capabilityPack / disabledToolKeys / artifactContext / approvalResume；approvalScope 默认 `''` 截断 200；conversationId 截断 128）。未知字段一律丢弃：不 400、不透传。provider 收紧为 ProviderName 枚举校验，非法值 400。**被推翻项**：chat-handler 的 `body as {...}` 断言解析与逐字段 ad-hoc 校验（de facto 约定，无 ADR）；provider 非法值「静默落 GenericAdapter」的现状行为（依据：垃圾输入不应形成隐藏失败；代价：仅影响本就不合法的请求）。

3. **非法输入分层语义矩阵**：

   | 输入类别 | 处置 |
   |---|---|
   | 未知字段（版本杂质） | 静默剥离 |
   | 布尔门控脏值（agent: 1、thinking: "yes"） | 归一化 false，不 400 |
   | 结构性根错误（body 非对象、messages 非数组/空） | 400 |
   | 已知字段值非法（role/content/attachment.type/provider 等类型或枚举错误） | 400 |
   | content 空串且无附件 | 400 |
   | 历史（非末条）消息附件缺载荷 | 剥离该附件、保留消息文本 |
   | 末条消息附件缺载荷 | 400 |
   | approvalResume 形状非法 | 400，保留既有中文文案 |

   400 响应形状：`{ error: 用户可读中文, code: 机器错误码, errorId, details: [{ path, message }] }`；错误码与 details 供前端针对性映射与测试断言，服务端日志全量记录。

4. **安全上限**：单条 content ≤ 64k 字符；单消息附件 ≤ 5 个；imageUrl ≤ 15MB 字符串；messages 至少含一条 user 消息；messages 条数首期不设硬上限（现状全量回传无上限，硬上限会砖化存量长会话；历史截断归客户端投影的独立议题，见 Out of Scope）。被否方案：条数上限 200（砖化存量会话）、附件 name 必填（破坏剪贴板无名图片与旧缓存客户端）、契约版本字段（strip + 可选字段演进已覆盖兼容）。

5. **请求投影分层**：shared 的 `projectWireHistory` 以窄鸭子类型入参固化 ADR-0041 规则（审批卡片与凭证绝不进历史；空内容审批消息不发送；已拒绝卡片转写一句系统提示；历史残缺附件剥离），作为跨端唯一事实源。web 新建 request-projection module 作为 4+1 组装点（sendMessage / reload / ApprovalResume / 对比 runModel / 批量预留）的唯一出口，输出即 ChatRequestBody / BatchReserveRequestBody。`toWireAttachment` 返回 null 的语义分两层：历史轮次静默剥离；**当前发送轮次投影失败必须硬阻断报错**，绝不静默吞图。对比模式 models 投影只保留 provider 与 model（剥离 label 等 UI 字段）。

6. **reload 行为**：维持不带附件的既有行为（投影 module 内具名分支，不再靠内联 map 隐式表达）；修复漏传 capabilityPack / disabledToolKeys 的漂移 Bug——重新生成与首次发送走同一组装出口后自然一致。**这是本规格仅有的两处用户可见行为变化之一**（另一处为 provider 非法 400），spec 与回归用例显式记录。

7. **批量预留双向锁定**：`parseBatchReserveBody` 复用 WireMessage 校验、provider 枚举与 400 错误形状；保留独立批量语义（独立 body 形状、服务端生成 requestId、admin 短路返回空、不合并进 parseChatRequestBody）。models 空数组 400（原作者报错文案本义即「模型列表不能为空」）、数组上限 8（客户端上限 4，留一倍裕量）。`BatchReserveResponseBody` 同契约定义，客户端响应断言以其为准。

8. **服务端 adapter 输入窄化**：ChatContext.messages 从 Store 完整 Message 类型换为 WireMessage[]；types.ts、chat-handler、agent-runner、adapters（doubao/xunfei/generic）、chained-session、eval 脚本一并移除对 `@/stores/chat-store` 的反向 import。切片内一步到位，不留 `as unknown as` 中间态强转。

9. **迁移双切片**：切片一 = 锁定现状合法请求样本（characterization tests）+ shared 契约与决策表测试 + 服务端接入（parser 替换断言 + 接口窄化）；切片二 = 客户端投影接入（reload 修复与当前附件阻断生效）。strip 语义保证旧客户端与新服务端逐字节兼容，两切片独立交付。解析器实现沿用 shared 包既有运行时解析惯例，行为以本规格决策表为准。

10. **不改变**：ADR-0041 审批历史裁剪语义、ADR-0037 产物上下文服务端复核（resolveArtifactContext 保持服务端权威）、ADR-0045 输出流契约、ADR-0016 thinking 语义、ADR-0046 双快照语义、QuotaSession 计费决策表、批量预留的估算口径（单份 prompt × 模型数）。

## Testing Decisions

**好测试的标准**：只断言外部可观察行为——解析结果/拒绝决定、HTTP 状态与错误形状（error/code/details）、adapter 实际收到的窄消息、客户端实际发出的请求体；不断言解析器内部实现（schema 组合方式、守卫函数结构）。

**测试接缝（已在拷问阶段确认）**：主接缝为 shared 契约 module 的解析与投影纯函数（parseChatRequestBody / parseBatchReserveBody / projectWireHistory / toWireAttachment），以决策表覆盖；路由级测试沿用既有 mock-adapter 装配缝（chat-handler 测试注入 getAdapter 替身，遵循 ADR-0003 精神不在路由测试复刻计费决策表）；客户端投影以 request-projection 纯函数为接缝；真实浏览器链路验收核心路径。既有接缝复用，不新增假设接缝。

**落盘与先行艺术**：

- 契约决策表测试随实现落在 shared 包测试目录（先行范本：同包 chat-stream-contract.test.ts 的事件决策表、artifact-context.test.ts 的「客户端 builder + 服务端 resolver」两侧同测范式）。
- characterization 锁定测试先行：切片一动手前先锁定 4+1 组装点当前实际发出的合法请求样例与服务端接受行为（先行范本：chat-store.approval.test.ts 的请求组装断言、comparison-store.test.ts 的对比流程测试），必须先绿（锁定现状）再在切片二中见证 reload 请求体变化（漂移修复）。
- 路由测试改造既有 chat-handler 测试套件（先行范本：同目录 chat-handler.test.ts 的 mock-adapter 装配），非法输入矩阵经路由断言 400 形状。
- request-projection 测试落在 web lib 测试目录（先行范本：lib/agent/approval-display 既有纯函数测试范式）。
- 决策表用例清单：未知字段剥离矩阵；布尔门控归一化（agent: 1 / "false" / null → false）；非法 role/content/attachment.type/provider 的 400 与 details 路径；content 空且无附件 400；历史附件剥离 vs 末条附件 400；approvalResume 形状非法 400 与中文文案；审批剥离矩阵（卡片不进历史/拒绝转写/空内容审批消息跳过）；超限矩阵（content > 64k、附件 > 5、imageUrl > 15MB、无 user 消息）；批量预留（空 models 400、超 8 个 400、逐元素非法 400、admin 短路空响应、响应形状）；provider 枚举 400；旧客户端全量快照兼容（strip 后逐字段等价）。

**真实浏览器验收**：触及对话核心链路（发送、重新生成、Agent、审批恢复、对比），阶段 5 不可豁免；macOS 宿主默认 ego-browser 可见窗口，走真实登录与真实后端，至少一条 RealLinkSmoke 覆盖「发送 → 流式回答 → 账本可见」全链路。用例编号与冻结断言在 `/qa-test-planner` 阶段落盘。

## 交付命令

```bash
pnpm --filter @repo/shared test
pnpm --filter @repo/web test "src/app/api/chat"
pnpm --filter @repo/web test "src/lib"
pnpm --filter @repo/web test "src/stores"
pnpm --filter @repo/shared typecheck
pnpm --filter @repo/web typecheck
```

## Out of Scope

- 批量预留估算口径修正（多轮对比的 branch 历史对齐）：底层为「单份平铺 messages × 模型数」算法，各模型分支独立演进无法平铺表达，修正属计费域重构，列为对比模式独立 backlog。
- 客户端历史截断策略（长会话投影时截断历史）：与 MemoryIndex、上下文窗口预算联动，独立议题。
- C5 聊天完成生命周期与 AgentRun 审计，以及审查报告中其它候选（C1/C2/C3/C6～C9 与第十节局部修正项）。
- 输出流契约的任何变更（ADR-0045 已定，本规格只补输入方向）。
- 任何用户可见 UI 变化、QuotaSession 计费决策表、限额阈值政策、审批协议语义（ADR-0041 保持）。
- ApprovalResume 的服务端执行语义、ArtifactContextInjection 的长度复核规则（ADR-0037 服务端权威保持）。

## Further Notes

- 决策全文、六项被否方案及代价见 ADR-0050；术语以 GLOSSARY.md 新增条目为准。
- 用户可见行为变化仅两处：provider 非法值 400（垃圾输入不再静默降级）；reload 重新携带 capabilityPack / disabledToolKeys（漂移修复）。其余合法请求逐字节兼容，旧缓存客户端经 strip 语义无感。
- eval 脚本（agent-baseline、artifact-patch）与既有测试中的 Store Message import 随切片一一并迁移；既有测试若构造非法 provider 字符串将在 parser 接入后红灯，切片一须先梳理。
- 收益口径：locality / leverage / 测试成本下降为机制描述（模块边界与测试接缝的结构性收益）；「减少线上异常输入故障」未量化实际故障率，不写成已证实收益。
