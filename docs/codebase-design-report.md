# AI 聚合平台 — 代码库设计审查报告

> 日期：2026-08-23  
> 审查框架：深模块设计（接口深度、接缝、适配器、杠杆、局部性、可测试性）

---

## 一、总览

本报告对 AI 聚合平台 monorepo 的 6 个核心模块区域进行了设计审查：

| 区域 | 深度评级 | 说明 |
|------|---------|------|
| `packages/providers` | ⚠️ 浅 | 接口存在但未被实际使用，实现分散 |
| `packages/queue` + `apps/worker` | ✅ 较深 | 接口小、契约清晰，但存在死代码 |
| `packages/db` | ⚠️ 半深 | 部分仓储模式，但抽象泄漏 |
| `packages/storage` | ⚠️ 浅 | 接口设计好但未被统一使用 |
| `apps/web` API 路由 | ⚠️ 参差 | 命运模块深，聊天路由浅 |
| `apps/web` 状态管理 | ⚠️ 宽而浅 | 模块化但缺乏行为深度 |

---

## 二、模块逐一审查

### 2.1 `packages/providers` — AI 提供方适配层

**接口：** 定义了 `AIProvider` 接口（`types.ts`）：

```typescript
interface AIProvider {
  name: string;
  chat(options: ChatCompletionOptions): Promise<ChatCompletionResponse>;
  chatStream(options: ChatCompletionOptions): AsyncIterable<string>;
}
```

**深度评估：接口存在但形同虚设**

| 适配器 | 状态 | 问题 |
|--------|------|------|
| `DashScopeProvider` | 空壳 | 两个方法均 `throw new Error('Not implemented')` |
| `ZhipuProvider` | 空壳 | 同上 |
| `DeepSeekProvider` | 空壳 | 同上 |
| `xunfei.ts` | 完整实现 | 未实现 `AIProvider`，使用独立类型和自由函数 |
| `factory.ts` | 完整实现 | 返回 Vercel AI SDK 对象，绕过 `AIProvider` 接口 |

**接缝分析：**

- **名义接缝：** `AIProvider` 接口 — 两个适配器即为真实接缝，但三个实现都是空壳，不构成真实接缝
- **实际接缝：** 不存在。消费方 `apps/web/app/api/chat/route.ts` 使用 `if (provider === 'xunfei')` 手动分支，而非多态分发

**删除测试：** 删除 `AIProvider` 接口和三个空壳类，不会影响任何运行中的代码 — 它们是死代码。

**杠杆缺失：** 工厂路径（`factory.ts`）只能处理 `'xunfei' | 'doubao'`，添加新提供方需要：(1) 在 `factory.ts` 加配置项，(2) 在 `chat/route.ts` 加分支，(3) 可能还需要写独立模块。没有单一接口可以"实现即接入"。

**建议：**

1. 删除三个空壳类（DashScope/Zhipu/DeepSeek）
2. 让所有提供方（含 Xunfei）实现统一的 `AIProvider` 接口
3. 消费方通过接口多态分发，消除 `if/else` 分支

---

### 2.2 `packages/queue` + `apps/worker` — 异步任务队列

**接口：** `@repo/queue` 导出：
- 5 个 `Queue` 实例（`sttQueue`, `pptQueue`, `imageQueue`, `qimenBaseQueue`, `qimenSectionQueue`）
- 5 个作业数据类型（`STTJobData`, `PPTJobData`, `ImageJobData`, `QimenBaseJobData`, `QimenSectionJobData`）

**深度评估：较好的深模块**

```
┌──────────────────────────────────────────┐
│  小接口：Queue 实例 + JobData 类型       │
├──────────────────────────────────────────┤
│  隐藏的实现：                             │
│  - Redis 连接配置                         │
│  - 重试策略（3次，指数退避 2s）            │
│  - 清理策略（完成 100/24h，失败 1000/7d） │
│  - 生产者/消费者解耦                      │
└──────────────────────────────────────────┘
```

**接缝质量：干净**

- **生产者（Web）：** 导入具体的 `Queue` 实例调用 `.add()`
- **消费者（Worker）：** 仅 `import type { XJobData }`，自行构建 `Worker`
- 两侧通过共享的类型契约连接，不互相耦合运行时

**问题：**

| 问题 | 影响 |
|------|------|
| `stt`, `ppt`, `image` 队列无生产者入队 | 死代码，工人端 3 个 worker 是 stub |
| `JOB_NAMES` 常量已定义但 Worker 不使用 | Worker 硬编码队列名字符串，存在不一致风险 |
| `qimen-base` 和 `qimen-section` 是多步骤协议 | 生产者预计算 → 基础 worker 校验 → 分段 worker 生成，隐式契约无验证 |

**杠杆：** 对已实现的奇门分析流程，杠杆高 — 添加新的奇门队列只需定义 `JobData` 类型 + 在 `queues.ts` 加一个 `Queue` 实例。

