# 统一额度计费验收测试清单

## 1. 用途、范围与结果口径

- 范围：统一额度计费改造，以及匿名账户初始额度改为 10,000 的变更。
- 用途：供产品、研发和测试逐项验收真实账本、接口行为和个人中心展示；本清单不是历史验证报告的替代品。
- 填写方式：每项仅填写“通过”“失败”或“阻塞”，并记录账号、`requestId`、供应商用量证据、SQL 结果和页面截图。
- 测试数据：仅限可丢弃的测试数据库和测试账号；真实供应商调用会产生费用，执行前需确认测试密钥与成本预算。

已有自动化和代码审查证据：

- `docs/reviews/2026-07-14-unified-billing-verification.md`
- `docs/reviews/2026-07-15-unified-billing-verification.md`
- `docs/reviews/2026-07-15-unified-billing-final-code-review.md`

以上文档记录历史命令结果，未提供完整的逐项人工验收用例；本文件补足该缺口。

## 2. 不可妥协的验收规则

| 编号 | 规则 | 必须满足的条件 |
| --- | --- | --- |
| RULE-01 | 身份与扣费解耦 | `isAnonymous` 只决定开户初始额度和身份限制；预留、结算、释放、补账不得按匿名/注册身份走不同扣费公式。 |
| RULE-02 | 初始额度 | 新匿名账户为 10,000；新注册账户为 20,000；管理员无限且默认免扣。 |
| RULE-03 | 唯一余额来源 | `QuotaAccount` 是唯一余额来源；`users.tokens` 只是同步的展示快照。 |
| RULE-04 | 余额守恒 | 每个非管理员账户满足 `grantedUnits = availableUnits + reservedUnits + settledUnits`，所有数值非负。 |
| RULE-05 | 文本真实计量 | 聊天、命理、简历、语音翻译、视频提示词优化按供应商实际输入 Token + 输出 Token 结算。 |
| RULE-06 | 音频真实计量 | 上传转写按服务端解析的音频秒数向上取整；实时转写按网关实际转发音频换算的秒数向上取整。 |
| RULE-07 | 媒体任务隔离 | 图片、视频生成成功只增加各自任务次数，不改变文本/语音额度账户；`billableUnits=1` 表示任务计数，不表示文本/语音扣款。 |
| RULE-08 | 无可审计真实用量 | 预留必须进入 `billing_pending`，等待自动或受保护的人工对账；不得用字符数、本地 Token 估算或固定成本直接最终扣款。 |
| RULE-09 | 幂等与并发 | 同一用户、同一 `requestId` 只可调用供应商一次、只产生一次最终结算。 |
| RULE-10 | 管理员统计 | 管理员不扣余额，但仍记录实际 Token、音频秒数与成功媒体任务次数。 |

> RULE-08 是发布阻断项。当前 `createTokenMeasurement` 存在 `local_estimate` 分支；T-06 必须按真实数据库结果判定。如果没有供应商 usage 的文本请求被直接标记为 `settled` 并扣款，则该项失败，不能以旧单元测试通过替代。

## 3. 测试准备

### 3.1 环境和账号

1. 使用可丢弃的 PostgreSQL 测试库，启动 Web、Worker、Redis 和受控 Provider 或测试网关。
2. 准备并记录三个账号的 `userId`。

| 代号 | 创建方法 | 初始状态 |
| --- | --- | --- |
| A | 无痕窗口或清除设备标识后匿名登录 | `isAnonymous=true`，`role=user`，额度账户总额和可用额均为 10,000。 |
| R | 正常注册 | `isAnonymous=false`，`role=user`，额度账户总额和可用额均为 20,000。 |
| M | 测试管理员 | `role=admin`，个人中心显示无限额度。 |

3. 准备可控的供应商响应：正常返回 usage、无 usage、流式中止、调用前失败、图片/视频成功和失败。
4. 对需要低余额的用例，仅在测试库将测试账号调至指定可用余额；不得修改生产账号。

