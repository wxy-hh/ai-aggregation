---
name: shadcn-ui shadcn/ui 组件
description: 集成和构建 shadcn/ui 组件应用的专家指导。帮助发现、安装、自定义和优化 shadcn/ui 组件，提供 React 应用的最佳实践。
license: Apache 2.0
---

# shadcn/ui 组件技能

这个技能提供使用 shadcn/ui 组件库的全面指导，帮助你高效地集成、自定义和优化 shadcn/ui 组件。

## 主要功能

### 1. 组件发现

- 浏览 shadcn/ui 组件库
- 了解各组件的功能和用途
- 选择适合项目需求的组件

### 2. 组件安装

- 指导组件的安装流程
- 配置必要的依赖
- 设置主题和样式系统

### 3. 组件自定义

- 自定义组件样式
- 调整组件行为
- 创建组件变体

### 4. 最佳实践

- 遵循 shadcn/ui 推荐的使用方式
- 优化组件性能
- 确保可访问性

## 使用场景

当你需要进行以下工作时，使用此技能：

- 在 React 项目中集成 shadcn/ui
- 构建基于 shadcn/ui 的组件系统
- 自定义 shadcn/ui 组件样式
- 学习 shadcn/ui 最佳实践

## 工作流程

1. **项目初始化**：设置 shadcn/ui 环境
2. **组件选择**：选择需要的组件
3. **组件安装**：使用 CLI 安装组件
4. **样式配置**：配置主题和设计令牌
5. **组件使用**：在应用中使用组件
6. **自定义优化**：根据需求自定义组件

## 前置要求

- React 项目（Next.js、Vite 等）
- Tailwind CSS 配置
- Node.js 和 npm/pnpm/yarn
- 基本的 React 和 TypeScript 知识

## shadcn/ui 特点

- **复制粘贴架构**：组件代码直接添加到项目中
- **完全可定制**：拥有组件的完整控制权
- **基于 Radix UI**：可访问性和功能完善
- **Tailwind CSS**：使用 Tailwind 进行样式化
- **TypeScript 支持**：完整的类型定义

## 常用组件

- **Button**：按钮组件，支持多种变体
- **Card**：卡片容器组件
- **Dialog**：对话框/模态框
- **Form**：表单组件，集成 react-hook-form
- **Input**：输入框组件
- **Select**：下拉选择组件
- **Table**：表格组件
- **Toast**：通知提示组件
- **Dropdown Menu**：下拉菜单
- **Tabs**：标签页组件

## 安装示例

```bash
# 初始化 shadcn/ui
npx shadcn@latest init

# 添加组件
npx shadcn@latest add button
npx shadcn@latest add card
npx shadcn@latest add dialog
```

## 使用示例

```tsx
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function Example() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>示例卡片</CardTitle>
      </CardHeader>
      <CardContent>
        <Button>点击我</Button>
      </CardContent>
    </Card>
  );
}
```

## 主题自定义

shadcn/ui 使用 CSS 变量进行主题配置：

```css
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  /* 更多变量... */
}
```

## 最佳实践

- 使用 CLI 安装组件而非手动复制
- 保持组件代码在项目中以便自定义
- 遵循 Tailwind CSS 的最佳实践
- 使用 TypeScript 获得类型安全
- 测试组件的可访问性
- 创建组件的 Storybook 文档
- 保持组件的一致性和可复用性
- 定期更新组件以获取新功能和修复
