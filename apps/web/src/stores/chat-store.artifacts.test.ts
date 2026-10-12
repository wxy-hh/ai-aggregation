import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useChatStore, runChatStreamSession, type ChatStreamSessionDeps, type Message } from './chat-store';
import { StoreEvents, on } from './store-events';
import type { Artifact } from '@repo/shared';

describe('chat-store Artifacts 状态机与工作台联动 (ADR-0015)', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it('初始状态下 artifacts 为空，activeArtifactId 为 null，isWorkspaceOpen 为 false', () => {
    const state = useChatStore.getState();
    expect(state.artifacts).toEqual([]);
    expect(state.activeArtifactId).toBeNull();
    expect(state.isWorkspaceOpen).toBe(false);
  });

  it('setActiveArtifactId / setWorkspaceOpen / closeWorkspace 控制状态', () => {
    const store = useChatStore.getState();
    store.setWorkspaceOpen(true);
    expect(useChatStore.getState().isWorkspaceOpen).toBe(true);

    store.setActiveArtifactId('art-1');
    expect(useChatStore.getState().activeArtifactId).toBe('art-1');

    store.closeWorkspace();
    expect(useChatStore.getState().isWorkspaceOpen).toBe(false);
  });

  it('runChatStreamSession 接收产物事件时，正确更新产物池与消息关联', async () => {
    let messages: Message[] = [
      { id: 'user-1', role: 'user', content: '请调研' },
      { id: 'asst-1', role: 'assistant', content: '', isStreaming: true },
    ];
    let artifacts: Artifact[] = [];
    let activeId: string | null = null;
    let workspaceOpen = false;

    const deps: ChatStreamSessionDeps = {
      getMessages: () => messages,
      updateMessages: (updater) => {
        messages = updater(messages);
        return messages;
      },
      setError: vi.fn(),
      activeConversationId: () => 'conv-test-1',
      getArtifacts: () => artifacts,
      updateArtifacts: (updater) => {
        artifacts = updater(artifacts);
      },
      setActiveArtifactId: (id) => {
        activeId = id;
      },
      setWorkspaceOpen: (open) => {
        workspaceOpen = open;
      },
    };

    // 模拟 mock 流式事件：artifact_start -> artifact_delta -> artifact_end -> done
    const fakeBody = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const send = (data: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        send({
          type: 'text-delta',
          text: '研报已在右侧生成：',
        });
        send({
          type: 'artifact_start',
          artifact: {
            id: 'art-report-1',
            type: 'markdown',
            title: '2026多模态调研',
          },
        });
        send({
          type: 'artifact_delta',
          id: 'art-report-1',
          delta: '# 核心趋势\n模型能力快速进化。',
        });
        send({
          type: 'artifact_end',
          id: 'art-report-1',
          status: 'complete',
        });
        send({
          type: 'done',
        });
        controller.close();
      },
    });

    const fakeResponse = new Response(fakeBody, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(fakeResponse);

    const outcome = await runChatStreamSession(
      deps,
      'asst-1',
      {
        body: { messages: [] },
        signal: new AbortController().signal,
      }
    );

    expect(outcome).toBe('sent');

    // 检查产物池
    expect(artifacts.length).toBe(1);
    expect(artifacts[0]).toMatchObject({
      id: 'art-report-1',
      type: 'markdown',
      title: '2026多模态调研',
      content: '# 核心趋势\n模型能力快速进化。',
      status: 'complete',
    });

    // 检查工作台聚焦与展开
    expect(activeId).toBe('art-report-1');
    expect(workspaceOpen).toBe(true);

    // 检查 assistant 消息关联
    const asstMsg = messages.find((m) => m.id === 'asst-1');
    expect(asstMsg?.artifactIds).toEqual(['art-report-1']);
    expect(asstMsg?.content).toBe('研报已在右侧生成：');
  });

  it('loadConversation 恢复历史产物池与活动产物', () => {
    const historicalArtifacts: Artifact[] = [
      {
        id: 'hist-art-1',
        type: 'markdown',
        title: '历史研报',
        content: '研报正文',
        status: 'complete',
      },
      {
        id: 'hist-art-2',
        type: 'code',
        title: '源码文件',
        content: 'console.log("hello")',
        status: 'complete',
      },
    ];

    useChatStore.getState().loadConversation(
      'conv-history',
      [{ id: 'm1', role: 'assistant', content: '请查阅', artifactIds: ['hist-art-1', 'hist-art-2'] }],
      'doubao',
      'doubao-seed-evolving',
      'deep-research',
      {},
      historicalArtifacts
    );

    const state = useChatStore.getState();
    expect(state.artifacts).toEqual(historicalArtifacts);
    expect(state.activeArtifactId).toBe('hist-art-2'); // 聚焦最新一个
    expect(state.isWorkspaceOpen).toBe(true);
  });
});
