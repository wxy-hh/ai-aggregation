# 交接文档：/chat Agent 工具调用 · 一期收官 → 二期规划

> 生成时间：2026-10-01 晚。面向下一个新会话。
> 本文只记录**尚未落入任何工件**的信息（环境坑、未确认项、二期判据与前置依赖）；已提交改动、spec、验收清单、工单、审查报告一律**引用路径**，不重复内容。

---

## 0. 一句话现状

**一期功能已全部实施完成、真机验收 11/11 通过、两轴 code review 已完成并处置完毕。** 剩余工作量分两块：① 把本地改动提交/推送（事务性收尾）；② **二期是「新增能力」而非修 bug** —— 多步自主循环、webhook 工具、服务端会话、MCP，每项都有明确前置依赖，不可直接开工。

---

## 1. 二期范围（权威出处：spec §12 + D9）

`docs/features/2026-10-01-chat-agent-tools/spec.md` §12 与决策 D9 划定的大方向与顺序：

> 多步自主循环 → 用户 webhook 工具 → 会话服务端化+长期记忆（独立立项）→ MCP

### 1.1 每项的开工前置（**这是二期最容易踩的坑**）

| 二期项 | 硬前置 | 出处 | 不满足会怎样 |
|---|---|---|---|
| **多步自主循环**（`maxSteps` 1→N） | 账本要支持**一对多结算** | D1 / D6 | 一次请求 5–20 次模型调用，而账本是「一次 reserve/finalize」，硬上会导致计费口径崩坏。**按步计费依赖账本能力，不是改个常量** |
| **用户自定义 webhook 工具** | SSRF 防护**专项**（域名白名单 / 响应限制 / 超时 / 审计） | D2 | 现有 `web-fetch` 的 SSRF 防护只覆盖「抓网页」这一种形态，不足以承载用户自填 URL 的写操作 |
| **会话服务端化 + 长期记忆** | 需**独立立项** | §12.3 | 记忆要可靠必须先有服务端会话存储，与 agent 解耦，不要塞进 agent 排期 |
| **MCP 接入** | webhook 的安全模型先跑通 | §12.4 | MCP 被定位为「受信工具注册表」的特例，安全模型未定前引入会把攻击面直接放大 |

### 1.2 二期可以顺手还的工程债（来自 T08 审查，当时标注「不修，记录在案」）

出处：`docs/reviews/2026-10-01-chat-agent-tools-code-review.md` 的「T08 处置」表末两行。

| 项 | 说明 | 优先级判断 |
|---|---|---|
| `ReserveFeature` 未从 `AiUsageFeature` 派生 | `'chat-agent'` 这一个新值被迫改 5 个文件，同一字符串联合在 4 处各写一份（Shotgun Surgery） | **值得单独开工**，越晚改越贵 |
| 合规检查点 2 语义（Spec #12） | `image_generate` 的 prompt 命中合规时**直接失败**，而 spec 写的是「替换为合规话术、不中断任务」 | 对图像生成而言「直接失败」更合理，建议**改 spec**而非改码 |
| 覆盖行为未留痕（Spec #3） | §5.2 要求「覆盖 provider/model 记入 finalize metadata」，实际只记了 `agent: true`，被覆盖的 `xunfei/lite` 没留 | 低 |
| **agent 一期不支持附件输入** | `toModelMessages` 只取 `role`/`content`，**附件被静默丢弃**；但前端 agent 模式下附件入口是**放开的**（`showAttachment = provider==='doubao' \|\| agentModeEnabled`） | **一致性缺陷**：能选图、传不进去。要么关掉入口，要么支持附件 |
| 推理流透传 | SDK `fullStream` 已暴露 `reasoning-*`，spec §5.6 明确为二期预留了通道 | 中，纯增益 |
| 并行工具执行 | 一期顺序执行；spec §7 注「并行为二期」 | 低，且会影响前端折叠信号（见 §3） |

---

## 2. 一期交付概览（勿重做，只给指针）

