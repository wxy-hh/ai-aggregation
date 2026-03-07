# 响应式布局实现说明

## 概述

本文档说明简历编辑器在不同视口宽度下的响应式布局实现，特别是 1024-1439px 视口下的双栏布局和 AI 助手抽屉功能。

## 响应式断点

根据需求 9，简历编辑器支持以下三种布局模式：

### 1. 桌面三栏布局（>= 1440px）

- **编辑区**：固定宽度 380px（2xl 断点为 420px）
- **预览区**：弹性宽度，居中显示
- **AI 助手面板**：固定宽度 360px（2xl 断点为 400px）

```
┌────────┬──────────┬────────┐
│ 编辑区 │  预览区  │ AI面板 │
│ 380px  │  flex-1  │ 360px  │
└────────┴──────────┴────────┘
```

### 2. 平板双栏布局（1024-1439px）

- **编辑区**：固定宽度 380px
- **预览区**：弹性宽度，居中显示
- **AI 助手**：通过抽屉显示，点击浮动按钮打开

```
┌────────┬──────────┐     ┌────────┐
│ 编辑区 │  预览区  │ ... │AI 抽屉 │
│ 380px  │  flex-1  │     │ 400px  │
└────────┴──────────┘     └────────┘
         [AI 按钮]
```

### 3. 移动单栏布局（< 1024px）

- **编辑区**：全宽显示
- **预览区**：隐藏（通过标签页切换）
- **AI 助手**：隐藏（通过标签页切换）

```
┌──────────────┐
│   编辑区     │
│   100%       │
└──────────────┘
```

## 核心组件

### AIDrawer（AI 抽屉）

**文件位置**：`_components/ai-drawer.tsx`

**功能**：

- 从右侧滑入/滑出的抽屉面板
- 包含完整的 AI 助手功能
- 支持点击遮罩层或按 Escape 键关闭
- 使用 Framer Motion 实现流畅动画

**动画配置**：

```typescript
{
  initial: { x: '100%' },
  animate: { x: 0 },
  exit: { x: '100%' },
  transition: {
    type: 'spring',
    damping: 30,
    stiffness: 300,
  }
}
```

### AIDrawerTrigger（抽屉触发按钮）

**文件位置**：`_components/ai-drawer-trigger.tsx`

**功能**：

- 浮动在页面右下角
- 仅在 1024-1439px 视口显示（`lg:block xl:hidden`）
- 点击打开 AI 助手抽屉
- 支持徽章提示（可选）

**样式特点**：

- 科技蓝背景色（#2F6BFF）
- 圆形按钮，带阴影效果
- 悬停时放大和阴影增强
- 包含悬停提示文本

## 实现细节

### 响应式类名

**编辑面板**：

```tsx
className = 'w-full lg:w-[380px] xl:w-[380px] 2xl:w-[420px]';
```

**预览区**：

```tsx
className = 'hidden lg:flex';
```

**AI 面板**：

```tsx
className = 'hidden xl:block';
```

**抽屉触发按钮**：

```tsx
className = 'lg:block xl:hidden';
```

### 状态管理

在主页面组件中使用 `useState` 管理抽屉开关状态：

```typescript
const [isDrawerOpen, setIsDrawerOpen] = useState(false);
```

### 无障碍支持

- 抽屉使用 `role="dialog"` 和 `aria-modal="true"`
- 触发按钮有 `aria-label="打开 AI 助手"`
- 关闭按钮有 `aria-label="关闭 AI 助手"`
- 支持 Escape 键关闭抽屉
- 抽屉打开时禁止背景滚动

## 测试

响应式布局测试位于：`__tests__/responsive-layout.test.tsx`

测试覆盖：

- 响应式断点类名验证
- 不同断点下的布局行为
- 抽屉宽度和位置
- 抽屉动画配置

运行测试：

```bash
npm test responsive-layout.test.tsx
```

## 使用示例

### 打开抽屉

```typescript
<AIDrawerTrigger onClick={() => setIsDrawerOpen(true)} />
```

### 关闭抽屉

```typescript
<AIDrawer
  isOpen={isDrawerOpen}
  onClose={() => setIsDrawerOpen(false)}
/>
```

## 注意事项

1. **性能优化**：抽屉使用 `AnimatePresence` 确保退出动画完成后才卸载组件
2. **滚动管理**：抽屉打开时自动禁止背景滚动，关闭时恢复
3. **焦点管理**：抽屉打开时焦点自动移到抽屉内容
4. **响应式测试**：建议在不同设备和浏览器宽度下测试布局效果

## 相关需求

- **需求 9.2**：WHEN 视口宽度在 1024px 至 1439px 之间，THE Resume_Editor SHALL 隐藏 AI_Assistant，显示两栏布局
