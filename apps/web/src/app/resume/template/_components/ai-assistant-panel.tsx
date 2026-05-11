'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, AlertCircle, CheckCircle2 } from 'lucide-react';
import { ScoreRing } from './score-ring';
import { useResumeEditorStore } from '@/stores/resume-editor-store';
import type { EditModule } from '@/types/resume-editor';
import { authHeaders } from '@/lib/api/client';

/**
 * AI 助手面板组件
 *
 * 功能:
 * - 显示动态评分圆环
 * - 展示优化建议列表（最多 5 条）
 * - 根据优先级使用不同视觉样式
 * - 支持建议点击交互（定位到对应编辑区域）
 * - 手动触发诊断（点击按钮）
 *
 * 对应需求: 6.5, 6.6, 6.7, 7.2, 7.3, 7.4, 7.5
 */
export function AIAssistantPanel() {
  // 优化：使用精确选择器，只订阅需要的状态
  // 不订阅 doc，改为在需要时通过 getState() 获取
  const score = useResumeEditorStore((state) => state.score);
  const suggestions = useResumeEditorStore((state) => state.suggestions);
  const aiStatus = useResumeEditorStore((state) => state.aiStatus);

  // 订阅隐私选项（用于 API 调用）
  const allowContactFieldsToAI = useResumeEditorStore(
    (state) => state.privacyOptions?.allowContactFieldsToAI || false
  );

  // Actions 不会变化，可以直接获取
  const setActiveModule = useResumeEditorStore((state) => state.setActiveModule);
  const setHighlightTargetPath = useResumeEditorStore((state) => state.setHighlightTargetPath);
  const setAIStatus = useResumeEditorStore((state) => state.setAIStatus);
  const setScoreAndSuggestions = useResumeEditorStore((state) => state.setScoreAndSuggestions);

  /**
   * 调用 AI 诊断 API
   * 优化：使用 getState() 获取最新的 doc，避免订阅整个 doc 对象
   */
  const callDiagnoseAPI = async () => {
    // 获取最新的 doc 数据（不订阅）
    const doc = useResumeEditorStore.getState().doc;

    // 如果简历内容为空，不调用 API
    if (!doc.personalInfo.name && doc.workExperiences.length === 0) {
      return;
    }

    setAIStatus('diagnosing');

    try {
      console.log('🔍 开始调用诊断 API，简历数据:', doc);

      const response = await fetch('/api/resume/diagnose', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          resume: doc,
          privacy: {
            allowContactFields: allowContactFieldsToAI,
          },
        }),
      });

      console.log('📊 诊断 API 响应状态:', response.status, response.statusText);

      if (!response.ok) {
        let errorText = '';
        try {
          errorText = await response.text();
        } catch (e) {
          errorText = '无法读取错误响应体';
        }

        console.error('❌ 诊断 API 错误:', {
          status: response.status,
          statusText: response.statusText,
          errorText: errorText,
          url: '/api/resume/diagnose',
        });

        let errorMessage = '诊断失败';
        try {
          if (errorText) {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.error || errorData.details || errorMessage;
          }
        } catch (e) {
          // 如果无法解析 JSON，使用原始文本
          errorMessage = errorText || errorMessage;
        }

        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log('✅ 诊断 API 成功响应:', data);

      // 更新评分和建议
      setScoreAndSuggestions(data.score, data.suggestions);
      setAIStatus('idle');
    } catch (error) {
      console.error('❌ AI 诊断失败:', error);
      setAIStatus('error');

      // 失败后重置为初始状态
      setTimeout(() => {
        setAIStatus('idle');
      }, 3000);
    }
  };

  // 是否正在加载
  const isLoading = aiStatus === 'diagnosing';

  // 是否有建议数据
  const hasSuggestions = suggestions.length > 0;

  // 最多显示 5 条建议
  const displaySuggestions = suggestions.slice(0, 5);

  /**
   * 根据目标路径判断应该激活哪个模块
   * @param targetPath - 目标字段路径
   * @returns 对应的模块名称
   */
  const getModuleFromPath = (targetPath: string): EditModule => {
    if (!targetPath || typeof targetPath !== 'string') return 'personal';
    if (targetPath.startsWith('personalInfo')) return 'personal';
    if (targetPath.startsWith('workExperiences')) return 'work';
    if (targetPath.startsWith('educations')) return 'education';
    if (targetPath.startsWith('projects')) return 'project';
    if (targetPath.startsWith('skills')) return 'skills';
    return 'personal'; // 默认返回个人信息模块
  };

  /**
   * 处理建议点击事件
   * @param targetPath - 目标字段路径
   */
  const handleSuggestionClick = (targetPath: string) => {
    if (!targetPath || typeof targetPath !== 'string') return;

    // 1. 切换到对应的模块
    const module = getModuleFromPath(targetPath);
    setActiveModule(module);

    // 2. 设置高亮目标路径，触发 pulse 动画
    setHighlightTargetPath(targetPath);
  };

  return (
    <div className="h-full p-6 space-y-6 overflow-y-auto">
      {/* 标题 */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-5 h-5 text-[#2F6BFF]" />
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">AI 诊断中心</h2>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400">点击按钮开始评估简历质量</p>
      </motion.div>

      {/* 诊断按钮 */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
      >
        <button
          onClick={callDiagnoseAPI}
          disabled={isLoading}
          className="
            w-full py-3 px-4 rounded-xl
            bg-gradient-to-r from-[#2F6BFF] to-[#5B8FFF]
            hover:from-[#2557E0] hover:to-[#4A7EE6]
            disabled:from-slate-300 disabled:to-slate-400
            text-white font-semibold text-sm
            transition-all duration-200
            shadow-lg hover:shadow-xl
            disabled:cursor-not-allowed disabled:opacity-60
            focus:outline-none focus:ring-2 focus:ring-[#2F6BFF] focus:ring-offset-2
          "
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              AI 诊断中...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4" />
              开始 AI 诊断
            </span>
          )}
        </button>
      </motion.div>

      {/* 评分圆环 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.15 }}
        className="
          relative rounded-2xl p-8
          bg-white/90 dark:bg-slate-800/90
          backdrop-blur-[28px]
          border border-white/60 dark:border-slate-700/60
          shadow-[0_8px_32px_rgba(0,0,0,0.08)]
        "
      >
        <ScoreRing score={score} isLoading={isLoading} size="md" />

        {/* 评分说明 */}
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-4 text-center">
          {isLoading
            ? 'AI 正在分析您的简历...'
            : score === 0
              ? '点击上方按钮开始诊断'
              : '继续优化以提升简历质量'}
        </p>

        {/* aria-live 区域用于播报 AI 诊断状态 */}
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {isLoading && 'AI 正在分析您的简历'}
          {!isLoading && score > 0 && `AI 诊断完成，综合评分 ${score} 分`}
          {aiStatus === 'error' && 'AI 诊断失败，请稍后重试'}
        </div>
      </motion.div>

      {/* 优化建议列表 */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.25 }}
        className="space-y-3"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">优化建议</h3>
          {hasSuggestions && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {displaySuggestions.length} / {suggestions.length}
            </span>
          )}
        </div>

        {/* aria-live 区域用于播报新建议 */}
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {hasSuggestions && !isLoading && `收到 ${suggestions.length} 条优化建议`}
        </div>

        {/* 有建议时显示建议列表 */}
        {hasSuggestions ? (
          <div className="space-y-2">
            {displaySuggestions.map((suggestion, index) => (
              <motion.div
                key={suggestion.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1 * index }}
              >
                <SuggestionCard
                  priority={suggestion.priority}
                  title={suggestion.title}
                  description={suggestion.description}
                  targetPath={suggestion.targetPath}
                  completed={false}
                  isExample={false}
                  onClick={handleSuggestionClick}
                />
              </motion.div>
            ))}
          </div>
        ) : (
          /* 空状态提示卡片 */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="
              rounded-xl p-6
              bg-slate-50/80 dark:bg-slate-800/50
              backdrop-blur-[20px]
              border border-slate-200/60 dark:border-slate-700/60
            "
          >
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-700/50">
                <Sparkles className="w-6 h-6 text-slate-400 dark:text-slate-500" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">等待诊断</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  点击上方"开始 AI 诊断"按钮，AI 将分析您的简历并提供个性化的优化建议
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* 示例建议（仅在空状态时显示） */}
        {!hasSuggestions && (
          <div className="space-y-2 opacity-40">
            <p className="text-xs text-slate-500 dark:text-slate-400 px-1">示例建议：</p>
            <SuggestionCard
              priority="high"
              title="补充量化成果"
              description="在工作经历中添加具体的数据指标"
              completed={false}
              isExample={true}
            />
            <SuggestionCard
              priority="medium"
              title="完善技能描述"
              description="添加更多专业技能和工具经验"
              completed={false}
              isExample={true}
            />
          </div>
        )}
      </motion.div>
    </div>
  );
}

/**
 * 建议卡片组件属性
 */
interface SuggestionCardProps {
  /** 优先级 */
  priority: 'high' | 'medium' | 'low';
  /** 建议标题 */
  title: string;
  /** 建议描述 */
  description: string;
  /** 目标字段路径（可选） */
  targetPath?: string;
  /** 是否已完成 */
  completed: boolean;
  /** 是否为示例（示例不可点击） */
  isExample?: boolean;
  /** 点击回调 */
  onClick?: (targetPath: string) => void;
}

/**
 * 建议卡片组件
 *
 * 功能:
 * - 根据优先级显示不同的视觉样式
 * - 高优先级使用淡红色边框
 * - 已完成显示绿色对勾图标
 * - 支持点击交互（非示例状态）
 * - 支持键盘导航（Enter 和 Space 键）
 * - 点击后触发定位和高亮动画
 *
 * 对应需求: 6.7, 7.2, 7.3, 7.4, 7.5, 13.1, 13.2
 */
function SuggestionCard({
  priority,
  title,
  description,
  targetPath,
  completed,
  isExample = false,
  onClick,
}: SuggestionCardProps) {
  // 优先级样式映射
  const priorityStyles = {
    high: 'border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20',
    medium: 'border-yellow-200 dark:border-yellow-900/50 bg-yellow-50/50 dark:bg-yellow-950/20',
    low: 'border-slate-200 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800/20',
  };

  // 处理点击事件
  const handleClick = () => {
    if (isExample || !targetPath || completed) return;

    // 调用父组件传入的点击回调
    if (onClick) {
      onClick(targetPath);
    }
  };

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isExample || !targetPath || completed) return;

    // Enter 或 Space 键触发点击
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  const isInteractive = !isExample && targetPath && !completed;

  return (
    <motion.div
      whileHover={isInteractive ? { scale: 1.02 } : {}}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={isInteractive ? 0 : -1}
      role={isInteractive ? 'button' : undefined}
      aria-label={isInteractive ? `查看并优化: ${title}` : undefined}
      aria-disabled={!isInteractive}
      className={`
        relative rounded-xl p-4
        backdrop-blur-[20px] border
        transition-all duration-150
        ${completed ? 'opacity-60' : ''}
        ${isInteractive ? 'cursor-pointer hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#2F6BFF] focus:ring-offset-2' : 'cursor-default'}
        ${priorityStyles[priority]}
      `}
    >
      <div className="flex items-start gap-3">
        {/* 图标 */}
        <div className="flex-shrink-0 mt-0.5" aria-hidden="true">
          {completed ? (
            <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
          ) : (
            <AlertCircle
              className={`w-5 h-5 ${
                priority === 'high'
                  ? 'text-red-600 dark:text-red-400'
                  : priority === 'medium'
                    ? 'text-yellow-600 dark:text-yellow-400'
                    : 'text-slate-600 dark:text-slate-400'
              }`}
            />
          )}
        </div>

        {/* 内容 */}
        <div className="flex-1 min-w-0">
          <h4
            className={`text-sm font-semibold mb-1 ${
              completed
                ? 'text-slate-600 dark:text-slate-400 line-through'
                : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {title}
          </h4>
          <p className="text-xs text-slate-600 dark:text-slate-400">{description}</p>
        </div>
      </div>
    </motion.div>
  );
}
