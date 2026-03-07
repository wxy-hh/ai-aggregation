'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Layout, Check } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import type { ResumeTemplate } from '@/types/resume-editor';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { useFocusReturn } from '@/hooks/use-focus-return';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

/**
 * 模板切换器组件属性
 */
export interface TemplateSwitcherProps {
  /** 当前模板 */
  currentTemplate: ResumeTemplate;
  /** 可用模板列表 */
  templates: ResumeTemplate[];
  /** 切换模板回调 */
  onTemplateChange: (templateId: string) => void;
}

/**
 * 模板切换器组件
 *
 * 功能:
 * - 显示可用模板列表
 * - 支持模板预览和切换
 * - 500ms 淡入淡出切换动效
 * - 全透明磨砂玻璃设计 (backdrop-filter blur(20px))
 * - 支持焦点陷阱和焦点返回
 * - 支持 Escape 键关闭
 *
 * 对应需求: 5.1, 5.2, 5.3, 5.4, 13.4, 13.5
 */
export function TemplateSwitcher({
  currentTemplate,
  templates,
  onTemplateChange,
}: TemplateSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const firstTemplateButtonRef = useRef<HTMLButtonElement>(null);
  const prefersReducedMotion = useReducedMotion();

  // 焦点陷阱
  const listRef = useFocusTrap<HTMLDivElement>(isOpen);

  // 焦点返回
  useFocusReturn(isOpen);

  // 打开时自动聚焦到第一个模板按钮
  useEffect(() => {
    if (isOpen && firstTemplateButtonRef.current) {
      firstTemplateButtonRef.current.focus();
    }
  }, [isOpen]);

  // 监听 Escape 键关闭列表
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleTemplateSelect = (templateId: string) => {
    if (templateId !== currentTemplate.id) {
      onTemplateChange(templateId);
    }
    setIsOpen(false);
  };

  return (
    <div className="relative">
      {/* 切换按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="
          px-4 py-2 rounded-xl
          bg-white/70 dark:bg-slate-800/70
          backdrop-blur-[20px]
          border border-white/60 dark:border-slate-700/60
          text-sm font-medium text-slate-700 dark:text-slate-300
          hover:bg-white/90 dark:hover:bg-slate-800/90
          transition-all duration-150
          flex items-center gap-2
        "
      >
        <Layout className="w-4 h-4" />
        切换模板
      </button>

      {/* 模板列表弹出层 */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* 遮罩层 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.15 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-40"
            />

            {/* 模板列表 */}
            <motion.div
              ref={listRef}
              initial={prefersReducedMotion ? {} : { opacity: 0, y: -10, scale: 0.95 }}
              animate={prefersReducedMotion ? {} : { opacity: 1, y: 0, scale: 1 }}
              exit={prefersReducedMotion ? {} : { opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
              role="dialog"
              aria-modal="true"
              aria-label="选择简历模板"
              className="
                absolute top-full right-0 mt-2
                w-80 max-h-96 overflow-y-auto
                bg-white/95 dark:bg-slate-800/95
                backdrop-blur-[20px]
                border border-white/60 dark:border-slate-700/60
                rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.12)]
                z-50 p-2
              "
            >
              <div className="space-y-1">
                {templates.map((template, index) => (
                  <button
                    key={template.id}
                    ref={index === 0 ? firstTemplateButtonRef : null}
                    onClick={() => handleTemplateSelect(template.id)}
                    className={`
                      w-full p-3 rounded-lg text-left
                      transition-colors duration-150
                      flex items-start gap-3
                      focus:outline-none focus:ring-2 focus:ring-[#2F6BFF] focus:ring-offset-2
                      ${
                        template.id === currentTemplate.id
                          ? 'bg-[#2F6BFF]/10 border border-[#2F6BFF]/30'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-700/50'
                      }
                    `}
                    aria-label={`选择 ${template.name} 模板`}
                    aria-current={template.id === currentTemplate.id ? 'true' : undefined}
                  >
                    {/* 缩略图占位 */}
                    <div
                      className="
                      w-12 h-16 flex-shrink-0 rounded
                      bg-slate-200 dark:bg-slate-700
                      flex items-center justify-center
                    "
                    >
                      {template.previewImage ? (
                        <img
                          src={template.previewImage}
                          alt={template.name}
                          className="w-full h-full object-cover rounded"
                        />
                      ) : (
                        <Layout className="w-6 h-6 text-slate-400" />
                      )}
                    </div>

                    {/* 模板信息 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {template.name}
                        </h4>
                        {template.id === currentTemplate.id && (
                          <Check className="w-4 h-4 text-[#2F6BFF] flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                        {template.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
