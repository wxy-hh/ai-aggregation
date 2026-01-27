# Next.js 客户端组件 vs 服务端组件

## 📚 核心概念

Next.js 13+ App Router 引入了 **React Server Components (RSC)**，默认所有组件都是**服务端组件**。

### 默认行为

```tsx
// app/page.tsx
// ✅ 默认是服务端组件（不需要任何标记）
export default function Page() {
  return <div>这是服务端组件</div>;
}
```

## 🎯 何时需要 'use client'

### 必须使用 'use client' 的情况

当你的组件使用以下特性时，**必须**添加 `'use client'` 指令：

#### 1. React Hooks

```tsx
'use client'; // ✅ 必需

import { useState, useEffect, useRef } from 'react';

export default function Counter() {
  const [count, setCount] = useState(0); // ❌ 没有 'use client' 会报错

  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

**常见 Hooks**:

- `useState`
- `useEffect`
- `useRef`
- `useContext`
- `useReducer`
- `useCallback`
- `useMemo`
- `useLayoutEffect`
- 自定义 hooks

#### 2. 事件处理器

```tsx
'use client'; // ✅ 必需

export default function Button() {
  const handleClick = () => {
    // ❌ 没有 'use client' 会报错
    console.log('clicked');
  };

  return <button onClick={handleClick}>Click me</button>;
}
```

#### 3. 浏览器 API

```tsx
'use client'; // ✅ 必需

export default function Component() {
  useEffect(() => {
    // ❌ 没有 'use client' 会报错
    window.addEventListener('scroll', handleScroll);
    localStorage.setItem('key', 'value');
    document.querySelector('.element');
  }, []);

  return <div>...</div>;
}
```

#### 4. React Context

```tsx
'use client';  // ✅ 必需

import { createContext, useContext } from 'react';

const MyContext = createContext(null);  // ❌ 没有 'use client' 会报错

export function Provider({ children }) {
  return <MyContext.Provider value={...}>{children}</MyContext.Provider>;
}
```

#### 5. 生命周期方法（Class Components）

```tsx
'use client'; // ✅ 必需

import { Component } from 'react';

class MyComponent extends Component {
  // ❌ 没有 'use client' 会报错
  componentDidMount() {
    // ...
  }

  render() {
    return <div>...</div>;
  }
}
```

## ✅ 不需要 'use client' 的情况

### 服务端组件可以做的事

```tsx
// app/page.tsx
// ✅ 不需要 'use client'

// 1. 直接访问数据库
import { prisma } from '@repo/db';

export default async function Page() {
  const users = await prisma.user.findMany();

  return (
    <div>
      {users.map((user) => (
        <div key={user.id}>{user.name}</div>
      ))}
    </div>
  );
}
```

```tsx
// 2. 使用 async/await
export default async function Page() {
  const data = await fetch('https://api.example.com/data');
  const json = await data.json();

  return <div>{json.title}</div>;
}
```

```tsx
// 3. 访问后端资源
import fs from 'fs';
import path from 'path';

export default async function Page() {
  const filePath = path.join(process.cwd(), 'data.json');
  const fileContents = fs.readFileSync(filePath, 'utf8');

  return <div>{fileContents}</div>;
}
```

```tsx
// 4. 使用环境变量（服务端）
export default function Page() {
  const apiKey = process.env.SECRET_API_KEY; // ✅ 安全，不会暴露给客户端

  return <div>...</div>;
}
```

## 🔄 混合使用

### 推荐模式：服务端组件包含客户端组件

```tsx
// app/page.tsx
// ✅ 服务端组件（默认）
import ClientButton from './ClientButton';

export default async function Page() {
  // 在服务端获取数据
  const data = await fetchData();

  return (
    <div>
      <h1>{data.title}</h1>
      {/* 嵌入客户端组件 */}
      <ClientButton />
    </div>
  );
}
```

```tsx
// app/ClientButton.tsx
'use client'; // ✅ 客户端组件

import { useState } from 'react';