### 3.2 只读账本核对 SQL

将 `<USER_ID>` 和 `<REQUEST_ID>` 替换为实际值。以下查询不修改数据。

```sql
-- 身份、展示快照与余额账户。
SELECT
  u.id, u.username, u."isAnonymous", u.role, u.tokens AS user_token_snapshot,
  qa."grantedUnits", qa."availableUnits", qa."reservedUnits", qa."settledUnits"
FROM users AS u
LEFT JOIN quota_accounts AS qa ON qa."userId" = u.id
WHERE u.id = '<USER_ID>';

-- 本次请求的预留和执行状态。
SELECT
  id, "requestId", feature, "meterType", "estimatedUnits", "settledUnits",
  status, "executionState", "expiresAt", "createdAt", "updatedAt"
FROM quota_reservations
WHERE "userId" = '<USER_ID>' AND "requestId" = '<REQUEST_ID>'
ORDER BY "createdAt";

-- 本次请求的不可变流水。
SELECT
  "requestId", "eventType", units, "meterType", feature, provider, model, reason, "createdAt"
FROM quota_ledger_entries
WHERE "userId" = '<USER_ID>' AND "requestId" = '<REQUEST_ID>'
ORDER BY "createdAt";

-- 本次请求的实际用量和计费状态。
SELECT
  feature, action, provider, model, "inputTokens", "outputTokens", "totalTokens",
  "taskCount", "meterType", "billableUnits", "billingStatus", "reservationId", "createdAt"
FROM ai_usage_records
WHERE "userId" = '<USER_ID>' AND "requestId" = '<REQUEST_ID>'
ORDER BY "createdAt";

-- 余额守恒检查：返回零行才算通过。
SELECT "userId", "grantedUnits", "availableUnits", "reservedUnits", "settledUnits"
FROM quota_accounts
WHERE "grantedUnits" <> "availableUnits" + "reservedUnits" + "settledUnits"
   OR "grantedUnits" < 0 OR "availableUnits" < 0
   OR "reservedUnits" < 0 OR "settledUnits" < 0;
```

### 3.3 每项通用核验

除非用例另有说明，每项结束后都要确认：

1. `users.tokens = QuotaAccount.availableUnits`。
2. 正常结束后不存在残留 `reserved` 预留；正常预留为 `settled / completed`。
3. `ai_usage_records.billingStatus`、`billableUnits` 与预留的 `meterType` 一致。
4. 账本对同一请求只有一次 `reserve` 和一次终态事实（`settle`、`release` 或 `billing_pending`）。
5. 余额守恒 SQL 返回零行。

## 4. 开户与身份验收

| 编号 | 操作 | 预期结果 | 结果 |
| --- | --- | --- | --- |
| A-01 | 用全新设备标识匿名登录。 | `users.tokens=10000`；额度账户 `grantedUnits=availableUnits=10000`、`reservedUnits=settledUnits=0`。 | ☐ |
| A-02 | 用相同设备标识再次匿名登录。 | 返回原匿名账户；不新建账户、不重复发放 10,000。 | ☐ |
| A-03 | 注册并登录 R。 | `users.tokens=20000`；额度账户总额和可用额均为 20,000。 | ☐ |
| A-04 | M 打开个人中心并请求 `GET /api/profile/usage`。 | 显示“无限额度”；接口 `tokenRemaining` 和 `quota` 均为 `null`，不返回 500。 | ☐ |
| A-05 | A、R 发送同一可控 Provider 请求，返回相同 usage。 | 两者均按相同实际用量扣款；差异只能是初始余额，不能是身份或固定成本。 | ☐ |

## 5. 智能对话与多模型比较

