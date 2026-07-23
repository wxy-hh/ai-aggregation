import { AlertCircle, Lightbulb, Palette, Zap, MoreHorizontal, type LucideIcon } from 'lucide-react';

type TypeConfigEntry = { label: string; icon: LucideIcon; color: string; bg: string };
type StatusConfigEntry = { label: string; dot: string; bg: string };
type PriorityConfigEntry = { label: string; color: string };

export const TYPE_CONFIG: Record<string, TypeConfigEntry> = {
  BUG: { label: '缺陷', icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20' },
  FEATURE: { label: '功能', icon: Lightbulb, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20' },
  UI: { label: '界面', icon: Palette, color: 'text-violet-500', bg: 'bg-violet-50 dark:bg-violet-900/20' },
  PERFORMANCE: { label: '性能', icon: Zap, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
  OTHER: { label: '其他', icon: MoreHorizontal, color: 'text-slate-500', bg: 'bg-slate-50 dark:bg-slate-800/40' },
};

export const STATUS_CONFIG: Record<string, StatusConfigEntry> = {
  PENDING: { label: '待处理', dot: 'bg-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400' },
  UNDER_REVIEW: { label: '审核中', dot: 'bg-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' },
  PLANNED: { label: '已规划', dot: 'bg-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' },
  IN_PROGRESS: { label: '进行中', dot: 'bg-cyan-400', bg: 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400' },
  COMPLETED: { label: '已完成', dot: 'bg-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' },
  DECLINED: { label: '已拒绝', dot: 'bg-slate-400', bg: 'bg-slate-50 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400' },
};

export const PRIORITY_CONFIG: Record<string, PriorityConfigEntry> = {
  LOW: { label: '低', color: 'text-slate-400' },
  MEDIUM: { label: '中', color: 'text-blue-500' },
  HIGH: { label: '高', color: 'text-amber-500' },
  CRITICAL: { label: '紧急', color: 'text-red-500' },
};

export const TYPE_LABEL: Record<string, string> = {
  ALL: '全部类型',
  BUG: '缺陷',
  FEATURE: '功能',
  UI: '界面',
  PERFORMANCE: '性能',
  OTHER: '其他',
};

export const STATUS_LABEL: Record<string, string> = {
  ALL: '全部状态',
  PENDING: '待处理',
  UNDER_REVIEW: '审核中',
  PLANNED: '已规划',
  IN_PROGRESS: '进行中',
  COMPLETED: '已完成',
  DECLINED: '已拒绝',
};
