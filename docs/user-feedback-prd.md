# AI 聚合平台 — 用户反馈功能需求文档（PRD）

> 文档版本：v2.0（已上线） | 更新日期：2026-05-29 | 作者：产品经理
>
> 关联项目：AI-Aggregation Monorepo（Next.js 15 + Prisma + shadcn/ui）

---

## 1. 文档概述

### 1.1 目的

本文档描述 AI 聚合平台**用户反馈系统**的已实现功能，涵盖反馈提交、列表浏览、投票互动、回复沟通、管理员处理等完整链路。反馈数据通过统一页面聚合展示，支持公开/私密模式，形成"收集 → 展示 → 互动 → 处理 → 闭环"的完整反馈生态。

### 1.2 适用范围

- **Web 端**：`apps/web`（Next.js 15 / React 19）
- **移动端**：响应式移动端（移动优先设计）
- **数据库**：PostgreSQL（Prisma ORM）
- **权限体系**：复用现有 `role = 'admin'` 管理员权限

### 1.3 术语定义

| 术语 | 说明 |
|------|------|
| 反馈（Feedback） | 用户提交的意见，包含类型、标题、内容、状态、优先级等信息 |
| 反馈类型 | 缺陷（BUG）、功能（FEATURE）、界面（UI）、性能（PERFORMANCE）、其他（OTHER） |
| 反馈状态 | 待处理 → 审核中 → 已规划 → 进行中 → 已完成 / 已拒绝 |
| 反馈优先级 | 低（LOW）、中（MEDIUM）、高（HIGH）、紧急（CRITICAL） |
| 公开/私密 | 公开反馈所有登录用户可见，私密反馈仅作者和管理员可见 |
| 投票 | 用户对他人公开的反馈进行赞同投票 |
| 回复 | 用户追评或管理员公开回复 |
| 置顶 | 管理员可将重要反馈置顶展示 |

---

## 2. 项目背景与目标

### 2.1 现状分析

当前系统已具备完整的用户认证、数据库、UI组件库、API模式等基础设施。用户反馈系统在此基础上新增，填补了平台与用户之间直接沟通渠道的空白。

**已复用的系统能力**：

| 能力 | 复用位置 | 说明 |
|------|----------|------|
| 用户认证 | `lib/auth/require-auth.ts` | JWT Bearer Token 校验 |
| 管理员权限 | `lib/auth/require-admin.ts` | `role === 'admin'` 校验 |
| 数据库 | `packages/db/prisma/schema.prisma` | PostgreSQL + Prisma |
| UI 组件 | `components/ui/` | shadcn/ui Button/Dialog/Input 等 |
| 页面框架 | `components/layout/app-layout.tsx` | AppLayout + AuthGuard |
| 导航系统 | `components/layout/apps-modal.tsx` | APP_CONFIGS 统一注册 |
| API 模式 | `lib/api/responses.ts` | ApiError / createSuccessResponse |
| 设计系统 | `docs/DESIGN.md` | 玻璃拟态 + 靛蓝主题 + 暗色模式 |

### 2.2 建设目标

1. **低门槛反馈**：用户可在反馈页面快速提交，表单简洁、支持类型选择和标签
2. **公开透明**：支持公开/私密模式，公开反馈可被其他用户查看和投票，形成社区共治氛围
3. **互动闭环**：用户之间可投票赞同，用户与管理员可通过回复沟通，状态变更清晰可见
4. **管理便捷**：管理员在同一页面即可查看、回复、变更状态、设置优先级和置顶，无需跳转管理后台

### 2.3 非目标（本期未实现，后续规划）

- 文件/截图上传（模型已预留，上传接口待接入对象存储）
- AI 自动分类与优先级建议
- 邮件/站内信通知
- 反馈统计看板
- 全局悬浮快捷反馈按钮
- 国际化（本期仅支持中文）

---

## 3. 用户场景

### 3.1 场景一：用户提交反馈

**角色**：已登录用户  
**前置条件**：用户在平台任意页面  
**操作流程**：

1. 用户通过侧边栏或移动端「更多」抽屉进入「用户反馈」页面
2. 点击右上角「提交反馈」按钮，打开提交弹窗
3. 选择反馈类型（缺陷 / 功能 / 界面 / 性能 / 其他）
4. 填写标题（2-200字）和详细描述（10-5000字）
5. 选择是否公开（默认公开，私密仅自己和管理员可见）
6. 可选：添加标签（最多5个）
7. 提交反馈
8. 弹窗关闭，列表自动刷新，Toast 提示提交成功

