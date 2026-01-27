# 前端目录结构说明

## 📁 当前目录结构

```
apps/web/src/
├── app/                          # Next.js App Router 页面
│   ├── layout.tsx                # 根布局（ThemeProvider + 字体）
│   ├── page.tsx                  # 首页
│   ├── globals.css               # 全局样式
│   ├── chat/                     # 智能对话
│   │   └── page.tsx
│   ├── voice/                    # 语音转写
│   │   └── page.tsx
│   ├── image/                    # 图像生成
│   │   └── page.tsx
│   ├── history/                  # 历史记录
│   │   └── page.tsx
│   ├── templates/                # 模板库
│   │   └── page.tsx
│
│
├── components/                   # 组件目录（按功能分类）
│   ├── layout/                   # 布局组件
│   │   ├── app-layout.tsx        # 主应用布局（侧边栏 + 内容区）
│   │   └── index.ts              # 导出文件
│   ├── home/                     # 首页组件
│   │   ├── home-content.tsx      # 首页内容
│   │   └── index.ts
│   └── theme/                    # 主题相关
│       ├── theme-provider.tsx    # 主题 Context Provider
│       ├── theme-toggle.tsx      # 主题切换按钮
│       └── index.ts
│
└── lib/                          # 工具函数和配置
    └── mock-data.ts              # 模拟数据
```

## ✅ 优化完成

### 已删除的文件

- ❌ `test-dark.tsx` - 测试文件
- ❌ `home-page-client.tsx` - 已被 `home-content.tsx` 替代

### 组件分类

- **layout/** - 布局相关组件（AppLayout、Sidebar 等）
- **home/** - 首页特定组件
- **theme/** - 主题管理组件

### 索引文件

每个组件目录都有 `index.ts` 文件，简化导入：

```typescript
// 之前
import { ThemeProvider } from '@/components/theme/theme-provider';

// 现在
import { ThemeProvider } from '@/components/theme';
```

## 📝 使用指南

### 添加新页面

1. 在 `app/` 下创建新目录
2. 创建 `page.tsx` 文件
3. 使用 `AppLayout` 包裹内容

```typescript
import { AppLayout } from '@/components/layout';

export default function NewPage() {
  return (
    <AppLayout>
      {/* 页面内容 */}
    </AppLayout>
  );
}
```

### 添加新组件

1. 根据功能分类选择目录（或创建新目录）
2. 创建组件文件
3. 在 `index.ts` 中导出

## ⚠️ 待处理

### tasks 目录

- 这是旧的任务管理页面
- 与新架构不一致
- 建议：
  - 选项 1：删除（如果不需要）
  - 选项 2：重构为使用 AppLayout
  - 选项 3：移到独立的管理后台

## 🎯 架构优势

✅ **清晰的组织结构** - 按功能分类，易于查找
✅ **可维护性强** - 组件职责明确
✅ **易于扩展** - 添加新功能很简单
✅ **符合最佳实践** - 遵循 Next.js 13+ 规范
✅ **减少重复** - 共享布局和组件
✅ **类型安全** - TypeScript 支持完善

## 🔄 下一步优化建议

1. **创建 UI 组件库** - 添加 `components/ui/` 目录
2. **类型定义** - 创建 `types/` 目录
3. **工具函数** - 扩展 `lib/` 目录
4. **路由组** - 使用 `(main)` 路由组共享布局
5. **测试** - 添加 `__tests__/` 目录
