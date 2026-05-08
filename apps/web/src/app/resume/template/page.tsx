'use client';

import './print.css';
import React from 'react';
import { useState } from 'react';
import { AppLayout } from '@/components/layout/app-layout';
import { ContentPanel } from './_components/content-panel';
import { PreviewViewport } from './_components/preview-viewport';
import { AIAssistantPanel } from './_components/ai-assistant-panel';
import { AIDrawer } from './_components/ai-drawer';
import { AIDrawerTrigger } from './_components/ai-drawer-trigger';
import { MobileTabs, type TabType } from './_components/mobile-tabs';
import { MobileTabContent } from './_components/mobile-tab-content';
import { SaveStatusIndicator } from './_components/save-status-indicator';
import { useAutoSave } from '@/hooks/use-auto-save';
import { useResumeEditorStore } from '@/stores/resume-editor-store';

export default function ResumeTemplatePage() {
  // 启用自动保存
  useAutoSave();

  // 获取保存状态
  const saveStatus = useResumeEditorStore((state) => state.saveStatus);
  const lastSavedAt = useResumeEditorStore((state) => state.lastSavedAt);

  // AI 抽屉状态（用于 1024-1439px 视口）
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // 移动端标签页状态（用于 <1024px 视口）
  const [mobileActiveTab, setMobileActiveTab] = useState<TabType>('edit');

  return (
    <AppLayout>
      {/* 简洁纯色背景 */}
      <div className="flex-1 relative overflow-hidden bg-[#F6F8FF] dark:bg-slate-900 pb-[env(safe-area-inset-bottom)]">
        {/* 保存状态指示器 - 固定在右上角 */}
        <div className="no-print absolute top-16 right-4 z-50 lg:top-4 lg:right-4">
          <SaveStatusIndicator
            status={saveStatus}
            lastSavedAt={lastSavedAt ? new Date(lastSavedAt) : undefined}
            errorMessage={saveStatus === 'error' ? '保存失败，请检查网络连接' : undefined}
          />
        </div>

        {/* 移动端布局（<1024px）：Tabs + 单栏内容 */}
        <div className="lg:hidden relative z-10 flex flex-col h-full">
          {/* 移动端标签页导航 */}
          <MobileTabs activeTab={mobileActiveTab} onTabChange={setMobileActiveTab} />

          {/* 移动端标签页内容 */}
          <MobileTabContent activeTab={mobileActiveTab} />
        </div>

        {/* 桌面端布局（>=1024px）：三栏/双栏布局 */}
        <div className="hidden lg:flex relative z-10 h-full">
          {/* 左侧：内容编辑区 */}
          <div className="no-print edit-panel w-[380px] xl:w-[380px] 2xl:w-[420px] flex-shrink-0 overflow-y-auto">
            <ContentPanel />
          </div>

          {/* 中间：A4 预览区 */}
          <div className="flex flex-1 items-center justify-center overflow-hidden p-8">
            <PreviewViewport />
          </div>

          {/* 右侧：AI 诊断中心（仅在 >=1440px 显示） */}
          <div className="no-print ai-panel hidden xl:block w-[360px] 2xl:w-[400px] flex-shrink-0 overflow-y-auto">
            <AIAssistantPanel />
          </div>
        </div>

        {/* AI 抽屉触发按钮（仅在 1024-1439px 显示） */}
        <AIDrawerTrigger onClick={() => setIsDrawerOpen(true)} />

        {/* AI 抽屉（用于 1024-1439px 视口） */}
        <AIDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
      </div>
    </AppLayout>
  );
}
