'use client';

/**
 * Store 协调器 —— 在应用生命周期中注册一次，负责监听跨 Store 事件并分发同步操作。
 *
 * 职责：
 * - 监听 conversation:updated → 同步更新 conversations-store 中的消息
 * - 监听 chat-history:saved → 同步写入 history-store
 * - 监听 history:deleted → 同步删除 conversations-store 和 audio-history-store 中的对应记录
 * - 监听 conversation:deleted → 同步删除 history-store 中的对应记录
 * - 监听 audio-history:deleted → 同步删除 history-store 中的对应记录
 * - 监听 relay:sources-invalidated → 标记接力引用来源已删除
 *
 * 所有同步操作都携带 isSyncDelete=true 守卫，避免事件循环。
 */

import { useEffect } from 'react';
import { on, StoreEvents } from './store-events';
import { useConversationsStore } from './conversations-store';
import { useHistoryStore } from './history-store';

export function registerStoreCoordinator(): () => void {
  const unsubs: Array<() => void> = [];

  // conversation:updated → 同步更新 conversations-store 中的消息
  unsubs.push(
    on(StoreEvents.CONVERSATION_UPDATED, ({ id, messages }: { id: string; messages: any[] }) => {
      useConversationsStore.getState().updateMessages(id, messages);
    })
  );

  // chat-history:saved → 同步写入 history-store
  unsubs.push(
    on(StoreEvents.CHAT_HISTORY_SAVED, ({ item }: { item: any }) => {
      useHistoryStore.getState().addItem(item);
    })
  );

  // history:deleted → 同步删除 conversations + audio-history + relay
  unsubs.push(
    on(StoreEvents.HISTORY_DELETED, ({ ids, types }: { ids: string[]; types?: Record<string, string> }) => {
      // 同步删除 conversations-store 中的 chat 类型对话
      const convStore = useConversationsStore.getState();
      ids.forEach((id) => {
        const conv = convStore.conversations.find((c: { id: string }) => c.id === id);
        if (conv) {
          convStore.deleteConversation(id, true);
        }
      });

      // 同步删除 audio-history-store 中的 voice 类型记录
      if (types) {
        try {
          const { useAudioHistoryStore } = require('./audio-history-store');
          const audioStore = useAudioHistoryStore.getState();
          ids.forEach((id) => {
            if (types[id] === 'voice') {
              audioStore.deleteItem(id);
            }
          });
        } catch {
          // audio-history-store 可能未初始化
        }
      }

      // 同步标记接力引用来源已删除
      try {
        const { markSourcesInvalidBySourceIds } = require('./relay-store');
        markSourcesInvalidBySourceIds(ids);
      } catch {
        // relay-store 可能未初始化
      }
    })
  );

  // conversation:deleted → 同步删除 history-store
  unsubs.push(
    on(StoreEvents.CONVERSATION_DELETED, ({ id }: { id: string }) => {
      useHistoryStore.getState().deleteItem(id, true);
    })
  );

  // audio-history:deleted → 同步删除 history-store
  unsubs.push(
    on(StoreEvents.AUDIO_HISTORY_DELETED, ({ id }: { id: string }) => {
      useHistoryStore.getState().deleteItem(id, true);
    })
  );

  return () => unsubs.forEach((unsub) => unsub());
}

/**
 * 协调器挂载组件：在应用生命周期内注册一次，卸载时清理。
 * 由 components/providers/store-coordinator.tsx 通过 dynamic 懒加载，
 * 确保本模块（及其静态依赖 conversations/history 等 store）不进入 layout chunk。
 */
export function CoordinatorEffect() {
  useEffect(() => registerStoreCoordinator(), []);
  return null;
}
