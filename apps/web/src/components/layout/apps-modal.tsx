'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  Bot,
  AudioWaveform,
  PenTool,
  Presentation,
  FileText,
  Scale,
  Code,
  Video,
  Box,
  Pin,
  X,
  Plus,
} from 'lucide-react';

export type AppId =
  | 'chat'
  | 'voice'
  | 'image'
  | 'ppt'
  | 'resume'
  | 'legal'
  | 'code'
  | 'video'
  | '3d';

interface AppConfig {
  id: AppId;
  label: string;
  description: string;
  icon: React.ElementType;
  category: 'core' | 'productivity' | 'creative';
  href: string;
  color: string;
}

export const APP_CONFIGS: AppConfig[] = [
  // 核心能力
  {
    id: 'chat',
    label: '智能对话',
    description: '基于最新大模型的深度逻辑推理与多轮对话。',
    icon: Bot,
    category: 'core',
    href: '/chat',
    color: 'text-blue-500',
  },
  {
    id: 'voice',
    label: '语音转写',
    description: '高精度语音识别，支持多语种会议纪要生成。',
    icon: AudioWaveform,
    category: 'core',
    href: '/voice',
    color: 'text-purple-500',
  },
  {
    id: 'image',
    label: '灵感绘图',
    description: '文生图、图生图，释放无限视觉创意。',
    icon: PenTool,
    category: 'core',
    href: '/image',
    color: 'text-pink-500',
  },
  // 生产力工具
  {
    id: 'ppt',
    label: 'PPT 制作',
    description: '一键生成演示文稿。',
    icon: Presentation,
    category: 'productivity',
    href: '/ppt',
    color: 'text-orange-500',
  },
  {
    id: 'resume',
    label: '简历制作',
    description: '智能排版与内容优化。',
    icon: FileText,
    category: 'productivity',
    href: '/resume',
    color: 'text-green-500',
  },
  {
    id: 'legal',
    label: '法律顾问',
    description: '合同审查与法律咨询。',
    icon: Scale,
    category: 'productivity',
    href: '/legal',
    color: 'text-slate-500',
  },
  {
    id: 'code',
    label: '代码助手',
    description: '代码解释、生成与重构。',
    icon: Code,
    category: 'productivity',
    href: '/code',
    color: 'text-blue-600',
  },
  // 创意工具
  {
    id: 'video',
    label: '视频生成',
    description: '文字生成短视频。',
    icon: Video,
    category: 'creative',
    href: '/video',
    color: 'text-indigo-500',
  },
  {
    id: '3d',
    label: '3D 模型',
    description: '快速生成 3D 资产。',
    icon: Box,
    category: 'creative',
    href: '/3d',
    color: 'text-cyan-500',
  },
];

interface AppsModalProps {
  isOpen: boolean;
  onClose: () => void;
  pinnedApps: AppId[];
  onTogglePin: (id: AppId, rect?: DOMRect) => void;
}

export function AppsModal({ isOpen, onClose, pinnedApps, onTogglePin }: AppsModalProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const sections = [
    { id: 'core', label: '核心原子能力', color: 'bg-blue-500' },
    { id: 'productivity', label: '专业生产力', color: 'bg-orange-500' },
    { id: 'creative', label: '创意实验室', color: 'bg-purple-500' },
  ];

  // 模糊搜索：匹配标签或描述（不区分大小写）
  const filteredApps = APP_CONFIGS.filter((app) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return app.label.toLowerCase().includes(query) || app.description.toLowerCase().includes(query);
  });

  const handlePinClick = (e: React.MouseEvent, id: AppId) => {
    e.stopPropagation();
    const button = e.currentTarget;

    // 找到图标元素以开始动画
    // 结构：flex-row -> [图标容器, 按钮]
    const cardHeader = button.parentElement;
    const iconContainer = cardHeader?.firstElementChild as HTMLElement;

    const rect = iconContainer
      ? iconContainer.getBoundingClientRect()
      : button.getBoundingClientRect();

    onTogglePin(id, rect);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-xl border-none shadow-2xl p-0 overflow-hidden max-h-[85vh] flex flex-col">
        {/* 为了无障碍访问而视觉隐藏的标题 */}
        <DialogTitle className="sr-only">应用中心</DialogTitle>
        {/* 带有搜索框的头部 */}
        <div className="p-6 pb-2 flex items-center justify-center">
          <div className="relative w-2/3">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <SearchIcon className="h-5 w-5 text-slate-400" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索您的 AI 创作工具..."
              className="w-full pl-10 pr-10 py-3 bg-white dark:bg-slate-800 rounded-2xl border-none focus:ring-2 focus:ring-blue-500/20 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 shadow-sm transition-shadow duration-300 hover:shadow-md"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-8 custom-scrollbar">
          {filteredApps.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <SearchIcon className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-lg">未找到匹配的应用</p>
              <p className="text-sm mt-1">尝试搜索其他关键词</p>
            </div>
          ) : (
            sections.map((section) => {
              const sectionApps = filteredApps.filter((app) => app.category === section.id);
              if (sectionApps.length === 0) return null;
              return (
                <div key={section.id} className="mb-8 last:mb-0">
                  <div className="flex items-center gap-2 mb-4">
                    <div className={`w-2 h-2 rounded-full ${section.color}`} />
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                      {section.label}
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sectionApps.map((app) => {
                      const isPinned = pinnedApps.includes(app.id);
                      return (
                        <div
                          key={app.id}
                          className="group relative bg-white dark:bg-slate-800 rounded-2xl p-5 hover:shadow-lg transition-all duration-300 border border-slate-100 dark:border-slate-700/50 hover:border-blue-200 dark:hover:border-blue-800 cursor-pointer"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div
                              className={cn(
                                'w-12 h-12 rounded-xl flex items-center justify-center bg-slate-50 dark:bg-slate-900 group-hover:scale-105 transition-transform duration-300',
                                app.color
                                  .replace('text-', 'bg-')
                                  .replace('500', '100')
                                  .replace('600', '100')
                              )}
                            >
                              <app.icon className={cn('w-6 h-6', app.color)} />
                            </div>
                            <button
                              onClick={(e) => handlePinClick(e, app.id)}
                              className={cn(
                                'p-1.5 rounded-lg transition-all duration-200',
                                isPinned
                                  ? 'text-orange-500 bg-orange-50 dark:bg-orange-900/20'
                                  : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'
                              )}
                            >
                              <Pin className={cn('w-4 h-4', isPinned && 'fill-current')} />
                            </button>
                          </div>
                          <h4 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">
                            {app.label}
                          </h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">
                            {app.description}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  );
}
