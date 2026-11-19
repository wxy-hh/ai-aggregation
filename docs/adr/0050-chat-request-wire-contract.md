# 0050. 聊天请求传输契约与输入解析边界（评审 C4）

* **编号**：ADR-0050
* **状态**：已接受
* **日期**：2026-11-11
* **决策者**：AI 聚合平台工程团队
* **范围**：`@repo/shared` 聊天输入契约、`apps/web` 聊天路由（chat-handler / batch-reserve）、Provider adapter 输入、客户端请求投影（chat-store / comparison-store）

---

## 背景

聊天输出流已由 ADR-0045 的共享契约与运行时解析统一；输入方向仍以 `body as {...}` 断言代替解析，逐条消息的 role/content/附件零运行时校验，且 chat-handler、agent-runner、Provider adapter 与 eval 脚本从 `@/stores/chat-store` 反向 import 完整快照 `Message` 类型（含流式状态、推理、计划、审批等 UI 字段）。客户端 4+1 个组装点（sendMessage / reload / ApprovalResume / 对比 runModel / batch-reserve）内联拼装，已发生漂移实证：reload 漏传 capabilityPack 与 disabledToolKeys。审查报告 C4（docs/reports/2026-11-10-core-architecture-review.md）经六问拷问收敛出本决策。

## 决策

1. **白名单窄契约落地 `@repo/shared`**：`WireMessage` 只含 role（user/assistant/system 三值）、content 与窄化附件（`{type, imageUrl?, fileId?, name?(≤255 字符)}`）；解析 = 白名单静默剥离（strip）——未知字段不 400 也不透传。content 允许空串但须满足「非空 || 有附件」联合校验；单条 content ≤ 64k 字符、单消息附件 ≤ 5、imageUrl ≤ 15MB、messages 至少含一条 user 消息；messages 条数首期不设硬上限（现状全量回传无上限，硬上限会砖化存量长会话）。
2. **两段式解析**：`chatRequestBodySchema` 只校形状；`normalizeChatRequestBody` 纯函数固化平台不变量——B-7：agent/thinking 只认严格 `true`，其余脏值（1、"false" 等）归一化为 false 且不 400；ADR-0041：approvalScope 默认 `''` 并截断 200、conversationId 截断 128；非 agent 模式剥离 capabilityPack / disabledToolKeys / artifactContext / approvalResume。provider 收紧为 ProviderName 枚举校验，非法值 400（取代现状「静默落 GenericAdapter」）。
3. **非法输入分层语义**：版本杂质（未知字段）静默剥离；布尔门控脏值归一化降级；结构性根错误（body 非对象、messages 非数组/空）、已知字段值非法、**末条消息**附件缺载荷 → 400，响应体 `{error 中文, code, errorId, details[]}`；**历史消息**附件缺载荷 → 剥离该附件保留消息文本（防单条历史污损砖化整个会话）；当前轮附件在客户端投影失败 → 硬阻断报错，绝不静默吞图。
4. **投影分层**：shared 拥有 `projectWireHistory` 鸭子类型纯函数（ADR-0041 审批剥离、拒绝转写、历史附件自愈），作为跨端唯一事实源，不搬前端 UI 类型；web 新建 request-projection 作为 4+1 组装点的唯一出口。reload 维持不带附件的既有行为，并修复漏传 capabilityPack / disabledToolKeys 的漂移 Bug（属行为修复，spec 与回归用例显式记录）。
5. **批量预留双向锁定**：`parseBatchReserveBody` 复用 WireMessage 校验、provider 枚举与错误形状，保留独立批量语义（独立 body 形状、服务端生成 requestId、admin 短路返回空）；models 空数组 400（原作者报错文案本义即「模型列表不能为空」）、数组上限 8；`BatchReserveResponseBody` 同契约定义。估算口径维持现状（单份 prompt × 模型数）——各模型分支历史独立演进，底层 `reserveChatQuotaBatch` 为平铺算法无法表达，修正属计费域重构，列为对比模式独立 backlog，不在 C4 夹带。
6. **迁移双切片**：切片一 = 锁定现状合法请求样本（characterization tests）+ shared 契约与决策表测试 + 服务端接入（parser 替换断言，`ChatContext.messages` 换 `WireMessage[]`，types.ts / chat-handler / agent-runner / adapters / chained-session / eval 一并移除 Store 反向 import，禁止中间态 `as unknown as` 强转）。切片二 = 客户端投影接入（reload 修复与当前附件阻断生效）。strip 语义保证旧客户端与新服务端逐字节兼容，两切片独立交付。
7. **验收**：决策表红灯用例（非法 role/content/附件矩阵、布尔门控归一化、历史附件剥离 vs 末条 400、审批剥离矩阵、provider 枚举 400、超限、空 models、batch 响应形状）；真实浏览器链路验收（发送 / 重新生成 / agent / 审批恢复 / 对比）不可豁免。

## 取代与修订

- **取代**：chat-handler 的 `body as {...}` 断言解析与逐字段 ad-hoc 校验（de facto 约定，无 ADR），由 `parseChatRequestBody` 统一接管。
- **不改变**：ADR-0041 审批历史裁剪语义、ADR-0037 产物上下文服务端复核、ADR-0045 输出流契约、ADR-0016 thinking 语义、ADR-0046 双快照语义。

## 备选方案及否决理由

1. **只给完整 Message 加校验器、不窄化**：服务端仍反向依赖 Store 类型，UI 字段增减迫使服务端发版；全量字段进入传输层存在审批凭证混入模型上下文的泄漏路径。否决。
2. **已知字段非法一律 400**：误伤 B-7 门控语义（`agent: 1` 应安全降级而非拒绝用户）；历史单条损坏 400 会砖化整个会话。否决，改分层语义。
3. **附件 name 必填**：破坏剪贴板无名图片与旧缓存客户端。否决，改可选 + 服务端截断。
4. **messages 条数硬上限**：现状客户端全量回传且无上限，硬上限会砖化存量超长会话。否决，首期不设；历史截断归客户端投影的独立议题。
5. **batch-reserve 估算口径顺带修复为全分支**：底层算法为「单份平铺 messages × 模型数」，分支独立演进无法平铺表达，强修导致 N×∑length 天量过度预留。否决，独立 backlog。
6. **契约加版本字段**：strip 语义 + 可选字段演进已覆盖前后端兼容。否决，避免过度设计。

## 后果

- **接口变化**：`ChatContext.messages` 窄化为 `WireMessage[]`；eval 脚本与既有测试中的 Store `Message` import 一并迁移；既有测试若构造非法 provider 字符串将在 parser 接入后红灯，切片一须先梳理。
- **行为变化仅两处**：provider 非法值从静默降级改为 400（垃圾输入本就不合法）；reload 重新携带 capabilityPack / disabledToolKeys（漂移修复）。其余合法请求逐字节兼容。
- **契约演进纪律**：新增可选字段视为向后兼容；收窄已有字段语义视为破坏性变更，须修订本 ADR。
- **验收基线**：决策表红灯用例 + 真实浏览器链路冒烟，作为 C4 交付的验收契约（后续 `/to-spec` 与 `/qa-test-planner` 落盘 Schema 4 细节）。
