# Monorepo 包管理指南

## 📦 已安装的包

### Web 应用新增包

刚刚为你安装了以下 Markdown 渲染相关的包：

- `react-markdown` - React Markdown 渲染组件
- `remark-gfm` - GitHub Flavored Markdown 支持
- `rehype-highlight` - 代码高亮插件

## 🎯 添加新包的标准流程

### 1. 确定包的安装位置

在 Monorepo 中，包应该安装到**使用它的具体应用或包**中，而不是根目录。

#### 安装位置决策树

```
需要添加新包？
├─ 只在 Web 应用使用？
│  └─ 安装到 apps/web
├─ 只在 Worker 使用？
│  └─ 安装到 apps/worker
├─ 多个应用共享？
│  └─ 安装到 packages/shared（或创建新的共享包）
└─ 开发工具（ESLint、TypeScript 等）？
   └─ 安装到根目录或 packages/config-*
```

### 2. 使用正确的安装命令

#### 为特定应用安装包

```bash
# 为 Web 应用安装
pnpm --filter @repo/web add <package-name>

# 为 Worker 安装
pnpm --filter @repo/worker add <package-name>

# 为共享包安装
pnpm --filter @repo/shared add <package-name>
```

#### 安装开发依赖

```bash
# 添加 -D 标志
pnpm --filter @repo/web add -D <package-name>
```

#### 在根目录安装（仅限工具）

```bash
# 在根目录安装（不推荐用于业务依赖）
pnpm add -w <package-name>
```

### 3. 实际示例

#### 示例 1: 为 Web 添加 UI 库

```bash
# 安装 shadcn/ui 依赖
pnpm --filter @repo/web add @radix-ui/react-dialog
pnpm --filter @repo/web add class-variance-authority clsx tailwind-merge
```

#### 示例 2: 为 Web 添加表单库

```bash
# 已安装的包
pnpm --filter @repo/web add react-hook-form zod
```

#### 示例 3: 为 Worker 添加 PPT 生成库

```bash
# 已安装的包
pnpm --filter @repo/worker add pptxgenjs
```

#### 示例 4: 为共享包添加工具库

```bash
pnpm --filter @repo/shared add date-fns
```

#### 示例 5: 添加类型定义

```bash
# 添加类型定义（开发依赖）
pnpm --filter @repo/web add -D @types/node
```

## 📋 常见包分类

### Web 应用常用包

```bash
# UI 组件
pnpm --filter @repo/web add @radix-ui/react-*

# 状态管理（已安装）
pnpm --filter @repo/web add @tanstack/react-query

# 表单（已安装）
pnpm --filter @repo/web add react-hook-form zod

# 日期处理
pnpm --filter @repo/web add date-fns

# 图标
pnpm --filter @repo/web add lucide-react

# Markdown 渲染（已安装）
pnpm --filter @repo/web add react-markdown remark-gfm rehype-highlight

# 代码高亮样式
pnpm --filter @repo/web add highlight.js
```

### Worker 应用常用包

```bash
# PPT 生成（已安装）
pnpm --filter @repo/worker add pptxgenjs

# 文件处理
pnpm --filter @repo/worker add sharp

# HTTP 请求
pnpm --filter @repo/worker add axios
```

### 共享包常用包

```bash
# 验证（已安装）
pnpm --filter @repo/shared add zod

# 工具函数
pnpm --filter @repo/shared add lodash-es
pnpm --filter @repo/shared add -D @types/lodash-es
```

## 🔍 查看已安装的包

### 查看特定应用的依赖

```bash
# 查看 Web 应用的依赖
pnpm --filter @repo/web list

# 查看 Worker 的依赖
pnpm --filter @repo/worker list

# 查看所有依赖（包括间接依赖）
pnpm --filter @repo/web list --depth=Infinity
```

### 查看包的版本

```bash
# 查看特定包的版本
pnpm --filter @repo/web list react-markdown
```

### 查看整个 Monorepo 的依赖

```bash
# 查看所有工作区的依赖
pnpm list -r
```

## 🔄 更新包

### 更新特定包

