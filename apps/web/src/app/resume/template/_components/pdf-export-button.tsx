'use client';

import { motion } from 'framer-motion';
import { Loader2, Printer, FileDown } from 'lucide-react';
import { useState } from 'react';
import { useResumeEditorStore } from '@/stores/resume-editor-store';

const PRINT_IFRAME_ID = 'resume-pdf-print-frame';

function getPrintablePreview(previewRef?: React.RefObject<HTMLDivElement | null>) {
  if (!previewRef?.current) return null;

  const clonedPreview = previewRef.current.cloneNode(true) as HTMLDivElement;
  clonedPreview.querySelectorAll('.no-print').forEach((element) => element.remove());
  clonedPreview.style.transform = 'none';
  clonedPreview.style.transformOrigin = 'top left';
  clonedPreview.style.width = '210mm';
  clonedPreview.style.minHeight = '297mm';
  clonedPreview.style.height = 'auto';
  clonedPreview.style.margin = '0';
  clonedPreview.style.boxShadow = 'none';
  clonedPreview.style.borderRadius = '0';

  return clonedPreview;
}

async function printPreviewInIframe(previewElement: HTMLDivElement, fileName: string) {
  document.getElementById(PRINT_IFRAME_ID)?.remove();

  const iframe = document.createElement('iframe');
  iframe.id = PRINT_IFRAME_ID;
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';

  document.body.appendChild(iframe);

  const iframeWindow = iframe.contentWindow;
  const iframeDocument = iframeWindow?.document;

  if (!iframeWindow || !iframeDocument) {
    iframe.remove();
    throw new Error('打印容器初始化失败');
  }

  const headMarkup = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((node) => node.outerHTML)
    .join('');

  iframeDocument.open();
  iframeDocument.write(`
    <!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <title>${fileName}</title>
        ${headMarkup}
        <style>
          @page {
            size: A4 portrait;
            margin: 0;
          }

          html,
          body {
            margin: 0;
            padding: 0;
            background: #ffffff;
            width: 210mm;
            min-height: 297mm;
            overflow: visible;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          body {
            display: block;
          }

          .pdf-print-root {
            width: 210mm;
            min-height: 297mm;
            margin: 0;
          }

          .pdf-print-root .resume-preview-container,
          .pdf-print-root .a4-paper {
            transform: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            margin: 0 !important;
          }
        </style>
      </head>
      <body>
        <div class="pdf-print-root"></div>
      </body>
    </html>
  `);
  iframeDocument.close();

  const printRoot = iframeDocument.querySelector('.pdf-print-root');
  if (!printRoot) {
    iframe.remove();
    throw new Error('打印内容挂载失败');
  }

  printRoot.appendChild(previewElement);

  await new Promise((resolve) => window.setTimeout(resolve, 150));
  await iframeDocument.fonts?.ready;

  await new Promise<void>((resolve) => {
    let cleanedUp = false;

    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      iframeWindow.removeEventListener('afterprint', cleanup);
      iframe.remove();
      resolve();
    };

    iframeWindow.addEventListener('afterprint', cleanup, { once: true });
    iframeWindow.focus();
    iframeWindow.print();

    window.setTimeout(cleanup, 1000);
  });
}

/**
 * PDF 导出按钮组件属性
 */
export interface PDFExportButtonProps {
  /** 预览容器的 ref（用于获取要打印的内容） */
  previewRef?: React.RefObject<HTMLDivElement | null>;
  /** 是否禁用 */
  disabled?: boolean;
  /** 简历标题（用于文件名） */
  resumeTitle?: string;
  /** 导出模式：'print' 使用浏览器打印，'download' 使用 html2pdf.js 直接下载 */
  mode?: 'print' | 'download';
}

/**
 * PDF 导出按钮组件
 *
 * 功能:
 * - 触发 PDF 导出（支持浏览器打印和直接下载两种模式）
 * - 显示导出进度状态
 * - 导出时冻结编辑状态（通过 store 状态控制）
 * - 与预览视口保持布局一致性
 *
 * 对应需求: 5.5, 5.6, 5.7
 */
