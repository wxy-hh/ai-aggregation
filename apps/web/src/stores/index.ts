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
export {
  useChatStore,
  type ChatState,
  type ProviderName,
  type Message,
  type MessageContent,
  type Attachment,
} from './chat-store';

// 音频历史记录存储 (Audio History Store)
export {
  useAudioHistoryStore,
  useHistoryItems as useAudioHistoryItems,
  useCurrentHistoryItem,
  useHistoryLoading as useAudioHistoryLoading,
  useHistoryError as useAudioHistoryError,
  useSelectedHistoryIds,
  useHistoryStats as useAudioHistoryStats,
  useHistoryFilter as useAudioHistoryFilter,
  useHistoryInitialized as useAudioHistoryInitialized,
  useHistoryActions as useAudioHistoryActions,
  type AudioHistoryState,
} from './audio-history-store';

// 统一历史记录存储 (Unified History Store)
export {
  useHistoryStore,
  useHistoryItems,
  useHistoryLoading,
  useHistoryError,
  useHistoryFilter,
  useHistoryInitialized,
  useHistoryActions,
} from './history-store';