**局部性：** 计费/配额逻辑集中在 `qimen-section` worker 中，修改一处即可影响整个配额生命周期 — 良好的局部性。

---

### 2.3 `packages/db` — 数据库层

**接口：** 导出 `prisma` 单例 + 3 个领域仓储模块

**深度评估：部分深模块**

| 模块 | 行为量 | 接口面 | 深度 |
|------|--------|--------|------|
| `quota-ledger.ts` | 高（12 个函数，事务性配额引擎） | 中等 | ✅ 深 |
| `ai-usage.ts` | 中（记录、查询、归一化） | 小 | ✅ 较深 |
| `media-tasks.ts` | 低（幂等任务状态机） | 小 | ✅ 较深 |
| `client.ts` | 低（单例） | 极小 | — 工具性 |

**接缝分析：抽象泄漏**

`@repo/db` 的 `index.ts` 执行了：
```typescript
export * from '@prisma/client';  // 整个 Prisma 客户端重导出
```

这意味着消费方可以绕过所有仓储函数，直接 `prisma.user.findMany()`。实际上约 20 个路由处理器直接导入 `prisma` 实例，而非使用仓储函数。

**删除测试：** 如果删除 `quota-ledger.ts`，12 个配额操作函数消失，需要在 Worker 和 Web 中重写 — 通过测试。如果删除 `client.ts` 的 `prisma` 导出，20+ 个路由直接崩溃 — 也通过测试，但说明抽象没有被强制执行。

**建议：**
1. 移除 `export * from '@prisma/client'`，改为仅导出仓储函数和必要类型
2. 仓储函数内部使用 `prisma`，外部消费方只通过仓储接口访问

---

### 2.4 `packages/storage` — 对象存储

**接口：** 定义了清晰的 `StorageProvider` 接口

```typescript
interface StorageProvider {
  upload(key: string, data: Buffer, contentType?: string): Promise<string>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getUrl(key: string, expiresIn?: number): Promise<string>;
}
```

**深度评估：接口好但未被使用**

| 层面 | 评估 |
|------|------|
| 接口设计 | ✅ 好 — 4 个方法覆盖全部存储操作 |
| 实现 | ✅ `S3Provider` 覆盖 S3/OSS/MinIO/R2 |
| 实际使用 | ⚠️ 糟糕 |

**接缝分析：接口存在但被绕过**

消费方代码（`feedback/[id]/attachments/route.ts`）：
```typescript
if (process.env.STORAGE_PROVIDER === 's3') {
  await uploadToS3(file);  // 调用 StorageProvider
} else {
  await uploadToLocal(file);  // 直接 fs.writeFile，未实现 StorageProvider
}
```

`uploadToLocal` 是一个自由函数，没有实现 `StorageProvider` 接口。多态完全被 `if/else` 取代。

**工厂问题：** `createStorageProvider()` 硬编码返回 `new S3Provider(config)`，不支持根据配置选择不同后端。

**建议：** 让 `uploadToLocal` 实现 `StorageProvider` 接口，工厂根据环境变量返回对应实现。

---

### 2.5 `apps/web` API 路由层

**51 个路由处理器**，深度参差不齐。

#### 最深的模块：命运报告工厂

`app/api/destiny/_lib/report-generation.ts` — 这是整个代码库**设计最好的模块**：

```typescript
interface ReportGenerationAdapter<TStream> {
  requestSchema: ZodSchema;
  generate(input, context): Promise<TStream>;
  mapError?(error): ApiError;
}

function createReportHandler(adapter: ReportGenerationAdapter<TStream>)
```

- **小接口：** 1 个泛型接口，3 个成员
- **高杠杆：** 八字报告和紫微报告各写一个适配器对象，共享全部 HTTP/认证/错误处理逻辑
- **高局部性：** 修改请求验证、流式传输、错误映射只需改一处
- **高可测试性：** 测试适配器的 `generate` 方法即可，无需模拟 HTTP

#### 最浅（最差）的模块：聊天路由

`app/api/chat/route.ts` — **~910 行**，是代码库中耦合度最高、最难修改的文件：

| 问题 | 影响 |
|------|------|
| 内联提供方分支（xunfei/doubao/generic） | 添加新提供方必须编辑此文件 |
| 直接读取 `process.env.ARK_API_KEY` | 配置分散，无集中管理 |
| 重复配额生命周期（reserve→settle/release ×3） | 修改计费逻辑需同步改多处 |
| 混合 SSE 错误映射、流式传输、限流 | 单一职责被严重违反 |

**删除测试：** 删除 `chat/route.ts`，整个对话功能消失 — 它不是传递模块，但复杂度没有被封装，而是被铺开。

#### 中间地带：计费配额生命周期

**复制粘贴模式：** 几乎每个流式路由都手写：
```
reserveChatQuota → stream → settleAiQuota / releaseAiQuota
```

这应该是一个深模块（小接口，隐藏复杂事务逻辑），但目前是散布在 10+ 个路由中的重复代码。

---

### 2.6 `apps/web` 状态管理（Zustand Stores）

