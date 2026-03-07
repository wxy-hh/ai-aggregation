'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Upload, AlertCircle, AlertTriangle } from 'lucide-react';
import { useState, useRef } from 'react';
import { useResumeEditorStore } from '@/stores/resume-editor-store';
import { ResumeDocumentSchema } from '@/schemas/resume-editor.schema';
import type { ResumeDocument } from '@/types/resume-editor';

/**
 * JSON 导入按钮组件
 *
 * 功能:
 * - 选择并解析 JSON 文件
 * - 使用 ResumeDocumentSchema 验证数据格式
 * - 验证失败时显示友好的错误提示
 * - 当前有数据时显示确认对话框
 * - 验证成功后更新 store
 */
export function JSONImportButton() {
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingDoc, setPendingDoc] = useState<ResumeDocument | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const updateDoc = useResumeEditorStore((state) => state.updateDoc);
  const currentDoc = useResumeEditorStore((state) => state.doc);

  /**
   * 检查当前是否有数据
   */
  const hasExistingData = (): boolean => {
    const { personalInfo, workExperiences, educations, projects, skills } = currentDoc;

    // 检查个人信息是否有非空字段
    const hasPersonalInfo =
      personalInfo.name.trim() !== '' ||
      personalInfo.title.trim() !== '' ||
      (personalInfo.email && personalInfo.email.trim() !== '') ||
      (personalInfo.phone && personalInfo.phone.trim() !== '') ||
      (personalInfo.location && personalInfo.location.trim() !== '') ||
      (personalInfo.summary && personalInfo.summary.trim() !== '');

    // 检查是否有任何列表数据
    const hasListData =
      workExperiences.length > 0 ||
      educations.length > 0 ||
      projects.length > 0 ||
      skills.length > 0;

    return hasPersonalInfo || hasListData;
  };

  /**
   * 处理文件选择
   */
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 重置错误状态
    setError(null);
    setIsImporting(true);

    try {
      // 读取文件内容
      const fileContent = await readFileAsText(file);

      // 解析 JSON
      let parsedData: unknown;
      try {
        parsedData = JSON.parse(fileContent);
      } catch (parseError) {
        throw new Error('JSON 格式无效，请检查文件内容');
      }

      // 使用 Zod schema 验证数据
      const validationResult = ResumeDocumentSchema.safeParse(parsedData);

      if (!validationResult.success) {
        // 提取第一个验证错误
        const firstError = validationResult.error.errors[0];
        const errorPath = firstError.path.join('.');
        const errorMessage = firstError.message;
        throw new Error(`数据验证失败: ${errorPath ? `${errorPath} - ` : ''}${errorMessage}`);
      }

      // 验证成功，检查是否需要确认
      const validatedDoc = validationResult.data as ResumeDocument;

      if (hasExistingData()) {
        // 有数据时显示确认对话框
        setPendingDoc(validatedDoc);
        setShowConfirmDialog(true);
      } else {
        // 无数据时直接导入
        updateDoc(validatedDoc);
      }

      // 清空文件输入，允许重复导入同一文件
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '导入失败，请重试';
      setError(errorMessage);
      console.error('导入 JSON 失败:', err);
    } finally {
      setIsImporting(false);
    }
  };

  /**
   * 读取文件为文本
   */
  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result;
        if (typeof result === 'string') {
          resolve(result);
        } else {
          reject(new Error('文件读取失败'));
        }
      };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsText(file);
    });
  };

  /**
   * 触发文件选择
   */
  const handleClick = () => {
    fileInputRef.current?.click();
  };

  /**
   * 关闭错误提示
   */
  const handleCloseError = () => {
    setError(null);
  };

  /**
   * 确认导入
   */
  const handleConfirmImport = () => {
    if (pendingDoc) {
      updateDoc(pendingDoc);
      setPendingDoc(null);
    }
    setShowConfirmDialog(false);
  };

  /**
   * 取消导入
   */
  const handleCancelImport = () => {
    setPendingDoc(null);
    setShowConfirmDialog(false);
  };

  return (
    <div className="relative">
      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        onChange={handleFileSelect}
        className="hidden"
        aria-label="选择 JSON 文件"
      />

      {/* 导入按钮 */}
      <motion.button
        onClick={handleClick}
        disabled={isImporting}
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
        aria-label="导入 JSON"
      >
        <div className="flex items-center gap-2">
          <Upload
            className={`
              w-4 h-4
              text-slate-600 dark:text-slate-400
              group-hover:text-[#2F6BFF] dark:group-hover:text-[#2F6BFF]
              transition-colors duration-150
              ${isImporting ? 'animate-bounce' : ''}
            `}
          />
          <span
            className="
              text-sm font-medium
              text-slate-700 dark:text-slate-300
              group-hover:text-[#2F6BFF] dark:group-hover:text-[#2F6BFF]
              transition-colors duration-150
            "
          >
            {isImporting ? '导入中...' : '导入 JSON'}
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
        >
          从 JSON 文件导入简历数据
        </div>
      </motion.button>

      {/* 确认对话框 */}
      <AnimatePresence>
        {showConfirmDialog && (
          <>
            {/* 遮罩层 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
              onClick={handleCancelImport}
            />

            {/* 对话框 */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              transition={{ type: 'spring', duration: 0.3 }}
              className="
                fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                w-full max-w-md
                p-6
                rounded-2xl
                bg-white/90 dark:bg-slate-800/90
                backdrop-blur-[28px]
                border border-slate-200/50 dark:border-slate-700/50
                shadow-2xl
                z-50
              "
              role="dialog"
              aria-labelledby="confirm-dialog-title"
              aria-describedby="confirm-dialog-description"
            >
              {/* 警告图标 */}
              <div className="flex justify-center mb-4">
                <div
                  className="
                    w-12 h-12
                    rounded-full
                    bg-amber-100 dark:bg-amber-900/30
                    flex items-center justify-center
                  "
                >
                  <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                </div>
              </div>

              {/* 标题 */}
              <h3
                id="confirm-dialog-title"
                className="
                  text-lg font-semibold
                  text-slate-900 dark:text-slate-100
                  text-center
                  mb-2
                "
              >
                确认导入
              </h3>

              {/* 描述 */}
              <p
                id="confirm-dialog-description"
                className="
                  text-sm
                  text-slate-600 dark:text-slate-400
                  text-center
                  mb-6
                "
              >
                导入新数据将覆盖当前所有简历内容，此操作无法撤销。确定要继续吗？
              </p>

              {/* 按钮组 */}
              <div className="flex gap-3">
                {/* 取消按钮 */}
                <motion.button
                  onClick={handleCancelImport}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="
                    flex-1
                    px-4 py-2.5
                    rounded-lg
                    bg-slate-100 dark:bg-slate-700
                    hover:bg-slate-200 dark:hover:bg-slate-600
                    text-slate-700 dark:text-slate-300
                    font-medium
                    transition-colors duration-150
                    focus:outline-none focus:ring-2 focus:ring-[#2F6BFF] focus:ring-offset-2
                  "
                >
                  取消
                </motion.button>

                {/* 确认按钮 */}
                <motion.button
                  onClick={handleConfirmImport}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="
                    flex-1
                    px-4 py-2.5
                    rounded-lg
                    bg-[#2F6BFF]
                    hover:bg-[#2557D6]
                    text-white
                    font-medium
                    transition-colors duration-150
                    shadow-lg shadow-[#2F6BFF]/20
                    focus:outline-none focus:ring-2 focus:ring-[#2F6BFF] focus:ring-offset-2
                  "
                >
                  确认导入
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 错误提示 */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="
            absolute top-full mt-2 left-0 right-0
            p-3
            rounded-lg
            bg-red-50 dark:bg-red-900/20
            border border-red-200 dark:border-red-800
            shadow-lg
            z-20
            min-w-[300px]
          "
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-red-800 dark:text-red-200 break-words">{error}</p>
            </div>
            <button
              onClick={handleCloseError}
              className="
                text-red-600 dark:text-red-400
                hover:text-red-800 dark:hover:text-red-200
                transition-colors
                flex-shrink-0
              "
              aria-label="关闭错误提示"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
