---
paths:
  - "apps/web/src/components/**/*.tsx"
  - "apps/web/src/app/**/*.tsx"
  - "apps/web/src/styles/**/*.css"
---

# UI 规范

> 视觉与交互标准以根目录 `DESIGN.md` 为唯一标准，写 UI 前必须先读。
> 本文件只管 Tailwind/shadcn 的工程用法纪律；两者冲突时以 `DESIGN.md` 为准。
> 默认新页面一律遵守 `DESIGN.md`，除非用户明确要求自由发挥或指定 UI 效果。

## shadcn/ui 组件使用

- 基础 UI 组件统一用 `components/ui/` 下已安装的 shadcn 组件，不手写替代品。
- 业务组件封装在 `components/<功能>/` 目录，不在 `components/ui/` 里写业务逻辑。
- 覆盖 shadcn 组件样式时通过 `className` 传参，不改动原始组件文件（`button.tsx`、`dialog.tsx` 等）。
- 组件的 `asChild` 属性优先于嵌套包裹。

## Tailwind CSS 约定

- 使用 `cn()` 工具函数（`@/lib/utils`）合并 className，不手工拼接字符串。
- 颜色使用 Tailwind 语义色板（`primary`、`muted`、`destructive`、`accent`），不直接用 `#` 十六进制。
- 避免深层任意值（如 `top-[calc(50%-12px)]`），改用 CSS 变量或 `inset-` 工具类。
- `z-index` 使用 Tailwind 层级：dropdown(50)、modal(60)、toast(70)，不跳过层级。
- 暗色模式通过 `dark:` 前缀处理，不在组件内写 JS 条件判断。

## 组件设计原则

- 每个文件只导出 1 个主要组件，辅以同文件中相关子组件。
- 业务组件从 `components/<功能>/` 导入，页面组件从 `app/<功能>/_components/` 导入。
- 列表、表格、选择器等可交互区域的最小点击热区为 `44x44`。
- 空状态、加载态、错误态和成功态都要处理，不能只覆盖理想路径。

## 移动端优先

- 新增页面从移动端布局开始，用 `sm:`/`md:`/`lg:` 渐进增强。
- 底部区域（输入框、录音按钮、底部导航）适配 safe-area：`pb-safe` 或 `style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}`。
- 侧边栏交互在移动端替换为底部抽屉（`components/layout/mobile-app-drawer.tsx`）或底部导航（`components/layout/mobile-bottom-nav.tsx`）。

## 响应式模式

- 分段控制器/复杂配置面板在小屏放入 `Dialog` 或 Drawer，不在页面上全部展开。
- 图片预览、视频播放器等媒体组件默认宽高比锁定，用 `aspect-video` / `aspect-square`。
- 悬停提示（Tooltip、Hover Card）只作为桌面端增强，移动端必须有点击触达的替代方式。