**13 个 Store，约 4,175 行**

**深度评估：宽而浅**

```
宽度（多独立 Store）：    ████████████████  13 个
深度（行为复杂度）：      ████████          5 个较深
浅层（纯状态+操作）：     ████████          8 个
```

| Store | 行数 | 深度 |
|-------|------|------|
| `audio-history-store` | 698 | ✅ 深 — 含 StorageAdapter 注入、错误恢复 |
| `comparison-store` | 585 | ✅ 较深 — AbortController 管理、RAF 节流 |
| `chat-store` | 451 | ✅ 较深 — 流式状态机 |
| `auth-store` | 227 | ✅ 接口好 — `createAuthStore({ anonymousStrategy })` 工厂模式 |
| `ui-store` | 101 | ⚠️ 浅 |

**最好的接缝：** `auth-store` 的 `createAuthStore` 工厂 — 依赖注入匿名认证策略，唯一一个设计为可测试的 Store。

**问题：** Store 间交叉导入（`chat-store` ← `conversations-store` + `history-store`），隐式的"单写者"约定没有强制执行。

---

## 三、跨模块接缝地图

| 接缝位置 | 接口 | 是否真实 | 可测试性 |
|----------|------|---------|---------|
| `@repo/providers` → `AIProvider` | 接口存在 | ❌ 空壳+绕过 | N/A |
| `@repo/queue` 生产者↔消费者 | `JobData` 类型 | ✅ 真实且干净 | 高 |
| `@repo/db` 仓储函数 | `quota-ledger` / `media-tasks` | ⚠️ 存在但泄漏 | 中 |
| `@repo/storage` → `StorageProvider` | 4 方法接口 | ⚠️ 存在但被绕过 | 中 |
| `destiny` 报告工厂 | `ReportGenerationAdapter` | ✅ 真实且深 | 高 |
| `auth-store` 工厂 | `anonymousStrategy` 注入 | ✅ 真实 | 高 |
| `lib/relay` 能力路由 | `target-registry` + `adapters` | ✅ 真实且完整 | 高 |
| `audio-history` 存储 | `StorageAdapter` | ✅ 真实 | 高 |

---

## 四、关键发现与建议

### 4.1 最高价值改进（按优先级）

**P0：重构 `chat/route.ts`（910 行）**

这是整个代码库最大的设计债务。建议参照命运报告的 `createReportHandler(adapter)` 模式：

```typescript
// 目标：每个提供方一个适配器
interface ChatProviderAdapter {
  stream(options: StreamOptions): AsyncIterable<ChatChunk>;
  estimateTokens(messages: ChatMessage[]): number;
}

// chat/route.ts 变成 ~100 行的薄壳
const handler = createChatHandler(getAdapter(provider));
```

这将实现：
- **深度：** 小接口（1 个 `stream` 方法）+ 隐藏的 SSE 映射、错误处理、重试逻辑
- **杠杆：** 添加新提供方只需写一个适配器
- **局部性：** 计费/限流/错误映射修改一处即可
- **可测试性：** 测试适配器的 `stream` 输出，无需模拟 HTTP

**P1：统一计费配额生命周期**

将 `reserve → stream → settle/release` 封装为一个深模块：

```typescript
// 目标接口
async function withQuotaBilling<T>(
  userId: string,
  request: BillingRequest,
  action: () => Promise<T>,
): Promise<T>;
```

- 隐藏：预留、结算、释放、异常回滚的完整事务逻辑
- 杠杆：10+ 个路由不再需要手写配额生命周期
- 局部性：修改计费策略改一处

**P2：清理 `packages/providers`**

删除三个空壳类，让 Xunfei 和工厂路径的提供方都实现统一接口，消费方通过接口分发。

### 4.2 已有深模块（保持并推广）

| 模块 | 特征 | 可推广的经验 |
|------|------|------------|
| `destiny/_lib/report-generation.ts` | 泛型适配器工厂 | 推广到 chat、image、video 路由 |
| `lib/relay/` | 能力注册表 + 纯函数适配 | 模型无关，易于扩展跨模态路由 |
| `quota-ledger.ts` | 事务性配额引擎 | 已是深模块，但需阻止绕过 |
| `audio-history-service` | 端口/适配器模式 | 存储可替换，错误恢复封装好 |

### 4.3 架构健康度总结

```
深模块覆盖率：约 30%（8/26 个主要模块有真正的接口深度）
接缝真实率：  约 50%（8 个名义接缝中 4 个被实际使用）
抽象执行率：  约 40%（仓储和 StorageProvider 接口存在但被绕过）
最大复杂度集中点：chat/route.ts（910 行，3 重职责）
```

**整体判断：** 代码库有良好的设计意识（定义了接口、划分了包、建立了接缝），但执行力不足 — 接口定义后没有被强制执行，消费方倾向于绕过抽象直接使用底层实现。最紧迫的工作是将聊天路由和计费生命周期从"铺开的重复代码"重构为"小接口 + 深实现"的模块。
