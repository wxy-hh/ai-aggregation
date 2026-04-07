---
name: react-components React 组件
description: 将 Stitch 屏幕转换为 React 组件系统，具有自动化验证和设计令牌一致性。
license: Apache 2.0
---

# React 组件技能

这个技能专注于将 Stitch 生成的设计屏幕转换为可复用的 React 组件系统，确保代码质量和设计一致性。

## 主要功能

### 1. 组件转换

- 将 Stitch HTML 转换为 React 组件
- 识别可复用的 UI 模式
- 创建组件层级结构

### 2. 自动化验证

- 验证生成的 React 代码语法
- 检查组件的 props 类型
- 确保组件的可复用性

### 3. 设计令牌一致性

- 提取和应用设计令牌
- 保持颜色、字体、间距的一致性
- 生成主题配置文件

### 4. 最佳实践应用

- 遵循 React 最佳实践
- 实现组件的可访问性
- 优化组件性能

## 使用场景

当你需要进行以下工作时，使用此技能：

- 将设计稿转换为 React 代码
- 构建可复用的组件库
- 从 Stitch 迁移到 React 应用
- 标准化前端组件开发

## 工作流程

1. **设计分析**：分析 Stitch 屏幕的结构和元素
2. **组件识别**：识别可复用的 UI 模式
3. **代码生成**：生成 React 组件代码
4. **令牌提取**：提取设计令牌并创建主题
5. **验证测试**：验证组件的正确性和可用性
6. **优化调整**：根据需要进行代码优化

## 前置要求

- Stitch 生成的设计屏幕
- React 项目环境
- 了解 React 基础知识
- 可选：TypeScript 支持

## 生成的组件结构

```
components/
├── Button/
│   ├── Button.tsx
│   ├── Button.types.ts
│   └── Button.module.css
├── Card/
│   ├── Card.tsx
│   ├── Card.types.ts
│   └── Card.module.css
└── theme/
    ├── colors.ts
    ├── typography.ts
    └── spacing.ts
```

## 组件特性

- **类型安全**：使用 TypeScript 定义 props 类型
- **样式隔离**：使用 CSS Modules 或 styled-components
- **可访问性**：遵循 ARIA 标准
- **响应式**：支持多种屏幕尺寸
- **可测试**：易于编写单元测试

## 最佳实践

- 保持组件的单一职责
- 使用 props 进行组件配置
- 提取共享的设计令牌
- 编写清晰的组件文档
- 实现组件的可访问性
- 考虑组件的性能优化
- 使用 Storybook 展示组件
