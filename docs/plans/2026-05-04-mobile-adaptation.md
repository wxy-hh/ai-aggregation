# Mobile Adaptation Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 `apps/web` 建立统一的移动端壳层、导航和页面适配方案，并完成核心页面的首轮移动端可用性改造。

**Architecture:** 本次改造采用“先基建、后页面、再收口”的路线。先在 `AppLayout` 层建立统一的移动端导航、抽屉和页面容器，再让 `chat / voice / image / history / video` 逐步接入，最后处理 `home / templates / resume / destiny` 等剩余页面与回归验收。

**Tech Stack:** Next.js 15、React 19、TypeScript、Tailwind CSS、shadcn/ui、Zustand、Vitest、Testing Library

---

## 实施原则

- 每个任务先补测试或最小验证，再做实现
- 每次提交只解决一个清晰问题
- 优先复用现有组件，不重写业务数据流
- 所有新增文案、注释、说明保持中文
- 桌面布局不回退，移动端优先保证主流程可用

## 依赖顺序

1. 先完成响应式基建与壳层改造
2. 再接入核心高频页面
3. 最后接入复杂工作台页面和次级页面
4. 全量跑类型、单测和人工验收

## 建议提交节奏

- `feat(web): add responsive layout foundation`
- `feat(web): add mobile navigation shell`
- `feat(web): adapt chat page for mobile`
- `feat(web): adapt voice page for mobile`
- `feat(web): adapt image page for mobile`
- `feat(web): adapt history page for mobile`
- `feat(web): adapt video page for mobile`
- `feat(web): adapt remaining pages for mobile`
- `test(web): add responsive regression coverage`

---

### Task 1: 建立响应式基础能力

**Files:**
- Create: `apps/web/src/hooks/use-breakpoint.ts`
- Create: `apps/web/src/hooks/use-is-mobile.ts`
- Create: `apps/web/src/hooks/use-safe-area-insets.ts`
- Create: `apps/web/src/hooks/use-breakpoint.test.tsx`
- Modify: `apps/web/src/components/layout/index.ts`

**Step 1: 写失败测试**

在 `apps/web/src/hooks/use-breakpoint.test.tsx` 中覆盖以下场景：

- 默认宽度下返回 `desktop`
- 宽度切换到 `767` 返回 `mobile`
- 宽度切换到 `768` 返回 `tablet`
- 宽度切换到 `1024` 返回 `desktop`
- `useIsMobile()` 在 `mobile` 为 `true`

参考测试骨架：

```tsx
import { renderHook } from '@testing-library/react';
import { useBreakpoint, useIsMobile } from './use-breakpoint';

describe('useBreakpoint', () => {
  it('在 767px 时返回 mobile', () => {
    window.innerWidth = 767;
    window.dispatchEvent(new Event('resize'));

    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toBe('mobile');
  });
});
```

**Step 2: 跑测试确认失败**

Run:

```bash
pnpm --filter @repo/web test -- use-breakpoint.test.tsx
```

Expected:

- FAIL
- 提示模块不存在或 hook 未实现

**Step 3: 写最小实现**

实现要求：

- 统一导出 `mobile | tablet | desktop`
- 监听 `resize`
- SSR 下安全返回默认值
- `useIsMobile()` 仅在 `mobile` 返回 `true`

**Step 4: 跑测试确认通过**

Run:

```bash
pnpm --filter @repo/web test -- use-breakpoint.test.tsx
```

Expected:

- PASS

**Step 5: 提交**

```bash
git add apps/web/src/hooks/use-breakpoint.ts apps/web/src/hooks/use-is-mobile.ts apps/web/src/hooks/use-safe-area-insets.ts apps/web/src/hooks/use-breakpoint.test.tsx apps/web/src/components/layout/index.ts
git commit -m "feat(web): add responsive breakpoint hooks"
```

---

### Task 2: 搭建移动端全局壳层

**Files:**
- Modify: `apps/web/src/components/layout/app-layout.tsx`
- Modify: `apps/web/src/components/layout/global-sidebar.tsx`
- Create: `apps/web/src/components/layout/mobile-header.tsx`
- Create: `apps/web/src/components/layout/mobile-bottom-nav.tsx`
- Create: `apps/web/src/components/layout/mobile-app-drawer.tsx`
- Create: `apps/web/src/components/layout/app-layout.test.tsx`
- Modify: `apps/web/src/components/layout/index.ts`

