/**
 * 对话页面入口意图解析。
 *
 * 把 URL 查询串解析为互斥的入口意图，供会话编排命令执行。
 * 纯函数：不读取浏览器位置、不依赖 store，便于独立验证优先级规则。
 */

/** 对话入口意图：五类互斥结果 */
export type ChatEntryIntent =
  | { kind: 'comparison'; comparisonId: string }
  | { kind: 'history'; historyId: string }
  | {
      kind: 'new';
      enableAgent: boolean;
      capabilityPack: string | null;
      goal: string | null;
    }
  | { kind: 'restore-first-single'; conversationId: string }
  | { kind: 'keep-current' };

/** 解析入口意图时需要的页面快照（只含判断所需字段） */
export interface ChatEntrySnapshot {
  /** 当前选中的会话 id */
  currentConversationId: string | null;
  /** 当前模式 */
  mode: 'single' | 'compare';
  /** 会话列表中首个单聊会话 id */
  firstSingleConversationId: string | null;
}

/**
 * 解析 URL 查询串为对话入口意图。
 * 优先级：对比会话 > 历史会话 > 新建 > 恢复首个单聊 > 保持当前；
 * `goal` / `pack` / `agent` 只在新建分支内生效。
 */
export function resolveChatEntryIntent(
  search: string,
  snapshot: ChatEntrySnapshot
): ChatEntryIntent {
  const params = new URLSearchParams(search);

  const comparisonId = params.get('comparisonId');
  if (comparisonId) return { kind: 'comparison', comparisonId };

  const historyId = params.get('historyId');
  if (historyId) return { kind: 'history', historyId };

  if (params.get('new') === 'true') {
    return {
      kind: 'new',
      enableAgent: params.get('agent') === 'true',
      capabilityPack: params.get('pack'),
      goal: params.get('goal'),
    };
  }

  if (
    !snapshot.currentConversationId &&
    snapshot.mode === 'single' &&
    snapshot.firstSingleConversationId
  ) {
    return {
      kind: 'restore-first-single',
      conversationId: snapshot.firstSingleConversationId,
    };
  }

  return { kind: 'keep-current' };
}
