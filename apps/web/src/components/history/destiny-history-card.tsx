'use client';

import React from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { DestinyHistoryItem } from '@/types/history';
import { Trash2 } from 'lucide-react';
import { DerivationBadge } from './derivation-badge';
import baziIcon from '@/assets/image/bazi.svg';
import ziweiIcon from '@/assets/image/ziwei.svg';
import qimendunjiaIcon from '@/assets/image/qimendunjia.svg';

interface DestinyHistoryCardProps {
  item: DestinyHistoryItem;
  onDelete?: (id: string) => void;
}

const SUB_TYPE_CONFIG: Record<string, { label: string; icon: typeof baziIcon; colorClass: string }> = {
  bazi: {
    label: '八字',
    icon: baziIcon,
    colorClass: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
  },
  'bazi-compatibility': {
    label: '八字合盘',
    icon: baziIcon,
    colorClass: 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400',
  },
  ziwei: {
    label: '紫微斗数',
    icon: ziweiIcon,
    colorClass: 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400',
  },
  qimen: {
    label: '奇门遁甲',
    icon: qimendunjiaIcon,
    colorClass: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
  },
};

export function DestinyHistoryCard({ item, onDelete }: DestinyHistoryCardProps) {
  const router = useRouter();
  const config = SUB_TYPE_CONFIG[item.subType] || SUB_TYPE_CONFIG.bazi;

  const handleClick = () => {
    // 合盘档案挂在八字工作区恢复，tab 映射到 bazi 并保留 historyId
    const tab = item.subType === 'bazi-compatibility' ? 'bazi' : item.subType;
    router.push(`/destiny?tab=${tab}&historyId=${item.id}`);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete) {
      onDelete(item.id);
    }
  };

  return (
    <div
      onClick={handleClick}
      className="bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-6 border border-slate-100 dark:border-slate-700 hover:shadow-lg hover:border-blue-200 dark:hover:border-blue-900 transition-all cursor-pointer group flex flex-col relative"
    >
      <button
        onClick={handleDelete}
        className="absolute top-4 right-4 p-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100"
        title="删除"
      >
        <Trash2 className="w-4 h-4" />
      </button>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${config.colorClass}`}>
            <Image src={config.icon} alt={config.label} width={18} height={18} />
          </div>
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
            {config.label}
          </span>
        </div>
        <span className="text-xs text-slate-400 mr-8">{item.date}</span>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
          {item.profileSummary?.name}
        </span>
        {item.coreTone && (
          <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200/50 dark:border-blue-800/40">
            {item.coreTone.length > 12 ? item.coreTone.slice(0, 12) + '...' : item.coreTone}
          </span>
        )}
      </div>

      <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">
        {item.profileSummary?.gender} · {item.profileSummary?.birthDate}
      </p>

      <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">
        {item.preview}
      </p>

      <DerivationBadge item={item} />
    </div>
  );
}
