'use client';

import { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { COMMON_NEGATIVE_PROMPTS } from '@/lib/constants/image-generation';

export interface NegativePromptProps {
  value: string;
  onChange: (value: string) => void;
}

export function NegativePrompt({ value, onChange }: NegativePromptProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleTemplateClick = (template: string) => {
    const current = value.trim();
    if (current) {
      onChange(`${current}, ${template}`);
    } else {
      onChange(template);
    }
  };

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden backdrop-blur-sm bg-white/50 dark:bg-slate-800/50">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/50 text-xs font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 transition-colors cursor-pointer"
      >
        <span>排除内容 (Negative Prompt)</span>
        <svg
          className={cn(
            'w-4 h-4 transform transition-transform duration-200',
            isExpanded ? 'rotate-180' : 'rotate-0'
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full h-20 px-3 py-2 bg-white/80 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 rounded-lg resize-none focus-visible:ring-0 focus-visible:border-blue-500 transition-all text-xs leading-relaxed text-slate-700 dark:text-slate-200"
            placeholder="描述你不想在图片中出现的内容..."
          />

          {/* 快速模板 */}
          <div className="space-y-2">
            <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
              常用模板
            </div>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_NEGATIVE_PROMPTS.map((template, index) => (
                <Button
                  key={index}
                  onClick={() => handleTemplateClick(template)}
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[10px] bg-white/50 dark:bg-slate-800/50 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700 transition-all cursor-pointer"
                >
                  {template.split(',')[0]}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
