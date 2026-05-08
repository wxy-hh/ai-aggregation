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
import { FolderOpen, Settings2, Sparkles } from 'lucide-react';

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
  const [isConfigDrawerOpen, setIsConfigDrawerOpen] = React.useState(false);
  const [isAssetsDrawerOpen, setIsAssetsDrawerOpen] = React.useState(false);
  const canGenerate = prompt.trim().length > 0 && !isGenerating;

  return (
    <AppLayout>
      <div className="flex flex-col w-full h-full bg-[#F5F7FA] dark:bg-[#0A0B10] text-slate-900 dark:text-slate-100 transition-colors duration-500 overflow-hidden font-sans">
        {/* 主界面内容区 */}
        <main className="flex-1 flex overflow-hidden relative">
          {/* 左侧面板：配置区 */}
          <aside className="hidden lg:flex w-[360px] lg:w-[400px] flex-shrink-0 bg-white dark:bg-[#111218] border-r border-slate-200 dark:border-slate-800/50 overflow-y-auto no-scrollbar shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-10">
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
            <div className="lg:hidden px-4 pt-4 flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1 justify-center rounded-2xl h-11"
                aria-label="打开配置面板"
                onClick={() => setIsConfigDrawerOpen(true)}
              >
                <Settings2 className="w-4 h-4 mr-2" />
                配置
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1 justify-center rounded-2xl h-11"
                aria-label="打开资源面板"
                onClick={() => setIsAssetsDrawerOpen(true)}
              >
                <FolderOpen className="w-4 h-4 mr-2" />
                资源
              </Button>
            </div>

            {/* 预览区域 */}
            <div className="flex-1 p-4 lg:p-8 overflow-hidden flex flex-col items-center justify-center">
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
            <div className="px-4 pb-24 lg:px-6 lg:pb-6">
              <TimelineBar videoUrl={videoUrl} />
            </div>
          </section>

          {/* 右侧工具栏：资源面板 */}
          <aside className="hidden lg:block border-l border-slate-200 dark:border-slate-800/50 bg-white dark:bg-[#111218] z-10">
            <AssetsSidebar />
          </aside>
        </main>

        <div className="lg:hidden sticky bottom-0 z-20 border-t border-slate-200/80 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-[#111218]/95">
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
              referenceImage={referenceImage}
              setReferenceImage={setReferenceImage}
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
