'use client';

import { motion } from 'framer-motion';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { useResumeEditorStore } from '@/stores/resume-editor-store';

/**
 * JSON 导出按钮组件
 *
 * 功能:
 * - 导出当前简历数据为 JSON 文件
 * - 文件名格式: resume-{timestamp}.json
 * - 触发浏览器下载
 */
export function JSONExportButton() {
  const [isExporting, setIsExporting] = useState(false);
  const doc = useResumeEditorStore((state) => state.doc);

  /**
   * 处理 JSON 导出
   */
  const handleExport = () => {
    try {
      setIsExporting(true);

      // 生成时间戳
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `resume-${timestamp}.json`;

      // 将简历文档转换为 JSON 字符串
      const jsonString = JSON.stringify(doc, null, 2);

      // 创建 Blob 对象
      const blob = new Blob([jsonString], { type: 'application/json' });

      // 创建下载链接
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;

      // 触发下载
      document.body.appendChild(link);
      link.click();

      // 清理
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('导出 JSON 失败:', error);
      // TODO: 显示错误提示
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <motion.button
      onClick={handleExport}
      disabled={isExporting}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="
        group
        relative
        px-4 py-2
        rounded-lg
        bg-white/80 dark:bg-slate-800/80
        backdrop-blur-[20px]
        border border-slate-200/50 dark:border-slate-700/50
        hover:border-[#2F6BFF]/30 dark:hover:border-[#2F6BFF]/30
        transition-all duration-150
        disabled:opacity-50 disabled:cursor-not-allowed
        shadow-sm hover:shadow-md
        focus:outline-none focus:ring-2 focus:ring-[#2F6BFF] focus:ring-offset-2
      "
      aria-label="导出简历数据为 JSON 文件"
      aria-busy={isExporting}
    >
      <div className="flex items-center gap-2">
        <Download
          className={`
            w-4 h-4
            text-slate-600 dark:text-slate-400
            group-hover:text-[#2F6BFF] dark:group-hover:text-[#2F6BFF]
            transition-colors duration-150
            ${isExporting ? 'animate-bounce' : ''}
          `}
          aria-hidden="true"
        />
        <span
          className="
            text-sm font-medium
            text-slate-700 dark:text-slate-300
            group-hover:text-[#2F6BFF] dark:group-hover:text-[#2F6BFF]
            transition-colors duration-150
          "
        >
          {isExporting ? '导出中...' : '导出 JSON'}
        </span>
      </div>

      {/* 悬停提示 */}
      <div
        className="
          absolute -bottom-10 left-1/2 -translate-x-1/2
          px-3 py-1.5
          rounded-md
          bg-slate-900 dark:bg-slate-700
          text-xs text-white
          whitespace-nowrap
          opacity-0 group-hover:opacity-100
          pointer-events-none
          transition-opacity duration-200
          z-10
        "
        role="tooltip"
        aria-hidden="true"
      >
        导出简历数据为 JSON 文件
      </div>
    </motion.button>
  );
}
