# DeepSeek Tools 原生联网搜索与高韧性抓取分流架构测试计划 (QA Test Plan)

QA Schema: 4
QA Mode: inline
QA Kind: feature
QA Review Coverage: 1

### TC01: 智能对话 Agent 模式联网搜索真实链路（RealLinkSmoke）
- Priority: P0
- Covers: 1, 5
- Seam: browser

前置：真实登录的普通用户；在智能对话页面开启 Agent 模式（模式开关开启）；输入框 `getByRole('textbox')`，发送按钮 `getByRole('button', { name: '发送' })`。

#### 验证断言
1. 真实输入包含时效性查询的问题（如“请查询 DeepSeek API 最新动态”）并点击发送后，助手在 120 秒内产生包含工具调用卡片与终态正文的回答，且最新正文长度大于 0（实测：正文长度）。
2. 工具调用区域展示 `web_search` 执行卡片，卡片摘要包含检索词与获取的线索数量（实测：摘要文本）。
3. 全过程中浏览器控制台 error 级记录数为 0（实测：条数）。

---

### TC02: web_search DeepSeek 检索成功、长摘要优先与配额截断
- Priority: P0
- Covers: 1, 3, 4, 5, 10
- Seam: unit

#### 验证断言
1. 配置 `DEEPSEEK_TOOLS_API_KEY` 时，`web_search` 优先向 `DEEPSEEK_SEARCH_URL` 发起 POST 请求，且请求体携带 `query` 与 `count: 5`。
2. DeepSeek Search API 返回包含 `summary` 的结果时，注入模型的内容优先展示 `summary` 长摘要字段。
3. 当搜索结果的多条长摘要累计字符数超过 2,000 时，注入模型的内容在 2,000 字符处被平滑截断，并附带截断引导提示。
4. 执行结果中的 `summaryForDisplay` 呈现格式为“已搜索“<query>” · 获取 <count> 条线索”，不包含长正文噪声。

---

### TC03: web_search 空结果终态判定、错误边界与分流降级
- Priority: P0
- Covers: 2, 9, 11
- Seam: unit

#### 验证断言
1. DeepSeek Search 返回 HTTP 200 且 `results: []`（空数组）时，工具返回未检索到直接相关的提示，不向下触发 Tavily 或免密检索降级。
2. DeepSeek Search 返回 HTTP 400 或 401 错误时，直接抛出 `ToolError`，不触发下级降级。
3. DeepSeek Search 返回 HTTP 402、429、5xx 或网络请求超时时，记录警告日志并自动降级调用 Tavily（若有 Key）或免密检索流。
4. 传入全空白或空字符串作为 query 时，工具在发起任何网络请求前直接抛出 `搜索关键词不能为空` 的 `ToolError`。

---

### TC04: web_fetch 出站 URL 安全预检（EgressUrlPreflight）
- Priority: P0
- Covers: 7
- Seam: unit

#### 验证断言
1. 传入回环或私网 IP（如 `http://127.0.0.1/admin`、`http://192.168.1.1`）时，本地前置字面量校验直接抛出 `ToolError`，外部 fetch 与本地连接均未被调用。
2. 传入非 http/https 协议（如 `file:///etc/passwd`）时，本地前置校验直接抛出 `ToolError`，且外部 fetch 与本地连接均未被调用。

---

### TC05: web_fetch DeepSeek 抓取成功、正文截断与终态错误
- Priority: P0
- Covers: 6, 8, 10
- Seam: unit

#### 验证断言
1. 配置 `DEEPSEEK_TOOLS_API_KEY` 时，`web_fetch` 优先向 `DEEPSEEK_FETCH_URL` 发起 POST 请求，请求体携带目标 `url`。
2. DeepSeek Fetch 返回 HTTP 200 时，成功解析出页面标题与 Markdown 格式正文。
3. DeepSeek Fetch 返回超过 8,000 字符的超长 Markdown 时，正文被平滑截断至 8,000 字符上限，并附带 `[正文已截断，仅保留前 8,000 字符]` 提示。
4. DeepSeek Fetch 返回 HTTP 400 或 401 时，直接抛出 `ToolError`，不发生降级。
5. DeepSeek Fetch 返回 HTTP 403 安全策略拒绝时，直接抛出 `ToolError`，严禁降级至本地抓取。
6. DeepSeek Fetch 返回 HTTP 404 目标不存在或无有效内容时，直接抛出 `ToolError`，严禁降级至本地抓取。

