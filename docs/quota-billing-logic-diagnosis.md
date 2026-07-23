# 额度计费逻辑诊断报告

- 日期：2026-07-14
- 范围：匿名 / 真实用户额度扣减、个人中心展示口径、多模型对比并发
- 性质：诊断分析（本报告不改任何代码）
- 触发问题：
  1. 匿名用户 `UID_CMRK8N` 初始额度应为 3000，个人中心却显示"已消耗 9413 / 共 9831"。
  2. 多模型智能对话中，doubao 提示"免费额度已用完"，但讯飞 max 能正常回答。

---

## 一句话结论

当前"额度"其实是**两套互不相干的账**被前端拼在了一起：一套是**额度点数**（`users.tokens`，用于扣费/限流），另一套是**实际 token 消耗**（`AIUsageRecord`，纯统计流水）。两个现象都由此产生——**不是超支，而是口径混淆 + 多模型并发竞争**。

---

## 一、两套账分别是什么

| | 额度点数 `users.tokens` | 实际消耗 `AIUsageRecord.totalTokens` |
|---|---|---|
| 作用 | 扣费 / 限流的余额 | 模型真实用量的统计流水 |
| 初始值 | 匿名 3000 / 注册 20000 / admin 无限 | 0，只增不减 |
| 扣减方式 | 每次调用按**固定成本**扣（对话 500、转写 50…），**与实际 token 无关** | 每次成功后记录模型真实返回的 input + output token |
| 关键代码 | `packages/db/src/quota.ts` `checkAndDeductTokens`；`packages/db/src/token-deduction.ts` `deductTokens` | `packages/db/src/ai-usage.ts:116` `recordAiUsage` → `:160` `getProfileUsageSummary` 累加 |

核心：**扣 500 额度点 ≠ 用了 500 token**。匿名对话一次预扣 500 点，但模型实际可能吐 2000 token，两条线从不相等。

常量定义见 `apps/web/src/lib/constants/quota.ts`：
- `ANONYMOUS_FREE_TOKENS = 3000`
- `ANONYMOUS_OPERATION_COSTS`：`CHAT_RESERVE: 500`、`DESTINY_COPILOT: 100`、`DESTINY_QIMEN_ANALYZE: 500`、`IMAGE_GENERATE: 100`、`RESUME_DIAGNOSE: 100`、`RESUME_POLISH: 100`、`VOICE_TRANSCRIBE: 50`

---

## 二、现象①：为什么 3000 额度却"消耗 9413"

前端个人中心 `apps/web/src/app/profile/_components/profile-shell.tsx:505-510` 的计算：

```
剩余额度 = users.tokens            → 418   （额度点余额）
已消耗   = AIUsageRecord 累加       → 9413  （真实 token，统计口径）
共 X     = 剩余 + 已消耗            → 418 + 9413 = 9831  ← 把两套账硬加在一起
```

`getProfileUsageSummary`（`packages/db/src/ai-usage.ts:228,272`）把所有 `status='success'` 记录的 `totalTokens` 直接累加返回。

结论：

- **9413 是真实 token 用量**，不是额度点消耗。实际只消耗了 `3000 - 418 = 2582` 个额度点。
- **多模型对比会放大 9413**：一次提问选 N 个模型 = 产生 N 条 `AIUsageRecord`，每条记该模型真实 token。
- **"共 9831" 是无意义数**：把"还剩多少额度点"和"已用多少真实 token"相加，属展示 bug，是"超支/很乱"观感的直接来源。
- **用户并未超支**：额度点还剩 418，属正常扣减。

---

## 三、现象②：为什么 doubao 失败、讯飞 max 正常

多模型对比中，**每个模型 = 一个独立的 `/api/chat` SSE 请求**。匿名用户在 `apps/web/src/app/api/chat/route.ts:206` 每个请求都要原子预扣 500：

```ts
checkAndDeductTokens(userId, ANONYMOUS_OPERATION_COSTS.CHAT_RESERVE /* 500 */)
// updateMany where tokens >= 500，原子操作
```

这是**并发抢锁**：N 个模型同时发请求、各自抢着扣 500，余额只够一部分时——

