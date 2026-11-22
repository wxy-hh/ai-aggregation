# 0061. Agent 执行与 HTTP 请求生命周期解耦：进程内运行注册表与事件重放

- **编号**：ADR-0061
- **状态**：已接受
- **日期**：2026-11-22
- **决策者**：AI 聚合平台工程团队
- **范围**：`apps/web/src/app/api/chat/_lib/`（chat-handler、agent-runner、新增运行注册表）、`packages/shared/src/chat-stream-contract.ts`、`apps/web/src/stores/chat-store.ts`、`apps/web/src/lib/conversation/message-snapshots.ts`
- **来源**：`docs/prd/02-prd-agent-runtime-checkpoint-resume.md` v1.1；2026-11-22 需求拷问

---

## 背景与问题

1. **执行与请求强绑定**：`runAgent` 直接消费 `req.signal`（`apps/web/src/app/api/chat/_lib/chat-handler.ts:359`），输出流直接管道到 HTTP 响应。客户端断开（刷新、锁屏、切网）即触发 abort，运行在下一个检查点停止。
2. **没有服务端会话历史兜底**：会话与历史存浏览器侧，流中每秒节流落盘（`apps/web/src/stores/chat-store.ts:356`）；服务端 `Message` 表只承载记忆索引输入（ADR-0058）。断线期间产生的最终文本与产物，服务端不落库。
3. **部署形态是单容器单 Node 进程**：生产 `infra/docker/docker-compose.prod.yml` 只有一个 `web` 服务；Redis 为 Upstash 外部托管（`DEPLOYMENT.md:254-259`），非本机容器。
4. **`AgentRun` 是审计表，不是运行态**：在流结束时一次性写入（`apps/web/src/app/api/chat/_lib/completion/lifecycle.ts:195`），`outcome` 只有 success/partial/failed，`/api/agent-runs` 按 `outcome` 查询。
5. **审批已有独立机制**：签名 token（TTL 10 分钟，`apps/web/src/lib/agent/approval-token.ts:15`）+ 客户端消息快照持久化（`apps/web/src/lib/conversation/message-snapshots.ts:30`）；审批请求发出后本次流正常结束（ADR-0041）。
6. **配额已有预留与对账**：`apps/web/src/app/api/internal/billing/reconcile/route.ts:88-92` 负责释放过期预留、锁定超时成本与补账。

原 PRD v1.0 主张 Redis 事件流水 + DB 运行态表 + `seq` 增量重放 + 进程重启后恢复执行。经拷问确认：真正的执行恢复需要独立执行宿主（BullMQ worker），工程量约为连接层方案的 2~3 倍，且原 PRD 验收标准中没有任何一条要求它；同时 Redis 与 DB 方案在单机部署下缺乏消费者。

## 决策

### 1. 运行与请求解耦，但只做连接层韧性

- 一次 Agent 执行由内存中的 `LiveRun` 承载，`req.signal` 降级为「订阅者离开」信号，不再等于任务结束。
- 客户端断开后运行继续到终态；唯一停止来源是用户显式 `Abort` 或 240s 运行预算。
- 进程重启不恢复执行：内存中的 `LiveRun` 消失，客户端重连得到不可用结果，状态为 `RunInterrupt`。

### 2. 进程内存是唯一真源；不引入 Redis、不改数据库、不加 `seq`

- `RunEventLog` 保存完整 SSE 事件序列（含 `text-delta`），重连时从头全量重放。
- 不引入 `seq` / `lastEventId`；客户端 `attach` 时先重建该 runId 的助手消息，再按原有消费逻辑快进到日志尾部，随后转为实时订阅。
- 首帧为新增的 `run_attached` 事件（携带 `runId`），客户端据此重建；它是每次连接的投递首帧，不写入共享事件日志，`resumed` 属于单次连接属性。
- `runId` 随消息快照写入浏览器本地存储。
- 不新增 Redis 键、不修改 `AgentRun` 表结构、不新增运行态表。

### 3. 原子挂载不变量

- 每次 `attach` 创建独立订阅与订阅内游标；注册表必须在同一次同步调用内返回「历史帧快照 + 订阅位置」并完成回调注册，禁止「先读完历史日志、再另起订阅」造成事件间隙。
- 初始 `POST /api/chat` 的响应流与 `/resume` 必须消费同一份事件日志。
- 同一 run 的多次 `attach` 幂等；多标签页各自独立重放，不共享 reader，不互相覆盖订阅。