**预期结果**：反馈提交成功，出现在公开列表或「我的反馈」中。

### 3.2 场景二：用户浏览与投票

**角色**：已登录用户  
**操作流程**：

1. 用户进入反馈页面，看到所有公开反馈的卡片列表
2. 可使用搜索框搜索标题或内容关键词
3. 可按类型、状态筛选，或按最新/最早/最多投票/优先级排序
4. 点击「我的反馈」只查看自己提交的反馈
5. 对认同的他人反馈点击投票按钮，实时看到票数变化
6. 点击反馈卡片打开详情弹窗，查看完整内容和回复

### 3.3 场景三：用户查看反馈详情与追评

**角色**：已登录用户  
**操作流程**：

1. 在列表中点击某条反馈卡片
2. 弹窗展示：标题、类型、状态、优先级、完整内容、投票数、回复列表
3. 如有管理员回复，可看到管理员身份标识
4. 在底部输入框填写追评内容，点击发送
5. 回复实时出现在回复列表中

### 3.4 场景四：管理员处理反馈

**角色**：管理员（`role = 'admin'`）  
**操作流程**：

1. 管理员进入反馈页面，与普通用户看到相同的列表
2. 点击任意反馈进入详情弹窗
3. 在详情弹窗底部看到管理操作区：
   - 变更状态（待处理 / 审核中 / 已规划 / 进行中 / 已完成 / 已拒绝）
   - 设置优先级（低 / 中 / 高 / 紧急）
   - 置顶/取消置顶
   - 标记解决时间
4. 填写公开回复，用户可在详情中看到
5. 提交后列表卡片状态标签实时更新

---

## 4. 功能需求

### 4.1 反馈提交（已实现）

**功能入口**：
- 全局侧边栏「用户反馈」导航项（通过 APP_CONFIGS 注册，支持固定到侧边栏）
- 移动端「更多」抽屉中自动出现「用户反馈」入口
- 反馈列表页面右上角「提交反馈」按钮

**表单字段**：

| 字段 | 类型 | 必填 | 限制 | 说明 |
|------|------|------|------|------|
| 反馈类型 | 分段控制器 | 是 | 单选 | 缺陷 / 功能 / 界面 / 性能 / 其他 |
| 标题 | 文本输入 | 是 | 2-200 字 | 一句话描述问题或建议 |
| 详细描述 | 文本域 | 是 | 10-5000 字 | 支持换行，详细说明场景和期望 |
| 公开/私密 | 开关 | 是 | 布尔 | 默认公开；私密仅作者和管理员可见 |
| 标签 | 文本数组 | 否 | 最多 5 个 | 自定义标签，用于分类检索 |

**提交验证**：
- 标题长度 2-200 字
- 描述长度 10-5000 字
- 类型必须从枚举中选择
- 同一用户无需防刷限制（依赖登录认证）

**提交后行为**：
- 弹窗关闭，列表自动刷新
- 新提交的反馈出现在列表顶部（按最新排序）或「我的反馈」中

### 4.2 反馈列表与浏览（已实现）

**列表功能**：
- 展示所有公开反馈 + 用户自己的私密反馈，按时间倒序（默认）
- 每条反馈卡片显示：
  - 标题（最多显示 2 行，超出省略）
  - 类型标签（颜色区分：缺陷=红、功能=蓝、界面=紫、性能=橙、其他=灰）
  - 状态标签（待处理=黄、审核中=橙、已规划=蓝、进行中=靛蓝、已完成=绿、已拒绝=灰）
  - 优先级标识（高/紧急显示警示色）
  - 投票数（显示赞同数）
  - 回复数
  - 提交时间（相对时间）
  - 提交者头像和用户名
  - 置顶标识（置顶反馈优先展示）
- 支持分页加载（每页 10 条）
- 空状态："暂无反馈，来提交第一条吧！"

**筛选与排序**：
- 搜索：关键词匹配标题和内容（不区分大小写）
- 类型筛选：全部 / 缺陷 / 功能 / 界面 / 性能 / 其他
- 状态筛选：全部 / 待处理 / 审核中 / 已规划 / 进行中 / 已完成 / 已拒绝
- 排序：最新 / 最早 / 最多投票 / 优先级
- 我的反馈：仅展示当前用户提交的反馈（包括私密）

**投票功能**：
- 登录用户可对他人公开反馈投票
- 不能为自己的反馈投票
- 点击投票按钮切换投票/取消投票状态
- 实时显示当前总票数
- 私密反馈不可投票

### 4.3 反馈详情与回复（已实现）

