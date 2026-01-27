# Next.js 路由指南

## 📚 路由系统概述

Next.js 15 使用 **App Router**（基于文件系统的路由），不需要单独的路由配置文件。

## 🗂️ 当前路由结构

```
apps/web/src/app/
├── layout.tsx              → 根布局（所有页面共享）
├── page.tsx                → 首页 (/)
├── globals.css             → 全局样式
├── chat/
│   └── page.tsx            → 对话页面 (/chat)
└── tasks/
    ├── page.tsx            → 任务列表 (/tasks)
    └── [id]/
        └── page.tsx        → 任务详情 (/tasks/:id)
```

## 🔗 路由映射

| 文件路径                  | URL          | 说明                 |
| ------------------------- | ------------ | -------------------- |
| `app/page.tsx`            | `/`          | 首页                 |
| `app/chat/page.tsx`       | `/chat`      | AI 对话              |
| `app/tasks/page.tsx`      | `/tasks`     | 任务列表             |
| `app/tasks/[id]/page.tsx` | `/tasks/123` | 任务详情（动态路由） |

## 📝 路由类型

### 1. 静态路由

创建文件夹和 `page.tsx` 即可：

```
app/
└── about/
    └── page.tsx    → /about
```

```tsx
// app/about/page.tsx
export default function AboutPage() {
  return <div>关于我们</div>;
}
```

### 2. 动态路由

使用 `[参数名]` 文件夹：

```
app/
└── posts/
    └── [id]/
        └── page.tsx    → /posts/123
```

```tsx
// app/posts/[id]/page.tsx
export default function PostPage({ params }: { params: { id: string } }) {
  return <div>文章 ID: {params.id}</div>;
}
```

### 3. 嵌套路由

创建多层文件夹：

```
app/
└── dashboard/
    ├── page.tsx              → /dashboard
    ├── settings/
    │   └── page.tsx          → /dashboard/settings
    └── profile/
        └── page.tsx          → /dashboard/profile
```

### 4. 路由组（不影响 URL）

使用 `(组名)` 文件夹：

```
app/
├── (marketing)/
│   ├── about/
│   │   └── page.tsx          → /about
│   └── contact/
│       └── page.tsx          → /contact
└── (shop)/
    ├── products/
    │   └── page.tsx          → /products
    └── cart/
        └── page.tsx          → /cart
```

## 🎯 导航方式

### 1. Link 组件（推荐）

```tsx
import Link from 'next/link';

<Link href="/chat">去对话</Link>
<Link href="/tasks/123">查看任务</Link>
<Link href="/chat" className="text-blue-600">
  对话页面
</Link>
```

### 2. useRouter Hook

```tsx
'use client';

import { useRouter } from 'next/navigation';

export default function MyComponent() {
  const router = useRouter();

  return (
    <>
      <button onClick={() => router.push('/chat')}>跳转</button>
      <button onClick={() => router.back()}>返回</button>
      <button onClick={() => router.refresh()}>刷新</button>
    </>
  );
}
```

### 3. redirect（服务端）

```tsx
import { redirect } from 'next/navigation';

export default function Page() {
  // 服务端重定向
  redirect('/login');
}
```

## 📄 特殊文件

### layout.tsx - 布局

共享的 UI 结构，会包裹子页面：

```tsx
// app/layout.tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <nav>导航栏</nav>
        {children}
        <footer>页脚</footer>
      </body>
    </html>
  );
}
```

### loading.tsx - 加载状态

自动显示加载状态：

```tsx
// app/tasks/loading.tsx
export default function Loading() {
  return <div>加载中...</div>;
}
```

### error.tsx - 错误处理

捕获错误并显示：

```tsx
'use client';

// app/tasks/error.tsx
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div>
      <h2>出错了！</h2>
      <p>{error.message}</p>
      <button onClick={reset}>重试</button>
    </div>
  );
}
```

### not-found.tsx - 404 页面

```tsx
// app/not-found.tsx
export default function NotFound() {
  return <div>页面未找到</div>;
}
```

## 🔍 获取路由参数

### URL 参数（动态路由）

```tsx
// app/posts/[id]/page.tsx
export default function Page({ params }: { params: { id: string } }) {
  return <div>文章 ID: {params.id}</div>;
}
```

### 查询参数（searchParams）

```tsx
// app/search/page.tsx
export default function Page({ searchParams }: { searchParams: { q: string } }) {
  return <div>搜索: {searchParams.q}</div>;
}
// 访问: /search?q=hello
```

### 使用 useSearchParams Hook

```tsx
'use client';

import { useSearchParams } from 'next/navigation';

export default function SearchPage() {
  const searchParams = useSearchParams();
  const query = searchParams.get('q');

  return <div>搜索: {query}</div>;
}
```

## 🎨 实际示例

### 示例 1: 创建用户中心

```bash
# 创建文件
apps/web/src/app/profile/page.tsx
```

```tsx
export default function ProfilePage() {
  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold">用户中心</h1>
    </div>
  );
}
```

访问: http://localhost:3001/profile

### 示例 2: 创建设置页面（嵌套路由）

```bash
# 创建文件
apps/web/src/app/settings/page.tsx
apps/web/src/app/settings/profile/page.tsx
apps/web/src/app/settings/security/page.tsx
```

```tsx
// app/settings/page.tsx
export default function SettingsPage() {
  return <div>设置首页</div>;
}

// app/settings/profile/page.tsx
export default function ProfileSettingsPage() {
  return <div>个人资料设置</div>;
}
```

访问:

- http://localhost:3001/settings
- http://localhost:3001/settings/profile
- http://localhost:3001/settings/security

### 示例 3: API 路由

```bash
# 创建文件
apps/web/src/app/api/hello/route.ts
```

```tsx
// app/api/hello/route.ts
export async function GET() {
  return Response.json({ message: 'Hello World' });
}

export async function POST(request: Request) {
  const body = await request.json();
  return Response.json({ received: body });
}
```

访问: http://localhost:3001/api/hello

## 📋 路由最佳实践

### 1. 使用 Link 而不是 <a>

```tsx
// ❌ 不推荐
<a href="/chat">对话</a>

// ✅ 推荐
<Link href="/chat">对话</Link>
```

### 2. 预加载路由

```tsx
<Link href="/chat" prefetch={true}>
  对话
</Link>
```

### 3. 使用路由组组织代码

```
app/
├── (auth)/
│   ├── login/
│   └── register/
└── (dashboard)/
    ├── home/
    └── settings/
```

### 4. 动态导入减少初始加载

```tsx
import dynamic from 'next/dynamic';

const HeavyComponent = dynamic(() => import('./HeavyComponent'), {
  loading: () => <p>加载中...</p>,
});
```

## 🔧 调试路由

### 查看当前路由

```tsx
'use client';

import { usePathname } from 'next/navigation';

export default function Component() {
  const pathname = usePathname();
  console.log('当前路径:', pathname);

  return <div>当前路径: {pathname}</div>;
}
```

### 查看所有参数

```tsx
'use client';

import { useParams, useSearchParams } from 'next/navigation';

export default function Component() {
  const params = useParams();
  const searchParams = useSearchParams();

  console.log('URL 参数:', params);
  console.log('查询参数:', Object.fromEntries(searchParams));

  return <div>...</div>;
}
```

## 📚 更多资源

- [Next.js 路由文档](https://nextjs.org/docs/app/building-your-application/routing)
- [App Router 迁移指南](https://nextjs.org/docs/app/building-your-application/upgrading/app-router-migration)

---

**总结**: Next.js 的路由系统非常简单，只需要创建文件夹和 `page.tsx` 文件即可！
