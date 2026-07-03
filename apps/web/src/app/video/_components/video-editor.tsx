'use client';

import React from 'react';
import { ConfigPanel } from './config-panel';
import { PreviewCanvas } from './preview-canvas';
import { AssetsSidebar } from './assets-sidebar';
import { TimelineBar } from './timeline-bar';
import { useVideoGeneration } from './use-video-generation';
import { AppLayout } from '@/components/layout/app-layout';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FolderOpen, Settings2, Sparkles, Clapperboard } from 'lucide-react';

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
    setModel,
    referenceImage,
    setReferenceImage,
    referenceImages,
    setReferenceImages,
    generateVideo,
    reset,
  } = useVideoGeneration();

  const isGenerating = status === 'generating';
  const [isConfigDrawerOpen, setIsConfigDrawerOpen] = React.useState(false);
  const [isAssetsDrawerOpen, setIsAssetsDrawerOpen] = React.useState(false);
  const canGenerate = prompt.trim().length > 0 && !isGenerating;

  return (
    <AppLayout>
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-100 via-white to-blue-50 font-sans text-slate-900 transition-colors duration-500 dark:from-slate-900 dark:via-slate-950 dark:to-indigo-950 dark:text-slate-100">
        {/* 背景光晕：支撑玻璃拟态质感（DESIGN.md §2.1） */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-[10%] -top-[20%] h-[50%] w-[50%] rounded-full bg-blue-400/10 blur-[100px]" />
          <div className="absolute -left-[10%] top-[40%] h-[40%] w-[40%] rounded-full bg-purple-400/10 blur-[100px]" />
          <div className="absolute bottom-0 left-1/3 h-[30%] w-[35%] rounded-full bg-cyan-400/8 blur-[90px]" />
        </div>

        {/* 顶栏：透明磨砂，与页面渐变一体 */}
        <header className="relative z-20 flex flex-none items-center justify-between px-4 py-4 backdrop-blur-xl supports-[backdrop-filter]:bg-white/20 md:px-6 dark:supports-[backdrop-filter]:bg-slate-950/15">
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/70 bg-white/60 text-blue-600 shadow-[0_8px_20px_rgba(76,95,154,0.08)] backdrop-blur-xl dark:border-slate-700/80 dark:bg-slate-800/60 dark:text-blue-300">
              <Clapperboard className="h-5 w-5" />
            </span>
            AI 视频工坊
            <Badge className="rounded-full border-0 bg-gradient-to-r from-indigo-500 to-cyan-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white shadow-lg shadow-indigo-500/20">
              READY
            </Badge>
          </h1>
        </header>

        {/* 主界面内容区 */}
        <main className="relative z-10 flex flex-1 overflow-hidden">
          {/* 左侧面板：G-2 磨砂玻璃 */}
          <aside className="no-scrollbar z-10 hidden w-full max-w-[400px] flex-shrink-0 flex-col overflow-y-auto border-r border-white/25 bg-white/40 backdrop-blur-xl dark:border-white/5 dark:bg-slate-900/40 lg:flex lg:w-[400px] xl:w-[433px]">
            <ConfigPanel
              prompt={prompt}
              setPrompt={setPrompt}
              config={config}
              setConfig={setConfig}
              setModel={setModel}
              referenceImage={referenceImage}
              setReferenceImage={setReferenceImage}
              referenceImages={referenceImages}
              setReferenceImages={setReferenceImages}
              onGenerate={generateVideo}
              isGenerating={isGenerating}
              loadingStep={loadingStep}
            />
          </aside>

          {/* 中央工作区：预览与时间轴（flex-shrink-0 避免被参数栏挤压变窄） */}
          <section className="relative flex min-w-0 flex-1 shrink-0 flex-col lg:min-w-[min(100%,720px)]">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
              style={{
                backgroundImage: 'radial-gradient(#64748b 1px, transparent 1px)',
                backgroundSize: '32px 32px',
              }}
              aria-hidden
            />

            <div className="relative z-10 flex items-center gap-3 px-4 pt-2 lg:hidden">
              <Button
                type="button"
                variant="outline"
                className="h-11 flex-1 justify-center rounded-2xl border-white/70 bg-white/70 backdrop-blur-md dark:border-slate-700 dark:bg-slate-800/70"
                aria-label="打开配置面板"
                onClick={() => setIsConfigDrawerOpen(true)}
              >
                <Settings2 className="mr-2 h-4 w-4" />
                配置
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 flex-1 justify-center rounded-2xl border-white/70 bg-white/70 backdrop-blur-md dark:border-slate-700 dark:bg-slate-800/70"
                aria-label="打开资源面板"
                onClick={() => setIsAssetsDrawerOpen(true)}
              >
                <FolderOpen className="mr-2 h-4 w-4" />
                资源
              </Button>
            </div>

            {/* 预览区域 */}
            <div className="relative z-10 flex flex-1 flex-col items-center justify-center overflow-hidden p-4 lg:p-8">
              <div className="h-full w-full max-h-[800px] max-w-[1200px]">
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
            <div className="px-4 pb-24 lg:px-6 lg:pb-6">
              <TimelineBar videoUrl={videoUrl} />
            </div>
          </section>

          {/* 右侧资源栏：空间不足时优先收缩，避免挤压预览区 */}
          <aside className="z-10 hidden shrink border-l border-white/25 bg-white/40 backdrop-blur-xl dark:border-white/5 dark:bg-slate-900/40 lg:block">
            <AssetsSidebar />
          </aside>
        </main>

        <div className="sticky bottom-0 z-20 border-t border-white/30 bg-white/75 px-4 py-3 backdrop-blur-xl dark:border-white/5 dark:bg-slate-950/75 lg:hidden">
          <Button
            type="button"
            onClick={generateVideo}
            disabled={!canGenerate}
            className="h-12 w-full rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 text-sm font-bold text-white shadow-lg shadow-blue-500/20 hover:from-blue-600 hover:to-blue-700"
          >
            {isGenerating ? (
              loadingStep || '正在创作...'
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                生成视频
              </>
            )}
          </Button>
        </div>
      </div>

      <Dialog open={isConfigDrawerOpen} onOpenChange={setIsConfigDrawerOpen}>
        <DialogContent className="inset-x-0 bottom-0 top-auto w-full max-w-none translate-x-0 translate-y-0 rounded-t-[28px] rounded-b-none border-0 bg-white p-0 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom dark:bg-slate-950">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <DialogTitle className="text-left text-base font-semibold text-slate-900 dark:text-white">
              创作参数
            </DialogTitle>
            <DialogDescription className="mt-1 text-left text-sm text-slate-500 dark:text-slate-400">
              在移动端集中调整视频生成配置
            </DialogDescription>
          </div>
          <div className="max-h-[78vh] overflow-y-auto">
            <ConfigPanel
              prompt={prompt}
              setPrompt={setPrompt}
              config={config}
              setConfig={setConfig}
              setModel={setModel}
              referenceImage={referenceImage}
              setReferenceImage={setReferenceImage}
              referenceImages={referenceImages}
              setReferenceImages={setReferenceImages}
              onGenerate={() => {
                setIsConfigDrawerOpen(false);
                generateVideo();
              }}
              isGenerating={isGenerating}
              loadingStep={loadingStep}
              showGenerateButton={false}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isAssetsDrawerOpen} onOpenChange={setIsAssetsDrawerOpen}>
        <DialogContent className="inset-x-0 bottom-0 top-auto w-full max-w-none translate-x-0 translate-y-0 rounded-t-[28px] rounded-b-none border-0 bg-white p-0 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom dark:bg-slate-950">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <DialogTitle className="text-left text-base font-semibold text-slate-900 dark:text-white">
              资源面板
            </DialogTitle>
            <DialogDescription className="mt-1 text-left text-sm text-slate-500 dark:text-slate-400">
              查看参考资源与占位素材
            </DialogDescription>
          </div>
          <div className="max-h-[78vh] overflow-y-auto px-5 py-4">
            <AssetsSidebar defaultOpen showToggle={false} />
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
