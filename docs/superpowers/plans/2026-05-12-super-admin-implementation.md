# 超管账号与用户管理 实施计划

> **For agentic workers:** 使用 `subagent-driven-development`（推荐）或 `executing-plans` 技能按任务逐步实施。步骤使用 checkbox (`- [ ]`) 语法追踪。

**目标：** 添加超管账号 `xkfy`，实现基于角色的用户管理功能（创建/删除/停用/Token 管理）。

**架构：** 数据库 User 表新增 `role`、`status`、`tokens` 字段。中间件 + API 双重校验角色。管理 API 在 `/api/admin/users` 下，前端 UI 保留现有玻璃态设计，替换假数据为真实 API。

**技术栈：** Prisma (PostgreSQL)、Next.js Route Handlers、JWT、Zustand、Zod、bcryptjs

---

## 文件结构

```
packages/db/
├── prisma/schema.prisma              # 修改：User 表加 role/status/tokens
└── prisma/migrations/                # 新增：迁移文件
├── src/seed.ts                       # 修改：创建超管 xkfy

apps/web/src/
├── middleware.ts                      # 修改：/admin/* 路由角色校验
├── lib/auth/
│   ├── jwt.ts                        # 修改：AccessToken 增加 role 字段
│   ├── require-auth.ts               # 不变（已有）
│   └── require-admin.ts              # 新增：requireAdmin()
├── lib/api/
│   ├── responses.ts                   # 不变（复用）
│   ├── middleware.ts                  # 修改：导出类型供 admin 使用
│   └── admin-api.ts                   # 新增：管理 API 客户端封装
├── schemas/
│   └── auth.schema.ts                # 修改：新增 admin 相关 schema
├── stores/
│   └── auth-store.ts                 # 修改：User 接口加 role
├── hooks/
│   └── use-auth.ts                   # 修改：导出 isAdmin
├── app/
│   ├── api/auth/
│   │   ├── login/route.ts            # 修改：检查 status
│   │   └── me/route.ts               # 修改：返回 role
│   └── api/admin/users/
│       ├── route.ts                  # 新增：GET（列表）+ POST（创建）
│       └── [id]/route.ts            # 新增：PATCH（更新）+ DELETE（删除）
└── app/admin/users/
    ├── _components/
    │   ├── user-management-shell.tsx  # 修改：替换假数据为 API
    │   ├── edit-user-dialog.tsx       # 修改：连接真实 API
    │   └── create-user-dialog.tsx     # 新增：创建用户弹窗
    └── page.test.tsx                  # 修改：适配新数据流
```

---

### 任务 1：数据库 Schema 变更

**文件：**

- 修改: `packages/db/prisma/schema.prisma`
- 新增: 迁移文件（Prisma 自动生成）

- [ ] **步骤 1：修改 Prisma Schema**

在 `packages/db/prisma/schema.prisma` 的 User 模型中，找到 `passwordHash` 字段后，添加 3 个新字段：

```prisma
model User {
  // ... 现有字段保留 ...

  passwordHash  String?

  // 新增：超管与用户管理字段
  role          String   @default("user")   // "user" | "admin"
  status        String   @default("active") // "active" | "disabled"
  tokens        Int      @default(20000)    // AI 调用配额

  emailVerified DateTime?
  avatar        String?
  // ... 后续字段保留 ...
}
```

- [ ] **步骤 2：生成并执行迁移**

```bash
cd /Users/weixiaoyu/Desktop/practice/AI-aggregation && pnpm db:generate
```

```bash
cd /Users/weixiaoyu/Desktop/practice/AI-aggregation && pnpm db:migrate
```

如果迁移需要命名，使用 `add_user_role_status_tokens`。

- [ ] **步骤 3：生成 Prisma Client**

```bash
cd /Users/weixiaoyu/Desktop/practice/AI-aggregation && pnpm db:generate
```