**Step 1: 写失败测试**

在 `app-layout.test.tsx` 中覆盖以下场景：

- 桌面宽度显示 `GlobalSidebar`
- 移动宽度隐藏桌面侧栏
- 移动宽度显示顶部栏和底部导航
- 点击“更多”按钮能打开移动抽屉

测试骨架：

```tsx
import { render, screen } from '@testing-library/react';
import { AppLayout } from './app-layout';

it('移动端显示底部导航', () => {
  window.innerWidth = 375;
  window.dispatchEvent(new Event('resize'));

  render(<AppLayout><div>内容</div></AppLayout>);
  expect(screen.getByRole('navigation')).toBeInTheDocument();
});
```

**Step 2: 跑测试确认失败**

Run:

```bash
pnpm --filter @repo/web test -- app-layout.test.tsx
```

Expected:

- FAIL
- 缺少移动端导航或测试查询不到元素

**Step 3: 写最小实现**

实现要求：

- `desktop` 保留 `GlobalSidebar`
- `mobile/tablet` 显示 `MobileHeader` 与 `MobileBottomNav`
- “更多”入口打开 `MobileAppDrawer`
- `main` 区域为统一内容容器
- 预留底部导航安全区

**Step 4: 跑测试确认通过**

Run:

```bash
pnpm --filter @repo/web test -- app-layout.test.tsx
```

Expected:

- PASS

**Step 5: 提交**

```bash
git add apps/web/src/components/layout/app-layout.tsx apps/web/src/components/layout/global-sidebar.tsx apps/web/src/components/layout/mobile-header.tsx apps/web/src/components/layout/mobile-bottom-nav.tsx apps/web/src/components/layout/mobile-app-drawer.tsx apps/web/src/components/layout/app-layout.test.tsx apps/web/src/components/layout/index.ts
git commit -m "feat(web): add mobile app shell"
```

---

### Task 3: 建立统一页面容器与响应式面板

**Files:**
- Create: `apps/web/src/components/layout/page-shell.tsx`
- Create: `apps/web/src/components/layout/page-header.tsx`
- Create: `apps/web/src/components/layout/page-body.tsx`
- Create: `apps/web/src/components/layout/responsive-panel.tsx`
- Create: `apps/web/src/components/layout/sticky-action-bar.tsx`
- Create: `apps/web/src/components/layout/responsive-panel.test.tsx`
- Modify: `apps/web/src/components/layout/index.ts`

**Step 1: 写失败测试**

覆盖以下场景：

- `ResponsivePanel` 在桌面渲染为内联面板
- `ResponsivePanel` 在移动端渲染为抽屉
- `StickyActionBar` 挂载后包含传入内容

**Step 2: 跑测试确认失败**

Run:

```bash
pnpm --filter @repo/web test -- responsive-panel.test.tsx
```

Expected:

- FAIL

**Step 3: 写最小实现**

实现要求：

- `ResponsivePanel` 支持 `desktop` 内联、`mobile` 抽屉
- 抽屉复用现有 `dialog` / `sheet` 体系，避免新引第三方依赖
- `PageShell` 统一处理 `min-h-dvh`、`px-4`、底部安全区
- `PageHeader` 支持标题、副标题、右侧操作区

**Step 4: 跑测试确认通过**

Run:

```bash
pnpm --filter @repo/web test -- responsive-panel.test.tsx
```

Expected:

- PASS

**Step 5: 提交**

```bash
git add apps/web/src/components/layout/page-shell.tsx apps/web/src/components/layout/page-header.tsx apps/web/src/components/layout/page-body.tsx apps/web/src/components/layout/responsive-panel.tsx apps/web/src/components/layout/sticky-action-bar.tsx apps/web/src/components/layout/responsive-panel.test.tsx apps/web/src/components/layout/index.ts
git commit -m "feat(web): add responsive layout primitives"
```

---

### Task 4: 改造聊天页移动端结构

