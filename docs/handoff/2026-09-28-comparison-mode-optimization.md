# 交接文档：对比模式优化缺口修复（2026-09-29 继续）

> 生成时间：2026-09-28 晚。面向明天的新会话——按 **G2 → G1a → G1b** 顺序执行。
> 本文只记录「尚未落入任何工件」的信息；已提交的改动一律引用 commit，不重复内容。

---

## 1. 背景与已完成工作（勿重做）

`/chat` 优化清单 10 项已全部完成并提交在 `master_optimize` 分支（工作区干净）：

| Commit | 内容 |
|---|---|
| `315bc49` | 取消链路（空删有留、停止按钮、隐式中止 finalize） |
| `ada1acd` | 流中节流落盘 + 失败保留部分内容 + 错误可见性 |
| `57269a2` | 流式渲染 rAF 合帧 + memo 击穿 + 滚动吸底 |
| `f05c678` | done 帧携带 usage + 消息级 token 展示 + 低余额预警 |
| `8769dbd` | 服务端合规拦截层（输入前置 + 输出流后审计） |
| `5e4d98c` | 计费挂账死角 + 讯飞业务错误被吞 |
| `00b643a` | reload 丢消息 + assistant 死按钮 |
| `bf411f8` | SSE `: ping` 心跳帧防中间层空闲断流 |
| `1e351a9` | 打字机测试 flake 改 fake timers |
| `a1b9b8e` | 输入坞 CTA 响应式 44px（DESIGN.md §8.1） |

另有两项**关闭（前提不成立）**：Agent 工具进度 UI（无 Agent 功能）；Markdown 增量解析（实测证实流式期间本就纯文本渲染，落定后才一次性解析 markdown——全应用仅 `message-item.tsx`、`focus-answer-pane.tsx` 两处 ReactMarkdown，都被 `isStreaming` 门控）。

## 2. 对比模式审计结论（本会话产出，未落入任何工件）

对比模式是**独立管线**（`apps/web/src/stores/comparison-store.ts` + `apps/web/src/components/chat/comparison/`），单聊修复不自动流过去。逐项审计结果：

**已自动覆盖 / 等效实现（6 项，勿动）**：合规拦截、计费死角、SSE 心跳（均为服务端层 + 同一 `streamChatResponse`/`consumeChatResponse` 解析器）；取消链路（每模型独立 AbortController + `stopModel` + UI 停止按钮）；rAF 合帧（`comparison-store.ts:90` 自有节流 + components useMemo）；CTA 44px（对比发送钮本就 `h-11`+`px-4` 合规）。

**浏览器实测过的关键路径**：竞态窗口（讯飞完成+豆包流式）刷新 → 豆包卡按 failed+可重试恢复，不是死卡（刷新掐断 fetch 走失败分支并同步了镜像）。

**3 个缺口 = 明天的工作**（详见第 3 节）。

---

## 3. 明天的任务（按此顺序）

### G2 — 对比模式 token 用量展示 + 低余额预警（最优先）

对比模式是最烧钱路径（N 模型并发扣费），却完全没有用量透明。

已定事实：

- `apps/web/src/stores/comparison-store.ts` 的 `runModel`（约 :167-187）调用 `streamChatResponse` 时**没传 `onDone`**，done 帧 usage 被丢弃。`streamChatResponse` 的 `onDone?: (usage?: ChatStreamUsage) => void` 签名在 `apps/web/src/lib/utils/chat-stream.ts:29`，`ChatStreamUsage` 类型在 `packages/shared/src/chat-stream-contract.ts`（含 `inputTokens/outputTokens/totalTokens/estimated`）。
- 做法：runModel 补 `onDone(usage)` 处理器，把 usage 写到 run 上（`ModelRun` 类型在 `apps/web/src/types/comparison.ts`，需加 `usage` 字段）。
- 展示位：单聊的展示样式参照 `apps/web/src/components/chat/message-item.tsx`（「542 tokens（输入 514 · 输出 28）」）；对比模式加在 `focus-answer-pane.tsx` 完成态区块（约 :235 附近）和/或 `model-status-card.tsx`。
- 低余额预警：`checkAndWarnLowBalance` 在 `apps/web/src/lib/billing/balance-warning.ts`（阈值 2000），单聊调用点 `chat-store.ts:536/:620`。对比模式在一轮全部模型终局后调用一次即可。
- UI 改动必须先读根目录 `DESIGN.md`。

### G1a — loadComparison 清洗 stale 'streaming'（小活，堵死卡）

- 异常强杀（崩溃/断电）会把 `'streaming'` 状态持久化到镜像；`comparison-store.ts:514` 的 `loadComparison` 原样加载、不清洗，此时 `stopModel`（:469）拿不到 controller 是空操作 → 死卡。
- 修法：loadComparison 加载时把 run status 为 `'streaming'`/`'queued'` 的清洗为 `'stopped'`（内容保留）。参照 `chat-store.ts:135` 的 `finalizeAbortedMessages`（项 1 模式）。

### G1b — 对比模式流中落盘（对齐项 2）

- 现状：`comparison-store.ts:220` 注释「流式结束才持久化镜像；进行中内容不落盘」——在途轮次刷新即丢。
- 做法：对齐单聊项 2（commit `ada1acd`）的流中节流落盘模式，在 `scheduleContentFlush`/流式期间按节流节奏调 `syncTurnsToConversation`（:107）。G1a 先做，落盘带来的 `'streaming'` 持久化由清洗兜底。