- [ ] **步骤 4：提交**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/
git commit -m "feat: User 表增加 role/status/tokens 字段"
```

---

### 任务 2：Seed 脚本 - 创建超管账号

**文件：**

- 修改: `packages/db/src/seed.ts`
- 依赖: `apps/web/src/lib/auth/password.ts`（`hashPassword`）

> 注意：seed 脚本运行在 Node.js 环境，需直接使用 bcryptjs，不通过 web 的 lib。

- [ ] **步骤 1：修改 seed.ts**

完整替换 `packages/db/src/seed.ts`：

```typescript
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('开始数据库种子数据...');

  // 创建超管账号
  const superAdminPasswordHash = await bcrypt.hash('woaini2244', 12);

  const superAdmin = await prisma.user.upsert({
    where: { username: 'xkfy' },
    update: {},
    create: {
      username: 'xkfy',
      passwordHash: superAdminPasswordHash,
      name: '超级管理员',
      role: 'admin',
      status: 'active',
      tokens: 999999,
    },
  });

  console.log('超管账号已就绪:', superAdmin.username, '(role:', superAdmin.role, ')');

  // 创建测试用户（如已存在则跳过）
  await prisma.user.upsert({
    where: { username: 'test_user' },
    update: {},
    create: {
      username: 'test_user',
      name: '测试用户',
      role: 'user',
      status: 'active',
      tokens: 20000,
    },
  });

  console.log('种子数据完成!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **步骤 2：检查 bcryptjs 是否为 db 包的依赖**

```bash
cd /Users/weixiaoyu/Desktop/practice/AI-aggregation && cat packages/db/package.json | grep bcryptjs
```

如果不存在，安装：

```bash
cd /Users/weixiaoyu/Desktop/practice/AI-aggregation && pnpm --filter @repo/db add bcryptjs && pnpm --filter @repo/db add -D @types/bcryptjs
```

- [ ] **步骤 3：运行 seed 验证**

```bash
cd /Users/weixiaoyu/Desktop/practice/AI-aggregation && pnpm db:seed
```

预期输出：
```
开始数据库种子数据...
超管账号已就绪: xkfy (role: admin)
种子数据完成!
```

- [ ] **步骤 4：提交**

```bash
git add packages/db/src/seed.ts packages/db/package.json
git commit -m "feat: seed 脚本增加超管账号 xkfy"
```

---

### 任务 3：JWT 增加 role 字段 & 新增 requireAdmin

**文件：**

- 修改: `apps/web/src/lib/auth/jwt.ts`
- 新增: `apps/web/src/lib/auth/require-admin.ts`

- [ ] **步骤 1：修改 JWT 签发和验证，加入 role**

在 `apps/web/src/lib/auth/jwt.ts` 中修改 AccessToken 相关代码：

```typescript
// 将 AccessTokenPayload 改为：
interface AccessTokenPayload {
  userId: string;
  role: string;
}

// 将 signAccessToken 改为：
export function signAccessToken(userId: string, role: string): string {
  return jwt.sign({ userId, role } satisfies AccessTokenPayload, getAuthSecret(), {
    expiresIn: ACCESS_TOKEN_EXPIRES,
  });
}

// 将 verifyAccessToken 返回类型改为：
export function verifyAccessToken(token: string): { userId: string; role: string } {
  const payload = jwt.verify(token, getAuthSecret()) as unknown as AccessTokenPayload;
  return { userId: payload.userId, role: payload.role };
}
```

- [ ] **步骤 2：新增 require-admin.ts**

创建 `apps/web/src/lib/auth/require-admin.ts`：

```typescript
import { verifyAccessToken } from './jwt';

/**
 * 从请求头验证 JWT 并检查 admin 角色。
 * 非 admin 用户抛出错误，由调用方返回 403。
 */
export async function requireAdmin(req: Request): Promise<string> {
  const authHeader = req.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('缺少认证令牌');
  }

  const token = authHeader.slice(7);
  const { userId, role } = verifyAccessToken(token);

  if (role !== 'admin') {
    throw new Error('无权访问：需要管理员权限');
  }

  return userId;
}
```

- [ ] **步骤 3：修改 login route 中 signAccessToken 调用**

在 `apps/web/src/app/api/auth/login/route.ts` 中，找到 `signAccessToken(user.id)`，改为：

```typescript
const accessToken = signAccessToken(user.id, user.role);
```

- [ ] **步骤 4：修改所有其他签发 token 的地方**

查找所有调用 `signAccessToken` 的位置并更新参数：

```bash
cd /Users/weixiaoyu/Desktop/practice/AI-aggregation && grep -rn "signAccessToken" apps/
```

对每个调用点，需要传入 role。例如 register route 中：

```typescript
// 原: const accessToken = signAccessToken(user.id);
// 改为:
const accessToken = signAccessToken(user.id, user.role);
```

- [ ] **步骤 5：运行 TypeScript 检查**

```bash
cd /Users/weixiaoyu/Desktop/practice/AI-aggregation && pnpm typecheck
```

修复所有类型错误。

- [ ] **步骤 6：提交**

```bash
git add apps/web/src/lib/auth/jwt.ts apps/web/src/lib/auth/require-admin.ts apps/web/src/app/api/auth/login/route.ts
git commit -m "feat: JWT 增加 role 字段，新增 requireAdmin 校验函数"
```

---

### 任务 4：登录增强 & Me 接口返回 role

**文件：**

- 修改: `apps/web/src/app/api/auth/login/route.ts`
- 修改: `apps/web/src/app/api/auth/me/route.ts`

- [ ] **步骤 1：登录接口增加状态检查**

在 `apps/web/src/app/api/auth/login/route.ts` 中，密码验证通过后、签发 token 前，增加：

```typescript
// 检查账号状态
if (user.status === 'disabled') {
  return ApiError.forbidden('账号已被停用，请联系管理员');
}
```

完整修改后的 login route 核心逻辑：

```typescript
const valid = await verifyPassword(password, user.passwordHash);
if (!valid) {
  return ApiError.unauthorized('用户名或密码错误');
}

// 新增：检查账号状态
if (user.status === 'disabled') {
  return ApiError.forbidden('账号已被停用，请联系管理员');
}

const accessToken = signAccessToken(user.id, user.role);
// ... 后续不变
```

- [ ] **步骤 2：me 接口返回 role**

在 `apps/web/src/app/api/auth/me/route.ts` 中，select 字段增加 `role`：

```typescript
const user = await prisma.user.findUnique({
  where: { id: userId },
  select: {
    id: true,
    username: true,
    email: true,
    name: true,
    avatar: true,
    emailVerified: true,
    createdAt: true,
    role: true,    // 新增
  },
});
```

- [ ] **步骤 3：提交**

```bash
git add apps/web/src/app/api/auth/login/route.ts apps/web/src/app/api/auth/me/route.ts
git commit -m "feat: 登录增加停用检查，me 接口返回 role"
```

---

### 任务 5：中间件增加 /admin/* 角色保护

**文件：**

- 修改: `apps/web/src/middleware.ts`

- [ ] **步骤 1：修改中间件**

完整替换 `apps/web/src/middleware.ts`：

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
];