**Files:**
- Modify: `apps/web/src/app/chat/page.tsx`
- Modify: `apps/web/src/components/chat/chat-input.tsx`
- Create: `apps/web/src/app/chat/page.mobile.test.tsx`
- Optional Modify: `apps/web/src/stores/chat-store.ts`
- Optional Modify: `apps/web/src/stores/conversations-store.ts`

**Step 1: 写失败测试**

覆盖以下场景：

- 移动端显示会话入口按钮
- 点击会话入口能打开会话抽屉
- 输入框区域在移动端仍可见
- 模型切换入口可见

**Step 2: 跑测试确认失败**

Run:

```bash
pnpm --filter @repo/web test -- page.mobile.test.tsx
```

Expected:

- FAIL

**Step 3: 写最小实现**

实现要求：

- 顶部显示标题、会话入口、模型入口
- 会话列表改为移动端抽屉
- `ChatInput` 改为移动端底部吸附
- 欢迎态卡片在移动端单列化
- 不改写 `sendMessage` 主流程

**Step 4: 跑测试确认通过**

Run:

```bash
pnpm --filter @repo/web test -- page.mobile.test.tsx
```

Expected:

- PASS

**Step 5: 补人工验收**

Run:

```bash
pnpm --filter @repo/web dev
```

手动检查：

- `375px` 宽度下无横向滚动
- 键盘弹起后输入区不被遮挡
- 会话抽屉可打开关闭

**Step 6: 提交**

```bash
git add apps/web/src/app/chat/page.tsx apps/web/src/components/chat/chat-input.tsx apps/web/src/app/chat/page.mobile.test.tsx apps/web/src/stores/chat-store.ts apps/web/src/stores/conversations-store.ts
git commit -m "feat(web): adapt chat page for mobile"
```

---

### Task 5: 改造语音页与历史记录面板

**Files:**
- Modify: `apps/web/src/app/voice/page.tsx`
- Modify: `apps/web/src/components/voice/recording-library.tsx`
- Modify: `apps/web/src/components/voice/upload-audio.tsx`
- Create: `apps/web/src/app/voice/page.mobile.test.tsx`

**Step 1: 写失败测试**

覆盖以下场景：

- 移动端显示模式切换
- 移动端显示历史入口
- 历史抽屉可打开
- 历史记录项点击后关闭抽屉并恢复内容

**Step 2: 跑测试确认失败**

Run:

```bash
pnpm --filter @repo/web test -- app/voice/page.mobile.test.tsx
```

Expected:

- FAIL

**Step 3: 写最小实现**

实现要求：

- `RecordingLibrary` 通过 `ResponsivePanel` 复用
- 桌面保持右侧栏
- 移动端改为历史抽屉
- 实时录音与上传结果在移动端使用单列布局
- 保留现有历史恢复逻辑

**Step 4: 跑测试确认通过**

Run:

```bash
pnpm --filter @repo/web test -- app/voice/page.mobile.test.tsx
```

Expected:

- PASS

**Step 5: 补人工验收**

手动检查：

- 上传模式与实时模式可切换
- 历史列表可打开与恢复
- 结果区在手机宽度下不重叠

**Step 6: 提交**

```bash
git add apps/web/src/app/voice/page.tsx apps/web/src/components/voice/recording-library.tsx apps/web/src/components/voice/upload-audio.tsx apps/web/src/app/voice/page.mobile.test.tsx
git commit -m "feat(web): adapt voice page for mobile"
```

---

### Task 6: 改造图像生成页移动端结构

**Files:**
- Modify: `apps/web/src/app/image/page.tsx`
- Modify: `apps/web/src/components/image/style-selector.tsx`
- Modify: `apps/web/src/components/image/settings-panel.tsx`
- Modify: `apps/web/src/components/image/negative-prompt.tsx`
- Create: `apps/web/src/app/image/page.mobile.test.tsx`

**Step 1: 写失败测试**

覆盖以下场景：

- 移动端显示参数入口
- 移动端仍显示提示词输入框
- 参数入口打开后能看到设置面板
- 结果区在无图片时显示空状态

**Step 2: 跑测试确认失败**

Run:

