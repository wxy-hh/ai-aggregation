'use client';

/**
 * 多模型选择器 — 并行对比的模型勾选入口
 *
 * 桌面端用 Popover，移动端用底部抽屉（Dialog 底部滑入）。
 * 按 Provider 分组列出全部模型变体，显示「已选 N/4」与「将同时调用 N 个模型」成本提示。
 */

import { memo, useMemo, useState } from 'react';
import { Check, ChevronDown, Layers, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { CHAT_MODEL_CATALOG, MAX_COMPARE_MODELS, MIN_COMPARE_MODELS } from '@/lib/constants/chat-models';
import { toModelKey } from '@/types/comparison';
import { useSelectedModels, useComparisonActions } from '@/stores/comparison-store';

// 模型勾选列表（桌面 Popover 与移动 Dialog 共用）
function ModelPickerList() {
  const selectedModels = useSelectedModels();
  const { toggleModel } = useComparisonActions();

  // 按 provider 分组
  const groups = useMemo(() => {
    const map = new Map<string, typeof CHAT_MODEL_CATALOG>();
    for (const item of CHAT_MODEL_CATALOG) {
      const arr = map.get(item.providerLabel) ?? [];
      arr.push(item);
      map.set(item.providerLabel, arr);
    }
    return Array.from(map.entries());
  }, []);

  const selectedKeys = useMemo(
    () => new Set(selectedModels.map((m) => toModelKey(m.provider, m.model))),
    [selectedModels]
  );
  const atMax = selectedModels.length >= MAX_COMPARE_MODELS;

  return (
    <div className="flex flex-col gap-3">
      {groups.map(([providerLabel, items]) => (
        <div key={providerLabel}>
          <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {providerLabel}
          </p>
          <div className="flex flex-col gap-1">
            {items.map((item) => {
              const key = toModelKey(item.provider, item.model);
              const checked = selectedKeys.has(key);
              const disabled = !checked && atMax;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleModel(item)}
                  className={cn(
                    'flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors',
                    checked
                      ? 'bg-blue-50/70 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
                      : 'text-slate-600 hover:bg-slate-100/70 dark:text-slate-300 dark:hover:bg-slate-800/60',
                    disabled && 'cursor-not-allowed opacity-40'
                  )}
                >
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded-md border transition-colors',
                      checked
                        ? 'border-blue-500 bg-blue-500 text-white'
                        : 'border-slate-300 bg-white/60 dark:border-slate-600 dark:bg-slate-800/60'
                    )}
                  >
                    {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  <span className="flex-1 truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* 成本提示 */}
      <div className="mt-1 flex items-center gap-1.5 rounded-xl border border-blue-200/50 bg-blue-50/50 px-3 py-2 text-[11px] text-blue-600 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
        <Layers className="h-3.5 w-3.5 shrink-0" />
        <span>
          将同时调用 {selectedModels.length} 个模型（{MIN_COMPARE_MODELS}–{MAX_COMPARE_MODELS} 个）
        </span>
      </div>
    </div>
  );
}

interface ModelSelectorProps {
  // 作为「添加模型」按钮样式（输入区 chip 末尾）时的紧凑形态
  variant?: 'header' | 'add';
}

export const ModelSelector = memo(function ModelSelector({ variant = 'header' }: ModelSelectorProps) {
  const isMobile = useIsMobile();
  const selectedModels = useSelectedModels();
  const [open, setOpen] = useState(false);

  const triggerLabel =
    variant === 'add' ? (
      <>
        <Plus className="h-3.5 w-3.5" />
        添加模型
      </>
    ) : (
      <>
        <Layers className="h-4 w-4" />
        <span>已选 {selectedModels.length} 个模型</span>
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </>
    );

  const triggerClass = cn(
    'inline-flex items-center gap-1.5 rounded-xl border transition-all duration-200',
    variant === 'add'
      ? 'h-8 border-dashed border-slate-300 bg-white/40 px-3 text-xs font-medium text-slate-500 hover:border-blue-300 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400'
      : 'h-9 border-white/60 bg-white/60 px-3 text-sm font-medium text-slate-700 shadow-sm backdrop-blur-xl hover:border-slate-300/80 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200'
  );

  if (isMobile) {
    return (
      <>
        <button type="button" onClick={() => setOpen(true)} className={triggerClass}>
          {triggerLabel}
        </button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="bottom-0 top-auto max-h-[80vh] translate-y-0 rounded-b-none rounded-t-[20px] border-white/60 bg-white/90 backdrop-blur-2xl dark:bg-slate-900/90">
            <DialogHeader>
              <DialogTitle className="text-base">选择对比模型</DialogTitle>
            </DialogHeader>
            <div className="overflow-y-auto pb-2">
              <ModelPickerList />
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={triggerClass}>
          {triggerLabel}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-72 rounded-2xl border-white/60 bg-white/95 p-3 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/95"
      >
        <ModelPickerList />
      </PopoverContent>
    </Popover>
  );
});