> 例：发起时剩 900 → 讯飞 max 先到，扣 500 → 剩 400；doubao 再到，`400 < 500` → 失败，返回 402「免费额度已用完」。

**哪个模型失败取决于请求到达先后，是随机的**，与模型本身、与讯飞/豆包各自额度无关。换一批模型，挂的可能是别人。

---

## 四、各功能扣减成本一览（"不统一"的全部证据）

| 功能 | 匿名成本 | 真实用户成本 | 扣减原语 | 是否按实际结算 |
|---|---|---|---|---|
| 对话 chat | **500** | **实际 token 数** | 匿名预扣 / 真实后扣 | 匿名❌ 真实✅ |
| 语音转写 | 50 | 1 | `deductAiQuotaForRoute` | ❌ |
| 语音翻译 | 1 | 1（不分类型） | `deductTokens` | ❌ |
| 图像生成 | 100 | 1 | `deductAiQuotaForRoute` | ❌ |
| 图像 agnes | — | 1 | `deductTokens` | ❌ |
| 简历诊断 / 润色 | 100 | 1 | `deductAiQuotaForRoute` | ❌ |
| 命理 copilot / 奇门 | 100 / 500 | 1 | `deductAiQuotaForRoute` | ❌ |

`deductAiQuotaForRoute`（`apps/web/src/lib/api/quota-helpers.ts:30-51`）：匿名走 `checkAndDeductTokens(anonymousCost)`，真实用户走 `deductTokens(realUserCost = 1)`。

不统一的点：

1. **匿名 vs 真实用户成本天差地别**：真实用户几乎所有功能只扣 **1 点**（近乎免费），匿名却 50~500；对话最极端（匿名 500 / 真实按实际）。
2. **扣减原语混用**：匿名用 `checkAndDeductTokens`（原子、带余额守卫、不透支）；真实用户与翻译/agnes 用 `deductTokens`（**无守卫、可透支成负数**）。
3. **结算口径不一**：仅真实用户对话按实际 token 结算；匿名对话固定 500 不结算（用 200 token 也扣 500）。
4. **两套账混着展示**：见现象①。

---

## 五、根因小结

历史上先做了**真实 token 统计**（`AIUsageRecord`，用于个人中心展示用量），后做了**匿名免费额度**（`users.tokens` + 固定成本扣减，用于限制匿名滥用）。两套系统独立演进、从未对齐口径；前端做"额度环"时又把两者拼在一起，于是产生"共 9831""消耗 9413 > 3000"的自相矛盾展示，以及多模型并发下的随机失败。

---

## 六、后续可选修复方向（本报告不实施，供决策）

> 额度/计费属**风险链路**，任何改动须先出方案、经确认后再实施，不直接改。

1. **修前端展示口径**（改动小、风险低）：个人中心"已消耗/共 X"改为只展示额度点（`users.tokens`）的已用/剩余/总量；真实 token 用量作为独立"统计"另列，消除 9413 > 3000 的误导。
2. **修多模型并发竞争**（M/L 改动）：匿名对话从"每模型预扣 500"改为"按实际 token 结算"或"发起前一次性预检总额度"，消除 doubao/讯飞随机失败。涉及 `chat` 路由与对比前端。
3. **统一扣减成本表**（范围较大）：重新审视匿名/真实用户各功能成本与扣减原语（统一原子扣减、明确结算口径），产出一致的计费规则表，需逐项确认。

---

## 附：关键文件索引

- `packages/db/src/quota.ts` — `checkAndDeductTokens`（匿名原子扣减，带 gte 守卫）
- `packages/db/src/token-deduction.ts` — `deductTokens`（无守卫，可透支）/ `refundTokens`
- `packages/db/src/ai-usage.ts` — `recordAiUsage` / `normalizeUsage` / `getProfileUsageSummary`
- `apps/web/src/lib/constants/quota.ts` — `ANONYMOUS_FREE_TOKENS`、`ANONYMOUS_OPERATION_COSTS`
- `apps/web/src/lib/api/quota-helpers.ts` — `deductAiQuotaForRoute` / `maybeRefund`
- `apps/web/src/app/api/chat/route.ts:90-98,203-232` — 对话预检与匿名预扣
- `apps/web/src/app/profile/_components/profile-shell.tsx:505-510` — 个人中心额度环计算