const PUBLIC_API_PREFIXES = [
  '/api/auth',
];

const STATIC_PREFIXES = [
  '/_next',
  '/favicon',
  '/assets',
];

/** 需要管理员权限的路径前缀 */
const ADMIN_PREFIXES = ['/admin'];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  if (STATIC_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  return false;
}

function isAdminPath(pathname: string): boolean {
  return ADMIN_PREFIXES.some((p) => pathname.startsWith(p));
}

const UNAUTH_ONLY_PATHS = ['/login', '/register', '/', '/forgot-password', '/reset-password'];

export function middleware(req: NextRequest) {
  const { pathname, origin } = req.nextUrl;

  const hasToken = !!req.cookies.get('refresh_token')?.value;

  // 已登录用户访问登录/注册/首页，重定向到聊天页
  if (hasToken && UNAUTH_ONLY_PATHS.includes(pathname)) {
    return NextResponse.redirect(new URL('/home', origin));
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // 未登录用户重定向到登录页
  if (!hasToken) {
    const loginUrl = new URL('/login', origin);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 新增：管理员路径校验
  // 注意：中间件无法直接访问 Prisma，解析 cookie token 需查库。
  // 简化方案：对于 /admin/* 路径，中间件放行但依赖 API 层 requireAdmin 保护。
  // 页面渲染前由客户端 AuthGuard 检查 role。
  // 如果需要在中间件层拦截，需要引入 Prisma（见下方备选方案）。
  //
  // 当前策略：中间件确保登录，API 层确保 admin role。
  // admin 页面由前端 useAuth 获取 role 后判断重定向。

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.svg).*)',
  ],
};
```

> **说明：** 中间件无法直接访问 Prisma（Edge Runtime 限制），因此实际的 role 校验在 API 层完成。前端通过 AuthGuard + useAuth 检查 role，非 admin 重定向到 `/home`。

- [ ] **步骤 2：提交**

```bash
git add apps/web/src/middleware.ts
git commit -m "feat: 中间件注释 admin 路径保护策略"
```

---

### 任务 6：Admin API Schema

**文件：**

- 修改: `apps/web/src/schemas/auth.schema.ts`

- [ ] **步骤 1：新增管理相关 Zod schema**

在 `apps/web/src/schemas/auth.schema.ts` 末尾追加：

```typescript
/** 超管创建用户 */
export const adminCreateUserSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, '用户名至少 3 个字符')
    .max(30, '用户名最多 30 个字符')
    .regex(USERNAME_REGEX, '用户名只能包含英文字母、数字和下划线'),
  password: z.string().min(8, '密码至少 8 位字符'),
  name: z.string().trim().max(50, '昵称最多 50 个字符').optional(),
});

/** 超管更新用户 */
export const adminUpdateUserSchema = z.object({
  name: z.string().trim().max(50, '昵称最多 50 个字符').optional(),
  role: z.enum(['user', 'admin']).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  tokens: z.number().int().min(0, 'Token 额度不能为负数').optional(),
});

