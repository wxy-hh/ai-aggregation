'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { FileText, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AppLayout } from '@/components/layout/app-layout';

export default function ResumeEntryPage() {
  const router = useRouter();

  const handleUseTemplate = () => {
    router.push('/resume/template');
  };

  return (
    <AppLayout>
      <div className="flex-1 relative overflow-y-auto bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-slate-900 dark:via-blue-950/30 dark:to-purple-950/20">
        {/* 主内容区 */}
        <div className="relative z-10 flex flex-col items-center justify-center px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-20 min-h-full">
          {/* 标题区域 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-10 lg:mb-16"
          >
            <h1 className="text-3xl sm:text-4xl lg:text-6xl font-bold text-slate-900 dark:text-slate-100 mb-4 lg:mb-6 tracking-tight">
              开启您的职业新篇章
            </h1>
            <p className="text-sm sm:text-base lg:text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
              利用前沿 AI 工智能技术，为您打造一份脱颖而出的专业简历。选择一种方式
              <br />
              开始您的旅程。
            </p>
          </motion.div>

          {/* 卡片区域 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 lg:gap-8 max-w-5xl w-full">
            {/* 使用通用模板卡片 */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="group relative"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-blue-400/20 to-cyan-400/20 rounded-3xl blur-2xl group-hover:blur-3xl transition-all duration-500" />

              <div
                onClick={handleUseTemplate}
                className="relative h-full bg-white/80 dark:bg-slate-800/80 backdrop-blur-[32px] rounded-3xl p-6 sm:p-8 lg:p-10 border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500 shadow-[0_8px_32px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.3)] hover:shadow-[0_16px_48px_rgba(0,0,0,0.1)] dark:hover:shadow-[0_16px_48px_rgba(0,0,0,0.4)] transition-all duration-300 hover:-translate-y-1 cursor-pointer flex flex-col"
              >
                {/* 图标 */}
                <div className="mb-6 flex justify-center">
                  <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center transition-all duration-300 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/30 group-hover:scale-110">
                    <FileText className="w-8 h-8 text-blue-500" strokeWidth={2} />
                  </div>
                </div>

                {/* 标题 */}
                <h2 className="text-xl lg:text-2xl font-bold text-slate-900 dark:text-slate-100 mb-3 text-center">
                  使用通用模板
                </h2>

                {/* 描述 */}
                <p className="text-slate-600 dark:text-slate-400 text-center mb-4 leading-relaxed">
                  从精选的专业设计模板中挑选，只需填写信息
                </p>

                {/* 特性说明 */}
                <div className="flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-500 mb-2">
                  <FileText className="w-4 h-4" />
                  <span>AI 自动帮您生成排版</span>
                </div>

                {/* 占位空间 */}
                <p className="text-xs text-slate-400 dark:text-slate-600 mb-6 text-center">
                  多种专业模板可选
                </p>

                {/* 提示信息 */}
                <div className="mt-auto p-3.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                  <p className="text-sm text-blue-800 dark:text-blue-300 text-center">
                    ✨ 快速创建专业简历
                  </p>
                </div>
              </div>
            </motion.div>

            {/* 上传已有简历卡片 */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="relative"
            >
              <div className="absolute inset-0 rounded-3xl bg-slate-300/20 blur-2xl" />

              <div
                aria-disabled="true"
                className="relative h-full cursor-not-allowed rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50/90 p-6 sm:p-8 lg:p-10 opacity-65 shadow-[0_8px_32px_rgba(0,0,0,0.04)] backdrop-blur-[16px] dark:border-slate-700 dark:bg-slate-800/70 dark:opacity-60 flex flex-col"
              >
                {/* 图标 */}
                <div className="mb-6 flex justify-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-200/70 dark:bg-slate-700/60">
                    <Upload className="h-8 w-8 text-slate-400 dark:text-slate-500" strokeWidth={2} />
                  </div>
                </div>

                {/* 标题 */}
                <h2 className="mb-3 text-center text-xl lg:text-2xl font-bold text-slate-700 dark:text-slate-300">
                  上传您的简历
                </h2>

                {/* 描述 */}
                <p className="mb-4 text-center leading-relaxed text-slate-500 dark:text-slate-400">
                  点击选择文件或拖拽文件到此区域
                </p>

                {/* 支持格式 */}
                <div className="mb-2 flex items-center justify-center gap-2 text-sm text-slate-400 dark:text-slate-500">
                  <FileText className="h-4 w-4" />
                  <span>支持 PDF、Word(.docx)、图片格式</span>
                </div>

                {/* 文件大小限制 */}
                <p className="mb-6 flex items-center justify-center text-xs text-slate-400 dark:text-slate-500">
                  文件大小不超过 10MB
                </p>

                {/* 提示信息 */}
                <div className="mt-auto rounded-xl border border-slate-200 bg-slate-100/90 p-3.5 dark:border-slate-700 dark:bg-slate-800/80">
                  <p className="text-center text-sm text-slate-500 dark:text-slate-400">
                    该功能暂未开放，敬请期待
                  </p>
                </div>
              </div>
            </motion.div>
          </div>

          {/* 底部信息 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="mt-10 lg:mt-16 flex items-start sm:items-center gap-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span>数据加密保护 · 隐私安全保障 · 符合 GDPR 标准</span>
          </motion.div>
        </div>
      </div>
    </AppLayout>
  );
}
