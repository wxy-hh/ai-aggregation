import { describe, expect, it } from 'vitest';

import { resolveChatEntryIntent, type ChatEntrySnapshot } from './chat-entry';

/** 构造页面入口快照：默认已有当前会话、单聊模式、存在首个单聊 */
const createSnapshot = (overrides: Partial<ChatEntrySnapshot> = {}): ChatEntrySnapshot => ({
  currentConversationId: 'conv-current',
  mode: 'single',
  firstSingleConversationId: 'conv-1',
  ...overrides,
});

describe('resolveChatEntryIntent', () => {
  it('解析 ?comparisonId= 为对比会话意图', () => {
    expect(resolveChatEntryIntent('?comparisonId=cmp-1', createSnapshot())).toEqual({
      kind: 'comparison',
      comparisonId: 'cmp-1',
    });
  });

  it('解析 ?historyId= 为历史会话意图', () => {
    expect(resolveChatEntryIntent('?historyId=h-1', createSnapshot())).toEqual({
      kind: 'history',
      historyId: 'h-1',
    });
  });

  it('解析 ?new=true 为不带附加参数的新建意图', () => {
    expect(resolveChatEntryIntent('?new=true', createSnapshot())).toEqual({
      kind: 'new',
      enableAgent: false,
      capabilityPack: null,
      goal: null,
    });
  });

  it('解析新建意图的 agent、pack 与 goal 参数', () => {
    expect(
      resolveChatEntryIntent(
        '?new=true&agent=true&pack=deep-research&goal=%E7%9B%AE%E6%A0%87',
        createSnapshot()
      )
    ).toEqual({
      kind: 'new',
      enableAgent: true,
      capabilityPack: 'deep-research',
      goal: '目标',
    });
  });

  it('同时带 comparisonId、historyId 与 new 时对比会话优先', () => {
    expect(
      resolveChatEntryIntent(
        '?comparisonId=cmp-1&historyId=h-1&new=true',
        createSnapshot()
      )
    ).toEqual({ kind: 'comparison', comparisonId: 'cmp-1' });
  });

  it('同时带 historyId 与 new 时历史会话优先', () => {
    expect(resolveChatEntryIntent('?historyId=h-1&new=true', createSnapshot())).toEqual({
      kind: 'history',
      historyId: 'h-1',
    });
  });

  it('不带 new 时 pack、goal、agent 不生效', () => {
    expect(
      resolveChatEntryIntent(
        '?pack=deep-research&goal=x&agent=true',
        createSnapshot()
      )
    ).toEqual({ kind: 'keep-current' });
  });

  it('无参数、无当前指针且存在首个单聊时恢复首个单聊', () => {
    expect(
      resolveChatEntryIntent(
        '',
        createSnapshot({ currentConversationId: null, firstSingleConversationId: 'conv-1' })
      )
    ).toEqual({ kind: 'restore-first-single', conversationId: 'conv-1' });
  });

  it('无参数且已有当前指针时保持当前', () => {
    expect(resolveChatEntryIntent('', createSnapshot())).toEqual({ kind: 'keep-current' });
  });

  it('无参数、无当前指针且没有单聊时保持当前', () => {
    expect(
      resolveChatEntryIntent(
        '',
        createSnapshot({ currentConversationId: null, firstSingleConversationId: null })
      )
    ).toEqual({ kind: 'keep-current' });
  });
});
