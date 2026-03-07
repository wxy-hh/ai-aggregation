# 移动端 Tabs 实现说明

## 概述

本文档说明简历编辑器在小于 1024px 视口下的单栏 Tabs 切换功能实现。

## 设计目标

根据需求 9.3，当视口宽度小于 1024px 时，简历编辑器应该：

- 切换为单栏布局
- 提供标签页切换编辑、预览和 AI 助手
- 保持流畅的切换动画效果
- 符合玻璃态设计风格

## 核心组件

### MobileTabs（移动端标签页导航）

**文件位置**：`_components/mobile-tabs.tsx`

**功能**：

- 固定在页面顶部的标签页导航栏
- 包含三个标签页：编辑、预览、AI 助手
- 每个标签页显示图标和文字标签
- 激活的标签页有底部指示器动画
- 使用科技蓝色（#2F6BFF）作为激活状态的强调色

**样式特点**：

- 玻璃态效果：`backdrop-blur-[20px]`
- 半透明背景：`bg-white/80`
- 固定定位：`fixed top-0 left-0 right-0`
- 仅在移动端显示：`lg:hidden`
- 高度：`h-14`（56px）

**动画效果**：

激活指示器使用 Framer Motion 的 `layoutId` 实现流畅的滑动动画：

```typescript
<motion.div
  layoutId="activeTab"
  className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#2F6BFF]"
  transition={{
    type: 'spring',
    stiffness: 500,
    damping: 30,
  }}
/>
```

**无障碍支持**：

- 每个按钮有 `aria-label` 描述
- 激活的标签页有 `aria-current="page"` 属性
- 支持键盘导航

### MobileTabContent（移动端标签页内容）

**文件位置**：`_components/mobile-tab-content.tsx`

**功能**：

- 根据当前激活的标签页显示对应的内容
- 标签页切换时有流畅的滑动动画
- 内容区域可滚动
- 自动适配不同标签页的布局需求

**布局特点**：

- 顶部内边距：`pt-14`（避免被固定的 Tabs 遮挡）
- 相对定位：`relative`
- 溢出隐藏：`overflow-hidden`
- 仅在移动端显示：`lg:hidden`

**切换动画**：

使用 Framer Motion 的 `AnimatePresence` 实现页面切换动画：

```typescript
const tabVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? '100%' : '-100%',
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction < 0 ? '100%' : '-100%',
    opacity: 0,
  }),
};
```

**内容渲染**：

- **编辑标签页**：显示 `ContentPanel` 组件
- **预览标签页**：显示 `PreviewViewport` 组件，居中显示
- **AI 助手标签页**：显示 `AIAssistantPanel` 组件

## 页面集成

在主页面 `page.tsx` 中的集成方式：

```typescript
// 移动端标签页状态
const [mobileActiveTab, setMobileActiveTab] = useState<TabType>('edit');

// 移动端布局（<1024px）
<div className="lg:hidden relative z-10 flex flex-col h-full">
  {/* 标签页导航 */}
  <MobileTabs
    activeTab={mobileActiveTab}
    onTabChange={setMobileActiveTab}
  />

  {/* 标签页内容 */}
  <MobileTabContent activeTab={mobileActiveTab} />
</div>
```

## 响应式断点

移动端 Tabs 布局仅在以下条件下显示：

- **视口宽度**：< 1024px
- **Tailwind 断点**：使用 `lg:hidden` 类名
- **桌面端**：>= 1024px 时自动隐藏，显示双栏或三栏布局

## 用户体验优化

### 1. 流畅的动画

- 标签页切换使用弹簧动画（spring animation）
- 激活指示器滑动流畅自然
- 内容切换有淡入淡出效果

### 2. 视觉反馈

- 激活的标签页使用科技蓝色高亮
- 未激活的标签页使用灰色
- 底部指示器清晰标识当前位置

### 3. 性能优化

- 使用 `AnimatePresence` 的 `mode="wait"` 避免内容重叠
- 内容区域使用绝对定位减少重排
- 动画使用 GPU 加速属性（transform、opacity）

### 4. 无障碍访问

- 所有交互元素支持键盘导航
- 提供清晰的 ARIA 标签
- 激活状态有明确的语义标记

## 测试覆盖

### MobileTabs 测试

测试文件：`__tests__/mobile-tabs.test.tsx`

测试覆盖：

- ✅ 渲染所有三个标签页
- ✅ 高亮显示当前激活的标签页
- ✅ 点击标签页触发回调
- ✅ 显示正确的图标
- ✅ 响应式类名验证
- ✅ 玻璃态样式验证
- ✅ 固定定位验证
- ✅ 颜色主题验证

### MobileTabContent 测试

测试文件：`__tests__/mobile-tab-content.test.tsx`

测试覆盖：

- ✅ 根据 activeTab 显示正确的内容
- ✅ 响应式类名验证
- ✅ 顶部内边距验证
- ✅ 滚动容器验证

运行测试：

```bash
npm test mobile-tabs.test.tsx
npm test mobile-tab-content.test.tsx
```

## 使用示例

### 基础使用

```typescript
import { useState } from 'react';
import { MobileTabs, MobileTabContent, type TabType } from './_components';

function MyPage() {
  const [activeTab, setActiveTab] = useState<TabType>('edit');

  return (
    <div className="flex flex-col h-full">
      <MobileTabs activeTab={activeTab} onTabChange={setActiveTab} />
      <MobileTabContent activeTab={activeTab} />
    </div>
  );
}
```

### 自定义初始标签页

```typescript
// 默认显示预览标签页
const [activeTab, setActiveTab] = useState<TabType>('preview');
```

### 编程式切换标签页

```typescript
// 切换到 AI 助手标签页
setActiveTab('ai');
```

## 注意事项

1. **固定定位**：MobileTabs 使用固定定位，确保页面有足够的顶部内边距
2. **滚动管理**：每个标签页内容独立滚动，切换时滚动位置会重置
3. **性能考虑**：使用 `AnimatePresence` 确保退出动画完成后才卸载组件
4. **响应式测试**：建议在不同移动设备和浏览器宽度下测试效果

## 相关需求

- **需求 9.3**：WHEN 视口宽度小于 1024px，THE Resume_Editor SHALL 切换为单栏布局，提供标签页切换编辑、预览和 AI 助手
- **需求 8.3**：THE Module_Card SHALL 应用 Glassmorphism 效果
- **需求 12**：动画性能优化要求

## 未来改进

可能的优化方向：

1. **手势支持**：添加左右滑动手势切换标签页
2. **状态持久化**：记住用户最后访问的标签页
3. **徽章提示**：在 AI 助手标签页显示未读建议数量
4. **预加载**：预加载相邻标签页的内容以提升切换速度
