'use client';

import { motion } from 'framer-motion';
import { Layout } from 'lucide-react';
import { useEffect, useRef, useState, Suspense, lazy, useMemo } from 'react';
import { ResumePreview } from './resume-preview';
import { useResumeEditorStore } from '@/stores/resume-editor-store';

// 动态导入重组件以减少初始包体积
const PDFExportButton = lazy(() =>
  import('./pdf-export-button').then((mod) => ({ default: mod.PDFExportButton }))
);

const WordExportButton = lazy(() =>
  import('./word-export-button').then((mod) => ({ default: mod.WordExportButton }))
);

export function PreviewViewport() {
  // 优化：只订阅需要的状态
  const doc = useResumeEditorStore((state) => state.doc);

  // 跟踪最近更新的字段路径，用于高亮动画
  const [recentlyUpdatedPath, setRecentlyUpdatedPath] = useState<string | undefined>(undefined);
  const prevDocRef = useRef(doc);
  const highlightTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // 响应式缩放状态
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  // 检测文档变化并触发高亮动画
  useEffect(() => {
    const prevDoc = prevDocRef.current;

    // 简单的变化检测：比较 updatedAt
    if (prevDoc.updatedAt !== doc.updatedAt) {
      // 触发高亮效果
      setRecentlyUpdatedPath(doc.updatedAt);

      // 清除之前的定时器
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }

      // 200ms 后清除高亮
      highlightTimerRef.current = setTimeout(() => {
        setRecentlyUpdatedPath(undefined);
      }, 200);
    }

    prevDocRef.current = doc;

    return () => {
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
    };
  }, [doc]);

  // 响应式缩放计算
  useEffect(() => {
    const calculateScale = () => {
      if (!containerRef.current) return;

      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;

      // A4 纸张尺寸（毫米转像素，1mm ≈ 3.7795px）
      const a4WidthPx = 210 * 3.7795; // 约 793.7px
      const a4HeightPx = 297 * 3.7795; // 约 1122.5px

      // 计算宽度和高度的缩放比例
      const scaleX = containerWidth / a4WidthPx;
      const scaleY = containerHeight / a4HeightPx;

      // 使用较小的缩放比例以确保完整显示
      const calculatedScale = Math.min(scaleX, scaleY, 1);

      // 设置最小和最大缩放限制
      const minScale = 0.3;
      const maxScale = 1;
      const finalScale = Math.max(minScale, Math.min(maxScale, calculatedScale));

      setScale(finalScale);
    };

    // 初始计算
    calculateScale();

    // 监听窗口大小变化
    window.addEventListener('resize', calculateScale);

    return () => {
      window.removeEventListener('resize', calculateScale);
    };
  }, []);

  // 优化：使用 useMemo 缓存派生状态，避免每次渲染都重新计算
  const hasContent = useMemo(
    () =>
      doc.personalInfo.name ||
      doc.personalInfo.title ||
      doc.workExperiences.length > 0 ||
      doc.educations.length > 0 ||
      doc.projects.length > 0 ||
      doc.skills.length > 0,
    [
      doc.personalInfo.name,
      doc.personalInfo.title,
      doc.workExperiences.length,
      doc.educations.length,
      doc.projects.length,
      doc.skills.length,
    ]
  );

  // 预览容器 ref（用于 PDF 导出）
  const previewRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col items-center overflow-y-auto py-8"
    >
      {/* 操作按钮组 */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="no-print flex justify-end gap-2 mb-6 w-full max-w-[210mm] flex-shrink-0"
      >
        {/* 使用 Suspense 包裹动态导入的组件，提供加载状态 */}
        <Suspense fallback={<ButtonSkeleton />}>
          {/* 下载 Word 按钮 */}
          <WordExportButton resumeTitle={doc.personalInfo.name || '简历'} />
        </Suspense>
        <Suspense fallback={<ButtonSkeleton />}>
          {/* 下载 PDF 按钮 */}
          <PDFExportButton previewRef={previewRef} resumeTitle={doc.personalInfo.name || '简历'} />
        </Suspense>
      </motion.div>

      {/* A4 纸张容器 - 响应式缩放 */}
      <div className="w-full flex-shrink-0 flex items-center justify-center mb-16">
        {/* A4 纸张预览 */}
        <motion.div
          ref={previewRef}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25 }}
          className="
            resume-preview-container a4-paper
            w-[210mm] min-h-[297mm]
            bg-white dark:bg-slate-900
            rounded-lg
            shadow-[0_0.5px_0_rgba(0,0,0,0.1),0_8px_32px_rgba(0,0,0,0.08)]
            dark:shadow-[0_0.5px_0_rgba(255,255,255,0.1),0_8px_32px_rgba(0,0,0,0.3)]
            overflow-hidden
            relative
            origin-center
            transition-transform
            duration-300
          "
          style={{
            // 响应式缩放：在小屏幕上自动缩放以适应视口
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
          }}
        >
          {/* 空状态提示 */}
          {!hasContent && (
            <div className="absolute inset-0 flex items-center justify-center p-12">
              <div className="text-center space-y-4 max-w-md">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                  className="flex justify-center"
                >
                  <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-800">
                    <Layout className="w-12 h-12 text-slate-400 dark:text-slate-600" />
                  </div>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                  className="space-y-2"
                >
                  <h3 className="text-xl font-semibold text-slate-700 dark:text-slate-300">
                    实时预览区
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    在左侧编辑区填写内容后,您的简历将在这里实时呈现。
                    <br />
                    所见即所得,随时查看最终效果。
                  </p>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.4 }}
                  className="pt-2"
                >
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                    <div className="w-2 h-2 rounded-full bg-[#2F6BFF] animate-pulse" />
                    <span className="text-xs text-slate-600 dark:text-slate-400">等待内容输入</span>
                  </div>
                </motion.div>
              </div>
            </div>
          )}

          {/* 实际简历预览内容 */}
          {hasContent && <ResumePreview document={doc} recentlyUpdatedPath={recentlyUpdatedPath} />}
        </motion.div>
      </div>

      {/* 悬浮效果提示 */}
      <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-6 mb-8">
        实时预览 · A4 尺寸 (210mm × 297mm)
      </p>
    </div>
  );
}

/**
 * 按钮骨架屏组件
 * 用于动态导入组件的加载状态
 */
function ButtonSkeleton() {
  return (
    <div
      className="
        px-4 py-2 rounded-lg
        bg-slate-200/50 dark:bg-slate-700/50
        animate-pulse
        w-24 h-9
      "
      aria-label="加载中"
    />
  );
}
