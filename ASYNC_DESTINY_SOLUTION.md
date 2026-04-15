# 命理分析异步任务解决方案

## 🔍 问题分析

### 当前情况

- **豆包 API 响应时间**：约 2 分钟（120 秒）
- **Vercel 免费版限制**：10 秒
- **Vercel Pro 限制**：60 秒
- **结论**：即使升级到 Pro 版也无法满足需求

### 受影响的接口

1. 八字分析 (`/api/destiny/report`)
2. 紫微斗数 (`/api/destiny/ziwei-report`)
3. 奇门遁甲 (`/api/destiny/qimen/analyze`)

---

## ✅ 推荐方案：异步任务队列

### 架构设计

```
用户提交请求
    ↓
创建任务 (立即返回 taskId)
    ↓
后台 Worker 处理 (BullMQ + Redis)
    ↓
前端轮询任务状态
    ↓
任务完成，返回结果
```

### 技术栈

- **队列**：BullMQ (已在项目中配置)
- **存储**：Redis (Upstash，已配置)
- **Worker**：Vercel Serverless Functions 或独立 Worker

---

## 🚀 实施步骤

### 方案 A：使用 Vercel Cron Jobs（推荐）

#### 优点

- ✅ 免费
- ✅ 无需额外服务器
- ✅ 与现有架构集成

#### 缺点

- ⚠️ Cron 最短间隔 1 分钟
- ⚠️ 不适合实时性要求高的场景

#### 实施步骤

**1. 修改 API 路由为任务创建接口**

```typescript
// apps/web/src/app/api/destiny/report/route.ts
export async function POST(req: Request) {
  const body = await req.json();

  // 创建任务
  const taskId = generateTaskId();
  await redis.set(
    `task:${taskId}`,
    JSON.stringify({
      status: 'pending',
      input: body,
      createdAt: Date.now(),
    }),
    'EX',
    3600
  ); // 1 小时过期

  // 立即返回任务 ID
  return NextResponse.json({
    taskId,
    status: 'pending',
    message: '任务已创建，请稍后查询结果',
  });
}
```

**2. 创建任务状态查询接口**

```typescript
// apps/web/src/app/api/destiny/task/[taskId]/route.ts
export async function GET(req: Request, { params }: { params: { taskId: string } }) {
  const task = await redis.get(`task:${params.taskId}`);

  if (!task) {
    return NextResponse.json({ error: '任务不存在' }, { status: 404 });
  }

  return NextResponse.json(JSON.parse(task));
}
```

**3. 创建 Worker 处理接口**

```typescript
// apps/web/src/app/api/cron/process-destiny-tasks/route.ts
export async function GET(req: Request) {
  // 验证 Cron Secret
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 获取待处理任务
  const keys = await redis.keys('task:*');
  const pendingTasks = [];

  for (const key of keys) {
    const task = await redis.get(key);
    const parsed = JSON.parse(task);
    if (parsed.status === 'pending') {
      pendingTasks.push({ key, ...parsed });
    }
  }

  // 处理任务（限制并发数）
  const results = await Promise.allSettled(
    pendingTasks.slice(0, 5).map((task) => processTask(task))
  );

  return NextResponse.json({
    processed: results.length,
    success: results.filter((r) => r.status === 'fulfilled').length,
  });
}
```

