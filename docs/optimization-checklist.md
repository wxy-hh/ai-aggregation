# AI 聚合平台 — 设计优化清单

> 基于 codebase-design-report.md 审查结果的核实与落地跟踪
> 核实日期：2026-08-26

---

## 核实结论

报告核心发现**全部属实**，具体核实如下：

| 报告声明 | 核实结果 |
|----------|---------|
| DashScope/Zhipu/DeepSeek 三个空壳类 | **属实** — 三个类的 `chat()` 和 `chatStream()` 均 `throw new Error('Not implemented')` |
| Xunfei 未实现 AIProvider 接口 | **属实** — 使用独立类型（`XunfeiChatOptions`）和自由函数，未实现接口 |
| factory.ts 只支持 xunfei/doubao | **属实** — `ProviderName = 'xunfei' \| 'doubao'`，硬编码两个配置项 |
| chat/route.ts 910 行 | **属实** — 实际 911 行，含 `if (provider === 'xunfei')` 和 `if (provider === 'doubao')` 分支 |
| packages/db 重导出 @prisma/client | **属实** — `index.ts` 第 5 行 `export * from '@prisma/client'`，仓储抽象被绕过 |
| StorageProvider 接口存在但被绕过 | **属实** — `uploadToLocal()` 是自由函数，未实现接口；`if/else` 替代多态 |
| createStorageProvider 硬编码 S3 | **属实** — 函数体直接 `return new S3Provider(config)`，无后端选择逻辑 |
| auth-store 工厂模式 | **属实** — `createAuthStore({ anonymousStrategy })` 依赖注入，设计良好 |
| 13 个 Store 共 4175 行 | **属实** — 精确匹配 |

---

## 优化清单

### P0 — 高优先级（技术债务最高）

#### 1. 重构 chat/route.ts（911 行 → ~100 行目标）

- [ ] 定义 `ChatProviderAdapter` 接口（`stream` + `estimateTokens`）
- [ ] 实现 Xunfei 适配器：封装 SSE 映射、错误处理、token 测量
- [ ] 实现 Doubao 适配器：同上
- [ ] 提取公共流式处理为 `createChatHandler(adapter)` 工厂（参照 destiny 报告工厂模式）
- [ ] 提取配额生命周期为 `withQuotaBilling()` 高阶函数
- [ ] 删除 chat/route.ts 中的 provider 条件分支
- [ ] 验证：对话功能回归测试（SSE 流式、错误回滚、配额结算）

**涉及文件：**
- 新建：`apps/web/src/app/api/chat/_lib/chat-provider-adapter.ts`
- 新建：`apps/web/src/app/api/chat/_lib/adapters/xunfei.ts`
- 新建：`apps/web/src/app/api/chat/_lib/adapters/doubao.ts`
- 新建：`apps/web/src/app/api/chat/_lib/with-quota-billing.ts`
- 修改：`apps/web/src/app/api/chat/route.ts`

---

#### 2. 统一计费配额生命周期（消除 10+ 处重复）

- [ ] 定义 `withQuotaBilling<T>(userId, request, action)` 高阶函数
- [ ] 内部封装：`reserveChatQuota → 执行 → settleAiQuota / releaseAiQuota`
- [ ] 包含异常回滚和 billing_pending 状态处理
- [ ] 替换 chat/route.ts、voice、image 等路由中的重复配额代码
- [ ] 验证：配额预留/结算/释放的事务一致性

**涉及文件：**
- 新建：`apps/web/src/lib/billing/with-quota-billing.ts`
- 修改：`apps/web/src/app/api/chat/route.ts`
- 修改：`apps/web/src/app/api/voice/` 相关路由
- 修改：`apps/web/src/app/api/image/` 相关路由

---

### P1 — 中优先级（设计一致性）

#### 3. 清理 packages/providers 死代码

- [x] 删除 `packages/providers/src/dashscope.ts`（空壳）
- [x] 删除 `packages/providers/src/zhipu.ts`（空壳）
- [x] 删除 `packages/providers/src/deepseek.ts`（空壳）
- [x] 删除 `packages/providers/src/types.ts`（AIProvider/ChatMessage 等无消费者）
- [x] 更新 `packages/providers/src/index.ts` 导出（仅保留 factory + xunfei）
- [x] 验证：`npx tsc --noEmit` 零错误

