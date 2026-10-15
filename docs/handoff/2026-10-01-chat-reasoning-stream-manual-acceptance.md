# 交接文档：聊天页真实思考流改造 · 人工验收阶段

> 生成时间：2026-10-01 上午。面向下一个新会话。
> **下一个会话的唯一目标**：完成手动验收清单 #1–#3 的浏览器联调（顺带复核 #4/#5/#7），并判定是否收尾发版。
> 本文只记录**尚未落入任何工件**的信息（环境坑、中断原因、未确认项）；已提交改动、spec、清单、工单一律**引用路径**，不重复内容。

---

## 0. 一句话现状

思考流改造 feature **已全部实施并提交，代码冻结**；自动验收 6/8 通过。剩余工作量仅在**人工浏览器联调**（清单 #1–#3）。上一会话因 **agent 自身模型额度 429 耗尽**而中断，并非代码问题。

---

## 1. 已完成（勿重做，只给指针）

| 项 | 状态 | 指针 |
|---|---|---|
| 需求拷问 + 设计 | 已定稿 | `docs/features/2026-10-01-chat-reasoning-stream/spec.md`（六问裁决见 §0） |
| 5 张工单 | 全部 `resolved` | `.scratch/chat-reasoning-stream/issues/01..05-*.md`（frontier 顺序 01→(02∥03)→04→05 已走完） |
| 实施提交 | 2 个 commit | `2997f7a3`（tracker 改本地 markdown）+ `77822f4b`（feat(chat) 思考流，14 文件 +1114/-105） |
| 自动验收 | 6/8 通过，913 用例全绿 | `docs/features/2026-10-01-chat-reasoning-stream/manual-test-checklist.md` |

> 工作区干净，无未提交改动（`git status` 空）。

---

## 2. 唯一剩余任务：人工验收 #1–#3

验收口径以 `manual-test-checklist.md` 的 8 条为准，其中 **#1/#2/#3 全量待人工**：

- **#1** 豆包模型提问 → 思考块展开流式渲染真实推理内容，与豆包官方 App 同题对拍一致。
- **#2** 正文首 token 流出瞬间，思考块自动折叠为「已思考 X 秒」；手动展开/收起后不再被自动干预。
- **#3** 讯飞三个模型：**无**思考块，骨架屏在首字节到达即消失。

**#4/#5/#7** 逻辑层已有自动证据，浏览器行为只需复核（推理中点停止 → 时长定格 + 刷新还原；推理-only 断流 → billing outcome=partial；对比页双跑不崩、不展示思考块）。

**环境前提（关键）**：需**登录态** + 真实 `ARK_API_KEY`。本地 `apps/web/.env.local` **已配齐** `ARK_API_KEY / ARK_BASE_URL / ARK_MODEL / ARK_DESTINY_MODEL`（值已脱敏，此处不列）。**登录态是上次未确认的未知数**——见 §4。

---

## 3. 本会话踩过的环境坑（未落入任何工件，务必沿用）

### 3.1 起 dev server

- 根 `pnpm dev` → `node tooling/scripts/dev.mjs`（内部 `ps -ax` 扫进程 + 自启 Redis）。**在 agent 背景下用 `| head -60` 管道会因 SIGPIPE 把进程掐死**（本会话第一次失败即此因）。
- 宿主会注入 `NODE_OPTIONS`（一个「语言垫片」），导致 `next dev` 启动失败。**必须摘掉**。
- 已验证可用的裸起命令（日志出现 `Ready in` 后 `/chat` 返回 200）：

  ```bash
  cd apps/web && env -u NODE_OPTIONS ./node_modules/.bin/next dev -p 3000 > /tmp/ai-agg-web.log 2>&1
  ```

- 沙箱会阻断 `~/Library/pnpm/store` 读取（报 `ERR_PNPM_READ_FROM_STORE`）；**装包/跑服务一律非沙箱执行**。
- 若 `.next` 缓存损坏：`rm -rf apps/web/.next` 后按上命令重启。

### 3.2 ego-browser 操作要点

- 打开 `/chat` 后**先等鉴权**：首屏会显示「加载中」，此时快照拿不到有效控件，需 `wait` 数秒再 `snapshotText()`。
- **默认模型是 Spark Lite**；切豆包要点头部模型按钮打开选择面板，再选 `Doubao-Seed-Evolving`。
- `click('@N')` 的 **ref 跨调用会漂移**（同一轮内有效，下一轮失效）。每次操作前重新 `snapshotText()` 取新鲜 ref，或用文本定位点击更稳。

---

## 4. 中断原因 & 未确认项（诚实标注）

1. **中断原因**：上一会话末尾 agent 自身触发 429（CodeBuddy 额度用尽，`https://www.codebuddy.cn/profile/usage`），与本项目代码无关；随后后台 dev server 任务被用户手动取消。**当前无 dev server 在跑**（3000 端口未监听，`/tmp/ai-agg-web.log` 停在 02:58）。
2. **登录态未确认**：上次可见 `/chat` 首屏「加载中」，但后续能在输入框发消息——无法判定是登录成功还是匿名放行。**下次开工第一步必须确认登录态**，否则 #1–#3 可能拿不到真实模型响应。
3. **#1/#2/#3 均无任何实测结论**：上次在「切换模型 → 发送」阶段就中断了，不要假设这几条已部分通过。

---

## 5. 建议执行顺序

1. 按 §3.1 起 dev server，探活 `/chat`，**确认登录态**（§4.2）。
2. 依次跑清单 #1（豆包对拍）→ #2（折叠时序）→ #3（讯飞骨架屏）；顺手复核 #4/#5/#7 的浏览器行为。
3. 若有偏差：`ThinkingBlock` 与折叠/冻结逻辑在 `apps/web/src/components/chat/`（`message-item.tsx` 一带），对照 spec §5（渲染/状态机）与 §6（中断语义）定位；合帧落盘逻辑见 `scheduleEntryFlush`。
4. 全绿后**回填** `manual-test-checklist.md` 结果列，再决定是否发版（走 `ai-aggregation-deploy`）。
5. **二期工具调用**：本会话已裁决「全仓零实现，单独立项」，**不要**在这个 feature 里顺手做。

---

## 6. Suggested skills（下一个会话应主动调用）

| Skill | 作用域/路径 | 何时用 |
|---|---|---|
| `ego-browser` | user：`~/.workbuddy/skills/ego-browser/SKILL.md` | **本阶段核心**——浏览器联调 #1–#3 全靠它 |
| `grilling` | project：`.workbuddy/skills/grilling/SKILL.md` | 若需对二期工具调用立项、或对验收结论再拷问 |
| `ai-aggregation-deploy` | user：`~/.workbuddy/skills/ai-aggregation-deploy/SKILL.md` | 验收全绿后发版到 chunfen.ink |
| `handoff` | project 文件：`.workbuddy/skills/handoff/SKILL.md` | ⚠️ 用 `@skill:handoff` 触发时 **Skill 工具报 "Can not find skill"**——注册表未收录，**下次直接 Read 该文件**照做即可 |

---

## 7. 脱敏说明

- `apps/web/.env.local` 仅记录**键名**，未落任何密钥值：`DATABASE_URL`、`REDIS_*`、各厂商 `*_API_KEY`（含量 `ARK_API_KEY`）、`AUTH_SECRET` 等。
- 交接文档不含真实 API Key、密码或个人信息。
