# Worker 服务故障排查指南

## 问题：Worker is already running

### 问题描述

在开发模式下使用 `tsx watch` 时，文件变化会触发热重载，导致以下错误：

```
Error: Worker is already running.
```

### 根本原因

1. BullMQ Worker 实例在模块顶层创建（`export const sttWorker = new Worker(...)`）
2. `tsx watch` 检测到文件变化时重新加载模块
3. 旧的 Worker 实例还在运行，新的模块加载创建了新实例
4. 调用 `worker.run()` 时，BullMQ 检测到同名 Worker 已在运行

### 解决方案

#### 方案 1：启动前检查并关闭（已实施）

在 `apps/worker/src/index.ts` 中：

- 使用 `worker.isRunning()` 检查 Worker 状态
- 如果已运行，先调用 `worker.close()` 关闭
- 等待 100ms 确保完全关闭
- 然后重新启动

优点：

- 支持开发模式热重载
- 不影响生产环境
- 代码改动最小

缺点：

- 每次重载都会中断正在处理的任务

#### 方案 2：禁用开发模式 Worker（可选）

如果你的简历编辑器不需要 Worker 服务（AI 功能在 API 路由中处理），可以在开发模式下禁用：

在 `package.json` 中修改：

```json
{
  "scripts": {
    "dev": "NODE_ENV=development DISABLE_WORKER=true turbo dev"
  }
}
```

在 `apps/worker/src/index.ts` 中添加：

```typescript
async function main() {
  if (process.env.DISABLE_WORKER === 'true') {
    logger.info('Worker 服务已禁用（开发模式）');
    return;
  }
  // ... 其余代码
}
```

#### 方案 3：使用单例模式（复杂）

重构 Worker 创建逻辑，使用单例模式确保只有一个实例：

```typescript
// workers/stt.ts
let instance: Worker<STTJobData> | null = null;

export function getSttWorker() {
  if (!instance) {
    instance = new Worker<STTJobData>(
      'stt',
      async (job) => {
        // ... 处理逻辑
      },
      {
        connection: {
          /* ... */
        },
      }
    );
  }
  return instance;
}
```

优点：

- 完全避免重复实例
- 更符合设计模式

缺点：

- 需要重构所有 Worker 文件
- 代码改动较大

### 当前状态

- ✅ 已实施方案 1（启动前检查并关闭）
- ✅ 添加了 SIGINT 信号处理（Ctrl+C 优雅关闭）
- ✅ 改进了错误日志

### 验证方法

1. 启动开发服务器：`pnpm dev`
2. 修改 `apps/worker/src/index.ts` 触发热重载
3. 检查日志，应该看到：
   ```
   检测到已运行的 Workers，先关闭它们...
   所有 Workers 已启动
   ```
4. 不应该再看到 "Worker is already running" 错误

### 注意事项

- Worker 服务主要用于异步任务（STT、PPT、图像生成）
- 简历编辑器的 AI 功能（润色、诊断）直接在 Next.js API 路由中处理
- 如果不需要异步任务功能，可以使用方案 2 禁用 Worker

### 相关文件

- `apps/worker/src/index.ts` - Worker 服务入口
- `apps/worker/src/workers/stt.ts` - 语音转文字 Worker
- `apps/worker/src/workers/ppt.ts` - PPT 生成 Worker
- `apps/worker/src/workers/image.ts` - 图像生成 Worker
