# 0016. DeepSeek 模型接入、Agent 模式适配与深度思考开关架构

* **状态**：已接受
* **日期**：2026-10-13
* **决策者**：AI 聚合平台工程团队
* **范围**：`apps/web`（`chat-workspace`、`chat-input`、`chat-store`、`settings-store`、`agent-runner`、`agent-config`、`chat-handler`）、`packages/providers`（`factory`）、`packages/shared`、`docs/adr`

---

## 背景

当前平台在智能对话及 Agent 模式中存在以下痛点与现实约束：
1. **豆包模型额度耗尽与单点依赖**：此前 Agent 模式硬编码强制使用豆包（`doubao-seed-evolving`），由于目前豆包上游额度耗尽，导致整条 Agent 链路不可用；
2. **多模型生态接入需求**：DeepSeek 官方 API 具备高性价比（按量计费）与高性能，官方已全面支持标准 `tools` 函数调用、多模态与 `thinking` 深度思考参数，平台需要无缝集成 DeepSeek；
3. **保护既有工程资产**：豆包适配器与相关逻辑已经过大量场景验证与测试，不应一刀切完全废弃，而是在保留现有体系的基础上平滑扩展，让系统具备双供应方冗余能力；
4. **思考模式（Thinking）的灵活调度**：Agent 模式是多步循环决策，若默认全流程深度思考会导致延迟暴增与消耗激增；但在特定复杂逻辑下，用户又渴望模型展示思维链推理过程。

## 决策

1. **多供应方扩展与 DeepSeek 凭据映射（Provider Registry）**：
   - 保留 `doubao` 和 `xunfei` 供应方实现不变；
   - 在 `packages/providers` 与全局类型中正式增加 `deepseek` 供应方；
   - **凭据读取契约**：
     - API Key：优先读取 `process.env.DEEPSEEK_MODEL`（向前兼容既有配置）；
     - Base URL：读取 `process.env.DEEPSEEK_BASE_URL`，缺省默认值 `https://api.deepseek.com/v1`；
     - 默认模型名称：固定为 `deepseek-flash`。

2. **全局模型目录上架（单聊与并行对比）**：
   - 共享模型目录 `CHAT_MODEL_CATALOG` 与 `MODELS` 常量正式收录 `DeepSeek · DeepSeek Flash`；
   - 支持在单聊、多模型并行对比模式中自由选用 DeepSeek 进行对话与测算，支持流式输出 `reasoning_content` 思维链。

3. **Agent 模式自动切换与交互对齐**：
   - 将 Agent 模式的默认底座配置更新为 `AGENT_PROVIDER = 'deepseek'` 与 `AGENT_MODEL = 'deepseek-flash'`；
   - 当用户在输入框开启「Agent 模式」开关时，顶部模型选择器自动联动切换为 DeepSeek，输入框上方提示条同步更新为「Agent 模式 · 已切换至 DeepSeek Flash」；
   - 既有豆包相关配置保留为可配置选项，未来额度充值后可随时配置回切。

4. **自适应工具集挂载（Adaptive Tool Mounting）**：
   - 区分平台本地执行工具与上游托管工具：本地工具（`web_fetch`、`image_generate`、用户自定义 Webhook 工具、`Artifacts` 产物生成）为标准 OpenAI Function Calling 契约，在 DeepSeek 上全量无缝挂载执行；
   - 火山方舟 Ark 特有的 Responses 服务端搜索扩展（`aiProvider.tools.webSearch`）做供应方隔离：仅在底层为 `doubao` 时挂载，在 `deepseek` 下安全剥离，避免协议不识别抛错。

5. **输入框独立「深度思考（Thinking）」交互开关**：
   - 交互形态采用方案 A：在输入框底部工具栏（与 Agent 开关、附件并列）新增「🧠 深度思考」图标按钮；
   - 默认保持关闭（`thinking: { type: "disabled" }`），确保 Agent 模式下循环低延迟；
   - 用户可单手一键点亮，点亮后请求体透传 `thinking: true`，服务端在调用 DeepSeek 时动态启用思考模式。

## 备选方案及否决理由

1. **废弃豆包代码全面替换为 DeepSeek**：
   - *否决理由*：粗暴替换会破坏已通过大量回归测试的豆包特化逻辑，未来豆包额度恢复时需二次重构。平滑追加保留才是多模型聚合平台的正确设计。
2. **在模型下拉框中拆分 `DeepSeek Flash (思考)` 与 `DeepSeek Flash (快速)`**：
   - *否决理由*：膨胀模型下拉列表，破坏对比模式的模型键语义，且在 Agent 模式下无法灵活随时启闭思考。底部独立按钮交互最直观、对齐行业共识。
3. **强制挂载 Ark 服务端搜索给 DeepSeek**：
   - *否决理由*：DeepSeek 官方是标准 Chat Completions API，不提供类似 Ark 的内置托管搜索引擎，强行挂载会导致上游 400 校验失败。

## 后果

- **正面**：
  - 彻底解除 Agent 模式对豆包单点额度的强依赖，以按量计费极低的成本快速盘活 Agent 模式；
  - 平台正式拥有讯飞、豆包、DeepSeek 三大供应方的完整单聊、对比与智能体能力；
  - 深度思考开关给用户赋予了灵活性，既保住了多步循环的响应速度，又满足了深度推理需求。
- **负面 / 注意事项**：
  - DeepSeek 下暂时无法使用 Ark 的服务端一键搜索，需依赖网页正文提取（`web_fetch`）；
  - 测试用例集需补充 DeepSeek 工具调用与非思考/思考模式的双轨单测。
