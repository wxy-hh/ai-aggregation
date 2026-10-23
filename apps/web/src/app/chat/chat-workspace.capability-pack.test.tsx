import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import ChatWorkspace from './chat-workspace';
import { useChatStore } from '@/stores/chat-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useConversationsStore } from '@/stores/conversations-store';

vi.mock('@/components/layout/app-layout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="app-layout">{children}</div>,
}));

vi.mock('@/components/auth/auth-guard', () => ({
  AuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/relay/use-relay-receive', () => ({
  useRelayReceive: () => ({
    initialized: true,
    bundle: null,
    replaceCandidate: null,
    isInvalid: false,
    draft: '',
    setDraft: vi.fn(),
    remove: vi.fn(),
    confirmReplace: vi.fn(),
    cancelReplace: vi.fn(),
    commitExecution: vi.fn(),
  }),
}));

vi.mock('@/lib/api/agent-tools', () => ({
  fetchAgentTools: vi.fn(async () => []),
}));

vi.mock('@/lib/api/client', () => ({
  authFetch: vi.fn(),
}));

describe('ChatWorkspace 场景能力包空态卡片交互 (ADR-0014 / 工单 01)', () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: [],
      isLoading: false,
      error: null,
      provider: 'doubao',
      model: 'doubao-seed-evolving',
      activeConversationId: 'test-conv-1',
      activeCapabilityPackKey: null,
      attachment: null,
    });
    useConversationsStore.setState({
      conversations: [
        {
          id: 'test-conv-1',
          title: '新对话',
          messages: [],
          provider: 'doubao',
          model: 'doubao-seed-evolving',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          mode: 'single',
        },
      ],
      currentConversationId: 'test-conv-1',
      mode: 'single',
    });
    useSettingsStore.setState({ agentModeEnabled: false });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('未开启 Agent 模式时：空态页展示通用助手入口，不展示能力包卡片网格', () => {
    useSettingsStore.setState({ agentModeEnabled: false });
    render(<ChatWorkspace />);

    expect(screen.queryByTestId('capability-packs-grid')).not.toBeInTheDocument();
    expect(screen.getByText('生成周报框架')).toBeInTheDocument();
  });

  it('开启 Agent 模式且对话为空时：空态页渲染能力包卡片网格（深度调研与图文报告）', () => {
    useSettingsStore.setState({ agentModeEnabled: true });
    render(<ChatWorkspace />);

    const grid = screen.getByTestId('capability-packs-grid');
    expect(grid).toBeInTheDocument();

    const researchCard = screen.getByTestId('capability-pack-card-deep-research');
    expect(researchCard).toBeInTheDocument();
    expect(researchCard).toHaveTextContent('深度调研');
    expect(researchCard).toHaveTextContent('8 步探索上限');

    const visualCard = screen.getByTestId('capability-pack-card-visual-report');
    expect(visualCard).toBeInTheDocument();
    expect(visualCard).toHaveTextContent('图文报告');
    expect(visualCard).toHaveTextContent('5 步探索上限');

    const knowledgeCard = screen.getByTestId('capability-pack-card-knowledge-qa');
    expect(knowledgeCard).toBeInTheDocument();
    expect(knowledgeCard).toHaveTextContent('知识库问答');
    expect(knowledgeCard).toHaveTextContent('5 步探索上限');
  });

  it('点击「深度调研」卡片：自动设置能力包标记并预填调研模板到输入框', async () => {
    useSettingsStore.setState({ agentModeEnabled: true });
    render(<ChatWorkspace />);

    const researchCard = screen.getByTestId('capability-pack-card-deep-research');
    await act(async () => {
      fireEvent.click(researchCard);
    });

    // 1. 设置能力包标记为 deep-research
    expect(useChatStore.getState().activeCapabilityPackKey).toBe('deep-research');

    // 2. 输入框中预填了专业调研 Prompt 模板
    const textarea = screen.getByPlaceholderText('输入消息…') as HTMLTextAreaElement;
    expect(textarea.value).toContain('深度调研');
    expect(textarea.value).toContain('交叉验证');

    // 3. 输入坞上方渲染出「深度调研」能力包徽标
    expect(screen.getByTestId('capability-pack-badge')).toHaveTextContent('深度调研');
  });

  it('点击「图文报告」卡片：自动设置能力包标记并预填图文报告模板到输入框', async () => {
    useSettingsStore.setState({ agentModeEnabled: true });
    render(<ChatWorkspace />);

    const visualCard = screen.getByTestId('capability-pack-card-visual-report');
    await act(async () => {
      fireEvent.click(visualCard);
    });

    // 1. 设置能力包标记为 visual-report
    expect(useChatStore.getState().activeCapabilityPackKey).toBe('visual-report');

    // 2. 输入框中预填了图文报告 Prompt 模板
    const textarea = screen.getByPlaceholderText('输入消息…') as HTMLTextAreaElement;
    expect(textarea.value).toContain('图文并茂');

    // 3. 输入坞上方渲染出「图文报告」能力包徽标
    expect(screen.getByTestId('capability-pack-badge')).toHaveTextContent('图文报告');
  });

  it('点击「知识库问答」卡片：自动设置能力包标记并预填知识库问答模板到输入框 (工单 08 / QA-013)', async () => {
    useSettingsStore.setState({ agentModeEnabled: true });
    render(<ChatWorkspace />);

    const knowledgeCard = screen.getByTestId('capability-pack-card-knowledge-qa');
    await act(async () => {
      fireEvent.click(knowledgeCard);
    });

    // 1. 设置能力包标记为 knowledge-qa
    expect(useChatStore.getState().activeCapabilityPackKey).toBe('knowledge-qa');

    // 2. 输入框中预填了知识库问答 Prompt 模板
    const textarea = screen.getByPlaceholderText('输入消息…') as HTMLTextAreaElement;
    expect(textarea.value).toContain('知识库');
    expect(textarea.value).toContain('[^n]');

    // 3. 输入坞上方渲染出「知识库问答」能力包徽标
    expect(screen.getByTestId('capability-pack-badge')).toHaveTextContent('知识库问答');
  });
});
