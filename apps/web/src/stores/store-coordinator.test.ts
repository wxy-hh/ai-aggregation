import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerStoreCoordinator } from './store-coordinator';
import { useConversationsStore } from './conversations-store';
import { useHistoryStore } from './history-store';

// history-store 依赖 authFetch（远端拉取历史）；删除链只走本地 emit，mock 网络层
vi.mock('@/lib/api/client', () => ({
  authFetch: vi.fn(),
  fetchWithAuth: vi.fn(),
  authHeaders: vi.fn(),
}));

describe('删除历史记录 → conversations-store 同步移除对话（bug: 删除后 /chat 仍见记录）', () => {
  let off: () => void;

  beforeEach(async () => {
    // 等待 persist 水合完成，避免 rehydrate 覆盖下面预置的状态
    await Promise.resolve();

    off = registerStoreCoordinator();

    useConversationsStore.setState({
      conversations: [
        {
          id: 'conv-1',
          title: '历史待删对话',
          messages: [{ id: 'm1', role: 'user', content: '你好' }],
          provider: 'xunfei',
          model: 'lite',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      currentConversationId: 'conv-1',
      isLoaded: true,
    });

    useHistoryStore.setState({
      items: [],
      isInitialized: true,
      isLoading: false,
      error: null,
      filter: { type: 'all' },
    });
  });

  afterEach(() => {
    off();
  });

  it('历史页删除入口（history-store.deleteItem 非 sync）应同步删除对应对话', async () => {
    // 模拟历史页 history-workspace 的 confirmDelete：deleteItem(id)
    useHistoryStore.getState().deleteItem('conv-1');

    // /chat 侧边栏数据源是 conversations-store，若未同步删除则残留显示
    const remaining = useConversationsStore
      .getState()
      .conversations.find((c) => c.id === 'conv-1');
    expect(remaining).toBeUndefined();
  });
});