export default function ClientButton() {
  const [count, setCount] = useState(0);

  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

## 📋 决策树

```
需要使用这个特性吗？
├─ React Hooks (useState, useEffect, etc.)
│  └─ ✅ 需要 'use client'
├─ 事件处理 (onClick, onChange, etc.)
│  └─ ✅ 需要 'use client'
├─ 浏览器 API (window, document, localStorage, etc.)
│  └─ ✅ 需要 'use client'
├─ React Context (createContext, useContext)
│  └─ ✅ 需要 'use client'
├─ Class Components
│  └─ ✅ 需要 'use client'
├─ 直接访问数据库
│  └─ ❌ 不需要（服务端组件）
├─ 使用 Node.js API (fs, path, etc.)
│  └─ ❌ 不需要（服务端组件）
└─ 只是渲染静态内容
   └─ ❌ 不需要（服务端组件）
```

## 🎯 实际示例

### 示例 1: 对话页面（需要 'use client'）

```tsx
'use client'; // ✅ 必需

import { useState } from 'react';

export default function ChatPage() {
  const [messages, setMessages] = useState([]); // 使用 useState
  const [input, setInput] = useState('');

  const handleSend = () => {
    // 事件处理
    setMessages([...messages, input]);
  };

  return (
    <div>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)} // 事件处理
      />
      <button onClick={handleSend}>发送</button>
    </div>
  );
}
```

### 示例 2: 数据展示页面（不需要 'use client'）

```tsx
// ❌ 不需要 'use client'

import { prisma } from '@repo/db';

export default async function TasksPage() {
  // 在服务端获取数据
  const tasks = await prisma.task.findMany();

  return (
    <div>
      {tasks.map((task) => (
        <div key={task.id}>{task.title}</div>
      ))}
    </div>
  );
}
```

### 示例 3: 混合模式（推荐）

```tsx
// app/tasks/page.tsx
// ❌ 不需要 'use client'（服务端组件）

import { prisma } from '@repo/db';
import TaskCard from './TaskCard'; // 客户端组件

export default async function TasksPage() {
  const tasks = await prisma.task.findMany();

  return (
    <div>
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} />
      ))}
    </div>
  );
}
```

```tsx
// app/tasks/TaskCard.tsx
'use client'; // ✅ 需要（因为有交互）

import { useState } from 'react';

export default function TaskCard({ task }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div onClick={() => setIsExpanded(!isExpanded)}>
      <h3>{task.title}</h3>
      {isExpanded && <p>{task.description}</p>}
    </div>
  );
}
```

## ⚡ 性能优化建议

### 1. 尽量使用服务端组件

```tsx
// ✅ 好 - 服务端组件（更快）
export default async function Page() {
  const data = await fetchData();
  return <div>{data.title}</div>;
}

// ❌ 不好 - 不必要的客户端组件
('use client');
export default function Page() {
  return <div>Static content</div>;
}
```

### 2. 将交互部分拆分为独立的客户端组件

```tsx
// ✅ 好 - 只有按钮是客户端组件
// app/page.tsx (服务端)
import LikeButton from './LikeButton';

export default async function Page() {
  const post = await fetchPost();

  return (
    <article>
      <h1>{post.title}</h1>
      <p>{post.content}</p>
      <LikeButton postId={post.id} /> {/* 只有这个是客户端 */}
    </article>
  );
}

// app/LikeButton.tsx (客户端)
('use client');
export default function LikeButton({ postId }) {
  const [liked, setLiked] = useState(false);
  return <button onClick={() => setLiked(!liked)}>❤️</button>;
}
```

```tsx
// ❌ 不好 - 整个页面都是客户端组件
'use client';

export default function Page() {
  const [liked, setLiked] = useState(false);

  return (
    <article>
      <h1>Title</h1>
      <p>Content</p>
      <button onClick={() => setLiked(!liked)}>❤️</button>
    </article>
  );
}
```

## 🚨 常见错误

### 错误 1: 忘记添加 'use client'

```tsx
// ❌ 错误
import { useState } from 'react';

export default function Counter() {
  const [count, setCount] = useState(0); // 报错！
  return <div>{count}</div>;
}

// 错误信息:
// Error: useState only works in Client Components.
// Add the "use client" directive at the top of the file.
```

**解决方案**:

```tsx
// ✅ 正确
'use client';

import { useState } from 'react';

export default function Counter() {
  const [count, setCount] = useState(0);
  return <div>{count}</div>;
}
```

### 错误 2: 在服务端组件中使用浏览器 API

```tsx
// ❌ 错误
export default function Page() {
  const width = window.innerWidth; // 报错！服务端没有 window
  return <div>{width}</div>;
}
```

**解决方案**:

```tsx
// ✅ 正确
'use client';

import { useEffect, useState } from 'react';

export default function Page() {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    setWidth(window.innerWidth);
  }, []);

  return <div>{width}</div>;
}
```

### 错误 3: 在客户端组件中直接访问数据库

```tsx
// ❌ 错误
'use client';

import { prisma } from '@repo/db';

export default function Page() {
  const users = await prisma.user.findMany(); // 报错！客户端不能访问数据库
  return <div>...</div>;
}
```

**解决方案**:

```tsx
// ✅ 正确 - 在服务端组件中获取数据
// app/page.tsx (服务端)
import { prisma } from '@repo/db';
import UserList from './UserList';

export default async function Page() {
  const users = await prisma.user.findMany();
  return <UserList users={users} />;
}

// app/UserList.tsx (客户端)
('use client');

export default function UserList({ users }) {
  const [filter, setFilter] = useState('');
  // ... 客户端交互逻辑
}
```

## 📚 总结

| 特性             | 服务端组件 | 客户端组件           |
| ---------------- | ---------- | -------------------- |
| 默认             | ✅ 是      | ❌ 需要 'use client' |
| React Hooks      | ❌         | ✅                   |
| 事件处理         | ❌         | ✅                   |
| 浏览器 API       | ❌         | ✅                   |
| 数据库访问       | ✅         | ❌                   |
| Node.js API      | ✅         | ❌                   |
| async/await      | ✅         | ❌ (在组件层面)      |
| 环境变量（私密） | ✅         | ❌                   |
| SEO 友好         | ✅         | ⚠️                   |
| 初始加载速度     | ✅ 更快    | ⚠️ 较慢              |
| 交互性           | ❌         | ✅                   |

## 🎯 最佳实践

1. **默认使用服务端组件**，只在需要交互时使用客户端组件
2. **将客户端组件推到组件树的叶子节点**
3. **在服务端组件中获取数据**，通过 props 传递给客户端组件
4. **不要过度使用 'use client'**，这会增加 JavaScript bundle 大小

---

**记住**: 在 Next.js App Router 中，使用 React Hooks 就必须添加 `'use client'`！
