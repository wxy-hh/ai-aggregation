# Resume Template 组件文档

## 玻璃态设计系统实现

本目录包含简历编辑器模板页面的所有组件，实现了完整的玻璃态（Glassmorphism）设计风格。

### 核心设计元素

#### 1. 玻璃态效果（Glassmorphism）

所有主要组件都应用了玻璃态效果，符合需求 1.4 和 8.3：

- **ModuleCard**: `backdrop-blur-[28px]` + 半透明背景
- **AI Assistant Panel**: `backdrop-blur-[28px]` + 半透明背景
- **AI Polish Layer**: `backdrop-blur-[28px]` + 半透明背景
- **Welcome Card**: `backdrop-blur-[28px]` + 渐变背景

#### 2. 网格背景（Grid Background）

页面主容器应用了珍珠白网格背景，符合需求 1.5 和 8.4：

```tsx
// 珍珠白背景色
bg-[#F6F8FF] dark:bg-slate-900

// 网格图案
bg-[linear-gradient(to_right,rgba(0,0,0,0.05)_1px,transparent_1px),
   linear-gradient(to_bottom,rgba(0,0,0,0.05)_1px,transparent_1px)]
bg-[size:2rem_2rem]
```

网格线使用 1px 的浅灰色 `rgba(0,0,0,0.05)`，营造"纸张悬浮在冰面"的视觉效果。

#### 3. 科技蓝强调色（Technology Blue）

使用 `#2F6BFF` 作为强调色和交互反馈色，符合需求 8.2：

- 激活状态边框
- 图标背景
- 按钮和链接
- 发光效果

#### 4. 柔和阴影（Soft Shadow）

所有卡片应用柔和的阴影效果，符合需求 8.6：

```tsx
shadow-[0_8px_32px_rgba(0,0,0,0.08)]
```

### 组件列表

#### ContentPanel

左侧内容编辑面板，包含：

- 欢迎提示卡片（带玻璃态效果）
- 模块卡片列表（个人信息、工作经历、教育背景）

#### ResumeInput

简历编辑器专用输入框组件，具有以下特性：