**详情弹窗**：
- 完整展示反馈内容、类型、状态、优先级、标签
- 展示提交者信息（头像、用户名、昵称）
- 展示投票数和投票状态
- 展示回复列表（按时间顺序）
- 登录用户可在底部输入框追评（2-3000字）

**回复规则**：
- 所有登录用户均可回复公开反馈
- 私密反馈仅作者可回复
- 管理员回复标注「管理员」身份
- 回复不支持修改和删除（后续可扩展）

### 4.4 管理员操作（已实现）

**管理入口**：
- 管理员进入与普通用户相同的 `/feedback` 页面
- 在反馈详情弹窗底部显示「管理操作」区域（仅管理员可见）

**管理功能**：
- **状态变更**：下拉选择新状态，实时更新
- **优先级设置**：低 / 中 / 高 / 紧急
- **置顶/取消置顶**：置顶反馈在列表中优先展示
- **标记解决时间**：记录实际解决时间
- **公开回复**：与普通回复共用输入框，管理员身份自动标注

**权限控制**：
- API 层通过 `requireAdmin()` 中间件保护管理操作
- 页面层无独立管理后台，管理功能嵌入详情弹窗
- 普通用户看不到管理操作区，调用管理 API 会返回 403

---

## 5. 数据库设计

### 5.1 Prisma 模型

位于 `packages/db/prisma/schema.prisma`：

```prisma
// ==================== 反馈类型枚举 ====================
enum FeedbackType {
  BUG         // 缺陷
  FEATURE     // 功能建议
  UI          // 界面体验
  PERFORMANCE // 性能问题
  OTHER       // 其他
}

// ==================== 反馈状态枚举 ====================
enum FeedbackStatus {
  PENDING      // 待处理
  UNDER_REVIEW // 审核中
  PLANNED      // 已规划
  IN_PROGRESS  // 进行中
  COMPLETED    // 已完成
  DECLINED     // 已拒绝
}

// ==================== 反馈优先级枚举 ====================
enum FeedbackPriority {
  LOW      // 低
  MEDIUM   // 中
  HIGH     // 高
  CRITICAL // 紧急
}

// ==================== 反馈主表 ====================
model Feedback {
  id          String           @id @default(cuid())
  userId      String
  type        FeedbackType
  status      FeedbackStatus   @default(PENDING)
  priority    FeedbackPriority @default(MEDIUM)
  title       String
  content     String           @db.Text
  isPublic    Boolean          @default(true)
  isPinned    Boolean          @default(false)
  tags        String[]         @default([])
  voteCount   Int              @default(0)
  replyCount  Int              @default(0)
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
  resolvedAt  DateTime?

  user        User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  replies     FeedbackReply[]
  votes       FeedbackVote[]
  attachments FeedbackAttachment[]

  @@index([userId])
  @@index([status])
  @@index([priority])
  @@index([type])
  @@index([isPinned])
  @@index([createdAt])
  @@map("feedbacks")
}

// ==================== 反馈回复 ====================
model FeedbackReply {
  id         String   @id @default(cuid())
  feedbackId String
  userId     String
  content    String   @db.Text
  isInternal Boolean  @default(false)  // true=仅管理员可见（预留字段，本期前端未使用）
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  feedback Feedback @relation(fields: [feedbackId], references: [id], onDelete: Cascade)
  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([feedbackId])
  @@index([userId])
  @@index([createdAt])
  @@map("feedback_replies")
}

// ==================== 反馈投票 ====================
model FeedbackVote {
  id         String   @id @default(cuid())
  feedbackId String
  userId     String
  createdAt  DateTime @default(now())

  feedback Feedback @relation(fields: [feedbackId], references: [id], onDelete: Cascade)
  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([feedbackId, userId])  // 同一用户对同一反馈只能投票一次
  @@index([feedbackId])
  @@index([userId])
  @@map("feedback_votes")
}

// ==================== 反馈附件（预留）====================
model FeedbackAttachment {
  id         String   @id @default(cuid())
  feedbackId String
  fileName   String
  fileSize   Int
  fileType   String
  fileUrl    String
  createdAt  DateTime @default(now())

  feedback Feedback @relation(fields: [feedbackId], references: [id], onDelete: Cascade)

  @@index([feedbackId])
  @@map("feedback_attachments")
}

// ==================== 反馈标签（预留）====================
model FeedbackTag {
  id          String   @id @default(cuid())
  name        String   @unique
  color       String   @default("#5D7CFA")
  description String?
  createdAt   DateTime @default(now())

  @@map("feedback_tags")
}
```

### 5.2 User 模型关联