/** 管理端用户列表查询参数 */
export const adminUsersQuerySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export type AdminCreateUserInput = z.infer<typeof adminCreateUserSchema>;
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;
export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;
```

- [ ] **步骤 2：提交**

```bash
git add apps/web/src/schemas/auth.schema.ts
git commit -m "feat: 新增管理端 Zod schema（创建/更新/查询用户）"
```

---

### 任务 7：Admin Users API - GET 列表 & POST 创建

**文件：**

- 新增: `apps/web/src/app/api/admin/users/route.ts`

- [ ] **步骤 1：创建 API 路由文件**

创建目录并写入 `apps/web/src/app/api/admin/users/route.ts`：

```typescript
import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { hashPassword } from '@/lib/auth/password';
import { requireAdmin } from '@/lib/auth/require-admin';
import { ApiError, createSuccessResponse } from '@/lib/api/responses';
import { adminCreateUserSchema, adminUsersQuerySchema } from '@/schemas/auth.schema';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    const url = new URL(req.url);
    const parsed = adminUsersQuerySchema.safeParse({
      search: url.searchParams.get('search') || undefined,
      page: url.searchParams.get('page') || 1,
      limit: url.searchParams.get('limit') || 10,
    });

    if (!parsed.success) {
      return ApiError.badRequest('参数错误', 'INVALID_REQUEST', {
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { search, page, limit } = parsed.data;

    const where = search
      ? {
          OR: [
            { username: { contains: search, mode: 'insensitive' as const } },
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          email: true,
          name: true,
          avatar: true,
          role: true,
          status: true,
          tokens: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    return createSuccessResponse({
      users,
      meta: { total, page, limit },
    });
  } catch (error) {
    if (error instanceof Error && error.message === '缺少认证令牌') {
      return ApiError.unauthorized('缺少认证令牌');
    }
    if (error instanceof Error && error.message === '无权访问：需要管理员权限') {
      return ApiError.forbidden('无权访问：需要管理员权限');
    }
    console.error('获取用户列表失败:', error);
    return ApiError.internalError('获取用户列表失败');
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);

    const body = await req.json();
    const parsed = adminCreateUserSchema.safeParse(body);

    if (!parsed.success) {
      return ApiError.badRequest('请求参数错误', 'INVALID_REQUEST', {
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { username, password, name } = parsed.data;

    // 检查用户名是否已存在
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return ApiError.badRequest('用户名已存在', 'USERNAME_EXISTS', {
        username: '用户名已存在',
      });
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        name: name || null,
        role: 'user',
        status: 'active',
        tokens: 20000,
      },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        status: true,
        tokens: true,
        createdAt: true,
      },
    });

    return createSuccessResponse({ user }, '用户创建成功', 201);
  } catch (error) {
    if (error instanceof Error && error.message === '缺少认证令牌') {
      return ApiError.unauthorized('缺少认证令牌');
    }
    if (error instanceof Error && error.message === '无权访问：需要管理员权限') {
      return ApiError.forbidden('无权访问：需要管理员权限');
    }
    console.error('创建用户失败:', error);
    return ApiError.internalError('创建用户失败');
  }
}
```

- [ ] **步骤 2：检查 Prisma findMany 的 mode 参数**

如果 `mode: 'insensitive'` 报类型错误（取决于 Prisma 版本和 PostgreSQL provider），改为使用 `contains: search` 去掉 `mode` 参数（PostgreSQL 默认大小写敏感）。

- [ ] **步骤 3：提交**

```bash
git add apps/web/src/app/api/admin/
git commit -m "feat: 管理端用户列表 GET 和创建 POST API"
```

---

### 任务 8：Admin Users API - PATCH 更新 & DELETE 删除

**文件：**

- 新增: `apps/web/src/app/api/admin/users/[id]/route.ts`

- [ ] **步骤 1：创建动态路由文件**

创建 `apps/web/src/app/api/admin/users/[id]/route.ts`：

```typescript
import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { requireAdmin } from '@/lib/auth/require-admin';
import { ApiError, createSuccessResponse } from '@/lib/api/responses';
import { adminUpdateUserSchema } from '@/schemas/auth.schema';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminId = await requireAdmin(req);
    const { id: targetId } = await params;

    // 安全检查：不能删除或降级自己
    const targetUser = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, role: true },
    });

    if (!targetUser) {
      return ApiError.notFound('用户不存在');
    }

    const body = await req.json();
    const parsed = adminUpdateUserSchema.safeParse(body);

    if (!parsed.success) {
      return ApiError.badRequest('请求参数错误', 'INVALID_REQUEST', {
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { name, role, status, tokens } = parsed.data;

    // 安全检查：不能将自己降级为非 admin
    if (targetId === adminId && role && role !== 'admin') {
      return ApiError.badRequest('不能移除自己的管理员权限', 'INVALID_REQUEST');
    }

    const user = await prisma.user.update({
      where: { id: targetId },
      data: {
        ...(name !== undefined && { name }),
        ...(role !== undefined && { role }),
        ...(status !== undefined && { status }),
        ...(tokens !== undefined && { tokens }),
      },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        status: true,
        tokens: true,
        createdAt: true,
      },
    });

    return createSuccessResponse({ user }, '更新成功');
  } catch (error) {
    if (error instanceof Error && error.message === '缺少认证令牌') {
      return ApiError.unauthorized('缺少认证令牌');
    }
    if (error instanceof Error && error.message === '无权访问：需要管理员权限') {
      return ApiError.forbidden('无权访问：需要管理员权限');
    }
    console.error('更新用户失败:', error);
    return ApiError.internalError('更新用户失败');
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminId = await requireAdmin(req);
    const { id: targetId } = await params;

    // 安全检查：不能删除自己
    if (targetId === adminId) {
      return ApiError.badRequest('不能删除自己的账号', 'INVALID_REQUEST');
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true },
    });

    if (!targetUser) {
      return ApiError.notFound('用户不存在');
    }

    // 硬删除，CASCADE 自动清理关联数据
    await prisma.user.delete({ where: { id: targetId } });

    return createSuccessResponse(null, '用户已删除');
  } catch (error) {
    if (error instanceof Error && error.message === '缺少认证令牌') {
      return ApiError.unauthorized('缺少认证令牌');
    }
    if (error instanceof Error && error.message === '无权访问：需要管理员权限') {
      return ApiError.forbidden('无权访问：需要管理员权限');
    }
    console.error('删除用户失败:', error);
    return ApiError.internalError('删除用户失败');
  }
}
```

- [ ] **步骤 2：提交**

```bash
git add apps/web/src/app/api/admin/users/
git commit -m "feat: 管理端用户更新 PATCH 和删除 DELETE API"
```

---

### 任务 9：Auth Store 增加 role 字段

**文件：**

- 修改: `apps/web/src/stores/auth-store.ts`

- [ ] **步骤 1：User 接口增加 role**

在 `apps/web/src/stores/auth-store.ts` 中修改 User 接口：

```typescript
interface User {
  id: string;
  username: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
  emailVerified: string | null;
  role: string;     // 新增
  createdAt?: string;
}
```

- [ ] **步骤 2：提交**

```bash
git add apps/web/src/stores/auth-store.ts
git commit -m "feat: auth store User 接口增加 role 字段"
```

---

### 任务 10：前端 Admin API 客户端

**文件：**

- 新增: `apps/web/src/lib/api/admin-api.ts`

- [ ] **步骤 1：创建管理 API 客户端**

创建 `apps/web/src/lib/api/admin-api.ts`：

```typescript
/** 管理端 API 客户端封装 */