**G3（不做，仅记录）**：对比视图无滚动吸底——双栏同时吸底可能与阅读打架，属产品设计判断，等用户明确想法。

---

## 4. 每项的固定工作流（本项目惯例，逐项照走）

1. **事实摸底**：先读码确认本交接口径仍成立（文件可能已被用户改动）。
2. **拷问决策点**：纯文本列 A/B/C 选项 + 推荐，**等用户回字母**再动手。
3. **写简报到 /tmp**，委派 Antigravity 后台执行：
   ```bash
   node /Users/weixiaoyu/.agents/skills/delegate-antigravity/scripts/delegate-antigravity.mjs work --cwd "$PWD" -- "$(cat /tmp/<brief>.md)"
   ```
   后台 Bash（timeout 3000s），完成通知后读 output.log 尾部 handoff JSON。
4. **亲自验收**（勿信子代理自报）：
   - `git diff` 逐行审，**重点怀疑配置类改动**（子代理有越界前科：乱动类型、加 package.json 脚本、手写 global.d.ts 桩——全部要回滚）；
   - `pnpm --filter @repo/web typecheck`；`cd apps/web && npx eslint <改动文件>`；定向 vitest；
   - 全套件必须 **`npx turbo test --force`**（裸 `pnpm test` 会命中 turbo 缓存假绿）；
   - 简报里写明：只许碰清单内文件、禁动配置、报错如实上报、注释全中文、禁 git add/commit。
5. **ego-browser 真实浏览器实测**（见第 5 节）。
6. **只 `git add` 任务文件**，commit message 中文带要点体（工作区可能有用户未提交改动）。

## 5. 环境与实测操作手册

- **dev server**：用户的 `next-server` 监听 **3030**。先确认存活：`curl -s -o /dev/null -w "%{http_code}" http://localhost:3030/chat`。
- **ego-browser 恢复 xkfy 管理员登录**（浏览器已记住凭据，密码不在任何可读位置，勿找）：
  1. `useOrCreateTaskSpace('<任务名>')`（可复用空间 id 8）
  2. `gotoAndWait('http://localhost:3030/login?logout=1')` → `wait(2)` → `click('ref=6')`（立即进入）→ `wait(4)`
  3. 验证：`localStorage['ai-app-auth']` 的 `state.user.username==='xkfy'`、`role==='admin'`（zustand persist 结构 `{state:{user,...}}`）
- **DOM 锚点**：单聊输入 `textarea[placeholder="输入消息…"]`，发送 `button[aria-label="发送"]`，停止 `button[aria-label="停止生成"]`，AI 气泡 `.markdown-body`；对比模式 tab `[role="tab"]`「并行对比」，对比输入 `textarea[placeholder="输入问题，同时发送给所选模型…"]`，发送按钮文案「同时发送」。
- **对比模式竞态实测手法**：默认选中模型是讯飞 Spark Lite（快）+ 豆包 Evolving（慢推理 13~60s 首 token），天然速度差；状态文案「已完成/生成中」在状态卡和聚焦面板双处渲染，计数会 ×2。
- **JWT/API 直测（如需要）**：node 脚本从 `apps/web/.env.local` 只提取 `AUTH_SECRET`/`DATABASE_URL` 行进 `process.env`（不回显密钥），用 `packages/db/node_modules/@prisma/client` 查用户，`apps/web/node_modules/jsonwebtoken` 签 10 分钟 token。
- **DB 直查**：同上 PrismaClient；配额表 `quotaReservation`（model 在 `packages/db/prisma/schema.prisma:177`）。
- **移动仿真**：`cdp('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:2,mobile:true})`，用完 `clearDeviceMetricsOverride`。

## 6. 未决观察项

- **P2（明早第一件事）**：`billing_pending` 存量 1 行（chat/xunfei 预留 1,747，2026-09-28T02:15 UTC 创建，09-29 10:15 本地时间满 24h）。第 6 项的 `releaseStaleBillingPendingReservations`（worker 每分钟对账）应在满 24h 且无审计用量时整额退还。**新会话手动复查**：查 `quotaReservation where status='billing_pending'` 应为 0 条；若仍在，检查 worker 是否运行。只读观察，勿改数据。（上一会话挂了 11:03 的 cron，但 cron 是会话级的，本会话需自己查。）
- **既有观察（未排期）**：长对话时整个页面滚动、输入坞在内容末尾（非 sticky 吸视口底）；已告知用户，开不开项由用户定。

## 7. Suggested skills

- **`delegate-antigravity`**：每项的实现执行（按第 4 节流程委派+验收）。
- **`grilling`**：每项动手前的决策点拷问（A/B/C + 推荐，等用户回字母）。
- **`ego-browser`**：每项的 xkfy 真实浏览器实测（登录恢复与 DOM 锚点见第 5 节）。
- **`code-review`**：较大改动（G2 涉及类型 + store + 两个展示组件）验收时可加一道双轴审查。

## 8. 硬规则提醒

- 注释/界面文案全中文；最小改动；改代码同步更新过时注释与 `AGENTS.md`（若涉及）。
- UI 改动先读 `DESIGN.md`，与其冲突时以它为准并在交付时说明。
- 工作区可能有用户未提交的改动，提交时只 `git add` 任务文件。