```prisma
model User {
  // ... 现有字段 ...

  // 新增关联
  feedbacks       Feedback[]      // 用户提交的反馈
  feedbackReplies FeedbackReply[] // 用户的回复
  feedbackVotes   FeedbackVote[]  // 用户的投票
}
```

### 5.3 索引设计说明

| 索引 | 字段 | 用途 |
|------|------|------|
| `userId` | Feedback.userId | 查询用户的反馈列表 |
| `status` | Feedback.status | 按状态筛选 |
| `priority` | Feedback.priority | 按优先级排序 |
| `type` | Feedback.type | 按类型筛选 |
| `isPinned` | Feedback.isPinned | 置顶排序优先 |
| `createdAt` | Feedback.createdAt | 时间排序 |
| `feedbackId + userId` | FeedbackVote | 唯一约束，防止重复投票 |

---

## 6. API 设计

### 6.1 路由规划

所有 API 位于 `apps/web/src/app/api/feedback/` 下，遵循现有模式（Next.js Route Handlers + Zod 校验 + `requireAuth`）。

| 方法 | 路由 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/feedback` | 获取反馈列表（支持筛选/排序/分页） | 无需登录可查看公开，mine=true 需登录 |
| POST | `/api/feedback` | 创建新反馈 | 登录用户 |
| GET | `/api/feedback/[id]` | 获取单个反馈详情 | 公开反馈无需登录，私密需作者/管理员 |
| PATCH | `/api/feedback/[id]` | 管理员更新状态/优先级/置顶 | 管理员 |
| POST | `/api/feedback/[id]/reply` | 添加回复 | 登录用户 |
| POST | `/api/feedback/[id]/vote` | 投票 | 登录用户 |
| DELETE | `/api/feedback/[id]/vote` | 取消投票 | 登录用户 |

### 6.2 接口详细设计

#### 6.2.1 获取反馈列表

```
GET /api/feedback?type=BUG&status=PENDING&priority=HIGH&search=关键词&sortBy=newest&page=1&limit=10&mine=false
```

**查询参数**：
- `type`: BUG | FEATURE | UI | PERFORMANCE | OTHER（可选）
- `status`: PENDING | UNDER_REVIEW | PLANNED | IN_PROGRESS | COMPLETED | DECLINED（可选）
- `priority`: LOW | MEDIUM | HIGH | CRITICAL（可选）
- `search`: 搜索关键词，匹配标题和内容（可选）
- `sortBy`: newest（默认）| oldest | votes | priority
- `page`: 页码，默认 1
- `limit`: 每页条数，默认 10，最大 50
- `mine`: true 时仅返回当前用户提交的反馈（需登录）

**响应**：
```json
{
  "success": true,
  "data": {
    "items": [{
      "id": "clx...",
      "type": "BUG",
      "status": "PENDING",
      "priority": "HIGH",
      "title": "...",
      "content": "...",
      "isPublic": true,
      "isPinned": false,
      "tags": ["对话", "DeepSeek"],
      "voteCount": 5,
      "replyCount": 2,
      "createdAt": "2026-05-29T14:30:00Z",
      "updatedAt": "2026-05-29T14:30:00Z",
      "user": { "id": "...", "username": "...", "name": "...", "avatar": "..." }
    }],
    "total": 42,
    "page": 1,
    "limit": 10,
    "totalPages": 5
  }
}
```

#### 6.2.2 创建反馈

```
POST /api/feedback
```

**请求体**：
```json
{
  "type": "BUG",
  "title": "对话页面发送消息后无响应",
  "content": "在对话页面使用 DeepSeek 模型时...",
  "isPublic": true,
  "tags": ["对话", "DeepSeek"]
}
```

**校验规则**：
- type: 必填，必须是 FeedbackType 枚举值
- title: 必填，2-200 字
- content: 必填，10-5000 字
- isPublic: 必填，布尔值
- tags: 可选，字符串数组，最多 5 个

#### 6.2.3 获取反馈详情

```
GET /api/feedback/[id]
```

**响应**：返回完整反馈信息，包括回复列表、投票状态、附件列表。

**权限**：公开反馈无需登录；私密反馈仅作者和管理员可查看。

#### 6.2.4 管理员更新反馈

```
PATCH /api/feedback/[id]
```

**请求体**：
```json
{
  "status": "IN_PROGRESS",
  "priority": "HIGH",
  "isPinned": true,
  "resolvedAt": "2026-05-29T18:00:00Z"
}
```

**权限**：仅管理员（`requireAdmin`）

#### 6.2.5 添加回复

```
POST /api/feedback/[id]/reply
```

**请求体**：
```json
{
  "content": "感谢反馈，我们已经定位到问题...",
  "isInternal": false
}
```

**校验规则**：
- content: 必填，2-3000 字
- isInternal: 可选，默认 false；设为 true 时仅管理员可调用

**权限**：公开反馈所有登录用户可回复；私密反馈仅作者可回复。

#### 6.2.6 投票 / 取消投票

```
POST   /api/feedback/[id]/vote   // 投票
DELETE /api/feedback/[id]/vote   // 取消投票
```

**权限**：登录用户，不能为自己的反馈投票，不能为私密反馈投票。

**响应**：
```json
{
  "success": true,
  "data": { "voteCount": 6, "hasVoted": true },
  "message": "投票成功"
}
```

### 6.3 Zod Schema 定义

位于 `apps/web/src/app/api/feedback/route.ts` 及子路由中：

```typescript
// 查询参数校验
const querySchema = z.object({
  type: z.enum(['BUG', 'FEATURE', 'UI', 'PERFORMANCE', 'OTHER']).optional(),
  status: z.enum(['PENDING', 'UNDER_REVIEW', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'DECLINED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  search: z.string().optional(),
  sortBy: z.enum(['newest', 'oldest', 'votes', 'priority']).default('newest'),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(10),
  mine: z.coerce.boolean().default(false),
});

// 创建反馈请求校验
const createFeedbackSchema = z.object({
  type: z.enum(['BUG', 'FEATURE', 'UI', 'PERFORMANCE', 'OTHER']),
  title: z.string().min(2).max(200),
  content: z.string().min(10).max(5000),
  isPublic: z.boolean().default(true),
  tags: z.array(z.string()).max(5).default([]),
});

// 更新反馈校验（管理员）
const updateSchema = z.object({
  status: z.enum(['PENDING', 'UNDER_REVIEW', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'DECLINED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  isPinned: z.boolean().optional(),
  resolvedAt: z.string().datetime().optional().nullable(),
});

// 回复校验
const replySchema = z.object({
  content: z.string().min(2).max(3000),
  isInternal: z.boolean().default(false),
});
```

---

## 7. 页面设计

### 7.1 页面路由与结构

采用**单页应用式**设计，所有功能集中在 `/feedback` 一个路由，通过弹窗承载表单和详情。

| 路由 | 页面 | 说明 |
|------|------|------|
| `/feedback` | 反馈主页面 | 列表 + 筛选 + 搜索 + 分页 |
| 弹窗 | 提交表单 | FeedbackForm 组件，Dialog 实现 |
| 弹窗 | 反馈详情 | FeedbackDetail 组件，Dialog 实现 |

**组件目录**：

```
apps/web/src/app/feedback/
├── page.tsx                           # 主页面（列表 + 筛选 + 弹窗控制）
└── _components/
    ├── feedback-list.tsx              # 反馈卡片列表 + 分页 + 空状态
    ├── feedback-form.tsx              # 提交表单弹窗（类型选择 + 标题/内容 + 公开开关 + 标签）
    └── feedback-detail.tsx            # 详情弹窗（内容 + 投票 + 回复列表 + 回复输入 + 管理操作）
```

### 7.2 关键页面设计

#### 7.2.1 反馈主页面（`/feedback`）

**布局**：全宽布局，内容区最大宽度 `max-w-5xl mx-auto`

**顶部玻璃拟态栏**（`sticky top-0 z-30`）：
- 左侧：页面标题「用户反馈」+ 副标题说明
- 右侧：「提交反馈」主按钮（渐变背景 + 阴影）
- 搜索框：全宽输入框，支持标题和内容搜索，带搜索图标
- 筛选区：
  - 「筛选」按钮：展开/收起类型筛选（分段控制器样式）
  - 排序下拉：最新 / 最早 / 最多投票 / 优先级
- 状态栏：全部状态胶囊按钮（全部 / 待处理 / 审核中 / 已规划 / 进行中 / 已完成 / 已拒绝）
- 「我的反馈」切换按钮（登录后显示，位于状态栏右侧）

**内容区**：
- 反馈卡片网格/列表（响应式：移动端单列，桌面端可扩展）
- 每条卡片：玻璃拟态背景 + 边框 + 圆角（`rounded-2xl`）
- 卡片内容：类型标签（颜色）+ 状态标签（深色胶囊）+ 标题 + 内容摘要 + 投票数 + 回复数 + 用户信息 + 时间
- 置顶反馈带有置顶图标，排序优先
- 分页：加载更多或页码切换

**空状态**：
- 图标 + "暂无反馈，来提交第一条吧！" + 提交按钮

#### 7.2.2 提交表单弹窗

**触发**：点击「提交反馈」按钮
**样式**：居中弹窗（桌面），底部滑出（移动端 `rounded-t-3xl`）
**字段布局**：
- 类型选择器：5 个选项的分段控制器（网格排列 `grid-cols-3 sm:grid-cols-5`）
- 标题输入框：placeholder「一句话描述你的反馈」
- 内容文本域：placeholder「请详细描述问题或建议...」，支持实时字数统计
- 公开/私密切换：开关组件，默认公开
- 标签输入：可添加/删除标签（预留，本期前端使用简单文本）
- 底部：「取消」+「提交反馈」按钮

**移动端适配**：
- 弹窗从底部滑出，圆角 `rounded-t-3xl sm:rounded-3xl`
- 表单控件热区 ≥44px
- 提交按钮固定在底部安全区上方

#### 7.2.3 详情弹窗

**触发**：点击反馈卡片
**内容**：
- 头部：类型标签 + 状态标签 + 优先级标识 + 置顶标识
- 用户信息：头像 + 用户名 + 提交时间
- 标题和内容：完整展示
- 投票区：投票按钮 + 票数 + 当前投票状态
- 回复列表：按时间顺序，包含用户头像、用户名、内容、时间；管理员回复带「管理员」Badge
- 回复输入框：底部固定，placeholder「写下你的回复...」
- **管理操作区**（仅管理员可见，底部展开面板）：
  - 状态下拉选择
  - 优先级下拉选择
  - 置顶开关
  - 解决时间选择
  - 更新按钮

**权限控制**：
- 私密反馈：非作者/管理员点击时 API 返回 403，前端不展示入口
- 管理操作区：通过 `isAdmin` 条件渲染

---

## 8. 导航与入口设计

### 8.1 APP_CONFIGS 配置

在 `apps-modal.tsx` 中注册：

```typescript
{
  id: 'feedback',
  label: '用户反馈',
  description: '提交问题反馈和功能建议',
  icon: MessageSquare,
  category: 'core',
  href: '/feedback',
  iconColor: 'text-amber-500',
  iconBg: 'bg-amber-500/10',
  sidebarPinEnabled: true,  // 支持固定到侧边栏
}
```

### 8.2 全局侧边栏

- 「用户反馈」自动出现在侧边栏应用列表中
- 用户可将其固定到侧边栏（`sidebarPinEnabled: true`）
- 未读回复红点（后续可扩展）

### 8.3 移动端导航

- `MobileAppDrawer`（「更多」抽屉）自动从 `APP_CONFIGS` 过滤出非主应用，`feedback` 自动出现
- `MobileBottomNav` 保持现有 5 项（首页、对话、图像、语音、更多），反馈通过「更多」进入

---

## 9. 权限设计

### 9.1 权限矩阵

| 操作 | 普通用户 | 管理员 | 未登录 |
|------|:---:|:---:|:---:|
| 查看公开反馈列表 | ✅ | ✅ | ✅ |
| 查看公开反馈详情 | ✅ | ✅ | ✅ |
| 提交反馈 | ✅ | ✅ | ❌ |
| 查看自己的私密反馈 | ✅ | ✅ | ❌ |
| 查看他人的私密反馈 | ❌ | ✅ | ❌ |
| 回复公开反馈 | ✅ | ✅ | ❌ |
| 回复私密反馈 | ✅（仅自己） | ✅ | ❌ |
| 投票 | ✅ | ✅ | ❌ |
| 变更反馈状态 | ❌ | ✅ | ❌ |
| 设置优先级 | ❌ | ✅ | ❌ |
| 置顶反馈 | ❌ | ✅ | ❌ |
| 标记解决时间 | ❌ | ✅ | ❌ |

### 9.2 实现方式

- **页面级**：`AuthGuard` 包裹 `/feedback` 页面，未登录用户重定向到登录
- **API 级**：`requireAuth()` 校验登录态；`requireAdmin()` 校验 `role === 'admin'`
- **数据级**：列表查询默认 `isPublic = true`；`mine=true` 时校验 userId；详情查询校验私密权限

---

## 10. 技术方案

### 10.1 技术栈（全部复用现有）

| 层 | 技术 | 说明 |
|----|------|------|
| 前端框架 | Next.js 15 / React 19 | 复用 |
| 语言 | TypeScript 5.6+ | 复用 |
| 样式 | Tailwind CSS + shadcn/ui | 复用，玻璃拟态风格 |
| 状态管理 | React useState/useCallback | 页面级状态，无需全局 Store |
| 数据校验 | Zod | 内联在各 API 路由中 |
| ORM | Prisma | 新增 5 模型 + 3 枚举 |
| 数据库 | PostgreSQL | 新增 feedbacks 等表 |
| 认证 | `requireAuth` / `requireAdmin` | 复用 |

### 10.2 已新建的文件

| 文件 | 说明 |
|------|------|
| `packages/db/prisma/schema.prisma` | **修改**：新增 Feedback 等 5 模型 + 3 枚举 + User 关联 |
| `apps/web/src/app/feedback/page.tsx` | 主页面（列表 + 筛选 + 弹窗控制） |
| `apps/web/src/app/feedback/_components/feedback-list.tsx` | 反馈卡片列表组件 |
| `apps/web/src/app/feedback/_components/feedback-form.tsx` | 提交表单弹窗 |
| `apps/web/src/app/feedback/_components/feedback-detail.tsx` | 详情弹窗（含管理操作） |
| `apps/web/src/app/api/feedback/route.ts` | GET 列表 + POST 创建 |
| `apps/web/src/app/api/feedback/[id]/route.ts` | GET 详情 + PATCH 管理员更新 |
| `apps/web/src/app/api/feedback/[id]/reply/route.ts` | POST 回复 |
| `apps/web/src/app/api/feedback/[id]/vote/route.ts` | POST 投票 + DELETE 取消投票 |
| `apps/web/src/lib/auth/require-admin.ts` | 管理员权限中间件（新建或复用） |
| `components/layout/apps-modal.tsx` | **修改**：新增 feedback 配置项 |

### 10.3 复用的现有模式

- `'use client'` 客户端组件模式
- `AppLayout` 页面包裹模式
- `AuthGuard` 权限包裹
- `requireAuth()` / `requireAdmin()` API 中间件
- `ApiError` / `createSuccessResponse` 响应模式
- shadcn/ui 组件（`Button`, `Input`, `Textarea`, `Dialog`, `Badge` 等）
- 玻璃拟态 CSS：`bg-white/80 backdrop-blur-xl border border-white/60`
- 主按钮渐变：`bg-gradient-to-r from-[#4969E9] to-[#7B8FFF]`
- 暗色模式：`dark:` 前缀
- 移动端安全区：`pb-safe` 等
- `@/` 路径别名导入

---

## 11. 移动端适配要点

| 场景 | 处理方式 |
|------|----------|
| 页面布局 | 单列全宽，`px-4 sm:px-6` 响应式边距 |
| 顶部栏 | `sticky top-0`，玻璃拟态 `backdrop-blur-2xl` |
| 搜索框 | 全宽，热区 ≥44px |
| 筛选按钮 | `min-h-[44px]`，触摸友好 |
| 类型选择器 | `grid-cols-3`（移动端），`sm:grid-cols-5`（桌面端） |
| 状态筛选 | 横向滚动或换行排列 |
| 反馈卡片 | 单列，圆角 `rounded-2xl`，阴影 `shadow-sm` |
| 弹窗 | 移动端从底部滑出 `rounded-t-3xl sm:rounded-3xl` |
| 提交按钮 | 固定在底部安全区上方 |
| 回复输入框 | 固定在弹窗底部 |
| 空状态 | 垂直居中，图标 + 文案 + 按钮 |
| 文案 | 全部中文，按钮文案简短（「提交反馈」而非「提交您的宝贵反馈」） |

---

## 12. 风险与注意事项

### 12.1 已实现的风险控制

| 风险 | 缓解措施 |
|------|----------|
| 恶意投票 | 同一用户重复投票通过数据库唯一约束 `@@unique([feedbackId, userId])` 防止 |
| 刷反馈 | 依赖登录认证，未做频率限制（后续可扩展 1 分钟限流） |
| 私密反馈泄露 | API 层严格校验 `isPublic` 字段，非作者/管理员返回 403 |
| 管理员权限绕过 | `requireAdmin` 中间件在 PATCH 和内部回复时强制校验 |
| 移动端布局异常 | 移动优先设计，所有控件热区 ≥44px，弹窗从底部滑出 |

### 12.2 注意事项

1. **所有用户界面文本使用中文**，代码注释使用中文
2. **移动端优先**：每个交互元素的点击区域不小于 44×44px
3. **暗色模式兼容**：所有新增组件使用 `dark:` 前缀
4. **安全区适配**：底部按钮和输入框兼容 iPhone 安全区
5. **类型安全**：全程 TypeScript，不出现 `as any` 或 `@ts-ignore`
6. **最小改动原则**：修改现有文件时只改必要部分

---

## 13. 验收标准

### 13.1 已实现的验收项

- [x] 登录用户可在 `/feedback` 页面提交反馈，包含类型、标题、内容、公开/私密设置
- [x] 提交后可查看反馈列表，支持搜索、类型筛选、状态筛选、排序
- [x] 反馈列表空状态展示引导内容
- [x] 点击反馈卡片打开详情弹窗，展示完整内容、投票、回复
- [x] 登录用户可对他人公开反馈投票/取消投票
- [x] 登录用户可追评自己的反馈或公开反馈
- [x] 管理员可在详情弹窗中变更状态、设置优先级、置顶
- [x] 管理员回复标注「管理员」身份
- [x] 私密反馈仅作者和管理员可见
- [x] 反馈入口出现在侧边栏和移动端「更多」抽屉中
- [x] 移动端（375px 宽度）所有页面体验正常
- [x] 暗色模式下所有页面颜色正常
- [x] TypeScript 类型检查通过，无 error
- [x] ESLint 检查通过

### 13.2 后续扩展项（待实现）

- [ ] 文件/截图上传（模型已预留 `FeedbackAttachment`）
- [ ] AI 自动分类与优先级建议
- [ ] 反馈提交后管理员通知（站内信/邮件）
- [ ] 反馈统计看板（总数、各状态数量、类型占比、趋势图）
- [ ] 全局悬浮快捷反馈按钮
- [ ] 批量操作（批量变更状态）
- [ ] 反馈标签的预设管理和颜色配置（当前为自由文本）
- [ ] 内部回复功能（`isInternal` 字段已预留，前端未使用）

---

## 附录 A：参考页面与文件

| 参考 | 文件路径 | 参考点 |
|------|------|------|
| 反馈主页面 | `app/feedback/page.tsx` | 列表页布局、筛选、弹窗控制 |
| 反馈列表组件 | `app/feedback/_components/feedback-list.tsx` | 卡片样式、分页、空状态 |
| 反馈表单组件 | `app/feedback/_components/feedback-form.tsx` | 表单结构、类型选择器、验证 |
| 反馈详情组件 | `app/feedback/_components/feedback-detail.tsx` | 详情展示、投票、回复、管理操作 |
| 反馈 API | `app/api/feedback/route.ts` | 列表查询 + 创建 |
| 反馈详情 API | `app/api/feedback/[id]/route.ts` | 详情查询 + 管理员更新 |
| 投票 API | `app/api/feedback/[id]/vote/route.ts` | 投票/取消投票逻辑 |
| 回复 API | `app/api/feedback/[id]/reply/route.ts` | 回复创建逻辑 |
| Prisma Schema | `packages/db/prisma/schema.prisma` | Feedback 等模型定义 |
| 导航配置 | `components/layout/apps-modal.tsx` | APP_CONFIGS 注册模式 |
| 设计规范 | `docs/DESIGN.md` | 玻璃拟态、色彩、排版 |

## 附录 B：关键设计决策记录

| 决策 | 选项 | 选择 | 理由 |
|------|------|------|------|
| 页面结构 | 多页面 / 单页弹窗 | 单页弹窗 | 减少路由数量，交互更连贯，移动端体验更好 |
| 管理后台 | 独立后台 / 嵌入弹窗 | 嵌入弹窗 | 复用现有页面，降低开发和维护成本 |
| 反馈类型 | 3 种 / 5 种 | 5 种（BUG/FEATURE/UI/PERFORMANCE/OTHER） | 覆盖更多场景，UI 和性能独立分类便于追踪 |
| 状态流转 | 4 状态 / 6 状态 | 6 状态 | 增加审核中和已规划，更精细地表达处理阶段 |
| 投票 vs 点赞 | 投票 / 点赞 | 投票 | 更适合功能建议的民主表达，数据更有参考价值 |
| 公开/私密 | 仅公开 / 可选 | 可选 | 保护用户隐私，敏感问题可私密提交 |
| 附件上传 | 本期实现 / 预留 | 预留 | 模型已建好，等对象存储接入后快速上线 |
| 标签系统 | 预设标签 / 自由文本 | 自由文本（本期） | 快速上线，后续可扩展为预设标签 + 颜色 |
| 移动端入口 | 底部导航 / 更多抽屉 | 更多抽屉 | 底部导航已有 5 项，不急于替换 |

---

> **文档状态**：已上线（v2.0）  
> **最后更新**：2026-05-29  
> **下一步**：根据用户实际使用反馈，优先实现附件上传和通知功能
