# QueryClient 错误修复

## 问题

页面报错：

```
Uncaught Error: No QueryClient set, use QueryClientProvider to set one
at useQueryClient (QueryClientProvider.js:21:15)
at useUploadVoice (use-voice-transcriptions.ts:27:37)
```

## 原因

React Query 需要在应用的顶层包裹 `QueryClientProvider`，但是根布局 (`app/layout.tsx`) 中没有配置。

## 解决方案

### 1. 创建 QueryProvider 组件

**文件**: `apps/web/src/components/providers/query-provider.tsx`

```typescript
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 分钟
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

**配置说明**:

- `staleTime: 60 * 1000`: 数据在 1 分钟内被认为是新鲜的，不会自动重新获取
- `refetchOnWindowFocus: false`: 窗口重新获得焦点时不自动重新获取数据

### 2. 更新根布局

**文件**: `apps/web/src/app/layout.tsx`

**添加导入**:

```typescript
import { QueryProvider } from '@/components/providers/query-provider';
```

**包裹 children**:

```typescript
<body className={dmSans.className}>
  <ThemeInitializer />
  <QueryProvider>{children}</QueryProvider>
</body>
```

### 3. 创建索引文件

**文件**: `apps/web/src/components/providers/index.ts`

```typescript
export { QueryProvider } from './query-provider';
```

## 验证

### 1. 类型检查

```bash
cd apps/web
pnpm typecheck
```

应该通过，没有错误。

### 2. 运行应用

```bash
cd apps/web
pnpm dev
```

访问 http://localhost:3000/voice，应该不再有 QueryClient 错误。

### 3. 测试上传功能

1. 点击"上传音频"标签
2. 点击"测试：直接显示结果界面"按钮
3. 或者上传一个真实的音频文件

应该能正常工作，不再报错。

## React Query 配置说明

### QueryClient 配置选项

```typescript
new QueryClient({
  defaultOptions: {
    queries: {
      // 数据新鲜时间（毫秒）
      staleTime: 60 * 1000,

      // 缓存时间（毫秒）
      cacheTime: 5 * 60 * 1000,

      // 窗口重新获得焦点时是否重新获取
      refetchOnWindowFocus: false,

      // 网络重新连接时是否重新获取
      refetchOnReconnect: false,

      // 组件挂载时是否重新获取
      refetchOnMount: true,

      // 失败后重试次数
      retry: 1,

      // 重试延迟（毫秒）
      retryDelay: 1000,
    },
    mutations: {
      // mutation 失败后重试次数
      retry: 0,
    },
  },
});
```

### 为什么使用 useState

```typescript
const [queryClient] = useState(() => new QueryClient(...))
```

- 使用 `useState` 的惰性初始化确保 `QueryClient` 只创建一次
- 避免在每次组件重新渲染时创建新的实例
- 这是 React Query 官方推荐的做法

## 相关文件

- ✅ `apps/web/src/components/providers/query-provider.tsx` - 新建
- ✅ `apps/web/src/components/providers/index.ts` - 新建
- ✅ `apps/web/src/app/layout.tsx` - 已更新

## 后续优化

### 1. 添加 React Query DevTools（可选）

在开发环境中添加 DevTools 方便调试：

```typescript
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

export function QueryProvider({ children }: { children: ReactNode }) {
  // ...
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === 'development' && <ReactQueryDevtools />}
    </QueryClientProvider>
  );
}
```

### 2. 持久化缓存（可选）

使用 `@tanstack/react-query-persist-client` 将查询缓存持久化到 localStorage：

```typescript
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

const persister = createSyncStoragePersister({
  storage: window.localStorage,
});

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient(...));

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
      {children}
    </PersistQueryClientProvider>
  );
}
```

### 3. 全局错误处理

添加全局错误处理：

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      onError: (error) => {
        console.error('Query error:', error);
        // 可以在这里显示全局错误提示
      },
    },
    mutations: {
      onError: (error) => {
        console.error('Mutation error:', error);
        // 可以在这里显示全局错误提示
      },
    },
  },
});
```

## 总结

通过添加 `QueryProvider` 并在根布局中使用，成功解决了 "No QueryClient set" 错误。现在应用可以正常使用 React Query 的所有功能，包括：

- ✅ 数据获取和缓存
- ✅ 自动重新获取
- ✅ 乐观更新
- ✅ 无限滚动
- ✅ 分页
- ✅ Mutations

语音转录功能现在应该可以正常工作了！
