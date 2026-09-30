# 真实思考流改造 · 手动验收清单

> 依据 spec §9 八条验收项。自动证据 = 已随工单 01-04 落地的单测/类型检查；待人工 = 需登录态 + 真实 ARK_API_KEY 的浏览器联调。
> 日期：2026-10-01

| # | 验收项 | 验证方法 | 结果 |
|---|--------|----------|------|
| 1 | 豆包模型提问：思考块展开流式渲染真实推理内容，与官方 App 对拍一致 | 浏览器：豆包模型提问，展开思考块与豆包官方 App 同题对拍 | ☐ 待人工 |
| 2 | 正文开始流出瞬间思考块自动折叠为"已思考 X 秒"，可手动展开，手动操作后不再自动干预 | 浏览器：观察首 text-delta 到达时的折叠行为；手动展开/收起后观察是否被再次自动干预 | ☐ 待人工（实现已按"自动折叠仅一次 + override 优先"落地，见 message-item.tsx ThinkingBlock） |
| 3 | 讯飞模型：无思考块，骨架屏在首字节到达即消失 | 浏览器：三个讯飞模型各发一问 | ☐ 待人工 |
| 4 | 推理中点停止：推理保留 + stopped + 时长定格；刷新后推理内容仍在（折叠态） | 浏览器：推理流出后点停止，检查思考块与"已停止"标记；F5 刷新后检查折叠还原 | ☑ 自动证据（store 单测：仅推理非空时中断保留 + stopped + 时长定格）／☐ 浏览器行为待人工复核 |
| 5 | 推理-only 流断：消息保留、计费按 partial 结算（billing 记录 outcome=partial） | 浏览器/日志：推理阶段断网或停服，查 billing 记录 outcome | ☑ 自动证据（适配器单测：推理-only 截断 outcome=partial）／☐ billing 记录待人工复核 |
| 6 | 多轮对话请求体中不出现历史 reasoningContent（测试锁死） | 适配器锁定测试 | ☑ 通过（doubao-reasoning.test.ts：含 reasoningContent 的历史消息不进上游请求体） |
| 7 | 对比页双跑不崩、不展示思考块 | 浏览器：对比页双模型各跑一次 | ☑ 自动证据（comparison-store 走 streamChatResponse handlers 对象签名，不传 onReasoning 天然兼容；stores 102 用例绿）／☐ 浏览器待人工复核 |
| 8 | parseChatStreamEvent 对非法 reasoning-delta 帧返回 null，不终止流 | 契约单测 | ☑ 通过（chat-stream.test.ts：空 text / 非 string / 缺 text 三类非法帧返回 null，遇 done 正常结束） |

## 结论

- 自动证据项：6 / 8 全部通过（类型检查 + ESLint + 全量测试套件绿）。
- 待人工项：1 / 2 / 3 全量待浏览器联调；4 / 5 / 7 自动证据已覆盖逻辑层，浏览器行为复核。
- 失败项：无（截至自动验收阶段）。
