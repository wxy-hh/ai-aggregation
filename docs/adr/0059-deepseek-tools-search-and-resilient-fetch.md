# 0059. 接入 DeepSeek Tools 原生检索与抓取 API 及分流降级架构

* **状态**：已接受
* **日期**：2026-11-19
* **决策者**：AI 聚合平台工程团队
* **范围**：`apps/web`（`tools/web-search.ts`, `tools/web-fetch.ts`）
* **关系**：修订并扩展 [ADR-0017 (通用内置联网搜索与高韧性网页精读协同架构)](0017-unified-web-search-and-resilient-web-fetch.md)

---

## 背景与问题

在智能对话页面开启 Agent 模式后，用户反馈调用 `web_search` 联网搜索工具频繁或完全执行失败。
现场排查与测试确认了以下根因与局限：
1. **默认免密检索链路网络阻断**：根据 ADR-0017 设计，在未配置商业检索密钥（`TAVILY_API_KEY`）的开发与测试环境中，系统自动降级至免密检索（抓取 `https://html.duckduckgo.com/html/?q=...`）。实测在当前公网网络环境下直连 DuckDuckGo 遭遇持续连接超时（5 秒未建连），触发了工具层的 `SEARCH_TIMEOUT_MS = 6000` 硬超时，导致 Agent 每次发起搜索均抛出“联网搜索请求超时”，执行 100% 失败；
2. **抓取深度与动态内容处理诉求**：ADR-0017 构建的本地抓取管线（`guardedLookup` + Chrome 桌面头 + 2MB 优雅截断）解决了大部分文档大页面熔断问题，但对于依赖复杂动态渲染或强反爬策略的站点仍可能受限；
3. **用户期望接入官方高品质搜索与抓取服务**：为了追求更好的中文理解、权威线索排序与正文提纯效果，提议接入 DeepSeek 官方推出的 [Search API (`/v1/tools/search`)](https://api-docs.deepseek.com/zh-cn/api/search) 与 [Fetch API (`/v1/tools/fetch`)](https://api-docs.deepseek.com/zh-cn/api/fetch)。

---

## 决策

### 1. 凭据隔离与独立端点配置（解耦模型代理网关）

为防止模型推理层的网关配置污染工具请求，决定不盲目复用模型层的 `DEEPSEEK_BASE_URL`（在实际部署中该地址常被配置为仅支持 `/v1/chat/completions` 的第三方反向代理或模型聚合网关，盲目请求会导致 `/v1/tools/*` 抛出 404）：
- 引入专用环境变量：
  - `DEEPSEEK_TOOLS_API_KEY`：专用工具调用凭据；
  - `DEEPSEEK_SEARCH_URL`：检索接口端点，默认直连官方 `https://api.deepseek.com/v1/tools/search`；
  - `DEEPSEEK_FETCH_URL`：抓取接口端点，默认直连官方 `https://api.deepseek.com/v1/tools/fetch`；
- 该组配置在 `apps/web/.env.local` 中已实测连通（Search 与 Fetch 均返回 HTTP 200 及完整数据）。

### 2. `web_search` 多级检索与空结果终态语义

- **多级检索优先序**：
  `DeepSeek Search API`（配置了 `DEEPSEEK_TOOLS_API_KEY` 时首选） $\to$ `Tavily API`（配置了 `TAVILY_API_KEY` 时次选） $\to$ `免密 DuckDuckGo HTML 爬虫`（兜底）。
- **空结果与终态错误不降级**：
  当 DeepSeek Search 返回 HTTP 200 且 `results: []`（空数组）时，判定为合法的“未检索到直接相关的公开网页”，直接向模型返回无结果提示，**严禁触发向下级降级**，避免冷门词连续轮询击穿多层接口导致延迟成倍放大；当返回 HTTP 400（参数非法）或 401（未授权/凭据失效）时，直接抛出 `ToolError`，**严禁静默降级**，避免掩盖配置错误；
- 仅当 DeepSeek 发生 HTTP 402（欠费）、429（限速）、5xx（上游故障）或网络请求超时时，才记录告警并向下触发降级链路。

### 3. 上下文配额控制（ToolContextBudget）

- DeepSeek Search API 为每条线索返回 `snippet`（短摘要，100~200字）和 `summary`（长摘要，600~800字）；
- 为提升模型分析质量，注入模型时优先采用信息密度更高的 `summary`，但必须施加**单次搜索总字数硬上限（默认 2,000 字符）**，超出平滑截断，严禁 5 条长摘要全量拼入导致上下文爆炸；
- 前端交互卡片摘要（`summaryForDisplay`）仅展示检索词与命中的权威线索条数；
- 深入阅读依然遵循 ADR-0017 的两步收敛范式，由模型选择高相关 URL 触发 `web_fetch`；在 `web_fetch` 远端正文提纯中同样施加 `MAX_CONTENT_CHARS = 8,000` 字符上限，超出部分平滑截断并附加 `\n\n[正文已截断，仅保留前 8,000 字符]`，彻底杜绝远端超长 Markdown 绕过上下文配额。
- *质量声明*：“效果更好”目前属于基于自研中文搜索引擎与丰富长摘要的机制推断，在未经过严格可复现对照评测前，不作为已证实的收益结论。

### 4. `web_fetch` 严格安全前置预检与分流降级策略

- **出站 URL 安全预检（EgressUrlPreflight）**：
  任何目标 URL 在发送至 DeepSeek Fetch 之前，**必须先在本地通过 `validateUrlLiteral` 校验**。内网 IP、回环地址（`127.0.0.1`、`localhost`、`10.*`、`192.168.*`）及非 http/https 协议在本地最外层直接 fail-closed 拦截，**绝对不向 DeepSeek 外发内网地址，且拦截后绝不允许经由本地兜底绕过**；
- **远端抓取与 SSRF 取舍说明**：
  远端 DeepSeek Fetch 服务端抓取无法复用本地 `guardedLookup` 的连接级 DNS 防重绑定能力。因此，本地前置字面量校验作为第一道物理红线，公网访问则托付上游安全策略；
- **分流降级策略（SplitFallbackPolicy）**：
  - **终态不降级**：DeepSeek 返回 **HTTP 400 / 401**（配置或参数非法）、**HTTP 403**（触发安全策略拦截）或 **HTTP 404**（目标页面不可达或无有效正文）时，判定为确定性失败，直接向模型报错，**不触发本地抓取降级**（防止绕过安全策略或发起无效二次请求）；
  - **服务故障自动降级**：DeepSeek 发生 **HTTP 402**（账号欠费）、**HTTP 429**（QPS 超限）、**5xx**（服务器异常）或网络超时时，判定为第三方接口不可用，系统自动静默降级至 ADR-0017 原有的本地高韧性抓取管线（`guardedLookup` + Chrome 真实头 + 2MB 优雅截断）。

---

## 后果与权衡

### 正面
1. **彻底修复 Agent 搜索 100% 失败**：避开受限的直连 DuckDuckGo 节点，通过官方专用 API 实现高可靠、低延迟的搜索召回；
2. **信息丰富度大幅提升**：模型可直接基于高质量 600~800 字的结构化 `summary` 进行综合分析，减少不必要的单页深读调用；
3. **安全边界清晰可控**：本地字面量预检严控内网外泄；分流降级策略兼顾了安全拦截（403/404 不降级）与高可用容灾（服务故障时本地兜底）。

### 负面与注意事项
1. **计费成本**：独立调用 DeepSeek Search API 与 Fetch API 按成功请求计费（每 1,000 次成功请求 5 元），需要保障账号余额充足；
2. **隐私考量**：搜索关键词与目标抓取 URL 会发送给第三方 DeepSeek 服务端；
3. **SSRF 差异**：远端抓取依赖 DeepSeek 侧的安全策略，本地无法对远端实施 `guardedLookup` DNS 校验，故本地严格前置校验不可妥协。
