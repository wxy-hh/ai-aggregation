import type { ChatHistoryItem, HistoryItem, HistoryStats } from '@/types/history';
import { formatRelativeTime } from '@/lib/utils/history-helpers';

/** 可投影进统一历史的会话字段，避免历史工具反向依赖会话 store */
export interface ProjectableConversation {
  id: string;
  title: string;
  messages: Array<{ role: string; content: string }>;
  provider: string;
  model: string;
  createdAt: number;
  updatedAt: number;
  mode?: 'single' | 'compare';
  turns?: Array<{ prompt?: string }>;
  selectedModels?: Array<unknown>;
}

function toIso(timestamp: number): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function firstText(messages: ProjectableConversation['messages'], role: string): string {
  return messages.find((message) => message.role === role && message.content.trim())?.content.trim() ?? '';
}

function lastText(messages: ProjectableConversation['messages']): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const content = messages[index]?.content?.trim();
    if (content) return content;
  }
  return '';
}

/** 没有正文的空白草稿不进首页和历史，避免「新对话」占住最近创作 */
export function conversationHasVisibleContent(conversation: ProjectableConversation): boolean {
  if (conversation.messages.some((message) => message.content.trim())) return true;
  return Boolean(conversation.turns?.some((turn) => turn.prompt?.trim()));
}

/** 把本地会话投影成对话历史卡片。已有同 id 历史记录时不覆盖。 */
export function projectConversation(conversation: ProjectableConversation): ChatHistoryItem | null {
  if (!conversationHasVisibleContent(conversation)) return null;

  const userText = firstText(conversation.messages, 'user');
  const prompt = conversation.turns?.find((turn) => turn.prompt?.trim())?.prompt?.trim() ?? '';
  const titled = conversation.title.trim() && conversation.title.trim() !== '新对话';
  const title = titled
    ? conversation.title.trim()
    : (userText || prompt).slice(0, 50);
  if (!title) return null;

  const previewSource = lastText(conversation.messages) || prompt || title;
  const preview = previewSource.length > 150 ? `${previewSource.slice(0, 150)}...` : previewSource;
  const createdAt = toIso(conversation.createdAt);
  const updatedAt = toIso(conversation.updatedAt || conversation.createdAt);
  const isCompare = conversation.mode === 'compare';

  return {
    id: conversation.id,
    type: 'chat',
    title,
    preview,
    date: formatRelativeTime(updatedAt),
    createdAt,
    updatedAt,
    model: isCompare
      ? `${conversation.selectedModels?.length ?? conversation.turns?.length ?? 0} 个模型`
      : conversation.model || '对话',
    provider: conversation.provider || 'chat',
    messages: conversation.messages
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .map((message) => ({
        role: message.role as 'user' | 'assistant',
        content: message.content,
      })),
    mode: isCompare ? 'compare' : 'single',
    conversationId: conversation.id,
  };
}

/** 历史记录优先；会话列表里还没有写进历史的对话补在后面 */
export function mergeHistoryWithConversations(
  items: HistoryItem[],
  conversations: ProjectableConversation[]
): HistoryItem[] {
  const seen = new Set(items.map((item) => item.id));
  const projected = conversations
    .map(projectConversation)
    .filter((item): item is ChatHistoryItem => item !== null && !seen.has(item.id));
  return [...items, ...projected];
}

export function filterHistoryItems(
  items: HistoryItem[],
  filter: { type?: string; search?: string }
): HistoryItem[] {
  const search = filter.search?.trim().toLowerCase() ?? '';
  return items.filter((item) => {
    if (filter.type && filter.type !== 'all' && item.type !== filter.type) return false;
    if (!search) return true;
    const preview = 'preview' in item ? item.preview : '';
    return item.title.toLowerCase().includes(search) || preview.toLowerCase().includes(search);
  });
}

export function countHistoryStats(items: HistoryItem[]): HistoryStats {
  return {
    total: items.length,
    chat: items.filter((item) => item.type === 'chat').length,
    voice: items.filter((item) => item.type === 'voice').length,
    image: items.filter((item) => item.type === 'image').length,
    video: items.filter((item) => item.type === 'video').length,
    destiny: items.filter((item) => item.type === 'destiny').length,
    agent: items.filter((item) => item.type === 'agent').length,
  };
}
