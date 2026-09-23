# 0002. 一元请求配额生命周期管道收口（withQuotaUnary）

* **状态**：已接受
* **日期**：2026-09-23
* **决策者**：AI 聚合平台工程团队
* **范围**：全局所有一元非流式 AI API 路由（如视频提示词优化、简历润色、简历诊断、语音翻译等）

---

## 背景

在 AI 聚合平台的后端架构中，除流式响应（SSE / ReadableStream）外，大量路由属于一元（Unary）请求模式——客户端发送单个 JSON 请求，服务端调用上游模型完成推理后，一次性返回 JSON 响应。

在此前各个一元路由的实现中，配额生命周期的管理由各业务路由自行手写样板代码，流程形如：
```ts
let session: QuotaSession | null = null;
try {
  session = await QuotaSession.reserve(...);
  const result = await callModel(...);
  await session.settle(...);
  if (!session.hasReservation) {
    await safeRecordAiUsage(...); // 管理员免扣费时补录审计日志
  }
  return NextResponse.json(result);
} catch (error) {
  if (session) {
    await session.release(...);
  }
  // 错误映射与返回
}
```

在日常迭代与跨模块审查中，这种分散手写模式暴露出多个系统性隐患：
1. **配额泄漏风险**：部分路由在 `!response.ok` 或遇到非 200 HTTP 响应时直接 `return new Response(...)` 提前退出，未进入 `catch` 块导致未能调用 `session.release()`，造成预留额度悬挂与泄漏；
2. **管理员审计逻辑冗余且易漏**：管理员用户无需预扣额度（`hasReservation: false`），但需要记录真实 Token 审计入库。部分路由自行手写 `safeRecordAiUsage`，字段组装各异，另有部分路由直接遗漏，导致管理审计数据缺失；
3. **终态认知混乱**：一元请求天然只有“成功交付”与“未成功失败”两态，不存在流式交互中的中间截断态（`partial`）。但在分散手写的代码中，部分路由试图在失败时根据是否有局部缓存文本进行分支判断，模糊了终态语义；
4. **代码重复率高**：每个一元路由均需重复 30-50 行的样板代码，且易在异常拦截顺序、超时处理、错误响应格式上产生不一致。

---

## 决策

引入统一的一元配额托管高阶管道 `withQuotaUnary(options)`（置于 `apps/web/src/lib/billing/with-quota-unary.ts`），将一元场景下的配额生命周期完全标准化收口。

核心架构与执行语义锁定如下：

1. **两态终态模型（严格 success 与 failed）**：
   一元请求不存在中间截断交付的业务场景。业务回调 `run(session)` 正常执行完毕返回，管道强制以 `success` 终态结算；若 `run` 内部抛出任何异常，管道一律以 `failed` 终态释放配额，彻底杜绝半成功（`partial`）逻辑侵入一元管道。
2. **预留与结算生命周期全托管**：
   - 管道负责执行 `QuotaSession.reserve`，获得 `session` 实例并注入 `run(session)`；
   - 业务逻辑只需聚焦上游模型调用，并在返回值中解构提供 `{ value, usage?, outputText? }`；
   - 管道负责将终态结果提交给 `session.finalize`，自动触发真实 Token 消耗结算或全额释放；
   - 若 `run` 抛出异常，管道在重新抛出原错误前，优先执行 `session.finalize('failed', { reason })` 释放额度。
3. **管理员（无预留）审计全自动收口**：
   底层 `QuotaSession.prototype.finalize` 已内置管理员无预留路径的 `safeRecordAiUsage` 真实 Token 审计入库逻辑。`withQuotaUnary` 直接复用该机制，业务层无需再关心 `hasReservation` 或手写 `safeRecordAiUsage`。
4. **输出文本缺省为空（显式优先）**：
   当计费度量为 `tokens` 且上游返回缺少原始 `usage` 时，系统依赖 `outputText` 进行 Token 估算。`run` 应显式返回 `outputText`；若未提供，管道按空字符串处理（`outputText ?? ''`），此时估算退化为仅按输入预留兜底。管道不对业务返回值 `value` 做隐式序列化猜测——输出物料由业务方显式声明，与 ADR-0001 的显式终态声明哲学同源。
5. **安全与异常重抛设计**：
   - 管道内部所有 `finalize` 调用均被独立 `try/catch` 守护，即便结算上报数据库异常，仅打印错误日志，绝不吞没业务层的原始错误；
   - `run` 抛出的原始错误在完成 `failed` 释放后会被原样 `rethrow`，外层路由可保持既有的错误映射逻辑（如 402、408 超时、429 限流、规则引擎 fallback 等）。

---

## 备选方案及否决理由

1. **方案 A：各路由手写标准 try/finally 模板**：
   - *思路*：不封装统一管道，仅制定代码规范，要求各路由严格在 `try/finally` 中处理 `session`。
   - *否决理由*：无法形成工程上的硬性约束。随着人员变动与业务迭代，手动书写依然会不断重现漏调 release、漏记账、分支遗漏等问题，排查与维护成本居高不下。
2. **方案 B：Express/Koa 风格洋葱式中间件**：
   - *思路*：将配额预留与结算拆分为路由级中间件前置/后置钩子。
   - *否决理由*：Next.js App Router 采用函数式 `Route Handlers` 架构，缺乏原生的路由级请求中间件管道；且中间件模式在 TypeScript 下类型推导极其晦涩，模型调用的输出入参无法在上下文中实现严格的类型绑定。
3. **方案 C：高阶函数 withQuotaUnary（当前采纳）**：
   - *思路*：提供泛型高阶函数 `withQuotaUnary<T>`，接收配置参数与 `run` 回调。
   - *选型理由*：
     - **TypeScript 类型推导原生友好**：`run` 的返回值类型 `T` 自动推导为 `withQuotaUnary` 的返回类型，调用方类型安全且无需断言；
     - **与 Next.js App Router 完美契合**：可直接在 `POST` handler 内部随时调用，不受任何生命周期黑盒限制；
     - **作用域清晰、边界分明**：`reserve`、`run`、`finalize` 三阶段职责单一，便于单元测试隔离打桩。

---

## 后果

### 正面收益

1. **彻底消除一元路由额度泄漏**：所有未捕获异常、HTTP 错误退出、超时中断均由管道统一拦截并释放预留，杜绝死锁与额度悬挂；
2. **业务代码大幅瘦身**：每个一元路由精简 30 行以上计费样板代码，删除手工 `settle`、`release` 与重复的管理员审计调用；
3. **保持既有路由响应兼容性**：管道透明重抛原始异常，各路由可无缝保留自身的业务降级策略（如 `resume/diagnose` 回退到规则引擎）与错误状态码映射；
4. **架构整洁与统一**：至此平台内流式路由统一遵循 ADR-0001 的 `createQuotaStream`，一元路由统一遵循 ADR-0002 的 `withQuotaUnary`，全平台配额生命周期完全标准化。

### 潜在代价与应对

- **开发约束**：业务方在 `run` 中需明确返回 `value` 与上游 `usage`（若有）；
- **应对措施**：管道提供强类型定义提示，并对缺失 `outputText` 实现了安全自动兜底，编写单元测试覆盖成功与失败路径即可轻松验证。
