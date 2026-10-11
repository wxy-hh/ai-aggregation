# /chat Agent 工具调用 · 手动验收清单

> 依据 spec §11 十一条端到端行为项。自动证据 = 已随工单 01–06 落地的单测/类型检查；待人工 = 需登录态 + 真实上游密钥的浏览器联调。
> 日期：2026-10-01 晚。环境：本地 dev server（`:3000`）+ 真实 ARK / Agnes 上游 + 登录态。
> 格式沿用上一期 `docs/features/2026-10-01-chat-reasoning-stream/manual-test-checklist.md`。

## 0. 前置条件与操作锚点

**起 dev server**（宿主注入的 `NODE_OPTIONS` 会让 `next dev` 起不来，必须摘掉）：

```bash
cd apps/web && env -u NODE_OPTIONS ./node_modules/.bin/next dev -p 3000 > /tmp/ai-agg-web.log 2>&1
```

依赖：本地 Redis 需在跑（`redis-cli ping` → PONG）；`apps/web/.env.local` 需齐 `ARK_API_KEY / ARK_BASE_URL / AUTH_SECRET / DATABASE_URL`。

**DOM 锚点**（联调时按这些定位，避免依赖会漂移的 ref）：

| 目标 | 选择器 |
| --- | --- |
| agent 开关（关/开两态） | `button[aria-label="开启 Agent 工具调用"]` / `button[aria-label="关闭 Agent 工具调用"]` |
| 输入坞生效模型提示条 | `[data-testid="agent-mode-notice"]` |
| 过程卡片 | `[data-testid="agent-trace"]` |
| 过程卡片折叠头 | `button[aria-label="收起工具调用过程"]` / `button[aria-label="展开工具调用过程"]` |
| 附件入口 | `button[aria-label="添加附件"]` / `button[aria-label="当前模型不支持附件"]` |
| 输入框 / 发送 / 停止 | `textarea[placeholder="输入消息…"]` / `button[aria-label="发送"]` / `button[aria-label="停止生成"]` |
| 头部模型选择器 | 头部显示当前模型名的下拉触发器（agent 期间应为置灰不可点） |
| AI 气泡正文 | `.markdown-body` |

**认证**：见 §3 环境记录——本机浏览器记住的凭据对应的是 DB 里已不存在的 `admin` 账号（本地库重建过），点「立即进入」会失败；需显式以 `xkfy` 身份登录。

**用量核对 SQL**：

```sql
-- 注意：ai_usage_records."createdAt" 是 timestamp without time zone（存 UTC），
-- 而会话 TimeZone 是 Asia/Shanghai(+08)，直接写 `> now() - interval '1 hour'`
-- 会把 13:35(UTC) 与 20:36(+08) 比较，恒返回 0 行（首轮踩过）。
-- 必须显式换算：用 `now() at time zone 'utc'` 或按绝对时间查。
select feature, status, provider, model, "inputTokens", "outputTokens", "createdAt"
from ai_usage_records
where "createdAt" > (now() at time zone 'utc') - interval '1 hour'
order by "createdAt" desc limit 30;
```

---

## 1. 验收项