```bash
pnpm --filter @repo/web test -- app/image/page.mobile.test.tsx
```

Expected:

- FAIL

**Step 3: 写最小实现**

实现要求：

- 移动端采用“结果优先 + 参数抽屉”
- 提示词输入与生成按钮留在主页面
- 风格选择器改为横向滚动
- 高级参数收敛到抽屉或折叠区

**Step 4: 跑测试确认通过**

Run:

```bash
pnpm --filter @repo/web test -- app/image/page.mobile.test.tsx
```

Expected:

- PASS

**Step 5: 补人工验收**

手动检查：

- 竖屏下结果区不被左侧栏压缩
- 参数抽屉可滚动
- 生成按钮始终可达

**Step 6: 提交**

```bash
git add apps/web/src/app/image/page.tsx apps/web/src/components/image/style-selector.tsx apps/web/src/components/image/settings-panel.tsx apps/web/src/components/image/negative-prompt.tsx apps/web/src/app/image/page.mobile.test.tsx
git commit -m "feat(web): adapt image page for mobile"
```

---

### Task 7: 改造历史页移动端列表结构

**Files:**
- Modify: `apps/web/src/app/history/page.tsx`
- Modify: `apps/web/src/components/history/chat-history-card.tsx`
- Modify: `apps/web/src/components/history/voice-history-card.tsx`
- Modify: `apps/web/src/components/history/image-history-card.tsx`
- Create: `apps/web/src/app/history/page.mobile.test.tsx`

**Step 1: 写失败测试**

覆盖以下场景：

- tabs 在移动端仍可见
- 搜索框在移动端仍可见
- 历史卡片渲染为单列主流布局
- 预览弹层可打开

**Step 2: 跑测试确认失败**

Run:

```bash
pnpm --filter @repo/web test -- app/history/page.mobile.test.tsx
```

Expected:

- FAIL

**Step 3: 写最小实现**

实现要求：

- 搜索与筛选改为上下堆叠
- 卡片默认单列
- tabs 支持横向滚动
- 图片详情在移动端优先全屏或大弹层

**Step 4: 跑测试确认通过**

Run:

```bash
pnpm --filter @repo/web test -- app/history/page.mobile.test.tsx
```

Expected:

- PASS

**Step 5: 提交**

```bash
git add apps/web/src/app/history/page.tsx apps/web/src/components/history/chat-history-card.tsx apps/web/src/components/history/voice-history-card.tsx apps/web/src/components/history/image-history-card.tsx apps/web/src/app/history/page.mobile.test.tsx
git commit -m "feat(web): adapt history page for mobile"
```

---

### Task 8: 改造视频页移动端分步工作流

**Files:**
- Modify: `apps/web/src/app/video/_components/video-editor.tsx`
- Modify: `apps/web/src/app/video/_components/config-panel.tsx`
- Modify: `apps/web/src/app/video/_components/assets-sidebar.tsx`
- Modify: `apps/web/src/app/video/_components/timeline-bar.tsx`
- Create: `apps/web/src/app/video/_components/video-editor.mobile.test.tsx`

**Step 1: 写失败测试**

覆盖以下场景：

- 移动端显示“配置”入口
- 移动端显示“资源”入口
- 配置入口打开后显示配置面板
- 资源入口打开后显示资源面板

**Step 2: 跑测试确认失败**

Run:

```bash
pnpm --filter @repo/web test -- video-editor.mobile.test.tsx
```

Expected:

- FAIL

**Step 3: 写最小实现**

实现要求：

- 中央预览区优先
- `ConfigPanel` 进入抽屉
- `AssetsSidebar` 进入抽屉
- `TimelineBar` 移动端支持横向滚动或简化
- 生成按钮固定在底部动作条

**Step 4: 跑测试确认通过**

Run:

```bash
pnpm --filter @repo/web test -- video-editor.mobile.test.tsx
```

Expected:

- PASS

**Step 5: 补人工验收**

手动检查：

- 预览区在手机首屏可见
- 配置、资源抽屉都可达
- 生成流程可完整执行到结果显示

**Step 6: 提交**

