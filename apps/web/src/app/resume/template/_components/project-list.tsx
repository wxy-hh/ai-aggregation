'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, ChevronDown, Trash2 } from 'lucide-react';
import { ResumeInput } from './resume-input';
import { ResumeTextarea } from './resume-textarea';
import type { ResumeProject } from '@/types/resume-editor';

/**
 * 项目列表组件属性
 */
interface ProjectListProps {
  /** 项目列表 */
  projects: ResumeProject[];
  /** 添加项目回调 */
  onAdd: (project: Omit<ResumeProject, 'id'>) => void;
  /** 更新项目回调 */
  onUpdate: (id: string, updates: Partial<ResumeProject>) => void;
  /** 删除项目回调 */
  onRemove: (id: string) => void;
}

/**
 * 项目列表组件
 *
 * 用于管理简历中的项目经历列表
 */
export function ProjectList({ projects, onAdd, onUpdate, onRemove }: ProjectListProps) {
  // 展开状态：记录哪些项目是展开的
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  /**
   * 切换项目展开/折叠状态
   */
  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  /**
   * 添加新项目
   */
  const handleAdd = () => {
    onAdd({
      name: '',
      period: '',
      description: '',
      responsibilities: '',
      techStack: '',
      highlights: '',
    });
  };

  return (
    <div className="space-y-4">
      {/* 项目列表 */}
      <AnimatePresence mode="popLayout">
        {projects.map((project, index) => {
          const isExpanded = expandedIds.has(project.id);

          return (
            <motion.div
              key={project.id}
              layout
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 transition-all duration-200"
            >
              {/* 项目头部 */}
              <div className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors rounded-t-xl">
                <button
                  onClick={() => toggleExpand(project.id)}
                  className="flex items-center gap-3 flex-1 min-w-0"
                >
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                    {project.name || `项目 ${index + 1}`}
                    {project.period && ` - ${project.period}`}
                  </span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(project.id);
                    }}
                    className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors group"
                    title={`删除项目 ${index + 1}`}
                  >
                    <Trash2 className="w-4 h-4 text-slate-400 group-hover:text-red-500 transition-colors" />
                  </button>

                  <button
                    onClick={() => toggleExpand(project.id)}
                    className="p-1"
                    aria-label={isExpanded ? '折叠' : '展开'}
                  >
                    <ChevronDown
                      className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* 项目详情 */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 space-y-4 border-t border-slate-200 dark:border-slate-700 pt-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <ResumeInput
                          label="项目名称"
                          placeholder="例如:电商管理系统"
                          required
                          maxLength={120}
                          showCount
                          value={project.name}
                          onChange={(e) => onUpdate(project.id, { name: e.target.value })}
                        />
                        <ResumeInput
                          label="项目时间"
                          placeholder="例如:2023.01 - 2023.06"
                          maxLength={60}
                          showCount
                          value={project.period}
                          onChange={(e) => onUpdate(project.id, { period: e.target.value })}
                        />
                      </div>

                      <ResumeTextarea
                        label="项目介绍"
                        placeholder="简要介绍项目背景、目标和规模..."
                        rows={3}
                        maxLength={500}
                        showCount
                        value={project.description}
                        onChange={(e) => onUpdate(project.id, { description: e.target.value })}
                      />

                      <ResumeTextarea
                        label="项目职责"
                        placeholder="描述您在项目中的具体职责和工作内容..."
                        rows={4}
                        maxLength={1000}
                        showCount
                        value={project.responsibilities}
                        onChange={(e) => onUpdate(project.id, { responsibilities: e.target.value })}
                      />

                      <ResumeTextarea
                        label="项目亮点"
                        placeholder="描述项目的创新点、难点攻克、性能优化等亮点..."
                        rows={4}
                        maxLength={1000}
                        showCount
                        value={project.highlights}
                        onChange={(e) => onUpdate(project.id, { highlights: e.target.value })}
                      />

                      <ResumeTextarea
                        label="技术栈"
                        placeholder="例如:React、TypeScript、Node.js、MongoDB..."
                        rows={2}
                        maxLength={500}
                        showCount
                        value={project.techStack}
                        onChange={(e) => onUpdate(project.id, { techStack: e.target.value })}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* 添加项目按钮 */}
      <motion.button
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        onClick={handleAdd}
        className="
          w-full px-4 py-3 rounded-xl
          border-2 border-dashed border-slate-300 dark:border-slate-600
          hover:border-[#2F6BFF] hover:bg-[#2F6BFF]/5
          dark:hover:border-[#2F6BFF] dark:hover:bg-[#2F6BFF]/10
          transition-all duration-200
          flex items-center justify-center gap-2
          text-slate-600 dark:text-slate-400
          hover:text-[#2F6BFF] dark:hover:text-[#2F6BFF]
        "
      >
        <Plus className="w-5 h-5" />
        <span className="text-sm font-medium">添加项目经历</span>
      </motion.button>
    </div>
  );
}