```bash
# 更新 Web 应用的特定包
pnpm --filter @repo/web update react-markdown

# 更新到最新版本
pnpm --filter @repo/web update react-markdown --latest
```

### 更新所有包

```bash
# 更新所有工作区的依赖
pnpm update -r

# 更新到最新版本（谨慎使用）
pnpm update -r --latest
```

### 检查过时的包

```bash
# 检查 Web 应用的过时包
pnpm --filter @repo/web outdated

# 检查所有工作区
pnpm outdated -r
```

## 🗑️ 删除包

### 删除特定包

```bash
# 从 Web 应用删除
pnpm --filter @repo/web remove react-markdown

# 从 Worker 删除
pnpm --filter @repo/worker remove pptxgenjs
```

## ⚠️ 常见问题

### 问题 1: 包安装后找不到

**原因**: 可能安装到了错误的位置

**解决方案**:

```bash
# 检查包是否在正确的 package.json 中
cat apps/web/package.json | grep "react-markdown"

# 如果不在，重新安装到正确位置
pnpm --filter @repo/web add react-markdown
```

### 问题 2: 类型定义找不到

**原因**: 缺少 @types 包

**解决方案**:

```bash
# 安装类型定义
pnpm --filter @repo/web add -D @types/react-markdown
```

### 问题 3: 版本冲突

**原因**: 不同工作区使用了不同版本

**解决方案**:

```bash
# 查看所有工作区的版本
pnpm list -r react

# 统一版本（在根 package.json 中指定）
# 或使用 pnpm overrides
```

### 问题 4: pnpm-lock.yaml 冲突

**解决方案**:

```bash
# 删除 lock 文件并重新安装
rm pnpm-lock.yaml
pnpm install
```

## 📝 最佳实践

### 1. 依赖就近原则

只在需要的地方安装依赖，避免在根目录安装业务依赖。

```bash
# ✅ 推荐
pnpm --filter @repo/web add axios

# ❌ 不推荐（除非是工具）
pnpm add -w axios
```

### 2. 使用精确版本（可选）

对于关键依赖，可以锁定版本：

```json
{
  "dependencies": {
    "react": "19.0.0", // 精确版本
    "next": "^15.1.4" // 允许小版本更新
  }
}
```

### 3. 定期更新依赖

```bash
# 每月检查一次
pnpm outdated -r

# 更新非破坏性版本
pnpm update -r
```

### 4. 使用 workspace 协议

对于内部包，使用 `workspace:*`：

```json
{
  "dependencies": {
    "@repo/shared": "workspace:*",
    "@repo/db": "workspace:*"
  }
}
```

### 5. 分离开发依赖

```bash
# 开发依赖使用 -D
pnpm --filter @repo/web add -D @types/node typescript

# 生产依赖不加 -D
pnpm --filter @repo/web add react
```

## 🎯 你的情况

### 刚刚安装的包

```bash
# 已执行
pnpm --filter @repo/web add react-markdown remark-gfm rehype-highlight
```

### 使用方式

```tsx
// apps/web/src/app/chat/ChatPage.tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

// 使用
<ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
  {content}
</ReactMarkdown>;
```

### 可能还需要的包

```bash
# 代码高亮样式
pnpm --filter @repo/web add highlight.js

# 然后在 layout.tsx 或 globals.css 中导入样式
# import 'highlight.js/styles/github-dark.css';
```

## 📚 参考资源

- [pnpm 文档](https://pnpm.io/zh/)
- [pnpm workspace](https://pnpm.io/zh/workspaces)
- [Turborepo 依赖管理](https://turbo.build/repo/docs/handbook/package-installation)

## 🔧 快速命令参考

```bash
# 安装
pnpm --filter <workspace> add <package>
pnpm --filter <workspace> add -D <package>

# 删除
pnpm --filter <workspace> remove <package>

# 更新
pnpm --filter <workspace> update <package>

# 查看
pnpm --filter <workspace> list
pnpm --filter <workspace> outdated

# 全局操作
pnpm install          # 安装所有依赖
pnpm update -r        # 更新所有工作区
pnpm list -r          # 列出所有工作区依赖
```

---

**记住**: 在 Monorepo 中，始终使用 `--filter` 指定工作区！
