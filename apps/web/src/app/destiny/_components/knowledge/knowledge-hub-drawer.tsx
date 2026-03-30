'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type Entry = {
  id: string;
  title: string;
  source: string;
  tags: string[];
  summary: string;
  plain: string;
};

const mockEntries: Entry[] = [
  {
    id: 'smt-1',
    title: '《三命通会》· 取用神之法',
    source: '三命通会',
    tags: ['用神', '格局', '实例验证'],
    summary: '用神不是玄学答案，而是“系统最缺的那一环”。',
    plain:
      '白话：先看命局整体偏寒偏热、偏燥偏湿，再看五行是否失衡。用神的意义是补足短板、让系统更稳定。',
  },
  {
    id: 'case-1',
    title: '名人案例：结构化执行型格局',
    source: '案例中心',
    tags: ['事业', '方法论', '长期积累'],
    summary: '典型特征：强目标感 + 规则意识，越到后期越能积累势能。',
    plain:
      '白话：这类格局更适合做长期主义的事业，早期可能不显山露水，但中后期会出现“厚积薄发”。',
  },
];

export function KnowledgeHubDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [q, setQ] = useState('');
  const [activeId, setActiveId] = useState<string>(mockEntries[0]?.id ?? '');

  const list = useMemo(() => {
    const query = q.trim();
    if (!query) return mockEntries;
    return mockEntries.filter(
      (e) => e.title.includes(query) || e.summary.includes(query) || e.tags.some((t) => t.includes(query))
    );
  }, [q]);

  const active = useMemo(() => list.find((e) => e.id === activeId) ?? list[0], [activeId, list]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[980px] p-0 border-0 bg-transparent shadow-none">
        <DialogTitle className="sr-only">Knowledge Hub</DialogTitle>
        <DialogDescription className="sr-only">
          古籍数字化条目与名人案例，支持搜索与白话解读。
        </DialogDescription>
        <div
          className={cn(
            'rounded-[30px] border border-white/35 bg-white/45 backdrop-blur-[32px]',
            'shadow-[0_30px_90px_-30px_rgba(15,23,42,0.28)] overflow-hidden'
          )}
        >
          <div className="p-5 border-b border-white/30 bg-white/35 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-lg font-extrabold text-slate-900">Knowledge Hub</div>
              <div className="text-xs text-slate-500">古籍数字化 · 白话翻译 · 案例验证</div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="rounded-full bg-white/55 border-white/45 hover:bg-white/70 font-bold"
              onClick={() => onOpenChange(false)}
            >
              关闭
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 min-h-[560px]">
            <div className="md:col-span-2 p-5 border-r border-white/25 bg-white/25">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索古籍/术语/案例…"
                className="h-11 rounded-full bg-white/55 border-white/45 focus-visible:ring-0 focus-visible:border-[#2F6BFF]/40"
              />

              <div className="mt-4 space-y-3 max-h-[490px] overflow-y-auto custom-scrollbar pr-1">
                {list.map((e) => {
                  const active = e.id === activeId;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setActiveId(e.id)}
                      className={cn(
                        'w-full rounded-2xl border px-4 py-3 text-left shadow-sm transition',
                        'bg-white/55 border-white/45 hover:bg-white/70',
                        active && 'bg-[#2F6BFF]/10 border-[#2F6BFF]/25'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-extrabold text-slate-900 line-clamp-1">
                          {e.title}
                        </div>
                        <Badge className="bg-white/60 text-slate-600 border border-white/50">
                          {e.source}
                        </Badge>
                      </div>
                      <div className="mt-2 text-xs text-slate-500 line-clamp-2">{e.summary}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {e.tags.map((t) => (
                          <span
                            key={t}
                            className="text-[11px] font-bold text-slate-500 bg-white/55 border border-white/45 px-2 py-0.5 rounded-full"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })}

                {list.length === 0 && (
                  <div className="text-sm text-slate-500 text-center py-10">没有找到相关条目</div>
                )}
              </div>
            </div>

            <div className="md:col-span-3 p-6">
              {active ? (
                <div className="h-full flex flex-col">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-xl font-extrabold text-slate-900">{active.title}</div>
                      <div className="mt-2 text-sm text-slate-600">{active.summary}</div>
                    </div>
                    <Badge className="bg-[#2F6BFF]/15 text-[#2F6BFF] border border-[#2F6BFF]/20">
                      白话解读
                    </Badge>
                  </div>

                  <div className="mt-6 rounded-3xl border border-white/35 bg-white/50 p-5 shadow-sm flex-1">
                    <div className="text-xs font-extrabold text-slate-500 tracking-[0.18em] uppercase">
                      Plain Translation
                    </div>
                    <div className="mt-3 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
                      {active.plain}
                    </div>
                  </div>

                  <div className="mt-5 rounded-3xl border border-white/35 bg-white/45 p-5 shadow-sm">
                    <div className="text-sm font-extrabold text-slate-900">案例验证（Mock）</div>
                    <div className="mt-2 text-sm text-slate-600">
                      第一版提供示例案例卡片；后续可接入可检索案例库与引用来源。
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-500">请选择左侧条目</div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

