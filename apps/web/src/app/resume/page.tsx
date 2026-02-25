'use client';

import { motion } from 'framer-motion';
import { FileText, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AppLayout } from '@/components/layout/app-layout';

export default function ResumeEntryPage() {
  const router = useRouter();

  const handleUseTemplate = () => {
    router.push('/resume/template');
  };

  const handleUploadResume = () => {
    router.push('/resume/upload');
  };

  return (
    <AppLayout>
      <div className="flex-1 relative overflow-y-auto bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-slate-900 dark:via-blue-950/30 dark:to-purple-950/20">
        {/* 珍珠白网格渐变背景 */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#f0f0f0_1px,transparent_1px),linear-gradient(to_bottom,#f0f0f0_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#1a1a1a_1px,transparent_1px),linear-gradient(to_bottom,#1a1a1a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]" />

        {/* 主内容区 */}
        <div className="relative z-10 flex flex-col items-center justify-center px-8 py-20 min-h-full">
          {/* 标题区域 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h1 className="text-6xl font-bold text-slate-900 dark:text-slate-100 mb-6 tracking-tight">
              开启您的职业新篇章
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
              利用前沿 AI 工智能技术，为您打造一份脱颖而出的专业简历。选择一种方式
              <br />
              开始您的旅程。
            </p>
          </motion.div>

          {/* 卡片区域 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl w-full">
            {/* 使用通用模板卡片 */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="group relative"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-blue-400/20 to-cyan-400/20 rounded-3xl blur-2xl group-hover:blur-3xl transition-all duration-500" />

              <div className="relative bg-white/70 dark:bg-slate-800/70 backdrop-blur-[32px] rounded-3xl p-12 border border-white/60 dark:border-slate-700/60 shadow-[0_8px_32px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.3)] hover:shadow-[0_16px_48px_rgba(0,0,0,0.1)] dark:hover:shadow-[0_16px_48px_rgba(0,0,0,0.4)] transition-all duration-500 hover:-translate-y-1">
                {/* 图标 */}
                <div className="mb-8 flex justify-center">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/30">
                    <FileText className="w-10 h-10 text-white" strokeWidth={1.5} />
                  </div>
                </div>

                {/* 标题 */}
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4 text-center">
                  使用通用模板
                </h2>

                {/* 描述 */}
                <p className="text-slate-600 dark:text-slate-400 text-center mb-8 leading-relaxed">
                  从精选的专业设计模板中挑选，只需填写信息，AI 自动
                  <br />
                  帮您生成排版。
                </p>

                {/* 按钮 */}
                <button
                  onClick={handleUseTemplate}
                  className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-2xl font-medium shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 transition-all duration-300 hover:scale-[1.02]"
                >
                  立即开始
                </button>
              </div>
            </motion.div>

            {/* 上传已有简历卡片 */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="group relative"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-purple-400/20 to-pink-400/20 rounded-3xl blur-2xl group-hover:blur-3xl transition-all duration-500" />

              <div className="relative bg-white/70 dark:bg-slate-800/70 backdrop-blur-[32px] rounded-3xl p-12 border border-white/60 dark:border-slate-700/60 shadow-[0_8px_32px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.3)] hover:shadow-[0_16px_48px_rgba(0,0,0,0.1)] dark:hover:shadow-[0_16px_48px_rgba(0,0,0,0.4)] transition-all duration-500 hover:-translate-y-1">
                {/* 图标 */}
                <div className="mb-8 flex justify-center">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/30">
                    <Upload className="w-10 h-10 text-white" strokeWidth={1.5} />
                  </div>
                </div>

                {/* 标题 */}
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4 text-center">
                  上传已有简历
                </h2>

                {/* 描述 */}
                <p className="text-slate-600 dark:text-slate-400 text-center mb-8 leading-relaxed">
                  智能解析您现有的 PDF 或 DOCX 文件，针对查询岗位进
                  <br />
                  行精准优化。
                </p>

                {/* 按钮 */}
                <button
                  onClick={handleUploadResume}
                  className="w-full py-4 px-6 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-2xl font-medium border-2 border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-600 transition-all duration-300 hover:scale-[1.02]"
                >
                  上传文件
                </button>
              </div>
            </motion.div>
          </div>

          {/* 底部信息 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="mt-16 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"
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
