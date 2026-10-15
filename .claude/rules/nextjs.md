---
paths:
  - "apps/web/src/**/*.ts"
  - "apps/web/src/**/*.tsx"
  - "apps/web/src/middleware.ts"
---

# Next.js 15 规范

## 组件边界

- Server Component 是默认选择。只有当需要事件监听、`useState`/`useEffect`/`useContext` 或浏览器 API 时，才添加 `'use client'`。
- 数据获取在 Server Component 中直接 `await`，不包装成客户端 `useQuery`/`useSWR`。
- 需要交互的叶子组件才标记 Client Component，父容器保持 Server Component。

## Route Handler

- API 路由放在 `app/api/<功能>/route.ts`。
- Session/认证校验统一用 `requireAuth()`（见 `lib/auth/require-auth.ts`），不在每个 handler 里手写 cookie 解析。
- 流式响应使用 Vercel AI SDK 的 `streamText`（对话场景）或原生 `ReadableStream`（媒体/文件）。
- 需要用户配额扣减时，使用 `safeRecordAiUsage()`。

## 数据获取

- 推荐在 Server Component 里直接 `fetch` + `React.cache()` 做请求级去重。
- 客户端数据获取用 `lib/api/client.ts` 封装的 `fetchWithAuth`，不要裸写 `fetch`。
- 401 响应由 `fetchWithAuth` 自动走刷新 token 流程，组件层不手动处理。

## 中间件

- 路径守卫统一在 `middleware.ts` 维护。新增需要认证的页面时，检查 `PUBLIC_PATHS` 和受保护路由的匹配逻辑。
- 不要在中间件中做重 IO（数据库查询、外部 API 调用），只做 cookie/token 检查。
- API 路由的认证在 handler 内部用 `requireAuth()` 处理，中间件不拦截 `/api/`。

## 状态管理

- 跨页面共享状态用 Zustand store（`stores/` 目录），不用 React Context。
- 使用 `useShallow` 选择器避免不必要的重渲染。
- Store 只放跨组件/跨页面共享的状态；页面局部状态用 `useState`。

## 构建与部署

- 不要修改 `next.config.js` 中已验证的配置（Prisma、Turbopack 等）。
- Clean URL：使用 App Router 目录结构，不用手动配置 `rewrites`/`redirects`。
- 环境变量通过 `.env.local` 注入，不硬编码。
