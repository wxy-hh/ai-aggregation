# 04 · PRD：MCP 开放协议扩展与安全治理管道 (MCP Integration & Security Governance)

> **实现阶段**：Stage 4（生态拓展与治理深水区：开放协议与安全隔离网关）  
> **文档版本**：v1.1 | **创建日期**：2026-11-18 | **规划状态**：需求已对齐，待规格化 (Aligned for Spec)
>
> **关联模块**：`apps/web/src/lib/agent/mcp/`、`apps/web/src/lib/agent/tool-pipeline.ts`、`apps/web/src/lib/agent/approval-token.ts`、个人中心既有工具管理区与聊天工具面板
>
> **关联决策**：ADR-0064（个人远程 MCP 扩展的受控边界与审批信任模型）

---

## 0. 一期裁决记录（2026-11-24，已确认）

> 本节与 ADR-0064 是一期边界的权威依据。下文保留原始问题背景与方案草案；凡传输类型、Stdio、连接池、风险推断、审批状态、熔断、配额、UI 入口或验收方式与本节不一致，均以本节和 ADR-0064 为准，后续 `/to-spec` 不得直接照搬冲突草案。

| # | 裁决项 | 一期结论 |
| --- | --- | --- |
| 1 | 交付边界 | 个人远程垂直闭环，仅 `tools/list` / `tools/call`；排除 Stdio、本地进程、resources/prompts、自动 OAuth、Server 市场与意图筛选 |
| 2 | 远程传输 | 仅 Streamable HTTP，明确不兼容已弃用的旧版 HTTP+SSE |
| 3 | 连接生命周期 | 工具发现独立建连；同一 Agent 运行复用并在终态关闭；不做全局长连接池，审批恢复另建连接 |
| 4 | 远程认证 | 无鉴权或一个静态鉴权头；加密存储、失败关闭、永不回显，不做 OAuth 子系统 |
| 5 | 工具挂载 | 显式白名单，新发现工具默认停用；所有 Server 合计最多启用 8 个，不做自动意图筛选 |
| 6 | 工具定义 | 添加与手动刷新时形成审核快照，运行只读快照，不实时发现或后台同步 |
| 7 | 审批默认值 | 新工具默认必须审批，只能显式放行；名称关键词和 MCP 注解不参与安全判定 |
| 8 | 审批生命周期 | 完全复用 ADR-0041；确认走新请求，拒绝不自动调用模型，不新增 MCP 专用暂停状态机 |
| 9 | 参数预览 | 完整原始 JSON 加硬上限；超限拒绝审批，不截断后批准，Server 鉴权头永不下发 |
| 10 | 审批失效 | URL、鉴权、Schema 快照、启停或审批策略变化后，旧审批失败关闭 |
| 11 | 出站安全 | HTTPS-only、禁重定向；保存/刷新及实际建连均执行 DNS/SSRF 防护，无生产 localhost 例外 |
| 12 | 自动执行语义 | 表示用户信任模型参数出站，不代表只读、无泄漏风险或内容可信 |
| 13 | 提示注入 | 描述、Schema 与结果均按不可信内容处理；不新增 MCP 专属污点模式，不宣称完全消除注入 |
| 14 | 返回内容 | 仅支持有界文本与 structuredContent/JSON；不自动下载多模态或嵌入资源 |
| 15 | 超时与熔断 | 单工具沿用 15 秒超时和现有运行级连败熔断；不做 Server 级/跨运行熔断，不承诺 0ms |
| 16 | 计费 | 沿用 chat-agent 一口价与现有预留/结算，只补调用元数据，不新增按工具账务 |
| 17 | 审计 | 独立 MCP 元数据审计，覆盖调用、待审批和安全拦截；不存原始参数、结果、鉴权或 URL 查询串 |
| 18 | UI 触点 | 管理复用个人中心，感知复用聊天工具面板，过程与审批卡展示 Server 来源；不新增独立设置弹窗 |
| 19 | 参数 Schema | 保留 JSON Schema 2020-12 并原生校验；禁止远程 `$ref` 抓取，不做有损 Zod 转换 |
| 20 | 保存语义 | 允许保存后发现失败并编辑/重试；无有效快照和启用工具时不得进入 Agent |
| 21 | 数量边界 | 每用户最多 10 个 Server；发现数可超过 20，快照另受工具数与字节上限，超限不静默截取 |
| 22 | 会话覆盖 | SessionToolOverride 只能收窄 MCP 白名单，不能绕过配置扩大 |
| 23 | 能力包 | 沿用 ADR-0041 的 Webhook 用户扩展语义，不在本特性单独改变 CapabilityPack 边界 |
| 24 | 真实验收 | 使用官方 SDK 构建的受控 HTTPS Streamable HTTP 测试 Server；第三方公共服务只作可选补充 |