```bash
git add apps/web/src/app/video/_components/video-editor.tsx apps/web/src/app/video/_components/config-panel.tsx apps/web/src/app/video/_components/assets-sidebar.tsx apps/web/src/app/video/_components/timeline-bar.tsx apps/web/src/app/video/_components/video-editor.mobile.test.tsx
git commit -m "feat(web): adapt video page for mobile"
```

---

### Task 9: 接入剩余页面与统一样式

**Files:**
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/resume/page.tsx`
- Modify: `apps/web/src/app/resume/template/page.tsx`
- Modify: `apps/web/src/app/destiny/page.tsx`
- Modify: `apps/web/src/app/destiny/_components/layout/destiny-shell.tsx`
- Modify: `apps/web/src/app/destiny/_components/reports/report-right-rail.tsx`
- Create: `apps/web/src/app/page.mobile.test.tsx`

**Step 1: 写失败测试**

至少覆盖：

- 首页模块入口在移动端可见
- 简历模板页移动端入口仍可切换

**Step 2: 跑测试确认失败**

Run:

```bash
pnpm --filter @repo/web test -- app/page.mobile.test.tsx
```

Expected:

- FAIL

**Step 3: 写最小实现**

实现要求：

- 首页改为 1~2 列入口
- `resume/template` 接入统一壳层安全区
- `destiny` 的右栏与知识面板移动端抽屉化

**Step 4: 跑测试确认通过**

Run:

```bash
pnpm --filter @repo/web test -- app/page.mobile.test.tsx
```

Expected:

- PASS

**Step 5: 提交**

```bash
git add apps/web/src/app/page.tsx apps/web/src/app/resume/page.tsx apps/web/src/app/resume/template/page.tsx apps/web/src/app/destiny/page.tsx apps/web/src/app/destiny/_components/layout/destiny-shell.tsx apps/web/src/app/destiny/_components/reports/report-right-rail.tsx apps/web/src/app/page.mobile.test.tsx
git commit -m "feat(web): adapt remaining pages for mobile"
```

---

### Task 10: 回归验证与文档收口

**Files:**
- Modify: `docs/mobile-adaptation-design.md`
- Optional Create: `docs/mobile-adaptation-qa-checklist.md`

**Step 1: 跑类型检查**

Run:

```bash
pnpm --filter @repo/web typecheck
```

Expected:

- PASS

**Step 2: 跑单测**

Run:

```bash
pnpm --filter @repo/web test
```

Expected:

- PASS

**Step 3: 跑 lint**

Run:

```bash
pnpm --filter @repo/web lint
```

Expected:

- PASS

**Step 4: 启动本地服务做人工验收**

Run:

```bash
pnpm --filter @repo/web dev
```

人工验收清单：

- `375px`、`768px`、`1024px` 三档都无明显布局破坏
- `chat / voice / image / history / video` 主流程可完成
- 无主要 CTA 被底部导航或键盘遮挡
- 无横向滚动条
- 桌面端原有主布局不回退

**Step 5: 更新设计文档状态**

在 `docs/mobile-adaptation-design.md` 中补充：

- 已完成范围
- 已知限制
- 后续优化方向

**Step 6: 提交**

```bash
git add docs/mobile-adaptation-design.md docs/mobile-adaptation-qa-checklist.md
git commit -m "docs(web): finalize mobile adaptation rollout notes"
```

---

## 执行建议

### 建议并行拆法

- 一条线负责 `Task 1 ~ Task 3` 基建
- 一条线负责 `Task 4 ~ Task 7` 核心页面
- 一条线负责 `Task 8 ~ Task 9` 复杂页面和剩余页面

但执行时必须满足：

- `Task 2` 完成后，页面任务再大规模接入
- `Task 3` 的 `ResponsivePanel` 稳定后，再迁移 `voice / image / video`

### 建议里程碑

- **里程碑 1：** 壳层与导航完成
- **里程碑 2：** 核心高频页面完成
- **里程碑 3：** 复杂页面完成
- **里程碑 4：** 全量回归完成

### 回退策略

如果某个复杂页面移动端改造引发桌面回归：

- 先保留桌面逻辑
- 通过 `useIsMobile()` 分支限制变更范围
- 避免把所有页面一次性切到同一实现
