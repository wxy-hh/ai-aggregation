'use client';

import { Plus, Trash2, GripVertical } from 'lucide-react';
import { useState, useEffect } from 'react';
import { ResumeInput } from './resume-input';
import { ResumeTextarea } from './resume-textarea';
import type { ResumeWorkExperience } from '@/types/resume-editor';

/**
 * 工作经历列表编辑组件属性
 */
export interface WorkExperienceListProps {
  /** 工作经历列表 */
  experiences: ResumeWorkExperience[];
  /** 添加工作经历回调 */
  onAdd: (experience: Omit<ResumeWorkExperience, 'id'>) => void;
  /** 更新工作经历回调 */
  onUpdate: (id: string, updates: Partial<ResumeWorkExperience>) => void;
  /** 删除工作经历回调 */
  onRemove: (id: string) => void;
}

/**
 * 工作经历列表编辑组件
 *
 * 功能:
 * - 显示工作经历列表
 * - 添加新的工作经历
 * - 编辑现有工作经历
 * - 删除工作经历
 */
export function WorkExperienceList({
  experiences,
  onAdd,
  onUpdate,
  onRemove,
}: WorkExperienceListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(
    experiences.length > 0 ? experiences[0].id : null
  );

  // 当添加新项时，自动展开最新的项
  useEffect(() => {
    if (experiences.length > 0) {
      const latestExp = experiences[experiences.length - 1];
      // 如果最新项是空的（刚添加的），自动展开它
      if (
        !latestExp.company &&
        !latestExp.position &&
        !latestExp.period &&
        !latestExp.description
      ) {
        setExpandedId(latestExp.id);
      }
    }
  }, [experiences]);

  const handleAdd = () => {
    onAdd({
      company: '',
      position: '',
      period: '',
      description: '',
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="space-y-4">
      {/* 工作经历列表 */}
      {experiences.map((exp, index) => {
        const isExpanded = expandedId === exp.id;
        const hasContent = exp.company || exp.position || exp.period || exp.description;

        return (
          <div
            key={exp.id}
            className="
              border border-slate-200 dark:border-slate-700
              rounded-xl overflow-hidden
              bg-white/50 dark:bg-slate-800/50
            "
          >
            {/* 头部 - 可折叠 */}
            <div
              className="
                w-full px-4 py-3
                flex items-center justify-between
                hover:bg-slate-50 dark:hover:bg-slate-700/50
                transition-colors duration-150
                cursor-pointer
              "
              onClick={() => toggleExpand(exp.id)}
              role="button"
              tabIndex={0}
              aria-expanded={isExpanded}
              aria-controls={`work-exp-${exp.id}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggleExpand(exp.id);
                }
              }}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <GripVertical className="w-4 h-4 text-slate-400 flex-shrink-0" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                    {hasContent
                      ? `${exp.company || '未命名公司'} - ${exp.position || '未命名职位'}`
                      : `工作经历 ${index + 1}`}
                  </div>
                  {exp.period && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {exp.period}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(exp.id);
                  }}
                  className="
                    p-1.5 rounded-lg
                    hover:bg-red-50 dark:hover:bg-red-900/20
                    text-slate-400 hover:text-red-600 dark:hover:text-red-400
                    transition-colors duration-150
                  "
                  aria-label={`删除工作经历 ${index + 1}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <svg
                  className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${
                    isExpanded ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>

            {/* 内容 - 可展开 */}
            {isExpanded && (
              <div
                id={`work-exp-${exp.id}`}
                className="px-4 pb-4 space-y-4 border-t border-slate-200 dark:border-slate-700"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                  <ResumeInput
                    label="公司名称"
                    placeholder="例如:字节跳动"
                    required
                    maxLength={120}
                    showCount
                    value={exp.company}
                    onChange={(e) => onUpdate(exp.id, { company: e.target.value })}
                  />
                  <ResumeInput
                    label="职位"
                    placeholder="例如:高级前端工程师"
                    required
                    maxLength={100}
                    showCount
                    value={exp.position}
                    onChange={(e) => onUpdate(exp.id, { position: e.target.value })}
                  />
                </div>

                <ResumeInput
                  label="工作时间"
                  placeholder="例如:2020.06 - 2023.08"
                  helperText="格式:YYYY.MM - YYYY.MM 或 至今"
                  maxLength={60}
                  showCount
                  value={exp.period}
                  onChange={(e) => onUpdate(exp.id, { period: e.target.value })}
                />

                <ResumeTextarea
                  label="岗位职责"
                  placeholder="描述您的主要职责和工作成果,建议使用量化数据..."
                  rows={6}
                  helperText="建议包含:职责描述、关键成果、使用技术栈"
                  required
                  maxLength={2000}
                  showCount
                  value={exp.description}
                  onChange={(e) => onUpdate(exp.id, { description: e.target.value })}
                />
              </div>
            )}
          </div>
        );
      })}

      {/* 添加按钮 */}
      <button
        onClick={handleAdd}
        className="
          w-full px-4 py-3
          border-2 border-dashed border-slate-300 dark:border-slate-600
          rounded-xl
          flex items-center justify-center gap-2
          text-sm font-medium text-slate-600 dark:text-slate-400
          hover:border-[#2F6BFF] hover:text-[#2F6BFF] dark:hover:border-[#2F6BFF] dark:hover:text-[#2F6BFF]
          hover:bg-[#2F6BFF]/5
          transition-all duration-150
          focus:outline-none focus:ring-2 focus:ring-[#2F6BFF] focus:ring-offset-2
        "
        aria-label="添加工作经历"
      >
        <Plus className="w-4 h-4" aria-hidden="true" />
        添加工作经历
      </button>

      {/* 空状态提示 */}
      {experiences.length === 0 && (
        <div className="text-center py-8 text-slate-500 dark:text-slate-400 text-sm">
          暂无工作经历，点击上方按钮添加
        </div>
      )}
    </div>
  );
}