---

## 1. 业务痛点与底层思考

### 1.1 现状与痛点
- **硬编码工具边界**：目前平台内置工具仅 6 个（计算器、知识库检索、网页抓取等），工具扩展必须写 TS 代码重新发版，无法满足用户对个性化业务系统（如企业内部数据库、GitHub、本地文件系统）的连接诉求。
- **行业标准演进**：Anthropic 推出的 **MCP（Model Context Protocol）** 正在成为大模型连接工具、数据与环境的事实标准。招聘市场上 21% 以上的 Agent 岗将其作为重点考核项。
- **协议好调，治理极难**：单纯通过 `@modelcontextprotocol/sdk` 调通一个工具没有任何技术壁垒。**不可信的外部 MCP Server 带来的安全风险才是深水区**：
  - 恶意 MCP Server 诱导执行任意系统命令或越权读取机密文件；
  - 外部服务延迟极高或挂起，拖死整个 Agent 运行循环；
  - 第三方工具频繁报错导致用户配额被死循环耗尽。

### 1.2 设计原则（张一鸣思维操作系统）
1. **拥抱开放标准，但在边界设立严格检查站**：遵循标准的 MCP 协议协议交换数据，但外部所有输入和执行必须视为“不可信”。
2. **Context not Control**：给模型完整的工具定义上下文，但把写操作的最终控制权和审计权交给人类（HITL 审批）。
3. **复用已有的优秀基础设施**：不重新发明轮子，将 MCP 工具无缝接入平台现有的 `ToolExecutionPipeline`（HMAC 凭证、SSRF 防护、熔断器、配额账本）。

---

## 2. 核心功能与产品形态

### 2.1 交互表现与用户旅程

#### 1. MCP 工具管理面板（设置中新增）
用户或管理员可以在界面中配置第三方 MCP Server：

```
+-----------------------------------------------------------------------------------------+
| [MCP 扩展服务器管理]                                          [ + 添加 MCP Server ]      |
+-----------------------------------------------------------------------------------------+
| 服务器名称        | 协议类型 | 地址 / 启动指令       | 状态      | 已发现工具数 | 操作         |
| GitHub Workspace  | SSE/HTTP | https://mcp.internal  | CONNECTED | 4 个工具     | [配置] [删除]|
| Local Filesystem  | Stdio    | npx -y @modelcontext..| CONNECTED | 2 个工具     | [配置] [删除]|
+-----------------------------------------------------------------------------------------+
| [GitHub Workspace 包含的工具治理配置]                                                   |
|  工具名称             | 功能说明               | 风险等级 | 治理策略                      |
|  github_search_issues | 搜索仓库 Issues/PR     | 低 (读)  | [√] 允许自动执行 (Auto)       |
|  github_create_issue  | 创建新 Issue           | 高 (写)  | [√] 必须经由 HMAC 人机审批    |
|  github_merge_pr      | 合并 Pull Request      | 极高(写) | [√] 必须经由 HMAC 人机审批    |
+-----------------------------------------------------------------------------------------+
```

#### 2. 对话中的执行流与微交互
- 当 Agent 规划并调用外部 MCP 工具时，聊天流中展示清晰的 **`[MCP: GitHub]`** 协议徽标。
- 若调用只读工具：透明展示入参、调用耗时与结构化输出。
- 若调用高风险工具（如创建/修改/删除）：
  - 自动触发平台的 **HMAC 一次性审批卡片**；
  - 弹窗展示拟执行的 MCP Server 名称、方法名、完整参数预览及有效期倒计时（10分钟）；
  - 用户点击「确认执行」，校验通过后方可执行；用户点击「拒绝」，以标准错误格式告知模型“用户已拒绝此操作，请尝试其他策略”。

---

## 3. 技术方案与实现细节

### 3.1 架构图

```mermaid
graph TD
    subgraph Client [用户界面]
        ChatUI[Chat UI 流式卡片]
        ApprovalModal[HMAC 审批弹窗]
    end

    subgraph Gateway [安全治理网关 (ToolExecutionPipeline)]
        URLGuard[SSRF / DNS 防重绑定检查]
        HMACGuard[HMAC 审批凭证签发与核销]
        CircuitBreaker[连续失败熔断器]
        QuotaLedger[Token & 耗时配额预留]
    end

    subgraph MCPClient [MCP 客户端管理器]
        McpAdapter[MCP Tool -> AI SDK Tool 转换器]
        Transport[SSE / Stdio 传输层]
    end

    subgraph External [外部生态]
        MCPServerA[GitHub MCP Server]
        MCPServerB[Postgres MCP Server]
    end

    ChatUI --> Gateway
    Gateway --> HMACGuard
    HMACGuard -.-> ApprovalModal
    Gateway --> URLGuard
    URLGuard --> McpAdapter
    McpAdapter --> Transport
    Transport --> MCPServerA
    Transport --> MCPServerB
```

