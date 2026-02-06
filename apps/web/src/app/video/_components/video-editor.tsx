'use client';

import React from 'react';
import { ConfigPanel } from './config-panel';
import { PreviewCanvas } from './preview-canvas';
import { AssetsSidebar } from './assets-sidebar';
import { TimelineBar } from './timeline-bar';
import { useVideoGeneration } from './use-video-generation';
import { AppLayout } from '@/components/layout/app-layout';
import { ChevronRight, Undo2, Redo2, LogOut } from 'lucide-react';

export function VideoEditor() {
  const {
    prompt,
    setPrompt,
    status,
    loadingStep,
    videoUrl,
    coverUrl,
    progress,
    config,
    setConfig,
    referenceImage,
    setReferenceImage,
    generateVideo,
    reset,
  } = useVideoGeneration();

  const isGenerating = status === 'generating';

  return (
    <AppLayout>
      <div className="flex flex-col w-full h-full bg-[#F5F7FA] dark:bg-[#0A0B10] text-slate-900 dark:text-slate-100 transition-colors duration-500 overflow-hidden font-sans">
        {/* 顶部导航栏 */}
        <header className="flex items-center justify-between h-14 min-h-[56px] px-6 bg-white dark:bg-[#111218] border-b border-slate-200 dark:border-slate-800/50 z-20">
          {/* 面包屑导航 */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-400 dark:text-slate-500 hover:text-blue-500 cursor-pointer transition-colors">
              我的工程
            </span>
            <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600" />
            <div className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg font-medium text-slate-700 dark:text-slate-200">
              无标题项目 01
            </div>
          </div>

          {/* 操作按钮组 */}
          <div className="flex items-center gap-3">
            {/* 撤销/重做 */}
            <div className="flex items-center p-1 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50">
              <button
                className="p-2 text-slate-400 hover:text-blue-500 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-all"
                title="撤销"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                className="p-2 text-slate-400 hover:text-blue-500 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-all"
                title="重做"
              >
                <Redo2 className="w-4 h-4" />
              </button>
            </div>

            <div className="w-px h-6 bg-slate-200 dark:bg-slate-800 mx-1" />

            {/* 导出按钮 */}
            <button
              className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:border-blue-500 hover:text-blue-500 transition-all shadow-sm disabled:opacity-50"
              disabled={!videoUrl}
            >
              <LogOut className="w-4 h-4 rotate-180" />
              导出
            </button>
          </div>
        </header>

        {/* 主界面内容区 */}
        <main className="flex-1 flex overflow-hidden relative">
          {/* 左侧面板：配置区 */}
          <aside className="w-[360px] lg:w-[400px] flex-shrink-0 bg-white dark:bg-[#111218] border-r border-slate-200 dark:border-slate-800/50 overflow-y-auto no-scrollbar shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-10">
            <ConfigPanel
              prompt={prompt}
              setPrompt={setPrompt}
              config={config}
              setConfig={setConfig}
              referenceImage={referenceImage}
              setReferenceImage={setReferenceImage}
              onGenerate={generateVideo}
              isGenerating={isGenerating}
              loadingStep={loadingStep}
            />
          </aside>

          {/* 中央工作区：预览和时间轴 */}
          <section className="flex-1 flex flex-col min-w-0 bg-[#F8FAFC] dark:bg-[#0E0F15]">
            {/* 预览区域 */}
            <div className="flex-1 p-8 overflow-hidden flex flex-col items-center justify-center">
              <div className="w-full h-full max-w-[1200px] max-h-[800px]">
                <PreviewCanvas
                  videoUrl={videoUrl}
                  coverUrl={coverUrl}
                  isGenerating={isGenerating}
                  progress={progress}
                  status={status}
                  onReset={reset}
                />
              </div>
            </div>

            {/* 底部控制条 */}
            <div className="px-6 pb-6">
              <TimelineBar videoUrl={videoUrl} />
            </div>
          </section>

          {/* 右侧工具栏：资源面板 */}
          <aside className="border-l border-slate-200 dark:border-slate-800/50 bg-white dark:bg-[#111218] z-10">
            <AssetsSidebar />
          </aside>
        </main>
      </div>
    </AppLayout>
  );
}