export function PDFExportButton({
  previewRef,
  disabled = false,
  resumeTitle = '简历',
  mode = 'print',
}: PDFExportButtonProps) {
  const [isExportingLocal, setIsExportingLocal] = useState(false);

  // 从 store 获取冻结状态控制方法
  const setStoreExporting = useResumeEditorStore((state) => state.setIsExporting);

  /**
   * 使用浏览器打印 API 导出 PDF
   * 优点：与预览视口完全一致，无需额外依赖
   * 缺点：需要用户手动选择"另存为 PDF"
   */
  const handlePrintExport = async () => {
    if (disabled || isExportingLocal) return;

    const originalTitle = document.title;

    try {
      setIsExportingLocal(true);
      setStoreExporting(true); // 冻结编辑状态

      // 设置文档标题（会显示在打印预览中）
      const fileName = `${resumeTitle || '简历'}_${new Date().toISOString().split('T')[0]}`;
      document.title = fileName;

      // 等待更长时间确保 React 状态更新和 DOM 完全渲染
      await new Promise((resolve) => setTimeout(resolve, 300));

      const printablePreview = getPrintablePreview(previewRef);

      if (printablePreview) {
        await printPreviewInIframe(printablePreview, fileName);
      } else {
        window.print();
      }
    } catch (error) {
      console.error('PDF 导出失败:', error);
      alert('PDF 导出失败，请重试');
    } finally {
      document.title = originalTitle;
      setIsExportingLocal(false);
      setStoreExporting(false); // 解除冻结
    }
  };

  /**
   * 使用 html2pdf.js 直接下载 PDF
   * 优点：一键下载，无需用户操作
   * 缺点：需要动态加载库，可能与预览有细微差异
   */
  const handleDirectDownload = async () => {
    if (disabled || isExportingLocal || !previewRef?.current) return;

    try {
      setIsExportingLocal(true);
      setStoreExporting(true); // 冻结编辑状态

      // 动态导入 html2pdf.js（避免增加初始包体积）
      const html2pdf = (await import('html2pdf.js')).default;

      const fileName = `${resumeTitle || '简历'}_${new Date().toISOString().split('T')[0]}.pdf`;

      // 配置选项：确保与 A4 预览一致
      const options = {
        margin: 0,
        filename: fileName,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: {
          scale: 2, // 高清输出
          useCORS: true,
          letterRendering: true,
          logging: false,
        },
        jsPDF: {
          unit: 'mm',
          format: 'a4',
          orientation: 'portrait' as const,
          compress: true,
        },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
      };

      // 克隆预览内容以避免影响原始 DOM
      const element = previewRef.current.cloneNode(true) as HTMLElement;

      // 移除不需要的元素（如按钮、工具栏等）
      element.querySelectorAll('.no-print').forEach((el) => el.remove());

      // 重置样式以确保正确渲染
      element.style.transform = 'none';
      element.style.width = '210mm';
      element.style.height = '297mm';
      element.style.boxShadow = 'none';
      element.style.borderRadius = '0';

      // 生成并下载 PDF
      await html2pdf().set(options).from(element).save();
    } catch (error) {
      console.error('PDF 下载失败:', error);
      alert('PDF 下载失败，请尝试使用浏览器打印方式');
    } finally {
      setIsExportingLocal(false);
      setStoreExporting(false); // 解除冻结
    }
  };

  /**
   * 根据模式选择导出方法
   */
  const handleExport = () => {
    if (mode === 'download') {
      handleDirectDownload();
    } else {
      handlePrintExport();
    }
  };

  return (
    <div className="relative">
      {/* 主按钮 */}
      <motion.button
        onClick={handleExport}
        disabled={disabled || isExportingLocal}
        whileHover={!disabled && !isExportingLocal ? { scale: 1.02 } : {}}
        whileTap={!disabled && !isExportingLocal ? { scale: 0.98 } : {}}
        className="
          px-4 py-2 rounded-xl
          bg-[#2F6BFF] hover:bg-[#2557CC]
          text-white text-sm font-medium
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-all duration-150
          flex items-center gap-2
          shadow-lg shadow-[#2F6BFF]/30
          focus:outline-none focus:ring-2 focus:ring-[#2F6BFF] focus:ring-offset-2
        "
        title={mode === 'print' ? '使用浏览器打印导出 PDF' : '直接下载 PDF 文件'}
        aria-label={mode === 'print' ? '打印导出 PDF' : '下载 PDF 文件'}
        aria-busy={isExportingLocal}
      >
        {isExportingLocal ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            {mode === 'download' ? '生成中...' : '准备打印...'}
          </>
        ) : (
          <>
            {mode === 'download' ? (
              <FileDown className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Printer className="w-4 h-4" aria-hidden="true" />
            )}
            下载 PDF
          </>
        )}
      </motion.button>
    </div>
  );
}