| 面 | 内容 | 指针 |
|---|---|---|
| 需求与决策 | 20 条用户故事、D1–D11 决策表、§5.1 事件契约（本期修订过） | `docs/features/2026-10-01-chat-agent-tools/spec.md` |
| 工单 | 01–07（实施）、09（事件顺序，路线 B 已修）、10（超时预算，已修） | `.scratch/chat-agent-tools/issues/`（**该目录被 `.gitignore` 忽略，不进仓库**） |
| 验收 | spec §11 十一条 + UI 壳专项 + 过程卡片专项，**全部通过** | `docs/features/2026-10-01-chat-agent-tools/manual-test-checklist.md` |
| 代码审查 | Standards / Spec 两轴，含主代理对关键项的独立复核 | `docs/reviews/2026-10-01-chat-agent-tools-code-review.md` |
| 可复现脚本 | 两段式总结的传输层对照（Chat Completions vs Responses） | `docs/features/2026-10-01-chat-agent-tools/verify-two-step-summary.mjs` |

**一期实际交付的能力**（用户可见）：输入坞 agent 开关（不跨会话记忆）→ 服务端强制 `doubao/doubao-seed-evolving` 走两段式编排（决策步 → 顺序执行工具 → 总结步）→ 内置 `web_fetch`（含完整 SSRF 红线）与 `image_generate`（Agnes 文生图）→ 过程卡片实时展示工具名/参数/结果 → 计费单列 `feature='chat-agent'`。

> **2026-10-03 根因批注（四期①修正，不改写历史结论）**：一期「Responses API 多轮回传 messages 报 400」的归因已修正。真实根因是 `@ai-sdk/openai` 在 `store:true`（默认）下把响应历史项序列化为 `item_reference`，Ark 不支持该类型而 400——并非 Responses API 不支持多轮。四期①已改用「`previous_response_id` 链式 + 只回发增量工具结果」跑通多步循环，agent 编排器已直切 Responses API。证据与落地：`docs/features/2026-10-02-chat-agent-responses-web-search/spec.md` §0、`docs/handoff/2026-10-03-chat-agent-responses-web-search.md`。

---

## 3. 一期已知边界（二期设计时需回看）

1. **多工具折叠瞬闪**（有意留下）：决策步正文已到达时，tool N 的 result 与 tool N+1 的 call 之间 `runningCount` 会瞬时归零再变 1，理论上有一次微秒级折叠→展开。**没改成「看最后一个工具的状态」是因为二期要支持并行**，那时「最后一个」会判错而「是否有在跑」仍正确。位置：`apps/web/src/components/chat/agent-trace.tsx`。
2. **出图工具 40s 预算、通用工具 15s**：`AgentToolSpec.timeoutMs` 可覆盖策略默认值（工单 10）。二期新增慢工具时记得声明自身预算。
3. **超时判定语义**：交给工具的是**派生信号**，超时下同样 `aborted`，因此**工具不得自查 `ctx.signal.aborted`** —— 取消/超时的区分统一在 `runToolWithPolicy`（用户取消 > 超时 > 其它）。二期加工具务必遵守。

---

## 4. 环境坑（未落入任何工件，务必沿用）

按上一期交接文档同款口径重列本会话新增/复现的坑：

- **起 dev server 必须摘 `NODE_OPTIONS`**（宿主注入的垫片会让 `next dev` 起不来）：
  ```bash
  cd apps/web && env -u NODE_OPTIONS ./node_modules/.bin/next dev -p 3000 > /tmp/ai-agg-web.log 2>&1
  ```
- **所有 pnpm/vitest/tsc/eslint 命令也要 `env -u NODE_OPTIONS` 前缀**，否则行为异常。
- **首次访问 `/chat` 是客户端渲染，要等 6–8s** 才出输入坞，此时快照才有有效 ref。
- **`ai_usage_records."createdAt"` 是 naive UTC，会话时区是 +08**：`> now() - interval '1 hour'` 恒返回 0 行，须写 `(now() at time zone 'utc') - interval '1 hour'`。
- **`quota_accounts` 有 CHECK `grantedUnits = availableUnits + reservedUnits + settledUnits`**：想手工造「额度不足」不能只改 `availableUnits`，须成组改（如 `available=100, reserved=0, settled=1900` 且 `granted` 不变），并同步 `users.tokens`。
- **切匿名身份**：匿名账号由 `localStorage['ai-device-id']`（`^[a-f0-9]{64}$`）决定。清 cookie + 预置一个新的 64 位十六进制 id + reload，服务端就会新建一个 20000 额度的全新匿名账号，无需换设备。
- **本机 Node 22 不读 `HTTP_PROXY`/`HTTPS_PROXY`**：服务端直连境外域名（如 Agnes 上游）会慢/失败，而**浏览器**直连同域名正常。凡「服务端拿不到、浏览器能拿到」先怀疑这条。*（注：本会话实测该上游从 Node 直连可达，约 1.7s 返回 401；真正的慢在**出图**，见下条。）*
- **Agnes 出图耗时 10.7–13.9s**（5 次采样）：这是出图工具超时预算的实测依据，已被工单 10 用（40s）。
- **ego-browser 判断「有没有新 trace 节点」**要用「计数基线 + `waitForFunction(count > baseline)`」，**别用** `waitForSelector('[data-testid="agent-trace"]')` —— 会命中页面里已存在的旧卡片，导致「其实没跑起来」却误判通过（本会话踩过）。