| # | 验收项 | 验证方法 | 结果 |
|---|--------|----------|------|
| 1 | agent 开 + 画图闭环：事件序列 tool_call → tool_result(success) → 文本 → done；消息含图片与工具记录 | 开 agent → 发「画一张…」→ 观察过程卡片实时出现「正在调用图像生成…」，折叠头在正文首增量到达时自动折叠；气泡内出现生成图 + 文字说明 | ✅ 通过（过程卡片实时出现「正在调用图像生成…」；图 1152×864 渲染于气泡内并带文字说明；两段式 token 累计 1,781） |
| 2 | agent 开 + URL 总结：抓取成功，回答含正文要点；过程卡片记录调用 | 开 agent → 发「总结一下 https://example.com」→ 过程卡片出现「网页抓取」且 resultSummary 有内容；回答概括页面要点 | ✅ 通过（折叠头「调用了 1 个工具」；明细含 `已抓取 example.com · Example Domain（正文 182 字）`；回答概括了页面要点） |
| 3 | agent 开 + 内网 URL 拦截：工具 failed，回答说明「该地址不允许访问」 | 开 agent → 发「总结 http://127.0.0.1:6379」与「http://192.168.1.1」→ 工具行显示失败态，回答解释该地址不允许访问 | ✅ 通过（trace 显示 `执行失败：该地址不允许访问`；回答以「无法实际抓取该页面」开头并如实说明被拒——**首轮曾不达标**，见 §2 F4） |
| 4 | agent 开 + 失效链接：工具 failed（超时/404），回答解释失败原因，非沉默非编造 | 开 agent → 发「总结 https://example.com/this-page-does-not-exist-404」→ 工具失败态 + 回答说明抓取失败原因 | ✅ 通过（`执行失败：目标网页返回 404`；回答明确解释 404 而非编造内容） |
| 5 | agent 开 + 普通问题（降级无感知）：单段直接回答，无工具事件，体验同普通聊天 | 开 agent → 发「用一句话解释什么是闭包」→ 无 `[data-testid="agent-trace"]` 节点；回答与 agent 关时一致；无骨架屏长挂 | ✅ 通过（DOM 中无新建 trace 节点；单段直答；无骨架屏长挂） |
| 6 | agent 关：一切行为与现状一致（回归） | 关 agent → 重发 #5 同题 → 无提示条、无过程卡片；头部模型选择器恢复可点；请求体不含 `agent`（网络面板核对） | ✅ 通过（无提示条、无新 trace、模型选择器恢复可点；用量记录落 `feature='chat'` 且 provider=xunfei，证明未走 agent 分支） |
| 7 | 停止中断：工具执行中点停止 → 已收内容保留、标记中断、partial 结算 | 开 agent → 发画图请求 → 过程卡片出现「执行中…」时点停止 → 过程卡片保留 running→failed、气泡显示「已停止 · 内容可能不完整」；DB 记 status=partial | ✅ 通过（折叠头「调用了 1 个工具（1 个失败）」；明细行 `执行未完成`；气泡「已停止 · 内容可能不完整」；**零残留 spinner**——首轮曾不达标，见 §2 F3） |
| 8 | 刷新后：agent 消息的工具调用记录可回看 | 完成一轮 agent 对话 → F5 → 过程卡片仍在且为折叠态，展开可见工具名/参数摘要/结果摘要；无残留「执行中…」假象 | ✅ 通过（刷新后 6 张 trace 全在且折叠头文案逐张一致；`aria-expanded` 全为 false；运行中 spinner 计数 0；生成图仍 1152×864；「已停止」标记保留） |
| 9 | 用量记录：`ai_usage_records.feature='chat-agent'`，与 `chat` 分列 | 跑完 #1/#2 后跑 §0 SQL：应同时出现 `chat` 与 `chat-agent` 两类记录，agent 轮次为 chat-agent | ✅ 通过（同期并存 `chat` 172 条 / `chat-agent` 6 条；agent 轮次 provider=doubao、model=doubao-seed-evolving；非 agent 轮次 provider=xunfei 落 `chat`） |
| 10 | 匿名用户：agent 可用，配额约束生效 | 清登录态以匿名身份开 agent 发一问 → 正常走通；再用额度紧张的匿名账号打到不足，确认 402/429 与额度弹窗 | ✅ 通过（**可用**：新建匿名账号 `anon_60986d48b48b441e` 开 agent 发 URL 总结，`/api/chat` 200、trace「调用了 1 个工具」、回答正确、落 `chat-agent` 记录、额度 20000→18780（精确减 1220 = 941+279）。**约束**：把额度压到 100 后重发，`/api/chat` **402**（151ms 快速失败，未触上游）、弹窗「文本或语音额度不足」+ 匿名专属「使用账号密码登录」入口、不新增 trace 节点、不写用量记录） |
| 11 | 移动端：开关与过程卡片在拇指区、热区达标 | 切 375×812 视口 → agent 开关位于输入坞内可拇指触达，命中区 ≥44px；过程卡片折叠头 ≥44px 高；布局不溢出 | ✅ 通过（开关侧见 §1b；过程卡片侧：折叠头实测 **44px 高**、可视框内命中；折叠/展开两态横向均不溢出（`scrollWidth == 375`）。**首轮发现工具名被挤成竖排**，见 §2 F5，已修） |

