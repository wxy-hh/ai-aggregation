'use client';

import Link from 'next/link';

export function HomeContent() {
  return (
    <div className="relative h-full flex flex-col overflow-hidden">
      {/* Gradient Background */}
      <div className="fixed inset-0 bg-gradient-to-br from-blue-100 via-indigo-100 to-purple-100 dark:from-slate-900 dark:via-blue-900 dark:to-indigo-900 -z-10"></div>

      {/* Animated gradient orbs */}
      <div className="fixed inset-0 overflow-hidden -z-10">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-400/50 dark:bg-blue-500/30 rounded-full blur-3xl animate-pulse"></div>
        <div
          className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-400/50 dark:bg-purple-500/30 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: '1s' }}
        ></div>
        <div
          className="absolute top-1/2 left-1/2 w-96 h-96 bg-indigo-400/50 dark:bg-indigo-500/30 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: '2s' }}
        ></div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex flex-col justify-center relative z-10 py-6 gap-8">
        {/* Hero Section */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/40 dark:bg-white/10 backdrop-blur-xl text-blue-700 dark:text-blue-300 rounded-full text-sm font-medium mb-6 border border-white/60 dark:border-white/20 shadow-lg transition-colors duration-300">
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            NEXT-GEN AI PLATFORM
          </div>
          <h1 className="text-5xl sm:text-6xl font-bold mb-6 text-slate-900 dark:text-white font-heading transition-colors duration-300">
            开启您的 AI{' '}
            <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 dark:from-blue-400 dark:via-indigo-400 dark:to-purple-400 bg-clip-text text-transparent animate-gradient drop-shadow-sm">
              创作宇宙
            </span>
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-300 max-w-3xl mx-auto leading-relaxed transition-colors duration-300">
            集成尖端对话模型、高精度语音识别与艺术级图像生成，
            <br />
            为专业创作者打造的沉浸式智能工作空间。
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link href="/chat" className="group cursor-pointer">
            <div className="bg-white/70 dark:bg-white/10 backdrop-blur-2xl rounded-2xl p-8 shadow-2xl hover:shadow-3xl transition-all duration-300 ease-out border border-white/60 dark:border-white/10 hover:border-blue-400/60 dark:hover:border-blue-400/40 hover:bg-white/80 dark:hover:bg-white/20">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-400/20 to-blue-500/30 dark:from-blue-400/30 dark:to-blue-500/40 backdrop-blur-sm rounded-2xl flex items-center justify-center mb-6 border border-blue-300/50 dark:border-blue-400/30">
                <svg
                  className="w-8 h-8 text-blue-600 dark:text-blue-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                  />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-3 font-heading transition-colors duration-300">
                智能对话
              </h3>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed transition-colors duration-300">
                深度逻辑推理，支持多轮复杂对话与情境化代码生成。
              </p>
            </div>
          </Link>

          <Link href="/voice" className="group cursor-pointer">
            <div className="bg-white/70 dark:bg-white/10 backdrop-blur-2xl rounded-2xl p-8 shadow-2xl hover:shadow-3xl transition-all duration-300 ease-out border border-white/60 dark:border-white/10 hover:border-indigo-400/60 dark:hover:border-indigo-400/40 hover:bg-white/80 dark:hover:bg-white/20">
              <div className="w-16 h-16 bg-gradient-to-br from-indigo-400/20 to-indigo-500/30 dark:from-indigo-400/30 dark:to-indigo-500/40 backdrop-blur-sm rounded-2xl flex items-center justify-center mb-6 border border-indigo-300/50 dark:border-indigo-400/30">
                <svg
                  className="w-8 h-8 text-indigo-600 dark:text-indigo-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                  />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-3 font-heading transition-colors duration-300">
                语音转写
              </h3>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed transition-colors duration-300">
                毫秒级低延迟，自动断句说话人并生成会议纪要。
              </p>
            </div>
          </Link>

          <Link href="/image" className="group cursor-pointer">
            <div className="bg-white/70 dark:bg-white/10 backdrop-blur-2xl rounded-2xl p-8 shadow-2xl hover:shadow-3xl transition-all duration-300 ease-out border border-white/60 dark:border-white/10 hover:border-purple-400/60 dark:hover:border-purple-400/40 hover:bg-white/80 dark:hover:bg-white/20">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-400/20 to-purple-500/30 dark:from-purple-400/30 dark:to-purple-500/40 backdrop-blur-sm rounded-2xl flex items-center justify-center mb-6 border border-purple-300/50 dark:border-purple-400/30">
                <svg
                  className="w-8 h-8 text-purple-600 dark:text-purple-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-3 font-heading transition-colors duration-300">
                灵感绘图
              </h3>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed transition-colors duration-300">
                超写实艺术渲染，将文字提示瞬间转化为视觉杰作。
              </p>
            </div>
          </Link>
        </div>

        {/* Recent Activity */}
        {/* Recent Activity */}
        <div className="bg-white/70 dark:bg-white/10 backdrop-blur-2xl rounded-2xl p-8 shadow-2xl border border-white/60 dark:border-white/10 transition-colors duration-300">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <svg
                className="w-6 h-6 text-blue-600 dark:text-blue-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white font-heading transition-colors duration-300">
                最近活动
              </h2>
            </div>
            <Link
              href="/history"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium flex items-center gap-2 cursor-pointer transition-colors duration-200"
            >
              查看全部历史
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Activity Card 1 - Futuristic City */}
            <div className="group cursor-pointer">
              <div className="aspect-video rounded-xl mb-4 overflow-hidden relative shadow-lg">
                {/* Cyberpunk gradient background */}
                <div className="absolute inset-0 bg-gradient-to-b from-slate-700 via-slate-800 to-slate-900 dark:from-slate-800 dark:via-slate-900 dark:to-black"></div>

                {/* Ambient glow at bottom */}
                <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-orange-500/30 via-amber-500/20 to-transparent"></div>

                {/* City skyline silhouettes */}
                <div className="absolute bottom-0 left-0 right-0 flex items-end justify-center gap-1 px-4 pb-4 opacity-80">
                  <div className="w-8 h-20 bg-gradient-to-t from-slate-900 to-slate-800 dark:from-black dark:to-slate-900 rounded-t-sm relative">
                    <div className="absolute top-2 left-1 right-1 space-y-1">
                      <div className="h-0.5 bg-cyan-400/40 rounded"></div>
                      <div className="h-0.5 bg-cyan-400/30 rounded"></div>
                      <div className="h-0.5 bg-cyan-400/40 rounded"></div>
                    </div>
                  </div>
                  <div className="w-10 h-28 bg-gradient-to-t from-slate-900 to-slate-700 dark:from-black dark:to-slate-800 rounded-t-sm relative">
                    <div className="absolute top-1 left-0 right-0 h-2 bg-gradient-to-b from-cyan-400/60 to-transparent rounded-t-sm"></div>
                    <div className="absolute top-4 left-1 right-1 space-y-1">
                      <div className="h-0.5 bg-blue-400/50 rounded"></div>
                      <div className="h-0.5 bg-blue-400/40 rounded"></div>
                      <div className="h-0.5 bg-cyan-400/50 rounded"></div>
                      <div className="h-0.5 bg-blue-400/30 rounded"></div>
                    </div>
                  </div>
                  <div className="w-7 h-24 bg-gradient-to-t from-slate-900 to-slate-800 dark:from-black dark:to-slate-900 rounded-t-sm relative">
                    <div className="absolute top-3 left-1 right-1 space-y-1">
                      <div className="h-0.5 bg-cyan-400/40 rounded"></div>
                      <div className="h-0.5 bg-blue-400/30 rounded"></div>
                    </div>
                  </div>
                  <div className="w-9 h-22 bg-gradient-to-t from-slate-900 to-slate-800 dark:from-black dark:to-slate-900 rounded-t-sm relative">
                    <div className="absolute top-2 left-1 right-1 space-y-1">
                      <div className="h-0.5 bg-cyan-400/50 rounded"></div>
                      <div className="h-0.5 bg-blue-400/40 rounded"></div>
                      <div className="h-0.5 bg-cyan-400/30 rounded"></div>
                    </div>
                  </div>
                  <div className="w-6 h-18 bg-gradient-to-t from-slate-900 to-slate-800 dark:from-black dark:to-slate-900 rounded-t-sm relative">
                    <div className="absolute top-2 left-1 right-1 space-y-1">
                      <div className="h-0.5 bg-cyan-400/40 rounded"></div>
                    </div>
                  </div>
                </div>

                {/* Fog/mist effect */}
                <div className="absolute inset-0 bg-gradient-to-t from-transparent via-slate-500/10 to-slate-400/20 group-hover:via-slate-500/5 transition-all duration-300"></div>

                {/* Scan line effect */}
                <div className="absolute inset-0 opacity-20">
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-400/10 to-transparent animate-pulse"></div>
                </div>

                {/* Icon badge */}
                <div className="absolute top-3 right-3 w-10 h-10 bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-200">
                  <svg
                    className="w-6 h-6 text-blue-600 dark:text-blue-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                </div>
              </div>
              <h4 className="font-semibold text-slate-900 dark:text-white mb-1 transition-colors duration-300">
                未来城市概念设计
              </h4>
              <p className="text-sm text-slate-500 dark:text-slate-400 transition-colors duration-300">
                最后编辑: 2小时前
              </p>
            </div>

            {/* Activity Card 2 */}
            <div className="group cursor-pointer">
              <div className="aspect-video bg-slate-50 dark:bg-dark-surface rounded-xl mb-4 flex items-center justify-center border-2 border-dashed border-slate-200 dark:border-dark-border group-hover:border-blue-300 dark:group-hover:border-blue-700 group-hover:bg-blue-50 dark:group-hover:bg-blue-950/20 transition-colors duration-200">
                <svg
                  className="w-12 h-12 text-slate-400 dark:text-slate-500 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors duration-200"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <h4 className="font-semibold text-slate-900 dark:text-white mb-1 transition-colors duration-300">
                产品发布营销文案
              </h4>
              <p className="text-sm text-slate-500 dark:text-slate-400 transition-colors duration-300">
                最后编辑: 5小时前
              </p>
            </div>

            {/* Activity Card 3 */}
            <div className="group cursor-pointer">
              <div className="aspect-video bg-slate-50 dark:bg-dark-surface rounded-xl mb-4 flex items-center justify-center border-2 border-dashed border-slate-200 dark:border-dark-border group-hover:border-blue-300 dark:group-hover:border-blue-700 group-hover:bg-blue-50 dark:group-hover:bg-blue-950/20 transition-colors duration-200">
                <svg
                  className="w-12 h-12 text-slate-400 dark:text-slate-500 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors duration-200"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                  />
                </svg>
              </div>
              <h4 className="font-semibold text-slate-900 dark:text-white mb-1 transition-colors duration-300">
                Q3 业务复盘录音
              </h4>
              <p className="text-sm text-slate-500 dark:text-slate-400 transition-colors duration-300">
                昨天
              </p>
            </div>

            {/* New Project Card */}
            <div className="group cursor-pointer">
              <div className="aspect-video bg-slate-50 dark:bg-dark-surface rounded-xl mb-4 flex items-center justify-center border-2 border-dashed border-slate-200 dark:border-dark-border hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors duration-200">
                <div className="text-center">
                  <svg
                    className="w-12 h-12 text-slate-400 dark:text-slate-500 group-hover:text-blue-500 dark:group-hover:text-blue-400 mx-auto mb-2 transition-colors duration-200"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </div>
              </div>
              <h4 className="font-semibold text-slate-900 dark:text-white mb-1 transition-colors duration-300">
                开启新创作
              </h4>
              <p className="text-sm text-slate-500 dark:text-slate-400 transition-colors duration-300">
                点击快捷创建
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
