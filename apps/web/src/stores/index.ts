/**
 * Zustand Stores - 统一导出入口
 *
 * 使用方式：
 * import { useConversationsStore, useSettingsStore } from '@/stores';
 */

// 会话存储 (Conversations Store)
export {
  useConversationsStore,
  useConversations,
  useCurrentConversationId,
  useIsConversationsLoaded,
  useConversationsActions,
  type ChatMessage,
  type Conversation,
  type ConversationGroup,
} from './conversations-store';

// 设置存储 (Settings Store)
export {
  useSettingsStore,
  useTheme,
  useLanguage,
  useFontSize,
  useSettingsActions,
  type Theme,
  type SettingsState,
} from './settings-store';

// UI 存储 (UI Store)
export {
  useUIStore,
  usePinnedApps,
  useShowAppsModal,
  useUIActions,
  type UIState,
} from './ui-store';

// 聊天存储 (Chat Store)
export { useChatStore, type ChatState, type ProviderName, type Message } from './chat-store';

// 音频历史记录存储 (Audio History Store)
export {
  useAudioHistoryStore,
  useHistoryItems,
  useCurrentHistoryItem,
  useHistoryLoading,
  useHistoryError,
  useSelectedHistoryIds,
  useHistoryStats,
  useHistoryFilter,
  useHistoryInitialized,
  useHistoryActions,
  type AudioHistoryState,
} from './audio-history-store';
