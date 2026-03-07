'use client';

import { Plus, Trash2, GripVertical } from 'lucide-react';
import { useState, useEffect } from 'react';
import { ResumeInput } from './resume-input';
import type { ResumeEducation } from '@/types/resume-editor';

/**
 * 教育背景列表编辑组件属性
 */
export interface EducationListProps {
  /** 教育背景列表 */
  educations: ResumeEducation[];
  /** 添加教育背景回调 */
  onAdd: (education: Omit<ResumeEducation, 'id'>) => void;
  /** 更新教育背景回调 */
  onUpdate: (id: string, updates: Partial<ResumeEducation>) => void;
  /** 删除教育背景回调 */
  onRemove: (id: string) => void;
}

/**
 * 教育背景列表编辑组件
 *
 * 功能:
 * - 显示教育背景列表
 * - 添加新的教育背景
 * - 编辑现有教育背景
 * - 删除教育背景
 */
export function EducationList({ educations, onAdd, onUpdate, onRemove }: EducationListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(
    educations.length > 0 ? educations[0].id : null
  );

  // 当添加新项时，自动展开最新的项
  useEffect(() => {
    if (educations.length > 0) {
      const latestEdu = educations[educations.length - 1];
      // 如果最新项是空的（刚添加的），自动展开它
      if (!latestEdu.school && !latestEdu.degree && !latestEdu.major && !latestEdu.period) {
        setExpandedId(latestEdu.id);
      }
    }
  }, [educations]);

  const handleAdd = () => {
    onAdd({
      school: '',
      degree: '',
      major: '',
      period: '',
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="space-y-4">
      {/* 教育背景列表 */}
      {educations.map((edu, index) => {
        const isExpanded = expandedId === edu.id;
        const hasContent = edu.school || edu.degree || edu.major || edu.period;

        return (
          <div
            key={edu.id}
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
              onClick={() => toggleExpand(edu.id)}
              role="button"
              tabIndex={0}
              aria-expanded={isExpanded}
              aria-controls={`education-${edu.id}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggleExpand(edu.id);
                }
              }}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <GripVertical className="w-4 h-4 text-slate-400 flex-shrink-0" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                    {hasContent
                      ? `${edu.school || '未命名学校'} - ${edu.degree || '未命名学历'}`
                      : `教育背景 ${index + 1}`}
                  </div>
                  {edu.period && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {edu.period}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(edu.id);
                  }}
                  className="
                    p-1.5 rounded-lg
                    hover:bg-red-50 dark:hover:bg-red-900/20
                    text-slate-400 hover:text-red-600 dark:hover:text-red-400
                    transition-colors duration-150
                  "
                  aria-label={`删除教育背景 ${index + 1}`}
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
                id={`education-${edu.id}`}
                className="px-4 pb-4 space-y-4 border-t border-slate-200 dark:border-slate-700"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                  <ResumeInput
                    label="学校名称"
                    placeholder="例如:清华大学"
                    required
                    maxLength={120}
                    showCount
                    value={edu.school}
                    onChange={(e) => onUpdate(edu.id, { school: e.target.value })}
                  />
                  <ResumeInput
                    label="学历"
                    placeholder="例如:本科 / 硕士"
                    required
                    maxLength={80}
                    showCount
                    value={edu.degree}
                    onChange={(e) => onUpdate(edu.id, { degree: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ResumeInput
                    label="专业"
                    placeholder="例如:计算机科学与技术"
                    required
                    maxLength={120}
                    showCount
                    value={edu.major}
                    onChange={(e) => onUpdate(edu.id, { major: e.target.value })}
                  />
                  <ResumeInput
                    label="在校时间"
                    placeholder="例如:2016.09 - 2020.06"
                    helperText="格式:YYYY.MM - YYYY.MM"
                    maxLength={60}
                    showCount
                    value={edu.period}
                    onChange={(e) => onUpdate(edu.id, { period: e.target.value })}
                  />
                </div>
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
        aria-label="添加教育背景"
      >
        <Plus className="w-4 h-4" aria-hidden="true" />
        添加教育背景
      </button>

      {/* 空状态提示 */}
      {educations.length === 0 && (
        <div className="text-center py-8 text-slate-500 dark:text-slate-400 text-sm">
          暂无教育背景，点击上方按钮添加
        </div>
      )}
    </div>
  );
}
