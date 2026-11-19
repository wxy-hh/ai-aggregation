# AI 聚合平台 · 核心进化 PRD 实施路线图 (Implementation Roadmap)

> **创建日期**：2026-11-18  
> **指导思想**：张一鸣思维操作系统（消除信息冗余、建立数据反馈飞轮、主航道逃逸平庸、坦诚清晰）  
> **目标**：将本项目从“全功能散点玩具聚合站”打造成**“具备工业级韧性、可信评测与企业级治理能力的 AI Agent 全栈代表作”**。

---

## 实施阶段与文档导航 (按实现顺序排列)

按“低阻力快速扫清雷区 → 攻坚核心状态机韧性 → 沉淀客观评测资产 → 扩展开放标准生态”的工程逻辑排列，**建议严格按照 01 → 02 → 03 → 04 的顺序推进**：

```
[Stage 1] 01-做减法与主线收敛
    │  (消除简历雷区、首屏聚焦 Agent 工作台、清理占位与虚假口径)
    ▼
[Stage 2] 02-运行时状态持久化与续跑
    │  (攻克断网/刷新丢失状态的易失性痛点，实现 Redis 事件流与增量重放)
    ▼
[Stage 3] 03-真实模型评测与观测看板
    │  (40 题无 Mock 真实基准，落地消融实验看板与负结果分析，建立技术信誉)
    ▼
[Stage 4] 04-MCP 协议集成与安全治理
       (接入标准 MCP 协议，借助 HMAC 一次性审批与 SSRF 网关构建防御深水区)
```

| 顺序 | PRD 文档 | 核心定位 | 核心改动模块 | 预估工时 | 面试直接收益 |
| :---: | :--- | :--- | :--- | :---: | :--- |
| **01** | [01-prd-product-decluttering-convergence.md](01-prd-product-decluttering-convergence.md) | **主线收敛与做减法**<br>（打扫战场，确立航道） | `settings-store.ts`<br>`apps-modal.tsx`<br>`README.md`<br>`CLAUDE.md` | 1 天 | 彻底消灭面试第一眼“杂货铺拼凑感”，首屏直奔 Agent 交付物，对齐全部事实口径，防止被追问击穿。 |
| **02** | [02-prd-agent-runtime-checkpoint-resume.md](02-prd-agent-runtime-checkpoint-resume.md) | **运行时持久化与断点续跑**<br>（状态机韧性） | `agent-runner.ts`<br>`chat-stream-contract.ts`<br>`chat-store.ts`<br>`Prisma: AgentRun` | 2~3 天 | 攻克“单次 HTTP 连接断开即丢失”的玩具级缺陷，具备分布式系统在弱网、切屏下的高可用恢复能力。 |
| **03** | [03-prd-agent-eval-benchmark-dashboard.md](03-prd-agent-eval-benchmark-dashboard.md) | **真实评测基准与观测看板**<br>（数据飞轮与底线） | `tooling/eval/`<br>`/admin/eval`<br>`packages/shared/src/eval/`<br>`Prisma: EvalRun` | 2 天 | 告别虚假的“100% 成功率”，拿出真实的 40 题测试集、多模型横评与消融分析（Ablation Study），展现高级工程师严谨度。 |
| **04** | [04-prd-mcp-integration-governance.md](04-prd-mcp-integration-governance.md) | **MCP 协议扩展与安全治理**<br>（生态与防御深水区） | `lib/agent/mcp/`<br>`tool-pipeline.ts`<br>`approval-token.ts`<br>`mcp-settings-modal.tsx` | 2 天 | 命中 21% 的 MCP 关键词，同时用 HMAC 审批与 SSRF 拦截把话题引向大厂极度关注的安全治理深水区。 |

---

## 阶段执行状态跟踪 (Checklist)

- [ ] **Stage 01**：产品信噪比优化与主线收敛
  - [ ] 1.1 文档事实全量纠偏（消除通义千问/NestJS 等不实描述，如实写明 Next.js 15 Monorepo）
  - [ ] 1.2 清理 `apps-modal.tsx` 中 PPT/法律/代码等禁用占位卡片
  - [ ] 1.3 `agentModeEnabled` 设为默认开启，优化 `/chat` 工作台首屏引导与 Artifacts 感知
  - [ ] 1.4 收敛命理与多模态生成为次级「实验室 (Labs)」入口
- [ ] **Stage 02**：Agent 执行运行时持久化与断点续跑
  - [ ] 2.1 Prisma Schema 扩充 `AgentRun` 与事件流结构
  - [ ] 2.2 服务端 `agent-runner.ts` 接入 Redis Stream 写入与 Checkpoint 存储
  - [ ] 2.3 新增 `GET /api/chat/agent/resume` SSE 增量补推接口与 `POST /api/chat/agent/abort`
  - [ ] 2.4 客户端 `chat-store.ts` 支持看门狗自动重连与断点重放
  - [ ] 2.5 覆盖网络断开、页面刷新与 HMAC 审批态保持三项验收测试
- [ ] **Stage 03**：真实模型端到端 Eval 评测基准与观测看板
  - [ ] 3.1 构建包含 40 个真实用例的 `agent-benchmark-v1.json`（规划、工具、安全、RAG）
  - [ ] 3.2 编写端到端真实调用执行引擎 `tooling/eval/runner.ts`（支持硬断言与 LLM-as-a-Judge）
  - [ ] 3.3 Prisma 新增 `AgentEvalRun` 表并打通 CLI 一键运行脚本
  - [ ] 3.4 前端实现 `/admin/eval` 观测看板页面（多模型横评、消融矩阵、Trace 下钻）
- [ ] **Stage 04**：MCP 开放协议扩展与安全治理管道
  - [ ] 4.1 集成 `@modelcontextprotocol/sdk`，实现 `McpClientManager` 客户端单例
  - [ ] 4.2 将外部 MCP 工具接入 `ToolExecutionPipeline`（SSRF 守卫、超时熔断）
  - [ ] 4.3 高危写操作（包含 create/write/delete 等动作）自动唤起 HMAC 人机审批卡片
  - [ ] 4.4 前端设置中新增「MCP Server 配置」弹窗与工具发现列表
