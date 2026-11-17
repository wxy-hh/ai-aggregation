import { describe, expect, it } from 'vitest';
import {
  filterHistoryItems,
  mergeHistoryWithConversations,
  projectConversation,
  type ProjectableConversation,
} from './project-conversations';
import type { HistoryItem } from '@/types/history';

const conversation: ProjectableConversation = {
  id: 'conv-c7',
  title: 'C7 引用核对',
  messages: [
    { role: 'user', content: '核对引用' },
    { role: 'assistant', content: '本次 PDF 引用用于核对。' },
  ],
  provider: 'deepseek',
  model: 'deepseek-chat',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_100_000,
};

describe('会话投影到统一历史', () => {
  it('有正文的会话会变成可搜索的对话记录', () => {
    const item = projectConversation(conversation);
    expect(item?.title).toBe('C7 引用核对');
    expect(item?.preview).toContain('PDF 引用');
    expect(item?.id).toBe('conv-c7');
  });

  it('空白草稿不进入最近创作', () => {
    expect(
      projectConversation({
        ...conversation,
        title: '新对话',
        messages: [],
      })
    ).toBeNull();
  });

  it('同 id 的历史记录不被会话投影覆盖，缺失的会话会补上', () => {
    const existing = {
      ...projectConversation(conversation)!,
      title: '历史里的标题',
    } as HistoryItem;
    const extra: ProjectableConversation = {
      ...conversation,
      id: 'conv-2',
      title: '另一段对话',
    };
    const merged = mergeHistoryWithConversations([existing], [conversation, extra]);
    expect(merged.map((item) => item.title)).toEqual(['历史里的标题', '另一段对话']);
  });

  it('搜索同时匹配标题和预览', () => {
    const item = projectConversation(conversation)!;
    expect(filterHistoryItems([item], { search: '引用' })).toHaveLength(1);
    expect(filterHistoryItems([item], { search: '不存在' })).toHaveLength(0);
    expect(filterHistoryItems([item], { type: 'image', search: '引用' })).toHaveLength(0);
  });
});