import { useAuthStore } from '@/stores/auth-store';

interface AdminUser {
  id: string;
  username: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
  role: string;
  status: string;
  tokens: number;
  createdAt: string;
}

interface UsersListResponse {
  success: boolean;
  data?: {
    users: AdminUser[];
    meta: { total: number; page: number; limit: number };
  };
  error?: string;
}

interface UserResponse {
  success: boolean;
  data?: { user: AdminUser };
  error?: string;
  message?: string;
}

function getAccessToken(): string | null {
  return useAuthStore.getState().accessToken;
}

function authHeaders(): HeadersInit {
  const token = getAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `请求失败: ${res.status}`);
  }
  return data;
}

export const adminApi = {
  async listUsers(params?: { search?: string; page?: number; limit?: number }) {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set('search', params.search);
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));

    const res = await fetch(`/api/admin/users?${searchParams.toString()}`, {
      headers: authHeaders(),
    });
    return handleResponse<UsersListResponse>(res);
  },

  async createUser(data: { username: string; password: string; name?: string }) {
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<UserResponse>(res);
  },

  async updateUser(id: string, data: { name?: string; role?: string; status?: string; tokens?: number }) {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<UserResponse>(res);
  },

  async deleteUser(id: string) {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return handleResponse<{ success: boolean; message?: string }>(res);
  },
};
```

- [ ] **步骤 2：提交**

```bash
git add apps/web/src/lib/api/admin-api.ts
git commit -m "feat: 新增管理端 API 客户端封装"
```

---

### 任务 11：创建用户对话框

**文件：**

- 新增: `apps/web/src/app/admin/users/_components/create-user-dialog.tsx`
- 修改: `apps/web/src/app/admin/users/_components/user-management-shell.tsx`

- [ ] **步骤 1：创建 CreateUserDialog 组件**

创建 `apps/web/src/app/admin/users/_components/create-user-dialog.tsx`：

```typescript
'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { adminApi } from '@/lib/api/admin-api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateUserDialog({ open, onOpenChange, onSuccess }: CreateUserDialogProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');
    if (!username.trim() || !password.trim()) {
      setError('用户名和密码不能为空');
      return;
    }
    if (password.length < 8) {
      setError('密码至少 8 位字符');
      return;
    }
    setIsSubmitting(true);
    try {
      await adminApi.createUser({
        username: username.trim(),
        password,
        name: name.trim() || undefined,
      });
      toast.success('用户创建成功');
      setUsername('');
      setPassword('');
      setName('');
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass =
    'h-[48px] w-full rounded-[12px] border border-[rgba(255,255,255,0.60)] bg-white/76 px-4 text-[14px] text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.84),0_8px_20px_rgba(76,95,154,0.10)] outline-none placeholder:text-slate-400 dark:border-white/10 dark:bg-slate-900/72 dark:text-white';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showClose={false}
        className="flex max-h-[min(88vh,520px)] w-[calc(100vw-1rem)] max-w-[480px] flex-col gap-0 overflow-hidden rounded-[24px] border border-[rgba(255,255,255,0.60)] bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(255,255,255,0.48),transparent)] p-3 shadow-[0_20px_56px_-16px_rgba(59,130,246,0.14)] backdrop-blur-[24px] sm:rounded-[28px] sm:p-6"
      >
        <DialogClose className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-[12px] border border-[rgba(255,255,255,0.65)] bg-white/76 text-slate-500 shadow-[0_8px_20px_rgba(76,95,154,0.10)] transition-colors hover:bg-white">
          <span className="text-[18px] leading-none">×</span>
        </DialogClose>

        <DialogHeader className="shrink-0 space-y-1.5 pr-10">
          <DialogTitle className="text-[22px] font-bold tracking-[-0.02em] text-slate-950">
            新增用户
          </DialogTitle>
          <DialogDescription className="text-[14px] text-slate-500">
            创建新用户账号，初始 Token 额度为 20,000
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-[14px] font-medium text-slate-700">用户名</label>
            <input
              type="text"
              className={inputClass}
              placeholder="英文字母、数字、下划线"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[14px] font-medium text-slate-700">密码</label>
            <input
              type="password"
              className={inputClass}
              placeholder="至少 8 位字符"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[14px] font-medium text-slate-700">昵称（可选）</label>
            <input
              type="text"
              className={inputClass}
              placeholder="显示名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {error ? (
            <p className="rounded-[12px] bg-rose-50 px-4 py-2 text-[13px] text-rose-600">{error}</p>
          ) : null}
        </div>

        <DialogFooter className="mt-4 shrink-0 flex-row gap-3 border-t border-[rgba(255,255,255,0.60)] pt-4 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-10 flex-1 rounded-[12px] sm:flex-none sm:min-w-[112px]"
          >
            取消
          </Button>
          <Button
            type="button"
            disabled={isSubmitting}
            onClick={handleSubmit}
            className="h-10 flex-1 rounded-[12px] sm:flex-none sm:min-w-[132px]"
          >
            {isSubmitting ? '创建中...' : '创建用户'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **步骤 2：在 user-management-shell 中集成创建对话框**

在 `user-management-shell.tsx` 中修改新增用户按钮，使其打开 CreateUserDialog：

```typescript
// 添加 import
import { CreateUserDialog } from './create-user-dialog';

// 在组件中添加状态
const [createDialogOpen, setCreateDialogOpen] = useState(false);

// 修改"新增用户"按钮
<Button type="button" className="..." onClick={() => setCreateDialogOpen(true)}>
  <UserPlus className="mr-2 h-5 w-5" />
  新增用户
</Button>

// 在 JSX 末尾添加
<CreateUserDialog
  open={createDialogOpen}
  onOpenChange={setCreateDialogOpen}
  onSuccess={fetchUsers}
/>
```

- [ ] **步骤 3：提交**

```bash
git add apps/web/src/app/admin/users/_components/create-user-dialog.tsx apps/web/src/app/admin/users/_components/user-management-shell.tsx
git commit -m "feat: 新增创建用户对话框，集成到管理页面"
```

---

### 任务 12：管理页面接入真实数据

**文件：**

- 修改: `apps/web/src/app/admin/users/_components/user-management-shell.tsx`

此任务将 `user-management-shell.tsx` 从假数据改为真实 API。改动较大，分步进行。

- [ ] **步骤 1：替换数据获取逻辑**

在文件顶部 import 修改为包含 adminApi 和 AdminUser 类型：

```typescript
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  Search,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { EditUserDialog, type AdminUserRecord } from './edit-user-dialog';
import { CreateUserDialog } from './create-user-dialog';
import { adminApi } from '@/lib/api/admin-api';
import { toast } from 'sonner';
```

删除 `ADMIN_USERS` 和 `SUMMARY_CARDS` 静态数据，替换为动态状态：

```typescript
// 替换 SUMMARY_CARDS 为：
function SummaryCards({ users }: { users: AdminUser[] }) {
  const totalUsers = users.length; // 初始加载时用当前页，后续从 meta.total 获取
  const adminCount = users.filter((u) => u.role === 'admin').length;
  const disabledCount = users.filter((u) => u.status === 'disabled').length;

  const cards = [
    { label: '总用户数', value: String(totalUsers), tone: 'text-slate-950 dark:text-white' },
    { label: '管理员', value: String(adminCount), tone: 'text-[#255DFF] dark:text-[#BFD0FF]' },
    { label: '已停用', value: String(disabledCount), tone: 'text-rose-500 dark:text-rose-300' },
  ];
  // ... 渲染逻辑复用原有卡片样式
}
```

- [ ] **步骤 2：在组件中实现数据加载**

```typescript
interface AdminUser {
  id: string;
  username: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
  role: string;
  status: string;
  tokens: number;
  createdAt: string;
}

export function UserManagementShell() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<AdminUserRecord | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await adminApi.listUsers({ search: searchQuery || undefined, page, limit: 10 });
      if (res.success && res.data) {
        setUsers(res.data.users);
        setTotal(res.data.meta.total);
      }
    } catch (err) {
      toast.error('加载用户列表失败');
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, page]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // 将 API 用户转为 AdminUserRecord 格式用于 EditUserDialog
  const toRecord = (user: AdminUser): AdminUserRecord => ({
    id: user.id,
    name: user.name || user.username,
    email: user.email || '',
    role: user.role === 'admin' ? '管理员' : '普通用户',
    tokens: user.tokens.toLocaleString() + ' Tokens',
    status: user.status === 'active' ? '正常' : user.status === 'disabled' ? '已禁用' : '耗尽',
    avatar: user.avatar || '',
    initials: (user.name || user.username).charAt(0).toUpperCase(),
    avatarTone: 'bg-gradient-to-br from-[#DCEBFF] to-[#BCD7FF] text-[#3066FF]',
  });
```

- [ ] **步骤 3：连接删除操作**

```typescript
const handleDelete = async (userId: string) => {
  if (!confirm('确认删除该用户？此操作不可撤销，将级联删除所有关联数据。')) return;
  try {
    await adminApi.deleteUser(userId);
    toast.success('用户已删除');
    fetchUsers();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '删除失败');
  }
};
```

- [ ] **步骤 4：更新用户列表渲染**

将 `filteredUsers` 改为基于 `users` 状态，将 `ADMIN_USERS.map` 替换为 `users.map`，删除按钮绑定 `handleDelete(user.id)`，更新按钮绑定打开编辑弹窗。

分页器绑定 `setPage`：

```typescript
// 上一页
onClick={() => setPage((p) => Math.max(1, p - 1))}
// 下一页
onClick={() => setPage((p) => p + 1)}
```

- [ ] **步骤 5：提交**

```bash
git add apps/web/src/app/admin/users/_components/user-management-shell.tsx
git commit -m "feat: 管理页面接入真实 API 数据，删除和分页功能实现"
```

---

### 任务 13：编辑对话框接入真实 API

**文件：**

- 修改: `apps/web/src/app/admin/users/_components/edit-user-dialog.tsx`

- [ ] **步骤 1：修改 EditUserDialog 支持真实保存**

在 `edit-user-dialog.tsx` 中添加：

```typescript
import { adminApi } from '@/lib/api/admin-api';
import { toast } from 'sonner';
```

修改 Props 增加 `onSuccess` 回调：

```typescript
interface EditUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AdminUserRecord | null;
  onSuccess: () => void;  // 新增
}
```

给"保存修改"按钮增加点击处理：

```typescript
const [isSaving, setIsSaving] = useState(false);
const [localRole, setLocalRole] = useState(user?.role);
const [localStatus, setLocalStatus] = useState(user?.status);

// 保存修改
const handleSave = async () => {
  if (!user) return;
  setIsSaving(true);
  try {
    const updateData: Record<string, unknown> = {};
    if (localRole === '管理员' && user.role !== '管理员') updateData.role = 'admin';
    if (localRole === '普通用户' && user.role !== '普通用户') updateData.role = 'user';
    if (localStatus !== user.status) {
      updateData.status = localStatus === '已禁用' ? 'disabled' : 'active';
    }
    if (Object.keys(updateData).length === 0) {
      onOpenChange(false);
      return;
    }
    await adminApi.updateUser(user.id, updateData);
    toast.success('更新成功');
    onSuccess();
    onOpenChange(false);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '更新失败');
  } finally {
    setIsSaving(false);
  }
};
```

角色切换和状态开关绑定 `setLocalRole` 和 `setLocalStatus`。Token 额度快捷按钮绑定：

```typescript
const handleTokenAdjust = async (amount: number) => {
  if (!user) return;
  const currentTokens = parseInt(user.tokens.replace(/[^0-9]/g, '')) || 0;
  const newTokens = Math.max(0, currentTokens + amount);
  try {
    await adminApi.updateUser(user.id, { tokens: newTokens });
    toast.success(`Token 已更新`);
    onSuccess();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '更新失败');
  }
};
```

- [ ] **步骤 2：提交**

```bash
git add apps/web/src/app/admin/users/_components/edit-user-dialog.tsx
git commit -m "feat: 编辑对话框接入真实 API，支持角色/状态/Token 修改"
```

---

### 任务 14：Token 配额扣除（AI 调用时）

**文件：**

- 修改: `apps/web/src/app/api/chat/route.ts`

- [ ] **步骤 1：在 chat API 中增加 token 扣除逻辑**

在 `apps/web/src/app/api/chat/route.ts` 中，`requireAuth` 之后增加角色查询和 token 扣除：

```typescript
import { prisma } from '@repo/db';

// 在 requireAuth 之后、限流检查之前：
const userId = await requireAuth(req);

// 获取用户信息（role + tokens）
const user = await prisma.user.findUnique({
  where: { id: userId },
  select: { role: true, tokens: true },
});

if (!user) {
  return new Response(JSON.stringify({ error: '用户不存在' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

// 非 admin 用户检查并扣除 tokens
if (user.role !== 'admin') {
  if (user.tokens <= 0) {
    return new Response(
      JSON.stringify({
        error: 'Token 额度不足，请联系管理员充值',
        errorId,
      }),
      {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // 每次 AI 调用扣除 1 token（可根据实际用量调整）
  prisma.user
    .update({
      where: { id: userId },
      data: { tokens: { decrement: 1 } },
    })
    .catch((err) => {
      console.error('扣除 tokens 失败:', err);
    });
}
```

> 注意：扣除操作使用异步不等待模式（fire-and-forget），避免影响流式响应延迟。生产环境建议通过 BullMQ 异步处理。

- [ ] **步骤 2：同样修改其他 AI 调用接口**

检查 `apps/web/src/app/api/image/` 和 `apps/web/src/app/api/video/` 路由，应用相同的 token 扣除逻辑。

- [ ] **步骤 3：提交**

```bash
git add apps/web/src/app/api/chat/route.ts
git commit -m "feat: AI 调用时检查并扣除用户 Token 额度，admin 跳过"
```

---

### 任务 15：客户端 Admin 路由守卫

**文件：**

- 修改: `apps/web/src/hooks/use-auth.ts`
- 修改: `apps/web/src/app/admin/users/page.tsx`

- [ ] **步骤 1：在 use-auth.ts 中导出 isAdmin**

```typescript
// 在 useAuth 的返回值中增加：
isAdmin: user?.role === 'admin',
```

- [ ] **步骤 2：Admin 页面增加客户端角色守卫**

在 `apps/web/src/app/admin/users/page.tsx` 中：

```typescript
'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppLayout } from '@/components/layout/app-layout';
import { UserManagementShell } from './_components/user-management-shell';
import { useAuth } from '@/hooks/use-auth';

export default function AdminUsersPage() {
  const { isAdmin, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !isAdmin)) {
      router.replace('/home');
    }
  }, [isLoading, isAuthenticated, isAdmin, router]);

  if (isLoading || !isAdmin) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#f8faff]">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#d7e2f3] border-t-[#3c6df3]" />
      </div>
    );
  }

  return (
    <AppLayout>
      <UserManagementShell />
    </AppLayout>
  );
}
```

- [ ] **步骤 3：提交**

```bash
git add apps/web/src/hooks/use-auth.ts apps/web/src/app/admin/users/page.tsx
git commit -m "feat: admin 页面增加客户端角色守卫，非 admin 重定向"
```

---

### 任务 16：更新测试

**文件：**

- 修改: `apps/web/src/app/admin/users/page.test.tsx`

- [ ] **步骤 1：更新测试以适配新数据流**

测试需要 mock `useAuth` (用于 Admin 守卫) 和 `adminApi` (用于数据加载)。新的 `page.test.tsx`：

```typescript
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock useAuth
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    isAdmin: true,
    isAuthenticated: true,
    isLoading: false,
    user: { id: 'admin-1', username: 'xkfy', role: 'admin', email: null, name: '超级管理员', avatar: null, emailVerified: null },
  }),
}));

// Mock admin API
vi.mock('@/lib/api/admin-api', () => ({
  adminApi: {
    listUsers: vi.fn().mockResolvedValue({
      success: true,
      data: {
        users: [
          { id: '1', username: 'test1', name: '张伟', email: 'zhangwei@test.ai', role: 'user', status: 'active', tokens: 12500, avatar: null, createdAt: '2026-01-01' },
          { id: '2', username: 'test2', name: '李娜', email: 'lina@test.ai', role: 'admin', status: 'active', tokens: 89000, avatar: null, createdAt: '2026-01-02' },
        ],
        meta: { total: 2, page: 1, limit: 10 },
      },
    }),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    deleteUser: vi.fn(),
  },
}));

vi.mock('@/components/layout/app-layout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import AdminUsersPage from './page';

describe('AdminUsersPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('渲染管理页面核心内容', async () => {
    render(<AdminUsersPage />);

    await waitFor(() => {
      expect(screen.getByText('系统用户管理')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('张伟')).toBeInTheDocument();
      expect(screen.getByText('李娜')).toBeInTheDocument();
    });
  });

  it('显示新增用户按钮', async () => {
    render(<AdminUsersPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '新增用户' })).toBeInTheDocument();
    });
  });
});
```

- [ ] **步骤 2：运行测试验证**

```bash
cd /Users/weixiaoyu/Desktop/practice/AI-aggregation && pnpm --filter @repo/web test -- apps/web/src/app/admin/users/page.test.tsx
```

- [ ] **步骤 3：提交**

```bash
git add apps/web/src/app/admin/users/page.test.tsx
git commit -m "test: 更新管理页面测试，适配 API 数据加载和角色守卫"
```

---

### 任务 17：导航栏显示管理入口（条件渲染）

**文件：**

- 查找: `apps/web/src/components/layout/` 中的导航组件

- [ ] **步骤 1：找到侧边栏或导航栏组件**

```bash
cd /Users/weixiaoyu/Desktop/practice/AI-aggregation && grep -rn "admin\|管理" apps/web/src/components/layout/
```

- [ ] **步骤 2：根据 role 条件渲染管理入口**

在导航组件中：

```typescript
import { useAuth } from '@/hooks/use-auth';

// 在组件中
const { isAdmin } = useAuth();

// 管理入口链接
{isAdmin && (
  <Link href="/admin/users" className="...">
    用户管理
  </Link>
)}
```

- [ ] **步骤 3：提交**

```bash
git add apps/web/src/components/layout/
git commit -m "feat: 导航栏根据 admin 角色条件渲染管理入口"
```

---

### 任务 18：端到端验证

- [ ] **步骤 1：启动开发环境**

```bash
cd /Users/weixiaoyu/Desktop/practice/AI-aggregation && pnpm dev
```

- [ ] **步骤 2：验证超管登录**

1. 访问 `http://localhost:3030/login`
2. 使用 `xkfy` / `woaini2244` 登录
3. 确认登录成功后跳转到 `/home`
4. 检查浏览器 localStorage 中 `ai-app-auth` 包含 `role: "admin"`

- [ ] **步骤 3：验证管理页面访问**

1. 导航到 `http://localhost:3030/admin/users`
2. 确认能看到用户管理页面
3. 确认统计卡片显示正确数据

- [ ] **步骤 4：验证创建用户**

1. 点击"新增用户"
2. 填写用户名、密码
3. 确认新用户出现在列表中

- [ ] **步骤 5：验证编辑用户**

1. 点击某用户的"更新"按钮
2. 修改角色/状态/Token
3. 点击"保存修改"
4. 确认列表刷新显示新数据

- [ ] **步骤 6：验证删除用户**

1. 点击某用户的"删除"按钮
2. 确认后从列表中消失

- [ ] **步骤 7：验证普通用户无法访问管理页面**

1. 新开无痕窗口
2. 用普通账号登录
3. 直接访问 `/admin/users`
4. 确认被重定向到 `/home`

- [ ] **步骤 8：验证停用用户无法登录**

1. 用超管将某用户停用
2. 该用户尝试登录
3. 确认收到"账号已被停用"错误

---

### 任务 19：最终提交

```bash
git add -A
git status
git commit -m "feat: 超管账号与用户管理完整实现"
```