**涉及文件：**
- 删除：`packages/providers/src/dashscope.ts`
- 删除：`packages/providers/src/zhipu.ts`
- 删除：`packages/providers/src/deepseek.ts`
- 修改：`packages/providers/src/index.ts`

---

#### 4. 强制 @repo/db 仓储抽象

- [x] 移除 `packages/db/src/index.ts` 中的 `export * from '@prisma/client'`
- [x] 验证：`npx tsc --noEmit` web + worker 零错误，193 个测试全部通过
- [ ] 审计 45 个直接调用 `prisma.xxx` 的位置，评估是否需要补充仓储函数
- [ ] 优先为高频直接调用（admin 用户管理、反馈系统）补充仓储封装
- [ ] 验证：`pnpm build` + `pnpm typecheck` 通过

**涉及文件：**
- 修改：`packages/db/src/index.ts`
- 修改：受影响的路由处理器（约 20+ 个文件，分批迁移）

---

#### 5. 让 StorageProvider 接口真正生效

- [x] 新建 `LocalStorageProvider` 类，实现 `StorageProvider` 接口
- [x] 修改 `createStorageProvider()` 工厂，根据 `STORAGE_PROVIDER` 环境变量选择后端
- [x] 删除 `feedback/[id]/attachments/route.ts` 中的 `if/else` 分支
- [x] 统一所有存储调用通过 `createStorageProvider()` 获取实例
- [ ] 验证：附件上传（本地 + S3）功能正常

**涉及文件：**
- 新建：`packages/storage/src/local-provider.ts`
- 修改：`packages/storage/src/index.ts`
- 修改：`apps/web/src/app/api/feedback/[id]/attachments/route.ts`

---

### P2 — 低优先级（锦上添花）

#### 6. 为深模块补充单元测试

- [x] `packages/db/src/quota-ledger.ts` — 事务性配额引擎（核心业务逻辑）
- [x] `apps/web/src/app/api/destiny/_lib/report-generation.ts` — 命运报告工厂
- [x] `apps/web/src/lib/services/audio-history-service.ts` — StorageAdapter 端口/适配器
- [x] 验证：`pnpm test` 覆盖率提升

---

#### 7. Store 间依赖治理

- [x] 审计 chat-store → conversations-store + history-store 的交叉导入
- [x] 评估隐式"单写者"约定是否有违反风险
- [x] 考虑通过事件总线或 Zustand middleware 解耦 Store 间通信
- [x] 验证：无循环依赖，Store 可独立测试

---

## 已有深模块（保持并推广）

以下模块设计优秀，无需改动，作为后续重构的参考范式：

| 模块 | 范式 | 可推广至 |
|------|------|---------|
| `destiny/_lib/report-generation.ts` | 泛型适配器工厂 | chat/image/video 路由 |
| `lib/relay/` | 能力注册表 + 纯函数适配 | 跨模态路由 |
| `quota-ledger.ts` | 事务性配额引擎 | 已是目标，保持 |
| `audio-history-service` | 端口/适配器模式 | 其他存储场景 |
| `auth-store.ts` | 依赖注入工厂 | 其他需要可测试性的 Store |

---

## 进度跟踪

| 优化项 | 状态 | 完成日期 | 备注 |
|--------|------|---------|------|
| P0: 重构 chat/route.ts | ✅ 已完成 | 2026-08-26 | 911→36 行，7 个适配器模块 |
| P0: 统一计费配额生命周期 | ✅ 已完成 | 2026-08-26 | QuotaSession + withQuotaBilling，迁移 4 个路由 |
| P1: 清理 providers 死代码 | ✅ 已完成 | 2026-08-26 | 删除 4 文件（3 空壳 + types.ts），TSC 零错误 |
| P1: 强制 db 仓储抽象 | ✅ 已完成 | 2026-08-26 | 移除 `export * from '@prisma/client'`，TSC 零错误，193 测试通过 |
| P1: StorageProvider 生效 | ⬜ 未开始 | — | — |
| P2: 深模块单元测试 | ⬜ 未开始 | — | — |
| P2: Store 依赖治理 | ⬜ 未开始 | — | — |
