# 技术规格：DeepSeek Tools 原生联网搜索与高韧性抓取分流架构

Spec Authority: `docs/features/2026-11-19-deepseek-tools-search-and-resilient-fetch/spec.md`（唯一事实源）
Status: `ready-for-agent`
ADR: `docs/adr/0059-deepseek-tools-search-and-resilient-fetch.md`
Glossary: `GLOSSARY.md`（DeepSeekTools、ToolContextBudget、SplitFallbackPolicy、EgressUrlPreflight）
QA Kind: `feature`

---

## Problem Statement

从用户与系统可靠性视角，当前存在三个核心痛点：

1. **Agent 模式联网搜索 100% 失败阻断**：
   在智能对话页面开启 Agent 模式后，用户询问具有时效性的事实或需要联网检索时，Agent 调用 `web_search` 每次均抛出“联网搜索请求超时，请稍后重试”，导致整个智能体任务链条中断。现场排查证实：在未配置商业 Tavily 密钥的环境中，系统默认降级至免密 DuckDuckGo 爬虫，由于当前公网网络对 DuckDuckGo 节点发生 TCP 连接超时，工具硬超时（6 秒）触发，搜索彻底不可用。
2. **抓取复杂页面与反爬防护不足**：
   既有本地抓取工具 `web_fetch` 虽具备基于 Node 原生 lookup 的 SSRF 防护与 2MB 截断能力，但对重型客户端单页应用（SPA）、动态渲染内容或带 WAF 验证码拦截的页面，往往只能提取到不足数十字符的空壳内容，模型无法获取有效正文。
3. **缺乏官方高品质检索与正文提纯能力**：
   模型无法直接使用由 DeepSeek 自研中文搜索引擎提供的高相关性排序结果及富文本长摘要，也无法直接获取服务端提纯的干净 Markdown 内容，导致模型推理受限于短碎片信息。

---

## Solution

