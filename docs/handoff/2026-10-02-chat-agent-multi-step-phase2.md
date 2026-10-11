# 交接文档：/chat Agent 二期（多步自主循环）收官

> 生成时间：2026-10-02 凌晨。面向下一个新会话。
> 本文只记录**尚未落入任何工件**的信息（环境坑、未确认项、下一步建议）；已提交改动、spec、验收结论一律**引用路径**，不重复内容。

---

## 0. 一句话现状

**二期「有界多步自主循环 + 四笔顺手债」已全部实施完成：门禁全绿（全仓 typecheck/lint/test），真机验收 6/6 通过，spec 与一期 spec §12.1 已回写。** 剩余事务性收尾：code-review 两轴审查（diff 基线 = 一期末次提交）→ 提交（推送需用户另行确认）。

---

## 1. 二期交付指针（勿重做）

| 面 | 指针 |
|---|---|
| 二期规格（含验收结果表） | `docs/features/2026-10-02-chat-agent-multi-step/spec.md` |
| 一期规格（D1 修订、§5.1 agent_note、§12.1 完成标记） | `docs/features/2026-10-01-chat-agent-tools/spec.md` |
| 工单 01–06（不进仓库） | `.scratch/chat-agent-multi-step/issues/` |
| 编排器 | `apps/web/src/app/api/chat/_lib/agent/agent-runner.ts`（循环骨架/边界/去重/熔断/出图上限） |
| 事件契约 | `packages/shared/src/chat-stream-contract.ts`（新增 `agent_note`，共 8 事件） |
| 前端 | `chat-store.ts`（agentNotes 累计值切增量 + 还原剥离）、`agent-trace.tsx`（扁平时间线混排）、`chat-input.tsx`（agent 模式隐藏附件入口）、`message-item.tsx`（hasToolCalls 含旁白） |

**关键口径**（细节都在 spec，这里只留最容易记错的）：

- `StreamChatResponseHandlers.onAgentNote` 回调的是**累计值**（与 onChunk 同形），store 侧用 `agentNoteConsumedLength` 切增量；`ConsumeChatResponseHandlers.onAgentNote` 才是单帧增量。
- 旁白剥离**只**挂在 `loadConversation` 还原路径（`stripAgentNotes`）；done/abort/failed 的 live 收尾共用 `sanitizeToolCalls` 但**不**剥离——否则流式一结束 live 视图旁白就消失。
- 折叠公式 `isStreaming && (runningCount>0 || !hasContent)` 一字未改即天然覆盖多步循环，不要画蛇添足。
- 服务端时序：每轮**先推 `agent_note` 再执行该轮工具**——「有旁白、零工具」是真实瞬时态，折叠头有零工具文案分支（「正在思考下一步…」）。

---

## 2. 环境坑（本期新增，务必沿用）

- **VPN global 模式会重置部分国内 AI 端点的 TLS**：Clash Party（mihomo 内核，TUN `utun1500`）全局走美国出口时，`ark.cn-beijing.volces.com` 与 `spark-api.xf-yun.com` 在 TLS 握手即被重置（0.2s ECONNRESET），而 deepseek/zhipu 正常。表现 = 服务端 3 次重试后「编排失败」，但 reserve 已冻结（会全额释放，无泄漏）。**解法**：mihomo 外部控制器在 unix socket（`ps -p <mihomo_pid> -o command=` 找 `-ext-ctl-unix` 路径），`curl --unix-socket <sock> -X PATCH http://localhost/configs -d '{"mode":"rule"}'` 切规则模式即可直连，**验收完务必改回 `global`**。该实例无 TCP 代理端口（TUN-only），`--noproxy` 无效因为出口在远端。
- **`tsx -e` 与 `.scratch/` 下的脚本是 CJS**：顶层 await 会报 Transform failed。解决：用 `.mts` 后缀，且脚本要放在 `packages/db/` 内（模块解析以**脚本位置**为准，放 `.scratch` 找不到 `@prisma/client`）。环境变量用 `npx tsx --env-file=apps/web/.env.local` 注入（Node 自读，不需人工读敏感文件）。
- **匿名会话约 22 分钟会整体失效**：access token 过期后 `/api/auth/refresh` 也 401（refresh token 被删除），前端连锁登出并清空 localStorage（含 `ai-device-id`），自动新建匿名身份。**长跑真机验收做到一半额度变了、身份换了，先怀疑这条**。是否是 refresh 轮换缺陷未排查（见 §3）。
- 一期坑全部仍然有效（`env -u NODE_OPTIONS`、naive UTC、quota_accounts 成组改、ego 计数基线别用 waitForSelector），见 `docs/handoff/2026-10-01-chat-agent-tools-phase1-to-phase2.md` §4。

---

## 3. 未确认项 & 诚实标注

1. **模型会把实质回答写进中间轮决策文本**：真机场景 1 中，「标题和用途」的答案被模型写进第 2 轮决策文本 → 路由进旁白（卡片内），最终正文只覆盖出图部分。路由行为符合 spec D-二期-6，属**系统提示词调优空间**（应引导模型把中间轮文本限制为简短过程说明），非代码缺陷。
2. **匿名会话 22 分钟失效**（见 §2 末条）：未排查是 token TTL 设计如此还是 refresh 轮换 bug。若用户反馈「聊着聊着被登出」，先查这里。
3. **delegate-antigravity 委派通道对「大文件前端改造」类任务会空转**：工单 04 两次委派均 IDLE 停摆（handoff 无可提取文本、changes 为空），最终由主代理自做。工单 01/02/03/05（中小颗粒、单文件聚焦）委派正常。后续委派前端大改造类任务前先用小任务试温。
4. **`.scratch/` 不进仓库**：二期工单 01–06 在 `.scratch/chat-agent-multi-step/issues/`（`.gitignore` 忽略）。
5. 真机验收的两个匿名测试账号（`cmupw93a6…`、`cmupwuaot…`，后者额度被压到 2000）仍留在数据库里，属无害测试数据；介意可删。

---

## 4. 下一步建议（三期候选，按优先级）

二期 spec「Out of Scope」仍然有效。按价值/成本排序：

1. **系统提示词调优**（对应 §3.1）：让中间轮决策文本保持简短过程说明、实质内容留给收尾步。改动小、用户可感知强。
2. **推理流透传**（一期 spec §5.6 已预留通道）：纯增益，展示设计需先定。
3. **agent 附件输入支持**：二期只关了入口；真支持涉及视觉能力实测、图片合规机制、多模态计费口径，需独立立项。
4. webhook / 会话服务端化 / MCP：前提条件与一期 D9 排序不变（webhook 卡四子系统、会话服务端化独立立项、MCP 等 webhook 安全模型）。

---

## 5. Suggested skills（下一个会话应主动调用）

| Skill | 何时用 |
|---|---|
| `handoff`（project，`.workbuddy/skills/handoff/SKILL.md`） | 生成本类文档；Skill 工具可能报找不到，直接 Read 照做 |
| `grilling` / `to-tickets` / `to-spec` | 三期立项拷问与拆解 |
| `code-review` | 本次二期提交前的两轴审查（diff 基线 = 一期末次提交，勿用空基线） |
| `ego-browser` | 三期真机验收；注意 §2 的 VPN 与匿名会话时效两条坑 |

---

## 6. 脱敏说明

- 全文只出现环境变量键名与本地文件路径，未落任何密钥值、账号密码、生产服务器信息。
- 文中匿名用户 ID 为本地开发库测试数据，非真实用户。
