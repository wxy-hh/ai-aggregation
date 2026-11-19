'use client';

/**
 * 知识库中心主页面 (/knowledge)
 *
 * 页面契约：
 * 1. 采用 AppLayout 全局布局（移动端包含 Header、底部导航，桌面端包含侧边栏）。
 * 2. 承载知识库管理与 RAG 检索调试台（双路召回 + RRF 融合明细）。
 */

import React from 'react';
import dynamic from 'next/dynamic';
import { AppLayout } from '@/components/layout/app-layout';

const KnowledgeWorkspace = dynamic(
  () => import('./knowledge-workspace').then((mod) => mod.KnowledgeWorkspace),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
      </div>
    ),
  }
);

export default function KnowledgePage() {
  return (
    <AppLayout>
      <KnowledgeWorkspace />
    </AppLayout>
  );
}
