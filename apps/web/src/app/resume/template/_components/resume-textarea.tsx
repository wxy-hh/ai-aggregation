import * as React from 'react';
import { cn } from '@/lib/utils';
import { Sparkles } from 'lucide-react';

export interface ResumeTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  /** 最大字符长度限制 */
  maxLength?: number;
  /** 是否显示字符计数 */
  showCount?: boolean;
  /** 是否显示 AI 润色按钮 */
  showPolishButton?: boolean;
  /** AI 润色按钮点击回调 */
  onPolishClick?: () => void;
}

/**
 * 简历编辑器专用文本域组件
 * 特性：
 * - 聚焦时科技蓝色 (#2F6BFF) 内发光效果
 * - 150ms 平滑过渡动画
 * - 玻璃态设计风格
 * - 可选的 AI 润色按钮
 */
const ResumeTextarea = React.forwardRef<HTMLTextAreaElement, ResumeTextareaProps>(
  (
    {
      className,
      label,
      error,
      helperText,
      maxLength,
      showCount = false,
      showPolishButton = false,
      onPolishClick,
      id,
      ...props
    },
    ref
  ) => {
    const [currentLength, setCurrentLength] = React.useState(0);
    const [textValue, setTextValue] = React.useState('');
    const isOverLimit = maxLength !== undefined && currentLength > maxLength;

    // 生成唯一的 ID 用于 label 关联
    const textareaId = id || `resume-textarea-${React.useId()}`;
    const helperId = `${textareaId}-helper`;
    const errorId = `${textareaId}-error`;

    // 检查字段是否为空或仅空白字符
    const isEmptyOrWhitespace = !textValue || textValue.trim().length === 0;

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setCurrentLength(value.length);
      setTextValue(value);
      props.onChange?.(e);
    };

    // 初始化时设置长度和值
    React.useEffect(() => {
      const value =
        props.value !== undefined ? String(props.value) : String(props.defaultValue || '');
      setCurrentLength(value.length);
      setTextValue(value);
    }, [props.value, props.defaultValue]);

    return (
      <div className="w-full space-y-2">
        {label && (
          <div className="flex items-center justify-between">
            <label
              htmlFor={textareaId}
              className="text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              {label}
              {props.required && <span className="text-[#2F6BFF] ml-1">*</span>}
            </label>
            {showCount && maxLength && (
              <span
                className={cn(
                  'text-xs transition-colors duration-150',
                  isOverLimit
                    ? 'text-red-500 font-medium'
                    : currentLength > maxLength * 0.9
                      ? 'text-amber-600 dark:text-amber-500'
                      : 'text-slate-400 dark:text-slate-500'
                )}
                aria-live="polite"
                aria-atomic="true"
              >
                {currentLength}/{maxLength}
              </span>
            )}
          </div>
        )}
        <textarea
          id={textareaId}
          maxLength={maxLength}
          className={cn(
            // 基础样式
            'flex min-h-[100px] w-full rounded-lg px-3 py-2 text-sm',
            // 背景和边框
            'bg-white/50 dark:bg-slate-900/50',
            'border border-slate-200 dark:border-slate-700',
            // 玻璃态效果
            'backdrop-blur-sm',
            // 文字样式
            'text-slate-900 dark:text-slate-100',
            'placeholder:text-slate-400 dark:placeholder:text-slate-500',
            // 聚焦状态 - 轻量高亮效果
            'focus:outline-none',
            'focus:border-[#2F6BFF]/60',
            'focus:shadow-[0_0_0_1px_rgba(47,107,255,0.3)]',
            // 150ms 过渡动画
            'transition-all duration-150 ease-in-out',
            // 禁用状态
            'disabled:cursor-not-allowed disabled:opacity-50',
            // 错误状态或超出长度限制
            (error || isOverLimit) &&
              'border-red-400 focus:border-red-500/60 focus:shadow-[0_0_0_1px_rgba(239,68,68,0.3)]',
            // 调整大小
            'resize-y',
            className
          )}
          ref={ref}
          onChange={handleChange}
          aria-invalid={!!(error || isOverLimit)}
          aria-describedby={error || isOverLimit ? errorId : helperText ? helperId : undefined}
          {...props}
        />
        {(error || helperText || isOverLimit) && (
          <p
            id={error || isOverLimit ? errorId : helperId}
            className={cn(
              'text-xs',
              error || isOverLimit ? 'text-red-500' : 'text-slate-500 dark:text-slate-400'
            )}
            role={error || isOverLimit ? 'alert' : 'status'}
            aria-live="polite"
          >
            {error || (isOverLimit ? `字符长度超出限制 ${maxLength} 字符` : helperText)}
          </p>
        )}

        {/* AI 润色按钮 */}
        {showPolishButton && (
          <button
            type="button"
            onClick={onPolishClick}
            disabled={isEmptyOrWhitespace}
            className={cn(
              // 基础样式
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
              // 玻璃态效果
              'bg-white/60 dark:bg-slate-800/60',
              'backdrop-blur-md',
              'border border-slate-200/60 dark:border-slate-700/60',
              // 文字和图标颜色
              'text-[#2F6BFF]',
              // 悬停效果
              'hover:bg-white/80 dark:hover:bg-slate-800/80',
              'hover:border-[#2F6BFF]/40',
              'hover:shadow-[0_2px_8px_rgba(47,107,255,0.15)]',
              // 焦点样式 - 2px 科技蓝外框
              'focus:outline-none focus:ring-2 focus:ring-[#2F6BFF] focus:ring-offset-2',
              // 过渡动画
              'transition-all duration-150 ease-in-out',
              // 禁用状态（字段为空或仅空白字符时）
              'disabled:opacity-40 disabled:cursor-not-allowed',
              'disabled:hover:bg-white/60 dark:disabled:hover:bg-slate-800/60',
              'disabled:hover:border-slate-200/60 dark:disabled:hover:border-slate-700/60',
              'disabled:hover:shadow-none'
            )}
            aria-label={`AI 智能润色${label ? ` - ${label}` : ''}`}
            aria-disabled={isEmptyOrWhitespace}
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            <span>AI 润色</span>
          </button>
        )}
      </div>
    );
  }
);
ResumeTextarea.displayName = 'ResumeTextarea';

export { ResumeTextarea };