---

## 1b. UI 壳专项（不依赖上游额度，已实测完成）

375×812 视口（DPR 3）下实测，证据均为浏览器内 `getBoundingClientRect` / `elementFromPoint` / `localStorage` 直读。

| 项 | 操作 | 预期 | 结果 |
|---|------|------|------|
| 移动端拇指区 | 量开关在输入坞中的位置 | 落在底部拇指可及范围 | ☑ 通过（开关 y=626 / 视口高 812，位于底部 23% 区域；横向 x=40，与附件钮、发送钮同排于输入坞内） |
| 热区 ≥44px | 在按钮可视框外 2px 处 `elementFromPoint` | 命中仍属该按钮（伪元素补热区） | ☑ 通过（可视 36×36；左/右/上/下各外扩 2px 仍命中、外扩 8px 不命中 → 实际命中区 44×44） |
| 开关两态 | 点击开关 | `aria-pressed` 翻转、图标态切换、可再次关闭 | ☑ 通过（false → true，`aria-label` 同步由「开启」变「关闭」） |
| 生效模型提示 | 开 agent 后读 `[data-testid="agent-mode-notice"]` | 出现且写明生效模型与代价 | ☑ 通过（文案：「Agent 模式 · 已切换至豆包 Seed · 额度消耗更高」，位于输入坞上方 y=595） |
| 头部模型选择器置灰（D11） | 开 agent 后读移动端模型选择按钮 | `disabled=true`，文案保持原模型名不篡改 | ☑ 通过（按钮 disabled，仍显示「Spark Lite (免费)」；关闭 agent 后恢复可点） |
| 附件入口一致性 | 开 agent（头部为讯飞）后读附件钮 | 由「当前模型不支持附件」变为可用的「添加附件」 | ☑ 通过（agent 期间服务端强制豆包，附件入口随之放行） |
| 开关不跨会话记忆（B3） | 开 agent → F5 | 回到默认「关」，无提示条，模型选择器可点 | ☑ 通过（刷新后三态齐回；且 `localStorage['ai-app-settings']` 内**只有** theme/language/fontSize，确认 `agentModeEnabled` 未落盘） |

---

## 1c. 过程卡片专项（375×812，DPR 3；复用 §1 跑出的 6 张真实 trace）

| 项 | 操作 | 预期 | 结果 |
|---|------|------|------|
| 折叠头热区 | 量 `[data-testid="agent-trace"] button` 的 `getBoundingClientRect` | ≥44px 高 | ☑ 通过（实测 **44×247**，由 `min-h-[44px] md:min-h-[32px]` 直接给足，无需伪元素补热区） |
| 折叠头可点 | 中心 `elementFromPoint` | 命中该 button | ☑ 通过 |
| 横向不溢出 | 折叠态与展开态分别读 `documentElement.scrollWidth` | == 375 | ☑ 通过（两态均为 375；展开态卡片右边界 315 < 375） |
| 展开态信息完整 | 展开一张 trace | 可见工具名 / 参数摘要 / 结果摘要 | ☑ 通过（工具名「图像生成」+ JSON 参数 + 结果摘要「执行未完成」） |
| 工具名不被挤压 | 量工具名 `<span>` 尺寸 | 单行、保持固有宽度 | ☑ 通过（修复后 **48×16 = 1 行**；修复前为 12×64 = 4 行竖排——见 §2 F5） |

