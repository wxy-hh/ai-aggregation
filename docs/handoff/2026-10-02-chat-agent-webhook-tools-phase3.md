# 交接文档：/chat Agent 用户自定义 Webhook 工具 · 三期收官

> 一期二期交接见 `2026-10-01-chat-agent-tools-phase1-to-phase2.md`。
> 本文档聚焦三期（用户自定义 webhook 工具）的部署要点、验收结论、记债清单与委派教训。

## 0. 一句话现状

三期 5 个工单（CRUD+加密+护栏 / 执行器+测试连接 / agent 集成 / profile UI / chat 状态条 + 审查验收）全部完成，全量门禁三连绿（typecheck / lint / 1248 测试用例），真机验收 8 项通过、1 项受本机网络限制未验（见 §3），代码已提交**未 push**（与二期 commit `12275a1` 一样等用户决定）。

## 1. 部署备忘（上线前必读）

1. **`WEBHOOK_SECRET_KEY` 必须配置**：32 字节随机 hex（64 字符），生成：`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`。未配置或格式非法时加解密 **fail-closed**（路由直接抛错，密文不落库）。已登记进 `AGENTS.md` 环境变量节与 `apps/web/.env.example`。本地 `apps/web/.env.local` 已配置。
2. **数据库迁移**：`packages/db/prisma/migrations/20261002032334_add_webhook_tools/`（`UserWebhookTool` 单表；spec §4.1 曾列审计表，最终审计复用既有 `AIUsageRecord` 的 metadata.webhookCalls，未建新表）。
3. **密钥轮换**：轮换 = 双密钥过渡窗口（旧密钥解密、新密钥加密），`webhook-secret.ts` 内注释已写明；具体流程轮换时再定。
4. **出站安全模型**：仅 https、禁重定向、内网/云元数据黑名单（`apps/web/src/lib/agent/url-guard.ts`）；执行器响应体 200KB 读取硬上限（`WebhookPayloadTooLargeError`）。

## 2. 三期交付概览（勿重做，只给指针）

- spec：`docs/features/2026-10-02-chat-agent-webhook-tools/spec.md`（§8 为验收结果）
- 工单：`.scratch/2026-10-02-chat-agent-webhook-tools/issues/01-05`（本地工单，不进仓库）
- CRUD 路由：`apps/web/src/app/api/agent-tools/`（含 `[id]` 与 `[id]/test`）
- 加密：`apps/web/src/lib/crypto/webhook-secret.ts`；执行器：`apps/web/src/lib/webhook/`
- agent 集成：`apps/web/src/app/api/chat/_lib/agent/tools/user-webhook.ts`（快照注入 + `AGENT_MAX_WEBHOOK_CALLS=3` 专项上限）
- 共享层（分层守卫注释齐备，客户端安全）：`apps/web/src/lib/agent/`（registry/tool-policy/url-guard/tool-error/guarded-lookup）、`apps/web/src/schemas/agent-tool-constants.ts`（零依赖，`CALL_NAME_REGEX` 单一真源）
- UI：`apps/web/src/app/profile/_components/profile-tool*.tsx` + chat 状态条（`chat-input.tsx`）
- 主接缝测试：`chat-handler.agent-webhook.test.ts`（8 用例）；全量 1248 用例绿

## 3. 验收结论与唯一未验项

真机验收 8 项全过（明细见 spec §8）：匿名引导态、登记+DB 密文核对、probe 真实出站（postman-echo，HTTP 404 判可达）、chat 状态条、密文不回显、停用过滤端到端、删除二次确认+DB 清零、ark 故障下预留额度正确释放（二期回滚链路的意外真实验证）。

**唯一未验**：chat 端到端真实模型决策调用 webhook 工具。验收时本机直连 `ark.cn-beijing.volces.com` 与 `dashscope.aliyuncs.com` TLS 握手失败（curl exit 35），api.deepseek.com 等正常——本机网络路径限制。agent 提供方硬锁定 doubao（`agent-config.ts` 的 `AGENT_PROVIDER`/`AGENT_MODEL` 常量；`packages/providers` 的 `ProviderName` 仅 `xunfei | doubao`），无法不切代码换模型，为验收加 provider 属规格外改动故未做。
**复验方法**（网络可达 ark 时，1 分钟）：登记任一 echo 工具 → chat 开 agent → 发送「用回声工具测试一下」→ 过程卡片应出现 `wh_echo_test` 调用与结果。

## 4. 记债清单（两轴审查裁决「不修，记录在案」）

1. CRUD 路由样板 ×4（list/create/patch/delete 结构重复，可抽公共 wrapper，等第 3 个同类路由出现时再抽）。
2. registry 契约复刻 + 逐字段搬运（agent tools 注册表与 AI SDK ToolSet 之间的映射样板）。
3. 三期新组件 27 处十六进制色值（profile 页既有先例，`GLASS_CARD`/`DIALOG_OVERLAY` 已收口到 profile-shell.tsx 复用；色值令牌化留待 DESIGN.md 统一治理）。
4. `tryExtractHostname`（lib/webhook）与 `extractHostname`（profile-tools-utils）同名异表，语义有微差，未合并。

## 5. 委派教训（delegate-antigravity 使用纪律）

- **简报必须小**：10KB 整包简报两次 stall（240s 无进展零产出）；拆成 3-5KB 小批次后三批全成功。
- read 模式探针（41s 回答分支名）可用来快速确认委派通道存活。
- 单飞锁，顺序执行，不要并发委派。
- handoff 自述不作数：每批必须亲自 diff + 跑测试验收（三批次分别 219/96/75 用例绿）。
- 委派简报原文留存于 `.scratch/delegation-brief-05b-batch{1,2,3}.md`。

## 6. 环境坑（沿用一二期清单，本期新增）

- vitest / tsc 必须 `env -u NODE_OPTIONS` 前缀，否则 jsdom 与类型检查行为异常。
- 跑独立 tsx 脚本：`tsx` 只在 `packages/db/node_modules/.bin/`，且脚本要包 `async main()`（CJS 输出不支持顶层 await）；env 用 `set -a && source apps/web/.env.local && set +a` 注入。
- 本地基建：PG :5432 / Redis :6379（docker-compose 的 postgres 角色在本地实例不存在，说明实际 DATABASE_URL 指向非 docker 实例——查 DB 一律走 prisma/tsx 脚本，别直接 psql 猜密码）。

## 7. 四期候选方向（未立项，仅供下期盘问参考）

- 记债清单 §4 的 1/2/4（样板收敛）。
- 「按对话相关性动态挂载工具」（当 10 个上限+注入裁剪实测上下文水位仍高时；spec §7 已写原则：不提高上限，做动态挂载）。
- MCP / inbound webhook（前置安全模型本期已跑通，见 spec §6 Out of Scope 的路线图注记）。
- 输入放大系数评估（跑量约一个月后用 `AIUsageRecord` 现有字段评估，零新代码，spec §7）。
