/**
 * 轻量级 Store 事件总线
 *
 * 用于解耦 Store 间的跨 Store 同步（删除、更新等）。
 * 各 Store 只需 emit 事件，不直接 require 其他 Store；
 * 由 store-coordinator 统一监听并分发，避免循环依赖和隐式递归守卫。
 */

type EventHandler = (payload: any) => void;

const listeners = new Map<string, Set<EventHandler>>();

export function on(event: string, handler: EventHandler): () => void {
  if (!listeners.has(event)) {
    listeners.set(event, new Set());
  }
  listeners.get(event)!.add(handler);
  return () => {
    listeners.get(event)?.delete(handler);
  };
}

export function emit(event: string, payload?: any): void {
  listeners.get(event)?.forEach((handler) => {
    try {
      handler(payload);
    } catch (err) {
      console.error(`[store-events] handler error on "${event}":`, err);
    }
  });
}

// ==================== 事件常量 ====================

export const StoreEvents = {
  /** 历史记录被删除（payload: { ids: string[] }） */
  HISTORY_DELETED: 'history:deleted',
  /** 对话被删除（payload: { id: string }） */
  CONVERSATION_DELETED: 'conversation:deleted',
  /** 对话消息被更新（payload: { id: string, messages: Message[] }） */
  CONVERSATION_UPDATED: 'conversation:updated',
  /** 聊天历史记录保存（payload: { item: HistoryItem }） */
  CHAT_HISTORY_SAVED: 'chat-history:saved',
  /** 音频记录被删除（payload: { id: string }） */
  AUDIO_HISTORY_DELETED: 'audio-history:deleted',
  /** 接力引用来源被删除（payload: { ids: string[] }） */
  RELAY_SOURCES_INVALIDATED: 'relay:sources-invalidated',
} as const;