接入官方 DeepSeek Tools API（[Search 接口](https://api-docs.deepseek.com/zh-cn/api/search) 与 [Fetch 接口](https://api-docs.deepseek.com/zh-cn/api/fetch)），并建立端点隔离、安全前置阻断与精细化分流降级架构：

1. **专用凭据与端点隔离（DeepSeekTools）**：
   引入专用环境变量 `DEEPSEEK_TOOLS_API_KEY`、`DEEPSEEK_SEARCH_URL` 与 `DEEPSEEK_FETCH_URL`，彻底与模型推理层反代（`DEEPSEEK_BASE_URL`）解耦，杜绝因第三方中转网关仅支持聊天端点而导致的 404 异常。
2. **`web_search` 升级接入与终态空结果判定**：
   检索优先走 DeepSeek Search API（返回权威标题、链接、短摘要 `snippet` 与长摘要 `summary`）。当接口正常返回且结果为空数组时，判定为合法的终态“未找到公开内容”，不触发降级；仅在接口异常、超时或欠费时平滑降级至 Tavily 及免密链路。
3. **长摘要优先注入与上下文配额（ToolContextBudget）**：
   检索结果格式化时优先采用信息密度更高的长摘要 `summary`，但设置 2,000 字符的全局硬上限，超出部分平滑截断，在保证高质量事实供给的同时杜绝上下文膨胀。
4. **`web_fetch` 严格安全前置拦截与分流降级（EgressUrlPreflight & SplitFallbackPolicy）**：
   所有外发 URL 必须先经本地 `validateUrlLiteral` 校验，私网 IP 与危险协议在宿主层 fail-closed 拦截，绝不向外部发送内网请求，拦截后绝不允许经由本地兜底绕过；远端 DeepSeek Fetch 若遇 403（安全策略拦截）或 404（无正文/不存在）视为终态直接报错，不降级；遇 402、429、5xx 及超时则自动无缝降级至本地高韧性抓取（`guardedLookup` + 2MB 优雅截断）。

---

## User Stories

1. 作为一名智能对话 Agent 模式用户，我询问最新时效事实时，Agent 自动调用 `web_search` 成功检索出权威线索，以便我获得最新、准确的事实答复。
2. 作为一名智能对话 Agent 模式用户，当我搜索一个全网无直接匹配结果的罕见冷门词时，系统直接告知未检索到相关公开网页，以便我获知真实检索状态，且系统不会盲目连续轮询多个备用搜索引擎产生漫长等待。
3. 作为一名智能对话 Agent 模式用户，当 Agent 检索内容时，模型获得的搜索上下文包含详细的长摘要（`summary`），以便模型能够基于更完整的背景事实进行逻辑推理，减少不必要的额外网页抓取。
4. 作为一名智能对话 Agent 模式用户，当单次搜索命中的多条长摘要总长度超过 2,000 字符时，系统自动进行平滑截断并引导模型使用 `web_fetch` 定向下钻，以便我的对话上下文窗口不会被无节制消耗。
5. 作为一名智能对话 Agent 模式用户，在前端界面查看 Agent 执行步骤时，搜索卡片仅展示简洁的检索词与获取的线索数量，以便我获得干净直观的交互视觉体验。
6. 作为一名智能对话 Agent 模式用户，当 Agent 发现关键参考外链并调用 `web_fetch` 深入阅读时，服务端通过 DeepSeek Fetch 直接返回提纯后的高质量 Markdown 正文，以便模型准确提炼核心内容。
7. 作为一名安全审视者，当模型或恶意提示词诱导 Agent 调用 `web_fetch` 探测内网或本机地址（如 `http://127.0.0.1`、`http://192.168.1.1`）时，系统在本地前置字面量校验阶段立即阻断，绝不向 DeepSeek 发送私网目标，且阻断后绝不允许降级绕过，以便平台的内网资产绝不泄露。
8. 作为一名智能对话 Agent 模式用户，当 Agent 尝试抓取的网页被目标网站的严格反爬策略拒绝（HTTP 403）或页面根本不存在（HTTP 404）时，系统立即向模型反馈明确错误且不进行无意义的本地重试，以便任务快速明确失败原因，避免死循环。
9. 作为一名智能对话 Agent 模式用户，当 DeepSeek 工具接口出现网络波动、请求超时、服务不可用（5xx）或账号余额不足（402）时，搜索与抓取自动静默降级至备用商业接口或本地高韧性抓取管线，以便我的对话请求不会因为第三方服务单点故障而彻底崩溃。
10. 作为一名系统运维人员，我可以通过在环境中配置独立的 `DEEPSEEK_TOOLS_API_KEY`、`DEEPSEEK_SEARCH_URL` 与 `DEEPSEEK_FETCH_URL` 来管理工具调用，以便与我可能配置的模型代理网关保持完全隔离，互不干扰。
11. 作为一名开发者，在调用 `web_search` 传入全空白字符串时，工具在执行前立即校验失败并抛出友好的中文错误，以便不会浪费外部 API 的调用配额。

---

## Implementation Decisions

1. **环境变量与配置契约（解耦模型反代）**：
   - 专用配置项：
     - `DEEPSEEK_TOOLS_API_KEY`: 必填工具密钥，不依赖 `DEEPSEEK_API_KEY`；
     - `DEEPSEEK_SEARCH_URL`: 检索端点，缺省值为 `https://api.deepseek.com/v1/tools/search`；
     - `DEEPSEEK_FETCH_URL`: 抓取端点，缺省值为 `https://api.deepseek.com/v1/tools/fetch`；
   - 彻底避免从 `DEEPSEEK_BASE_URL` 拼接 `/tools/*`，防止模型聚合网关返回 404。

2. **推翻既有决策与权衡说明**：
   - **被推翻项**：推翻 [ADR-0017](docs/adr/0017-unified-web-search-and-resilient-web-fetch.md) 中关于“`web_search` 仅由 Tavily 与免密 DuckDuckGo 双轨组成”以及“`web_fetch` 仅限本地 Node.js 原生发起请求”的既有架构设计。
   - **决策依据**：免密 DuckDuckGo 在当前公网环境中出现确定性网络连接超时（5 秒阻断），导致 Agent 搜索 100% 失败；同时官方自研搜索引擎与服务端抓取提纯能显著提升中文语境下的信息检索深度。
   - **代价与权衡**：
     - 计费成本：DeepSeek Search 与 Fetch 按成功请求计费（5元/千次），需要维护账号余额；
     - 隐私边界：搜索词与目标抓取 URL 会外发至 DeepSeek 服务端；
     - SSRF 边界转移：服务端抓取无法复用本地 Node.js 的 `guardedLookup` DNS 防重绑定能力，因此必须以严格的本地字面量前置校验（`validateUrlLiteral`）作为绝对物理红线；
     - 效果声明：当前“效果更好”属于基于产品架构（自研搜索引擎、长摘要与服务端 Markdown 解析）的机制推断，缺乏可复现的严格双盲或对照评测前，不作为已证实的收益结论。

3. **`web_search` 模块改造契约**：
   - 数据结构增强：
     ```ts
     interface SearchResultItem {
       title: string;
       url: string;
       snippet?: string;
       summary?: string;
     }
     ```
   - 请求流程：
     1. 若配置了 `DEEPSEEK_TOOLS_API_KEY`，优先向 `DEEPSEEK_SEARCH_URL` 发起 POST 请求，body 为 `{ query, count: 5 }`，超时设置为 6 秒；
     2. 状态判断：若返回 HTTP 200，解析 `results`：
        - 若 `results` 为非空数组，提取各条目并格式化长摘要；
        - 若 `results` 为空数组，视为终态，返回“未检索到直接相关的公开网页”，**不降级**；
     3. 降级流转：若 DeepSeek 请求抛出错误、网络超时或返回 402/429/5xx，捕获后输出告警日志，顺次降级至 `searchWithTavily`（若有 Key），最后降级至 `searchWithFreeProvider`；
     4. 上下文配额：格式化注入模型的内容限制在 2,000 字符以内，单条摘要过长或多条累计超标时进行平滑截断并附加说明。

4. **`web_fetch` 模块改造契约**：
   - 请求流程：
     1. **出站 URL 安全预检（EgressUrlPreflight）**：首先调用 `validateUrlLiteral(url)`，若未通过（如内网 IP、非 http/https 协议）直接抛出 `ToolError`，绝不外发，绝不走后续降级；
     2. 若配置了 `DEEPSEEK_TOOLS_API_KEY`，向 `DEEPSEEK_FETCH_URL` 发起 POST 请求，body 为 `{ url }`，超时设置为 8 秒；
     3. 状态码分流映射矩阵（SplitFallbackPolicy）：
        - **HTTP 200**：提取 `{ title, content }`；正文注入模型前必须严格执行 `MAX_CONTENT_CHARS = 8,000` 字符上限，超出部分平滑截断并附加 `\n\n[正文已截断，仅保留前 8,000 字符]`，彻底杜绝远端超长 Markdown 绕过上下文配额；标题过合规校验后直接包装为 `ToolExecutionResult` 返回；
        - **HTTP 400 / 401**：视为入参错误或凭据配置失效，直接抛出 `ToolError`，**严禁静默降级**，避免掩盖配置缺陷；
        - **HTTP 403 / 404**：视为确定性业务终态，直接抛出 `ToolError('目标网页返回 403，拒绝访问')` 或 `ToolError('目标网页未能获取可用内容')`，**严禁降级至本地抓取**；
        - **HTTP 402 / 429 / 5xx / 网络超时 / 网络未通**：捕获异常并输出告警，自动无缝降级执行现有的本地高韧性抓取流水线（`fetchWithRedirects`）；
     4. 若未配置 `DEEPSEEK_TOOLS_API_KEY`，直接走现有本地高韧性抓取。

---

## Testing Decisions

1. **良好测试的标准**：
   - 仅针对工具规范对外导出的行为和输入输出契约进行断言，不依赖任何私有变量或中间状态；
   - 外部网络与第三方 API（DeepSeek / Tavily / DuckDuckGo）在单元与集成测试中全部使用 Mock 或 Stub 隔离，确保测试具备确定性与快速执行能力；
   - 包含真实的端到端冒烟验证（RealLinkSmoke），确保 Agent 模式在智能对话页面真实触发。

2. **核心测试模块与接缝选择**：
   - **模块接缝 1 (web_search)**：`createWebSearchTool().execute(args, ctx)`
     - 验证 DeepSeek Search 成功返回结构化长摘要并受 2,000 字符配额约束；
     - 验证 DeepSeek Search 返回 HTTP 200 空数组时不触发下级降级；
     - 验证 DeepSeek Search 请求遇到 402/429/5xx/超时等服务可用性故障时平滑降级至 Tavily/DuckDuckGo；
     - 验证 DeepSeek Search 遇到 400/401 错误时直接抛错且不发生降级；
     - 验证搜索词为空时的前置校验报错。
   - **模块接缝 2 (web_fetch)**：`createWebFetchTool().execute(args, ctx)`
     - 验证私网 IP（`127.0.0.1`）在本地前置直接被拦截抛错，且不调用外部 fetch 也不走本地请求；
     - 验证 DeepSeek Fetch 成功返回 Markdown 正文；
     - 验证 DeepSeek Fetch 返回超过 8,000 字符的超长 Markdown 时，平滑截断至 8,000 字符上限并附带截断声明；
     - 验证 DeepSeek Fetch 返回 400、401、403 与 404 时作为终态直接抛错，不触发本地抓取降级；
     - 验证 DeepSeek Fetch 遭遇 402/429/5xx 或超时时自动降级至现有本地抓取流程；
     - 验证本地抓取超大体积（>2MB）时的优雅截断保护。

3. **代码库已有测试前例**：
   - `apps/web/src/app/api/chat/_lib/agent/tools/web-search.test.ts`
   - `apps/web/src/app/api/chat/_lib/agent/tools/web-fetch.test.ts`

---

## 交付命令

```bash
pnpm --filter @repo/web exec vitest run src/app/api/chat/_lib/agent/tools/web-search.test.ts
pnpm --filter @repo/web exec vitest run src/app/api/chat/_lib/agent/tools/web-fetch.test.ts
pnpm --filter @repo/web typecheck
```

---

## Out of Scope

1. 不修改非 Agent 模式的普通对话路由与流式传输契约；
2. 不修改模型推理网关（`DEEPSEEK_BASE_URL`）及其他模型适配层；
3. 不在前端界面增加 DeepSeek Tools 专用的配置管理界面（配置通过环境变量管理）；
4. 不在服务端维护代理池以修复 DuckDuckGo 免密抓取（其仅作为末级离线容灾）；
5. 不修改知识库 RAG 检索（`knowledge-search`）与会话记忆检索（`memory-search`）逻辑。

---

## Further Notes

### 状态码分流矩阵速查

| 服务与接口 | 响应状态 / 场景 | 处理机制 | 是否降级至次级/本地 |
|---|---|---|---|
| DeepSeek Search | HTTP 200 且 `results` 包含条目 | 提取長摘要注入，限制 2,000 字符 | 否（成功终态） |
| DeepSeek Search | HTTP 200 且 `results: []` | 提示未检索到直接相关网页 | **否（有效终态，严禁降级）** |
| DeepSeek Search | HTTP 400 / 401 | 抛出参数非法或认证错误 | **否（配置/入参终态，严禁降级）** |
| DeepSeek Search | HTTP 402 / 429 / 5xx / 超时 | 记录告警并向下传递 | **是（降级至 Tavily / 免密爬虫）** |
| DeepSeek Fetch | URL 为内网/本机/非法协议 | 本地立即抛错阻断（`validateUrlLiteral`） | **否（硬安全红线，严禁外发或降级）** |
| DeepSeek Fetch | HTTP 200 | 返回 Markdown 正文并施加 8,000 字符截断上限 | 否（成功终态） |
| DeepSeek Fetch | HTTP 400 / 401 | 抛出参数非法或认证错误 | **否（配置/入参终态，严禁降级）** |
| DeepSeek Fetch | HTTP 403 / 404 | 明确提示拒绝访问或内容不存在 | **否（确定性错误终态，严禁降级）** |
| DeepSeek Fetch | HTTP 402 / 429 / 5xx / 超时 | 记录告警并降级至本地请求 | **是（降级至本地 `guardedLookup` 抓取）** |