---

## 2. 附带发现

T07 联调共暴露 **5 个产品缺陷（4 个阻塞级 + 1 个观感级，均已在联调中修复并复验）** 与 1 个文档缺陷。逐条标注是否阻塞发版。

| 编号 | 现象 | 根因 | 处置 | 阻塞发版？ |
|---|---|---|---|---|
| F1 | 两段式总结步骤恒定 HTTP 400：`The parameter 'input' ... '<nil>'`（`/api/v3/responses`） | **传输层选择错误**。`@ai-sdk/openai` 的默认可调用形态 `provider(model)` 走 **Responses API**；该 API 会把 `decision.response.messages` 序列化成 `item_reference` 条目，Ark 不认。单测把 `streamText` mock 掉了，所以 T03 这层结构性测不到 | 改为 `aiProvider.chat(options.model)`（Chat Completions），决策步与总结步统一。归档可复现脚本 `verify-two-step-summary.mjs` | **是**（不修则 agent 多工具/两段式路径全废） |
| F2 | agent 生成的图片经 `/api/image/proxy` 返回 403 | 上游产物域名 `platform-outputs.agnes-ai.space` 是 **GCS 自定义域名**，不在 `DEFAULT_ALLOWED_DOMAINS` 白名单（白名单里只有 `storage.googleapis.com`） | 把 `agnes-ai.space` 加入白名单（产品级修复，绘图页同样受益）；同时前端 `<img>` 改用上游**原始 URL**（无需 CORS/代理）。另注：本机 Node 22 不读 `HTTP_PROXY`，直连该域名极慢，代理链路在本机不可复现——属**本地环境假象**，非产品缺陷 | **是**（不修则 agent 画图功能不可用） |
| F3 | 工具执行中点「停止」后，过程卡片永久卡在「正在调用…」 | `sanitizeToolCalls`（把 `running` 归一为 `failed`）只在 `loadConversation` 回放路径调用，中止/失败/正常结束三条终止路径都没调，破坏了「非流式中 ⇒ 不存在 running 工具调用」这条不变式 | 在 `runChatStreamSession` 的**中止路径、失败路径、正常完成路径**三处统一调用 `sanitizeToolCalls` | **是**（用户可见的假状态） |
| F4 | 内网 URL 被安全拦截后，模型**用自身既有知识替用户作答**，掩盖了工具被拒的事实 | `tool-policy.ts` 失败分支只返回了给人看的 `summaryForDisplay`，没有给模型的 `contentForModel`，模型收到的是空结果，于是自行补答 | 失败分支补上带指令的 `contentForModel`：「工具「X」执行失败：…；请在回答中如实告知用户这次调用失败及其原因；不要凭自身既有知识替用户回答本该由该工具获取的内容」 | 否（质量级；但涉及「不可编造」的产品底线，建议随版发出） |
| F5 | 移动端过程卡片里工具名被挤成**竖排**（每行一个字） | 工具名 `<span>` 是 flex item，未设 `shrink-0`/`whitespace-nowrap`；中文可在任意字间断行，`min-width:auto` 使其 min-content 退化为 1 个字，于是被右侧 `flex-1` 的参数摘要吃光宽度 | 工具名加 `shrink-0 whitespace-nowrap`，截断责任交给本就带 `truncate` 的参数摘要；并补一条类名契约单测（jsdom 无排版引擎，只能锁契约） | 否（观感级；影响的是过程卡片可读性） |
| D1 | 本清单 §0 的用量核对 SQL **恒返回 0 行** | `ai_usage_records."createdAt"` 是 `timestamp without time zone`（存 UTC），而会话 TimeZone 为 `Asia/Shanghai(+08)`；`> now() - interval '1 hour'` 把 `13:35`(UTC) 与 `20:36`(+08) 比较 | 改为 `(now() at time zone 'utc') - interval '1 hour'`，并在 §0 写明原因 | — （文档缺陷） |