**4. 配置 Vercel Cron**

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/process-destiny-tasks",
      "schedule": "* * * * *"
    }
  ]
}
```

**5. 前端轮询实现**

```typescript
// 前端代码
async function submitDestinyReport(data) {
  // 1. 创建任务
  const { taskId } = await fetch('/api/destiny/report', {
    method: 'POST',
    body: JSON.stringify(data),
  }).then((r) => r.json());

  // 2. 轮询任务状态
  return new Promise((resolve, reject) => {
    const interval = setInterval(async () => {
      const task = await fetch(`/api/destiny/task/${taskId}`).then((r) => r.json());

      if (task.status === 'completed') {
        clearInterval(interval);
        resolve(task.result);
      } else if (task.status === 'failed') {
        clearInterval(interval);
        reject(new Error(task.error));
      }
    }, 5000); // 每 5 秒轮询一次

    // 超时保护
    setTimeout(() => {
      clearInterval(interval);
      reject(new Error('任务超时'));
    }, 180000); // 3 分钟超时
  });
}
```

---

### 方案 B：使用独立 Worker 服务（最佳性能）

#### 优点

- ✅ 实时处理
- ✅ 更好的性能
- ✅ 更灵活的控制

#### 缺点

- ❌ 需要额外服务器（Railway / Render / Fly.io）
- ❌ 增加运维复杂度

#### 实施步骤

**1. 使用现有的 Worker 项目**

项目中已有 `apps/worker` 目录，可以直接扩展：

```typescript
// apps/worker/src/queues/destiny.queue.ts
import { Queue, Worker } from 'bullmq';
import { redis } from '@repo/queue';

const destinyQueue = new Queue('destiny-reports', { connection: redis });

const destinyWorker = new Worker(
  'destiny-reports',
  async (job) => {
    const { type, input } = job.data;

    // 调用豆包 API（无超时限制）
    const result = await callDoubaoAPI(type, input);

    // 保存结果到 Redis
    await redis.set(
      `task:${job.id}`,
      JSON.stringify({
        status: 'completed',
        result,
        completedAt: Date.now(),
      }),
      'EX',
      3600
    );

    return result;
  },
  { connection: redis }
);

export { destinyQueue, destinyWorker };
```

**2. API 路由添加任务到队列**

```typescript
// apps/web/src/app/api/destiny/report/route.ts
import { destinyQueue } from '@repo/queue';

export async function POST(req: Request) {
  const body = await req.json();

  // 添加任务到队列
  const job = await destinyQueue.add('bazi-report', {
    type: 'bazi',
    input: body,
  });

  return NextResponse.json({
    taskId: job.id,
    status: 'pending',
  });
}
```

**3. 部署 Worker 到云服务**

```bash
# 使用 Railway 部署（免费额度）
railway up

# 或使用 Render（免费额度）
render deploy
```

---

### 方案 C：使用 Vercel Edge Functions（实验性）

#### 优点

- ✅ 免费
- ✅ 无超时限制
- ✅ 全球分布式

#### 缺点

- ⚠️ Edge Runtime 限制（不支持某些 Node.js API）
- ⚠️ 需要测试兼容性

#### 实施步骤

```typescript
// apps/web/src/app/api/destiny/report/route.ts
export const runtime = 'edge';

export async function POST(req: Request) {
  // Edge Runtime 没有 10 秒限制
  const result = await callDoubaoAPI(await req.json());
  return Response.json(result);
}
```

---

## 📊 方案对比

| 方案              | 成本     | 实时性          | 复杂度 | 推荐度     |
| ----------------- | -------- | --------------- | ------ | ---------- |
| A. Vercel Cron    | 免费     | 低（1分钟延迟） | 中     | ⭐⭐⭐     |
| B. 独立 Worker    | $5-10/月 | 高（秒级）      | 高     | ⭐⭐⭐⭐⭐ |
| C. Edge Functions | 免费     | 高（秒级）      | 低     | ⭐⭐⭐⭐   |

---

## 🎯 推荐实施顺序

### 第一阶段：快速验证（Edge Functions）

1. 将三个命理 API 改为 Edge Runtime
2. 测试是否能正常工作
3. 如果成功，问题解决！

### 第二阶段：生产优化（独立 Worker）

1. 扩展现有 `apps/worker` 项目
2. 部署到 Railway / Render
3. 实现任务队列 + 轮询机制

---

## 🔧 立即实施（Edge Functions）

我可以立即帮你实施 Edge Functions 方案，只需要在三个 API 路由文件顶部添加：

```typescript
export const runtime = 'edge';
```

这样就没有 10 秒限制了。要我现在修改吗？

---

## 📚 参考文档

- [Vercel Edge Functions](https://vercel.com/docs/functions/edge-functions)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)
- [BullMQ Documentation](https://docs.bullmq.io/)
- [Railway Deployment](https://railway.app/)
