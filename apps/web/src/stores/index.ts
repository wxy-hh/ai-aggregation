/**
 * Zustand Stores - 统一导出入口
 * 
 * 使用方式：
 * import { useConversationsStore, useSettingsStore } from '@/stores';
 */

// Conversations Store
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

// Settings Store
export {
    useSettingsStore,
    useTheme,
    useLanguage,
    useFontSize,
    useSettingsActions,
    type Theme,
    type SettingsState,
} from './settings-store';

// UI Store
export {
    useUIStore,
    usePinnedApps,
    useShowAppsModal,
    useUIActions,
    type UIState,
} from './ui-store';

// Chat Store
export {
    useChatStore,
    type ChatState,
    type ProviderName,
    type Message,
} from './chat-store';