---

## 5. 未确认项 & 诚实标注

1. **本地有 2 个提交未推送**，另有 4 个文件未提交（见 §6）。`git push` 按 `.claude/rules/git-workflow.md` 需二次确认，本会话未执行。
2. **出图工具的 40s 预算未在真机验证**：要构造 >15s 的上游延迟，代价是一次真实的慢出图。已用「通用超时 100ms + 工具耗时 300ms 仍成功」等价证明声明值生效，但**没有**真跑到 40s 量级。
3. **`.scratch/` 不进仓库**：所有工单文件（01–07、09、10）都在 `.scratch/chat-agent-tools/issues/`，被 `.gitignore` 第 67 行忽略。若希望工单长期留档，需换目录。
4. **`docs/reviews/` 会进仓库**（与本条相反，已随 `ed0b4ed5` 提交）。

---

## 6. 建议执行顺序

**先收尾一期，再谈二期。**

1. **事务性收尾**：确认无误后提交当前 4 个文件（`agent-trace.tsx` 折叠信号、两个测试文件、spec 修订、审查报告一行更正），再决定是否 `git push`（2+1 个提交）。
2. **二期立项前**：先读 `spec.md` 的 D1/D2/D6 与 §12 —— **多步循环与 webhook 都不是「加个循环/加个接口」**，前者卡账本一对多结算，后者卡 SSRF 专项。建议按 `grilling` 技能对「二期先做哪一个」做一次拷问，再拆工单。
3. **若选多步自主循环**：先确认账本一对多结算的方案（`packages/db/src/billing/`），再动 `agent-runner.ts` 的 `maxSteps`。
4. **若顺手还债**：`ReserveFeature` 从 `AiUsageFeature` 派生（改动面小、收益随二期加值放大）适合先做。

---

## 7. Suggested skills（下一个会话应主动调用）

| Skill | 作用域 / 路径 | 何时用 |
|---|---|---|
| `handoff` | project 文件：`.workbuddy/skills/handoff/SKILL.md` | ⚠️ 用 `@skill:handoff` 触发时 **Skill 工具可能报 "Can not find skill"**——注册表未收录，**直接 Read 该文件**照做即可（本会话即如此）。注意它默认写到系统临时目录，但本仓库先例是写 `docs/handoff/` |
| `grilling` | project：`.workbuddy/skills/grilling/SKILL.md` | **二期立项的核心工具**——多步循环 vs webhook 的优先级、账本改造范围都需要拷问 |
| `to-tickets` | project：`.workbuddy/skills/to-tickets/SKILL.md` | 拷问定稿后把二期拆成带阻塞关系的工单 |
| `code-review` | project：`.workbuddy/skills/code-review/SKILL.md` | 二期任一改动落地后做两轴审查。⚠️ 注意本仓库**尚无提交基线时** `git diff <ref>...HEAD` 会是空的，需改用工作区对比 |
| `ego-browser` | user：`~/.workbuddy/skills/ego-browser/SKILL.md` | 二期做真机验收时用 |
| `ai-aggregation-deploy` | user：`~/.workbuddy/skills/ai-aggregation-deploy/SKILL.md` | 一期推送后若要发版到 chunfen.ink |

---

## 8. 脱敏说明

- 全文只出现**环境变量键名**（`ARK_API_KEY`、`AGNES_API_KEY`、`AGNES_INFERENCE_API_URL`、`DATABASE_URL`、`AUTH_SECRET` 等），**未落任何密钥值**。
- 未记录任何账号密码、个人身份信息或生产服务器信息。
- 引用的提交 SHA、文件路径、数据库表名均为非敏感信息。