---

### TC06: web_fetch 服务可用性故障降级与本地大文件保护
- Priority: P0
- Covers: 9
- Seam: unit

#### 验证断言
1. DeepSeek Fetch 返回 HTTP 402、429、5xx 或网络请求超时时，记录告警日志并自动降级执行本地高韧性抓取流水线（`fetchWithRedirects`）。
2. 在未配置 `DEEPSEEK_TOOLS_API_KEY` 时，`web_fetch` 直接执行本地高韧性抓取流水线。
3. 本地高韧性抓取遇到超过 2MB 的超大页面时，平滑截断停止接收，提取已接收内容并正常返回正文，不抛出致命异常。

---

## 执行记录

| 用例 | 断言序号 | 状态 | 证据 | 绑定 | 备注 |
| --- | --- | --- | --- | --- | --- |
| TC01 | 1 | PASS | `evidence/r3-tc01.log`, `screenshots/r3-tc01-agent-search.png` | | 助手终态正文 455 字符（> 0） |
| TC01 | 2 | PASS | `evidence/r3-tc01.log`, `screenshots/r3-tc01-agent-search.png` | | 工具卡片展示「已搜索“DeepSeek 发布两个正式版 新…” · 获取 5 条线索」 |
| TC01 | 3 | PASS | `evidence/r3-tc01.log`, `screenshots/r3-tc01-agent-search.png` | | 控制台 error 级记录数 0 |
| TC02 | 1 | PASS | `evidence/r3-search-suite.log` | `apps/web/src/app/api/chat/_lib/agent/tools/web-search.test.ts` › TC02-1: 配置 DEEPSEEK_TOOLS_API_KEY 时优先向 DEEPSEEK_SEARCH_URL 发起 POST 请求且携带 query 与 count: 5 | |
| TC02 | 2 | PASS | `evidence/r3-search-suite.log` | `apps/web/src/app/api/chat/_lib/agent/tools/web-search.test.ts` › TC02-2: DeepSeek Search API 返回 summary 时模型内容优先展示长摘要 | |
| TC02 | 3 | PASS | `evidence/r3-search-suite.log` | `apps/web/src/app/api/chat/_lib/agent/tools/web-search.test.ts` › TC02-3: 搜索结果长摘要累计字符数超过 2,000 时在 2,000 字符处平滑截断 | |
| TC02 | 4 | PASS | `evidence/r3-search-suite.log` | `apps/web/src/app/api/chat/_lib/agent/tools/web-search.test.ts` › TC02-4: summaryForDisplay 呈现格式为已搜索指定词并获取线索条数 | |
| TC03 | 1 | PASS | `evidence/r3-search-suite.log` | `apps/web/src/app/api/chat/_lib/agent/tools/web-search.test.ts` › TC03-1: DeepSeek Search 返回 HTTP 200 且 results 为空数组时返回未检索到直接相关提示且不触发降级 | |
| TC03 | 2 | PASS | `evidence/r3-search-suite.log` | `apps/web/src/app/api/chat/_lib/agent/tools/web-search.test.ts` › TC03-2: DeepSeek Search 返回 HTTP 400 或 401 错误时直接抛出 ToolError 且不触发下级降级 | |
| TC03 | 3 | PASS | `evidence/r3-search-suite.log` | `apps/web/src/app/api/chat/_lib/agent/tools/web-search.test.ts` › TC03-3: DeepSeek Search 返回 HTTP 402/429/5xx 或网络请求超时时自动降级调用 Tavily 或免密检索 | |
| TC03 | 4 | PASS | `evidence/r3-search-suite.log` | `apps/web/src/app/api/chat/_lib/agent/tools/web-search.test.ts` › TC03-4: 传入全空白或空字符串作为 query 时工具在发起任何网络请求前直接抛出 ToolError | |
| TC04 | 1 | PASS | `evidence/r3-fetch-suite.log` | `apps/web/src/app/api/chat/_lib/agent/tools/web-fetch.test.ts` › TC04-1: 传入回环或私网 IP 时本地前置字面量校验直接抛出 ToolError 且外部 fetch 未被调用 | |
| TC04 | 2 | PASS | `evidence/r3-fetch-suite.log` | `apps/web/src/app/api/chat/_lib/agent/tools/web-fetch.test.ts` › TC04-2: 传入非 http/https 协议时本地前置校验直接抛出 ToolError 且外部 fetch 未被调用 | |
| TC05 | 1 | PASS | `evidence/r3-fetch-suite.log` | `apps/web/src/app/api/chat/_lib/agent/tools/web-fetch.test.ts` › TC05-1: 配置 DEEPSEEK_TOOLS_API_KEY 时优先向 DEEPSEEK_FETCH_URL 发起 POST 请求且携带目标 url | |
| TC05 | 2 | PASS | `evidence/r3-fetch-suite.log` | `apps/web/src/app/api/chat/_lib/agent/tools/web-fetch.test.ts` › TC05-2: DeepSeek Fetch 返回 HTTP 200 时成功解析出页面标题与 Markdown 格式正文 | |
| TC05 | 3 | PASS | `evidence/r3-fetch-suite.log` | `apps/web/src/app/api/chat/_lib/agent/tools/web-fetch.test.ts` › TC05-3: DeepSeek Fetch 返回超过 8,000 字符时正文平滑截断至 8,000 字符上限并附带提示 | |
| TC05 | 4 | PASS | `evidence/r3-fetch-suite.log` | `apps/web/src/app/api/chat/_lib/agent/tools/web-fetch.test.ts` › TC05-4: DeepSeek Fetch 返回 HTTP 400 或 401 时直接抛出 ToolError 且不发生降级 | |
| TC05 | 5 | PASS | `evidence/r3-fetch-suite.log` | `apps/web/src/app/api/chat/_lib/agent/tools/web-fetch.test.ts` › TC05-5: DeepSeek Fetch 返回 HTTP 403 安全策略拒绝时直接抛出 ToolError 且严禁降级至本地抓取 | |
| TC05 | 6 | PASS | `evidence/r3-fetch-suite.log` | `apps/web/src/app/api/chat/_lib/agent/tools/web-fetch.test.ts` › TC05-6: DeepSeek Fetch 返回 HTTP 404 目标不存在或无有效内容时直接抛出 ToolError 且严禁降级至本地抓取 | |
| TC06 | 1 | PASS | `evidence/r3-fetch-suite.log` | `apps/web/src/app/api/chat/_lib/agent/tools/web-fetch.test.ts` › TC06-1: DeepSeek Fetch 返回 HTTP 402/429/5xx 或网络请求超时时记录告警日志并自动降级执行本地高韧性抓取流水线 | |
| TC06 | 2 | PASS | `evidence/r3-fetch-suite.log` | `apps/web/src/app/api/chat/_lib/agent/tools/web-fetch.test.ts` › TC06-2: 在未配置 DEEPSEEK_TOOLS_API_KEY 时直接执行本地高韧性抓取流水线 | |
| TC06 | 3 | PASS | `evidence/r3-fetch-suite.log` | `apps/web/src/app/api/chat/_lib/agent/tools/web-fetch.test.ts` › TC06-3: 本地高韧性抓取遇到超过 2MB 的超大页面时平滑截断停止接收并正常返回提取正文 | |

---

## 交付验证

| 命令 | 证据 |
| --- | --- |
| `pnpm --filter @repo/web exec vitest run src/app/api/chat/_lib/agent/tools/web-search.test.ts` | `evidence/r3-search-suite.log` |
| `pnpm --filter @repo/web exec vitest run src/app/api/chat/_lib/agent/tools/web-fetch.test.ts` | `evidence/r3-fetch-suite.log` |
| `pnpm --filter @repo/web typecheck` | `evidence/r3-typecheck.log` |

---

## 计划变更
- 无
