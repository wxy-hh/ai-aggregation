'use client';

import { AppLayout } from '@/components/layout/app-layout';
import { StyleSelector } from '@/components/image/style-selector';
import { SettingsPanel } from '@/components/image/settings-panel';
import { AssetSidebar } from '@/components/image/asset-sidebar';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export default function ImagePage() {
  const [prompt, setPrompt] = useState(
    '赛博格猫咪，霓虹灯雨夜，高耸的摩天大楼，反射光泽，8k 分辨率，电影质感...'
  );
  const [isGenerating, setIsGenerating] = useState(true);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (isGenerating) {
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 99) {
            // clearInterval(interval);
            // setIsGenerating(false);
            return 99; // 演示时保持在 99%
          }
          return prev + 1;
        });
      }, 100);
      return () => clearInterval(interval);
    }
  }, [isGenerating]);

  return (
    <AppLayout>
      <div className="flex w-full h-full bg-slate-50 dark:bg-slate-950 overflow-hidden">
        {/* 主工作区 */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          {/* 头部 */}
          <header className="flex-none px-6 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between z-10 shadow-sm">
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                灵感绘图
                <Badge className="px-2 py-0.5 bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-300 text-xs rounded-md font-bold uppercase border-0 hover:bg-indigo-200 dark:hover:bg-indigo-900/70">
                  Engine v4.0
                </Badge>
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                AI 正在根据您的描述构建画面。
              </p>
            </div>
            <div>
              <Badge
                variant="outline"
                className="flex items-center gap-2 px-3 py-1.5 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-full text-xs font-bold border-green-100 dark:border-green-900/30"
              >
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                GPU 算力充足
              </Badge>
            </div>
          </header>

          {/* 内容区域：拆分视图 */}
          <div className="flex-1 flex overflow-hidden">
            {/* 左侧面板：设置与提示词 */}
            <div className="w-80 md:w-96 flex-none flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 overflow-y-auto custom-scrollbar">
              <div className="p-6 space-y-8">
                {/* 提示词输入 */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <svg
                        className="w-5 h-5 text-purple-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                      </svg>
                      <h3 className="font-bold text-slate-800 dark:text-white">创意描述</h3>
                    </div>
                    <button className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium px-2 py-1 bg-blue-50 dark:bg-blue-900/20 rounded-md">
                      随机灵感
                    </button>
                  </div>
                  <div className="relative group">
                    <Textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      className="w-full h-32 px-4 py-3 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl resize-none focus-visible:ring-0 focus-visible:border-blue-500 transition-all text-sm leading-relaxed text-slate-700 dark:text-slate-200 shadow-sm group-hover:border-slate-300 dark:group-hover:border-slate-600"
                      placeholder="描述你想要生成的画面细节..."
                    />
                    <div className="absolute right-3 bottom-3 text-xs text-slate-400 bg-white dark:bg-slate-800 px-2 py-0.5 rounded-full border border-slate-100 dark:border-slate-700 font-mono">
                      {prompt.length}/500
                    </div>
                  </div>

                  {/* 反向提示词折叠面板 */}
                  <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                    <button className="w-full px-4 py-3 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 text-xs font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                      <span>排除内容 (Negative)</span>
                      <svg
                        className="w-4 h-4 transform rotate-0 transition-transform"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="bg-slate-200 dark:bg-slate-800 h-px w-full"></div>

                <StyleSelector />

                <div className="bg-slate-200 dark:bg-slate-800 h-px w-full"></div>

                <SettingsPanel />
              </div>

              {/* 吸底生成按钮 */}
              <div className="p-6 pt-0 mt-auto sticky bottom-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-100 dark:border-slate-800 z-10 pb-8">
                <Button
                  onClick={() => {
                    setIsGenerating(true);
                    setProgress(0);
                  }}
                  disabled={isGenerating}
                  className={cn(
                    'w-full py-6 rounded-2xl font-bold flex items-center justify-center gap-2 text-white shadow-lg transition-all text-md',
                    isGenerating
                      ? 'bg-slate-800 dark:bg-slate-700 cursor-not-allowed opacity-90'
                      : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:shadow-blue-500/25 hover:scale-[1.02] active:scale-[0.98]'
                  )}
                >
                  {isGenerating ? (
                    <>
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      生成中...
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                        />
                      </svg>
                      立即生成
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* 中间：预览区域 */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col items-center justify-center bg-slate-100 dark:bg-black relative">
              {/* 背景网格纹理 */}
              <div
                className="absolute inset-0 opacity-[0.03] dark:opacity-[0.1]"
                style={{
                  backgroundImage: 'radial-gradient(#64748b 1px, transparent 1px)',
                  backgroundSize: '24px 24px',
                }}
              ></div>

              <div className="w-full max-w-2xl aspect-[9/16] md:aspect-[3/4] relative rounded-3xl overflow-hidden shadow-2xl border-4 border-white dark:border-slate-800 bg-slate-200 dark:bg-slate-900 group">
                {/* 图片内容（生成时模糊） */}
                <div
                  className={cn(
                    'absolute inset-0 bg-cover bg-center transition-all duration-1000',
                    isGenerating ? 'scale-110 blur-xl opacity-80' : 'scale-100 blur-0 opacity-100'
                  )}
                  style={{
                    backgroundImage:
                      "url('https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?q=80&w=1974&auto=format&fit=crop')",
                  }}
                ></div>

                {/* 生成中遮罩 */}
                {isGenerating && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/20 backdrop-blur-sm">
                    {/* 进度环 */}
                    <div className="relative w-40 h-40 mb-8">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle
                          className="text-white/20"
                          strokeWidth="6"
                          stroke="currentColor"
                          fill="transparent"
                          r="70"
                          cx="80"
                          cy="80"
                        ></circle>
                        <circle
                          className="text-blue-500"
                          strokeWidth="6"
                          strokeDasharray={440}
                          strokeDashoffset={440 - (440 * progress) / 100}
                          strokeLinecap="round"
                          stroke="currentColor"
                          fill="transparent"
                          r="70"
                          cx="80"
                          cy="80"
                        ></circle>
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-4xl font-bold text-white tracking-tighter">
                          {progress}%
                        </span>
                      </div>
                    </div>

                    {/* 状态徽章 */}
                    <div className="flex items-center gap-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-6 py-3 rounded-full shadow-xl border border-white/20">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                        <span className="font-bold text-slate-800 dark:text-white text-sm">
                          正在扩散生成中...
                        </span>
                      </div>
                      <div className="w-px h-4 bg-slate-300 dark:bg-slate-600"></div>
                      <span className="font-mono text-sm text-blue-600 dark:text-blue-400 font-bold">
                        Step 22/50
                      </span>
                    </div>
                  </div>
                )}

                {!isGenerating && (
                  <div className="absolute bottom-6 right-6 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <button className="p-3 bg-white/20 backdrop-blur-md hover:bg-white/30 rounded-full text-white transition-colors">
                      <svg
                        className="w-6 h-6"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                        />
                      </svg>
                    </button>
                    <button className="p-3 bg-white/20 backdrop-blur-md hover:bg-white/30 rounded-full text-white transition-colors">
                      <svg
                        className="w-6 h-6"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                        />
                      </svg>
                    </button>
                  </div>
                )}
              </div>

              {/* 历史记录条 */}
              <div className="mt-8 w-full max-w-2xl px-4">
                <div className="flex items-center justify-between mb-4 text-xs font-bold text-slate-400 uppercase tracking-widest">
                  <span>历史版本 (Version History)</span>
                  <button className="hover:text-blue-500 transition-colors">查看全部</button>
                </div>
                <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="w-24 h-24 rounded-2xl bg-slate-300 dark:bg-slate-800 shrink-0 overflow-hidden border-2 border-transparent hover:border-blue-500 transition-all cursor-pointer shadow-sm hover:shadow-lg relative grayscale hover:grayscale-0"
                    >
                      <div
                        className={cn(
                          'absolute inset-0 bg-cover bg-center',
                          i === 1
                            ? 'bg-gradient-to-br from-indigo-500 to-purple-500'
                            : i === 2
                              ? 'bg-gradient-to-br from-blue-500 to-cyan-500'
                              : 'bg-gradient-to-br from-pink-500 to-rose-500'
                        )}
                      ></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 右侧边栏：资产停靠区 - 移动端隐藏，lg 屏幕可见 */}
        <AssetSidebar />
      </div>
    </AppLayout>
  );
}