**结论**：F1/F2/F3 三个阻塞级缺陷已全部修复并复验（§1 的 #1/#3/#7 即复验证据）；F4/F5 为质量与观感级，同样已修。当前无已知阻塞发版的遗留问题。

---

## 3. 环境记录（联调过程写入）

- dev server：`next dev -p 3000`，`Ready in 5.5s`，`GET /chat 200`。首次访问 `/chat` 需等客户端渲染（首屏为 spinner，约 6–8s 后才出输入坞）。
- **登录态**：本机浏览器自动填充的用户名是 `admin`、密码 16 位，但本地库 `users` 表中**只有 `xkfy`**（`admin` 不存在），点击「立即进入」失败、登录态停留在匿名账号。
- **配额现状**：`xkfy` 20000/20000 可用；匿名账号 `anon_7dcc770e1cc4a699` 20000 中已用 17946、**仅剩 2054**——高消耗项（图像生成）在匿名账号下不可靠，故验收以 `xkfy` 进行。

### 3.1 可复现的测试手法（后续回归可直接复用）

- **切匿名身份**：匿名账号由设备指纹决定（`getDeviceId()` 优先读 `localStorage['ai-device-id']`，命中 `^[a-f0-9]{64}$` 即复用）。所以 `Network.clearBrowserCookies` + `localStorage.clear()` + 预置一个新的 64 位十六进制 `ai-device-id` + reload，服务端就会**新建一个 20000 额度的全新匿名账号**（本次得到 `anon_60986d48b48b441e`）。无需真机换设备。
- **造「额度不足」**：`quota_accounts` 有两条 CHECK——`grantedUnits = availableUnits + reservedUnits + settledUnits` 且各列 ≥0。直接改 `availableUnits` 会违反约束，必须成组调整，例如：
  ```sql
  update quota_accounts
     set "availableUnits"=100, "reservedUnits"=0, "settledUnits"=19900
   where "userId"='…';   -- grantedUnits 保持 20000
  ```
  并同步 `users.tokens`。改完记得还原。
- **不确定有没有新 trace 节点时**：用「trace 计数基线 + `waitForFunction(count > baseline)`」判断，**不要**用 `waitForSelector('[data-testid="agent-trace"]')`——它会命中页面里已存在的旧卡片，导致「其实没跑起来」却误判通过（#7 首轮就踩了这个坑，重跑才拿到有效证据）。
- **验收后已还原**：`xkfy` 的 15 条 cookie 与 `localStorage` 已从 `.scratch/chat-agent-tools/anon-switch-backup.json` 完整回灌（`isAnonymous=false`、agent 恢复默认关、6 张历史 trace 仍在）；匿名测试账号额度已回填。

### 3.2 环境级假象（非产品缺陷，排查时勿误判）

- **本机 Node 22 不读 `HTTP_PROXY`/`HTTPS_PROXY`**（Node 24+ 才有 `NODE_USE_ENV_PROXY`）。因此服务端侧直连境外域名（如 Agnes 产物域）会极慢甚至超时，而**浏览器**直连同域名正常（本次实测 1152×864 图正常加载）。凡「服务端抓不到、浏览器能拿到」的现象，先怀疑这条。
- **宿主注入的 `NODE_OPTIONS` 会让 `next dev` 与 vitest 行为异常**，所有命令需 `env -u NODE_OPTIONS` 前缀。

### 3.3 收尾验证（本轮 5 处代码修复之后）

- `apps/web` 全量单测：**119 文件 / 1007 测试全绿**（含本轮新增的 agent-trace 布局契约用例）。
- `packages/shared` 全量单测：**1 文件 / 12 测试全绿**。
- `tsc --noEmit`：退出码 0，无输出。
- `eslint src/components/chat src/stores/chat-store.ts src/app/api/chat`：退出码 0，无输出。
