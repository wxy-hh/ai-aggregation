import type { DestinyHistoryItem, HistoryItem, HistoryType } from '@/types/history';

/** 各类型在首页最近创作中的展示配置 */
export const RECENT_CREATION_TYPE_META: Record<
  HistoryType,
  { label: string; accent: string; chip: string; iconBg: string }
> = {
  chat: {
    label: '对话',
    accent: 'text-blue-600 dark:text-blue-400',
    chip: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
    iconBg: 'bg-blue-100/80 dark:bg-blue-900/30',
  },
  voice: {
    label: '语音',
    accent: 'text-purple-600 dark:text-purple-400',
    chip: 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300',
    iconBg: 'bg-purple-100/80 dark:bg-purple-900/30',
  },
  image: {
    label: '图像',
    accent: 'text-pink-600 dark:text-pink-400',
    chip: 'bg-pink-50 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300',
    iconBg: 'bg-pink-100/80 dark:bg-pink-900/30',
  },
  video: {
    label: '视频',
    accent: 'text-cyan-600 dark:text-cyan-400',
    chip: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300',
    iconBg: 'bg-cyan-100/80 dark:bg-cyan-900/30',
  },
  destiny: {
    label: '命理',
    accent: 'text-amber-600 dark:text-amber-400',
    chip: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    iconBg: 'bg-amber-100/80 dark:bg-amber-900/30',
  },
};

/** 根据历史记录类型生成跳转路径 */
export function getHistoryItemHref(item: HistoryItem): string | null {
  switch (item.type) {
    case 'chat':
      return `/chat?historyId=${item.id}`;
    case 'voice':
      return `/voice?historyId=${item.id}`;
    case 'image':
      return null;
    case 'destiny':
      return `/destiny?tab=${(item as DestinyHistoryItem).subType}&historyId=${item.id}`;
    default:
      return null;
  }
}

/** 按更新时间倒序取最近 N 条（去重后） */
export function pickRecentHistoryItems(items: HistoryItem[], limit = 3): HistoryItem[] {
  const latestById = new Map<string, HistoryItem>();

  items.forEach((item) => {
    const existing = latestById.get(item.id);
    if (!existing) {
      latestById.set(item.id, item);
      return;
    }
    const existingTime = new Date(existing.updatedAt).getTime();
    const itemTime = new Date(item.updatedAt).getTime();
    if (itemTime >= existingTime) {
      latestById.set(item.id, item);
    }
  });

  return Array.from(latestById.values())
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, limit);
}