- **聚焦内发光效果**：使用科技蓝色 (#2F6BFF) 的 inset box-shadow
- **150ms 平滑过渡**：聚焦和失焦动画
- **玻璃态设计**：半透明背景 + backdrop-blur
- **完整表单支持**：标签、错误提示、辅助文本、必填标记

**使用示例：**

```tsx
<ResumeInput label="姓名" placeholder="请输入您的姓名" required helperText="请输入真实姓名" />
```

**验收标准（需求 2）：**

- ✅ 聚焦时产生科技蓝色的内发光效果
- ✅ 使用 #2F6BFF 作为聚焦状态的发光颜色
- ✅ 在 150ms 内完成聚焦动画过渡
- ✅ 失焦时在 150ms 内移除发光效果

#### ResumeTextarea

简历编辑器专用文本域组件，特性与 ResumeInput 相同，适用于多行文本输入。

**使用示例：**

```tsx
<ResumeTextarea
  label="工作描述"
  placeholder="描述您的主要职责和工作成果..."
  rows={6}
  required
  helperText="建议包含：职责描述、关键成果、使用技术栈"
/>
```

#### ModuleCard

可折叠的模块卡片组件，特性：

- 玻璃态效果：`backdrop-blur-[28px]`
- 激活状态：科技蓝边框 + 完全不透明
- 未激活状态：透明度降低 30%（opacity: 0.7）
- 300ms 平滑展开/折叠动画
- 悬停效果：轻微缩放（scale: 1.01）

#### PreviewViewport

中间 A4 预览区域（占位实现）

#### AIAssistantPanel

右侧 AI 诊断助手面板（占位实现）

#### SaveStatusIndicator

保存状态指示器，固定在右上角

#### AIPolishLayer

AI 润色浮层（占位实现）

### 测试覆盖

#### ResumeInput 测试

- ✅ 基本渲染和属性传递
- ✅ 标签和必填标记显示
- ✅ 错误信息和辅助文本显示
- ✅ 用户输入交互
- ✅ 聚焦样式类验证（#2F6BFF 内发光）
- ✅ 禁用状态
- ✅ 自定义 className 支持

#### ResumeTextarea 测试

- ✅ 基本渲染和属性传递
- ✅ 标签和必填标记显示
- ✅ 错误信息和辅助文本显示
- ✅ 用户输入交互
- ✅ 聚焦样式类验证（#2F6BFF 内发光）
- ✅ 禁用状态
- ✅ 行数设置
- ✅ 自定义 className 支持

#### ModuleCard 测试

- ✅ 基本渲染和属性传递
- ✅ 激活/非激活状态切换
- ✅ 点击交互
- ✅ 玻璃态样式验证（backdrop-blur-[28px]）
- ✅ 科技蓝边框验证
- ✅ 阴影效果验证
- ✅ 透明度变化验证

#### Page 测试

- ✅ 页面结构渲染
- ✅ 珍珠白背景色（#F6F8FF）
- ✅ 网格背景效果
- ✅ 三栏布局容器
- ✅ 保存状态指示器定位

### 设计规范符合性

| 需求 | 描述                       | 状态 |
| ---- | -------------------------- | ---- |
| 1.2  | 300ms 滑入动效             | ✅   |
| 1.3  | 未选中模块透明度降低 30%   | ✅   |
| 1.4  | backdrop-filter blur(28px) | ✅   |
| 1.5  | 珍珠白网格背景 #F6F8FF     | ✅   |
| 2.1  | 聚焦时科技蓝色内发光       | ✅   |
| 2.2  | 使用 #2F6BFF 发光颜色      | ✅   |
| 2.3  | 150ms 聚焦动画过渡         | ✅   |
| 2.4  | 150ms 失焦动画过渡         | ✅   |
| 8.1  | 珍珠白主背景色             | ✅   |
| 8.2  | 科技蓝强调色 #2F6BFF       | ✅   |
| 8.3  | Glassmorphism 效果         | ✅   |
| 8.4  | 网格图案 1px 浅灰色        | ✅   |
| 8.5  | 悬停透明度变化 150ms       | ✅   |
| 8.6  | 柔和阴影效果               | ✅   |

### 性能优化

- 使用 Framer Motion 的 `layout` 属性实现流畅的布局动画
- GPU 加速属性（transform、opacity）
- 合理的动画时长（150ms-300ms）
- 避免不必要的重渲染

### 无障碍支持

- 所有交互元素支持键盘导航
- 清晰的焦点状态指示
- 语义化的 HTML 结构
- 适当的颜色对比度

### 响应式设计

- `>=1440px`: 三栏布局
- `1024px-1439px`: 双栏布局（隐藏 AI 面板）
- `<1024px`: 单栏布局（标签页切换）

### 开发指南

#### 添加新的玻璃态组件

```tsx
<div
  className="
  backdrop-blur-[28px]
  bg-white/90 dark:bg-slate-800/90
  border border-white/60 dark:border-slate-700/60
  shadow-[0_8px_32px_rgba(0,0,0,0.08)]
  rounded-2xl
"
>
  {/* 组件内容 */}
</div>
```

#### 应用科技蓝强调色

```tsx
// 边框
border-[#2F6BFF]/30

// 背景
bg-[#2F6BFF]/10

// 文字
text-[#2F6BFF]
```

#### 实现平滑动画

```tsx
<motion.div
  initial={{ opacity: 0, y: 10 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
>
  {/* 内容 */}
</motion.div>
```

### 相关文档

- [需求文档](/.kiro/specs/resume-editor-glassmorphism/requirements.md)
- [设计文档](/.kiro/specs/resume-editor-glassmorphism/design.md)
- [任务清单](/.kiro/specs/resume-editor-glassmorphism/tasks.md)