| 编号 | 操作 | 预期结果 | 结果 |
| --- | --- | --- | --- |
| T-01 | A 发起单模型聊天，保存 Provider 的输入、输出 Token。 | 请求开始产生 `tokens` 预留；完成后最终结算值严格等于输入 + 输出，未使用预留释放。 | ☐ |
| T-02 | 在流式输出未结束时查询账本。 | 状态为 `reserved / processing`；可用额已减少，已结算额尚未增加；供应商仅调用一次。 | ☐ |
| T-03 | 流式输出已有内容时主动停止。 | Provider 已返回真实 usage 时按 `partial` 结算；只要真实 usage 尚不可得，必须进入 `billing_pending`，不得按文本长度估算。 | ☐ |
| T-04 | 令 Provider 在无输出前失败。 | 能确认请求未到达 Provider 时释放预留；连接中断、无法确认是否已产生供应商成本时进入 `billing_pending`，不得错误退款。 | ☐ |
| T-05 | 余额不足“输入估算 + 至少 1 个输出 Token”时发起聊天。 | 调用 Provider 前返回额度不足；没有预留、流水或供应商调用；文案不写死“匿名 3000 Token”。 | ☐ |
| T-06 | Provider 返回文本但不返回可审计 usage。 | 请求进入 `billing_pending`；不得用内容长度或本地估算直接 `settled` 并扣最终余额。 | ☐ |
| T-07 | 同一 HTTP 请求、同一 `requestId` 并发提交两次。 | 仅一个请求领取执行权；另一个返回处理中或已处理；无第二次供应商调用和终态流水。 | ☐ |
| T-08 | 选择两个模型，余额充足时发起比较。 | 两个预留原子创建；每个模型按自身真实 usage 结算，最终扣款为两者实际值之和。 | ☐ |
| T-09 | 余额无法覆盖所有模型的“输入 + 配置输出上限”时发起两模型比较。 | 整批在调用前失败；两个模型都不能出现预留、用量或供应商调用。 | ☐ |
| T-10 | 两模型成功预留后，一个失败、一个成功。 | 成功模型按实际 usage 结算；失败模型仅在明确未调用 Provider 时释放，否则进入 `billing_pending`；不整批误退或误扣。 | ☐ |
| T-11 | 对同一模型批次重放相同 `requestId`。 | 已处理模型不重新调用；预留执行状态最终为 `completed`。 | ☐ |

## 6. 其他文本 AI 入口

下表每个入口至少执行一次正常成功和一次“调用前余额不足”。成功时必须核对 `meterType=tokens`、供应商实际 usage、账本和页面余额；余额不足时必须确认 Provider 未被调用。支持流式停止的入口还需完成部分成功测试。

| 编号 | 入口与路由 | feature / action | 成功 | 余额不足 | 部分成功（适用时） |
| --- | --- | --- | --- | --- | --- |
| T-12 | 语音翻译 `/api/voice/translate` | `voice / voice-translate` | ☐ | ☐ | 不适用 |
| T-13 | 八字报告 `/api/destiny/report` | `destiny / destiny-report` | ☐ | ☐ | ☐ |
| T-14 | 紫微报告 `/api/destiny/ziwei-report` | `destiny / destiny-ziwei-report` | ☐ | ☐ | ☐ |
| T-15 | 奇门分析 `/api/destiny/qimen/analyze` | `destiny / destiny-qimen-analyze` | ☐ | ☐ | 视异步结果 |
| T-16 | 命理追问 `/api/destiny/copilot` | `destiny / destiny-copilot` | ☐ | ☐ | ☐ |
| T-17 | 简历诊断 `/api/resume/diagnose` | `resume / resume-diagnose` | ☐ | ☐ | 不适用 |
| T-18 | 简历润色 `/api/resume/polish` | `resume / resume-polish` | ☐ | ☐ | 不适用 |
| T-19 | 视频提示词优化 `/api/video/optimize-prompt` | `video_prompt / video-prompt-optimize` | ☐ | ☐ | 不适用 |

