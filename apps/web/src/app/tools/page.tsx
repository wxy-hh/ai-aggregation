'use client';

/**
 * 我的工具工作台主页面 (/tools)
 *
 * 页面契约：
 * 1. 采用 AppLayout 全局布局（移动端包含 Header、底部导航，桌面端包含侧边栏）。
 * 2. 工作区采用动态导入分包，避免首屏加载整块工具与 MCP 配置逻辑。
 */

import React from 'react';
import dynamic from 'next/dynamic';
import { AppLayout } from '@/components/layout/app-layout';

const ToolsWorkspace = dynamic(
  () => import('./_components/tools-workspace').then((mod) => mod.ToolsWorkspace),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
      </div>
    ),
  }
);

export default function ToolsPage() {
  return (
    <AppLayout>
      <ToolsWorkspace />
    </AppLayout>
  );
}
