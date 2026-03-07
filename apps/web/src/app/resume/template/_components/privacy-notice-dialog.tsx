'use client';

import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, X, Info } from 'lucide-react';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { useFocusReturn } from '@/hooks/use-focus-return';

/**
 * 隐私告知弹窗组件属性
 */
interface PrivacyNoticeDialogProps {
  /** 是否显示弹窗 */
  isOpen: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 同意回调 */
  onAccept: (allowContactFields: boolean) => void;
}

/**
 * 隐私告知弹窗组件
 *
 * 功能:
 * - 首次使用 AI 功能前展示隐私告知
 * - 说明数据使用方式和隐私保护措施
 * - 提供"联系方式是否发送给 AI"的选项
 * - 用户同意后才能使用 AI 功能
 * - 支持焦点陷阱和焦点返回
 * - 支持 Escape 键关闭
 *
 * 对应需求: 3.12, 15, 13.4, 13.5
 */
export function PrivacyNoticeDialog({ isOpen, onClose, onAccept }: PrivacyNoticeDialogProps) {
  // 是否允许发送联系方式
  const [allowContactFields, setAllowContactFields] = React.useState(false);
  const acceptButtonRef = useRef<HTMLButtonElement>(null);

  // 焦点陷阱
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);

  // 焦点返回
  useFocusReturn(isOpen);

  // 打开时自动聚焦到同意按钮
  useEffect(() => {
    if (isOpen && acceptButtonRef.current) {
      acceptButtonRef.current.focus();
    }
  }, [isOpen]);

  // 监听 Escape 键关闭弹窗
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  /**
   * 处理同意按钮点击
   */
  const handleAccept = () => {
    onAccept(allowContactFields);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 遮罩层 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* 弹窗内容 */}
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <motion.div
              ref={dialogRef}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="privacy-dialog-title"
              aria-describedby="privacy-dialog-description"
              className="
                relative w-full max-w-lg
                bg-white dark:bg-slate-800
                rounded-2xl shadow-2xl
                overflow-hidden
              "
              onClick={(e) => e.stopPropagation()}
            >
              {/* 关闭按钮 */}
              <button
                onClick={onClose}
                className="
                  absolute top-4 right-4 z-10
                  p-2 rounded-lg
                  text-slate-400 hover:text-slate-600
                  dark:text-slate-500 dark:hover:text-slate-300
                  hover:bg-slate-100 dark:hover:bg-slate-700
                  transition-colors
                  focus:outline-none focus:ring-2 focus:ring-[#2F6BFF] focus:ring-offset-2
                "
                aria-label="关闭隐私保护说明对话框"
              >
                <X className="w-5 h-5" />
              </button>

              {/* 头部 */}
              <div className="p-6 pb-4 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 p-3 rounded-xl bg-[#2F6BFF]/10" aria-hidden="true">
                    <Shield className="w-6 h-6 text-[#2F6BFF]" />
                  </div>
                  <div className="flex-1">
                    <h2
                      id="privacy-dialog-title"
                      className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2"
                    >
                      隐私保护说明
                    </h2>
                    <p
                      id="privacy-dialog-description"
                      className="text-sm text-slate-600 dark:text-slate-400"
                    >
                      我们重视您的隐私安全，请仔细阅读以下内容
                    </p>
                  </div>
                </div>
              </div>

              {/* 内容区域 */}
              <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                {/* AI 功能说明 */}
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    AI 功能说明
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    我们使用 AI 技术为您提供简历润色和诊断服务。为了提供更准确的建议，AI
                    需要分析您的简历内容。
                  </p>
                </div>

                {/* 数据使用方式 */}
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    数据使用方式
                  </h3>
                  <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                    <li className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[#2F6BFF] mt-1.5" />
                      <span>您的简历数据将被发送至 AI 服务进行分析</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[#2F6BFF] mt-1.5" />
                      <span>AI 分析结果仅用于为您提供优化建议</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[#2F6BFF] mt-1.5" />
                      <span>我们不会将您的数据用于其他用途或与第三方共享</span>
                    </li>
                  </ul>
                </div>

                {/* 隐私保护措施 */}
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    隐私保护措施
                  </h3>
                  <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                    <li className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5" />
                      <span>所有数据传输均采用加密通道</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5" />
                      <span>服务端日志会自动脱敏处理敏感信息</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5" />
                      <span>您可以随时选择是否发送联系方式给 AI</span>
                    </li>
                  </ul>
                </div>

                {/* 联系方式选项 */}
                <div
                  className="
                  p-4 rounded-xl
                  bg-slate-50 dark:bg-slate-700/50
                  border border-slate-200 dark:border-slate-600
                "
                >
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowContactFields}
                      onChange={(e) => setAllowContactFields(e.target.checked)}
                      className="
                        mt-0.5 w-4 h-4 rounded
                        border-slate-300 dark:border-slate-600
                        text-[#2F6BFF] focus:ring-[#2F6BFF] focus:ring-offset-2
                        cursor-pointer
                      "
                      aria-describedby="contact-fields-description"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        允许发送联系方式（邮箱、电话）给 AI
                      </span>
                      <p
                        id="contact-fields-description"
                        className="text-xs text-slate-500 dark:text-slate-400 mt-1"
                      >
                        勾选后，AI
                        可以根据您的联系方式提供更个性化的建议。不勾选则不会发送这些信息。
                      </p>
                    </div>
                  </label>
                </div>

                {/* 提示信息 */}
                <div
                  className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30"
                  role="note"
                >
                  <Info
                    className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                    您可以随时在设置中修改隐私选项。点击"同意并继续"即表示您已阅读并同意上述隐私说明。
                  </p>
                </div>
              </div>

              {/* 底部按钮 */}
              <div className="p-6 pt-4 border-t border-slate-200 dark:border-slate-700">
                <div className="flex gap-3">
                  <button
                    onClick={onClose}
                    className="
                      flex-1 px-4 py-2.5 rounded-lg
                      text-sm font-medium
                      text-slate-700 dark:text-slate-300
                      bg-slate-100 dark:bg-slate-700
                      hover:bg-slate-200 dark:hover:bg-slate-600
                      transition-colors
                      focus:outline-none focus:ring-2 focus:ring-[#2F6BFF] focus:ring-offset-2
                    "
                    aria-label="取消并关闭对话框"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleAccept}
                    ref={acceptButtonRef}
                    className="
                      flex-1 px-4 py-2.5 rounded-lg
                      text-sm font-medium
                      text-white
                      bg-[#2F6BFF] hover:bg-[#2557D6]
                      transition-colors
                      focus:outline-none focus:ring-2 focus:ring-[#2F6BFF] focus:ring-offset-2
                    "
                    aria-label="同意隐私说明并继续使用 AI 功能"
                  >
                    同意并继续
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