## 7. 语音转写验收

| 编号 | 操作 | 预期结果 | 结果 |
| --- | --- | --- | --- |
| V-01 | 上传服务端可识别、时长为 12.01 秒的音频并转写成功。 | 按 13 个 `audio_seconds` 结算；不使用前端上报时长、文件名或文件大小。 | ☐ |
| V-02 | 上传损坏文件，或让转写服务在开始前失败。 | 不增加已结算音频秒数；已有预留必须释放。 | ☐ |
| V-03 | 创建实时会话但不发送 PCM 音频，随后主动结束。 | 预留释放；无成功计费用量记录。 | ☐ |
| V-04 | 实时转写发送可核验为 12.01 秒的 PCM，并部分成功结束。 | 网关结算 13 个 `audio_seconds`，用量记录为 `partial`，余额守恒。 | ☐ |
| V-05 | 实时会话可用额度小于配置时长上限。 | `maxDurationSeconds=min(配置上限, 可用额度)`；达到上限后停止，余额不为负。 | ☐ |
| V-06 | 未登录调用实时会话，或缺失网关内部密钥调用开始/结算接口。 | 请求被拒绝，且额度账户无变化。 | ☐ |
| V-07 | 对同一实时 `requestId` 重复发送开始和结算回调。 | 首段音频只领取一次执行权；结算不重复写用量和流水。 | ☐ |

## 8. 图片、视频任务验收

执行前记录额度账户四个数值；每项结束后，除“视频提示词优化”的文本调用外，四个数值必须完全不变。

| 编号 | 操作 | 预期结果 | 结果 |
| --- | --- | --- | --- |
| M-01 | 图片生成成功。 | 增加 1 个 `image_task`；`billableUnits=1` 仅表示图片任务次数；文本/语音额度不变。 | ☐ |
| M-02 | 图片生成失败、取消或上游超时。 | 不增加成功图片任务次数；额度不变。 | ☐ |
| M-03 | 视频生成成功。 | 供应商轮询明确成功后才增加 1 个 `video_task`；`billableUnits=1` 仅表示视频任务次数；文本/语音额度不变。 | ☐ |
| M-04 | 视频生成失败、取消或上游超时。 | 不增加成功视频任务次数；额度不变。 | ☐ |
| M-05 | 先优化视频提示词，再生成视频。 | 仅优化提示词按实际 Token 改变额度；视频生成自身只增加视频任务次数。 | ☐ |
| M-06 | 连续成功生成两张图片、两条视频后刷新个人中心。 | 图片任务为 2、视频任务为 2，独立显示；不能混入 Token 总消耗或额度环已用。 | ☐ |

## 9. 待补账、过期与对账验收

| 编号 | 操作 | 预期结果 | 结果 |
| --- | --- | --- | --- |
| P-01 | 构造真实用量大于预留的文本或音频请求。 | 不允许余额为负或静默超扣；预留进入 `billing_pending` 并保留异常原因。 | ☐ |
| P-02 | 构造未领取执行权且已过期的预留，运行对账任务。 | 预留释放，`reservedUnits` 回退，写入释放流水。 | ☐ |
| P-03 | 构造已领取执行权但超时未完成的预留，运行对账任务。 | 不自动退款；状态转为 `billing_pending`，保留成本风险。 | ☐ |
| P-04 | 不携带或携带错误 `BILLING_RECONCILE_SECRET` 调用 `/api/internal/billing/reconcile`。 | 返回 401；额度、预留和流水均无变化。 | ☐ |
| P-05 | 用正确内部密钥对待补账预留回填真实用量和证据。 | 仅该预留完成结算；多余预留释放；重复回填不重复扣款。 | ☐ |
| P-06 | Worker 自动对账运行一次。 | 有可审计真实用量的待补账自动完成；没有真实用量的记录保持待补账且可追踪。 | ☐ |

## 10. 个人中心与接口验收