### 3.2 核心模块改造

#### A. MCP 客户端管理器（`apps/web/src/lib/agent/mcp/client-manager.ts`）
- 引入官方 `@modelcontextprotocol/sdk`。
- 实现 `McpClientManager` 单例：
  - 管理长连接池与心跳检测；
  - 启动时拉取各 Server 的 `tools/list`，将 JSON Schema 转换为标准 Zod Schema，封装为 Vercel AI SDK 的 `CoreTool`；
  - 针对每个工具打上 `metadata: { isMcp: true, serverName, isDestructive }`。

#### B. 治理网关集成（`apps/web/src/lib/agent/tool-pipeline.ts`）
所有 MCP 工具的执行必须强制经过 `ToolExecutionPipeline`：
1. **SSRF / DNS 检查**：若 MCP Server 为 HTTP/SSE 协议，其主机地址必须通过 `url-guard.ts` 检查，严格禁止私网 IP（RFC 1918）与内网元数据服务（169.254.169.254）。
2. **风险分级与 HMAC 拦截**：
   - 默认规则：工具名称包含 `create`、`write`、`update`、`delete`、`drop`、`exec`、`merge` 均判定为高危；
   - 高危工具自动中断并签发 HMAC-SHA256 审批凭证，进入 `PAUSED_APPROVAL` 终态；
   - 凭证与用户 ID、工具名、参数摘要绑定，Redis 一次性消费，防篡改、防重放。
3. **熔断与时间预算**：
   - 单个 MCP 工具单次调用上限 15s；
   - 单一 MCP Server 若连续 3 次超时或抛出 5xx，触发熔断器，短路该 Server 剩余工具，避免拖垮对话。

#### C. 数据模型持久化（`packages/db/prisma/schema.prisma`）

```prisma
enum McpTransportType {
  SSE
  STDIO
}

model McpServerConfig {
  id             String           @id @default(uuid())
  userId         String           @map("user_id")
  name           String           // 如 "GitHub Integration"
  transport      McpTransportType @default(SSE)
  url            String?          // 用于 SSE
  command        String?          // 用于 Stdio (生产环境仅管理员可用)
  args           String[]         @default([])
  envEncrypted   String?          @map("env_encrypted") // 环境变量加密存储
  isActive       Boolean          @default(true) @map("is_active")
  toolPolicies   Json             @default("{}") @map("tool_policies") // 自定义各工具审批策略
  createdAt      DateTime         @default(now()) @map("created_at")
  updatedAt      DateTime         @updatedAt @map("updated_at")

  @@index([userId, isActive])
  @@map("mcp_server_configs")
}
```

---

## 4. 边界条件与安全红线

1. **Stdio 模式的生产沙箱隔离**：
   - 在线上云服务器环境，`Stdio` 执行本地子进程有极大逃逸风险。生产环境默认**仅允许管理员配置且限制在受限容器内**；普通用户仅允许连接经过白名单校验的外部 `SSE` 地址。
2. **上下文膨胀保护**：
   - 单个 MCP Server 暴露的工具如果超过 20 个，会极大地挤占模型的输入上下文并降低工具匹配精度。
   - 增加**前置意图筛选器**或限制单个会话最多挂载 8 个活跃 MCP 工具。
3. **敏感凭证防泄漏**：
   - MCP Server 所需的 API Key（如 GitHub Token）在数据库中采用 AES-256-GCM 加密，且在返回前端时完全脱敏。

---

## 5. 验收标准与求职转化口径

| 检查项 | 验证方式 | 预期目标 |
| :--- | :--- | :--- |
| **标准协议连通** | 接入官方示例 MCP SQLite / Fetch Server | 10 秒内自动发现其工具列表，并在对话中成功规划调用 |
| **高危写操作拦截** | 让 Agent 执行 `mcp_write_file` 或创建 Issue | 系统不出错，直接暂停并弹出 HMAC 审批卡片；点击「拒绝」后模型智能降级 |
| **SSRF 拦截验证** | 尝试添加 `http://192.168.1.1/mcp` 或回环地址 | `url-guard` 抛出 `SecurityPolicyViolation`，拒绝添加非法 Server |
| **熔断防护** | 模拟一个会抛出超时的假 MCP Server | 第 3 次失败后熔断器立即生效，后续请求 0ms 快速失败，保护整条会话链路 |