### 4. 保留与淘汰

- 终态后保留 30 分钟，从进入终态起算；覆盖用户离开后回来取完整结果的场景。
- 全部 run（活跃 + 终态）上限 128 个 / 64MB；超限时只淘汰最久未访问的**终态** run。
- 活跃 run 不参与淘汰，但单独设上限 16 个 / 32MB；超限时新 Agent 请求在配额预留前返回 `503`，内存保护不依赖 240s 预算。
- 单 run 日志软上限 8MB，超出记录告警而不截断（截断会破坏重放正确性）。

### 5. 不可用语义统一

- 进程重启、日志过期、非法 runId 在内存方案下均表现为「查不到」，统一返回 `410` 与同一文案「任务已不可用，可重新执行」。
- 不得在验收标准或 UI 中承诺区分具体中断原因。

### 6. 中止与结算恰好一次

- `POST /api/chat/agent/abort` 校验归属、幂等；触发该 run 的 `AbortController` 后，运行器在下一个检查点停止。
- 五类收尾——正常完成、主动中止、预算耗尽、审批暂停、异常——先由运行器写入唯一终态事件并把 `LiveRun` 标记终态（记 `settledAt`），再由 `ChatCompletionLifecycle` 执行恰好一次结算；审批暂停按 ADR-0041 视为有效终态。
- 客户端断开、`attach` 失败、重复 abort 均不进入完成生命周期。

### 7. 并发与作用域

- 同一 `conversationId` 仅允许一个活跃 `LiveRun`；重复的 `POST /api/chat` 返回 `409` 与现有 `runId`，客户端保留草稿并 `attach`。
- 本决策只覆盖 Agent 模式；普通对话仍绑定 `req.signal`，断开即中止。

### 8. 部署边界

- 方案仅在「长驻、单 Node 进程、单副本」部署形态下成立，当前对应腾讯云 Docker 单容器。
- Vercel/serverless、多副本、滚动重启不提供同等恢复能力；该方案不得表述为「工业级执行持久化」，正确表述是「连接层韧性」。

## 后果与权衡

### 正面

- 刷新、锁屏、切网三个旗舰场景可用；新增面只有内存注册表、两个端点与一个事件类型。
- 不引入 Redis 写放大、TTL 对账与降级分叉；`AgentRun` 分析口径零改动。
- 停止按钮语义诚实：界面显示已停止即服务端已停止，且只结算一次。

### 负面与注意事项

- 单进程内存方案在多副本或 Vercel 下失效；未来需粘性会话或补 Redis 实现。运行注册表接口预留实现替换点。
- 进程重启会丢失进行中任务与尚未被消费的结果（最长 30 分钟保留窗口）。
- 用户离开后任务继续执行，最坏消耗一次 240s 预算；配额按实际用量结算，不退还已产生用量。
- 活跃运行达到上限时，新 Agent 请求会被 `503` 拒绝；这是以可用性换内存有界性的明确取舍。
- 审批跨刷新与配额准确性目前只有代码阅读依据（token TTL 10 分钟、本地快照、reconcile 机制），必须列为回归验证项，不能视为已验证通过。

## 备选方案

- **Redis Stream 事件流水 + Pub/Sub（原 PRD）**：跨进程存活能力与决策 1 冲突；Upstash 跨公网写放大、TTL 与 DB 状态对账、宕机降级分叉均需额外处理，而其消费者只存在于进程生命周期内。
- **扩展 `AgentRun` 为运行态表**：与现有分析表语义冲突，需要双写与口径迁移；在决策 1 下不产生任何新增能力。
- **BullMQ worker 作为独立执行宿主**：可支持进程重启后继续执行，但需重写执行器与 SSE 的耦合、迁移计费/审批/trace，工程量约为本方案 2~3 倍，且没有验收项要求。
- **`seq` + `lastEventId` 增量重放**：需穿透 20+ 事件类型，并要求客户端把 `lastSeq` 与部分文本原子持久化；全量重放以可忽略的流量换取正确性与实现简单性。