| 编号 | 操作 | 预期结果 | 结果 |
| --- | --- | --- | --- |
| U-01 | A、R、M 分别调用 `GET /api/profile/usage`。 | A/R 返回自己的 `quota`、`tokenRemaining`；M 的两项为 `null`；三者均不返回 500。 | ☐ |
| U-02 | A 完成文本请求后刷新个人中心。 | 剩余额度来自 `availableUnits`，已消耗来自 `settledUnits`，总额度来自 `grantedUnits`，三者满足余额守恒。 | ☐ |
| U-03 | A 完成语音转写后刷新个人中心。 | 额度按音频秒数变化；语音转写时长单独展示，不混入 Token 总消耗。 | ☐ |
| U-04 | A 完成图片和视频任务后刷新个人中心。 | 图片、视频次数独立展示；额度环和文本/语音已结算额度不因媒体成功而变化。 | ☐ |
| U-05 | 令文本或语音额度不足后发起操作。 | 页面显示统一中文额度不足提示；不显示“免费额度已用完”等与模型或匿名额度绑定的误导文案。 | ☐ |
| U-06 | 测试库中临时制造非管理员缺失 `QuotaAccount` 的数据，再调用使用统计接口。 | 接口明确报告额度账户缺失，不虚构余额；恢复数据后正常账户不得触发该错误。 | ☐ |

## 11. 自动化映射与已知验收缺口

| 测试文件 | 已覆盖重点 | 不能替代的人工验收 |
| --- | --- | --- |
| `apps/web/src/lib/billing/quota-service.test.ts` | 执行权领取、重复请求拒绝、实时语音待补账补结算。 | 真实数据库并发和全部业务入口。 |
| `apps/web/src/lib/billing/usage-measurement.test.ts` | Token、音频秒、媒体任务测量结构。 | RULE-08 的运行时行为；该测试包含本地估算分支，不能证明真实用量政策已满足。 |
| `apps/web/src/app/api/internal/billing/reconcile/route.test.ts` | 内部密钥、回填、过期预留处理。 | 实际 Worker 定时触发和真实账本。 |
| `apps/web/src/app/api/internal/billing/rtasr/start/route.test.ts` | 首段音频锁定预留。 | 真实网关、PCM 时长和供应商连接。 |
| `apps/web/src/app/api/internal/billing/rtasr/settle/route.test.ts` | 部分成功秒数结算、零音频释放。 | 重复网关回调和真实时长。 |
| `apps/web/src/app/api/voice/realtime/session/route.test.ts` | 会话预留和最大时长。 | 浏览器录音、网络断开和上限强制停止。 |
| `apps/web/src/app/api/video/optimize-prompt/route.test.ts` | 视频提示词优化 Token 结算。 | 视频任务成功/失败的独立次数统计。 |
| `apps/web/src/lib/api/client.test.ts` | 前端额度错误反馈。 | 个人中心真实数据和移动端交互。 |

必须关闭的验收风险：

1. 文本计量工具支持 `local_estimate`，与 RULE-08 存在直接风险；T-06 为阻断发布的用例。
2. 聊天、命理、简历、上传转写、图片和视频路由没有完整真实账本集成测试；本清单中的 T-01 至 T-19、V-01 至 V-02、M-01 至 M-06 是当前人工验收依据。
3. Provider usage、网关回调和页面展示依赖外部环境，不能仅凭 Vitest 通过就标记为完全验收。

## 12. 执行记录

| 执行日期 | 环境 | 执行人 | 通过项 / 总项 | 失败或阻塞项 | 结论 |
| --- | --- | --- | --- | --- | --- |
| 待填写 | 待填写 | 待填写 | 待填写 | 待填写 | 待填写 |

只有 RULE-01 至 RULE-10 全部满足、所有适用测试项通过，并且没有未关闭的 P0/P1 计费问题时，才能将统一额度计费标记为“完全验收”。
