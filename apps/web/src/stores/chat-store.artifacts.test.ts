import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useChatStore, runChatStreamSession, type ChatStreamSessionDeps, type Message } from './chat-store';
import { resetConversationPort, setConversationPort } from './conversation-port';
import type { Artifact } from '@repo/shared';

// 埋点走真实网络会干扰 fetch 的一次性 mock，统一替换为可断言的替身
const trackerMock = vi.hoisted(() => ({ trackEvent: vi.fn() }));
vi.mock('@/lib/events/tracker', () => ({ trackEvent: trackerMock.trackEvent }));

afterEach(() => {
  resetConversationPort();
});

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
    // 加载历史会话保持单栏沉浸阅读，不强行分屏打扰（可由用户点击顶部或卡片按需展开）
    expect(state.isWorkspaceOpen).toBe(false);
  });

  it('loadConversation 过滤纯图片的冗余产物', () => {
    const mixedArtifacts: Artifact[] = [
      {
        id: 'hist-img-1',
        type: 'image',
        title: '生成的图片',
        content: 'https://example.com/pic.png',
        status: 'complete',
      },
      {
        id: 'hist-art-1',
        type: 'markdown',
        title: '历史研报',
        content: '研报正文',
        status: 'complete',
      },
    ];

    useChatStore.getState().loadConversation(
      'conv-history-img',
      [{ id: 'm1', role: 'assistant', content: '请查阅' }],
      'doubao',
      'doubao-seed-evolving',
      null,
      {},
      mixedArtifacts
    );

    const state = useChatStore.getState();
    // 纯图片已被过滤，仅保留真实研报产物
    expect(state.artifacts).toHaveLength(1);
    expect(state.artifacts[0].type).toBe('markdown');
  });
});

// ==================== 工单 02：产物收尾可信化（ADR-0037） ====================

type StreamStep = Record<string, unknown> | 'abort' | 'network-error';

/** 构造一次会话流：按步骤下发 SSE 帧，'abort' / 'network-error' 让读流以对应错误终止 */
function makeSession(initialArtifacts: Artifact[] = []) {
  let messages: Message[] = [
    { id: 'user-1', role: 'user', content: '请修改' },
    { id: 'asst-1', role: 'assistant', content: '', isStreaming: true },
  ];
  let artifacts: Artifact[] = initialArtifacts;
  const emitted: Array<{ id: string; messages: Message[]; artifacts?: Artifact[] }> = [];
  // 假端口按事件时期的载荷形状记录落盘请求
  setConversationPort({
    saveMessages: (id, messages, artifacts) =>
      emitted.push(artifacts ? { id, messages, artifacts } : { id, messages }),
    saveToolOverrides: () => {},
    appendHistory: () => {},
  });
  const deps: ChatStreamSessionDeps = {
    getMessages: () => messages,
    updateMessages: (updater) => {
      messages = updater(messages);
      return messages;
    },
    setError: vi.fn(),
    activeConversationId: () => 'conv-test-2',
    getArtifacts: () => artifacts,
    updateArtifacts: (updater) => {
      artifacts = updater(artifacts);
    },
    setActiveArtifactId: vi.fn(),
    setWorkspaceOpen: vi.fn(),
  };

  const run = async (steps: StreamStep[]) => {
    // 逐帧 pull 下发：controller.error() 会丢弃已入队未读的帧，必须等前面的帧被消费后再抛错
    let cursor = 0;
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      pull(controller) {
        if (cursor >= steps.length) {
          controller.close();
          return;
        }
        const step = steps[cursor++];
        if (step === 'abort') {
          controller.error(new DOMException('The operation was aborted.', 'AbortError'));
          return;
        }
        if (step === 'network-error') {
          controller.error(new Error('network down'));
          return;
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(step)}\n\n`));
      },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    );
    const outcome = await runChatStreamSession(deps, 'asst-1', {
      body: { messages: [] },
      signal: new AbortController().signal,
    });
    resetConversationPort();
    return outcome;
  };

  return { run, getArtifacts: () => artifacts, emitted };
}

const startEvent = (id = 'rpt') => ({
  type: 'artifact_start',
  artifact: { id, type: 'markdown', title: '研报' },
});
const deltaEvent = (delta: string, id = 'rpt') => ({ type: 'artifact_delta', id, delta });
const endEvent = (status: 'complete' | 'error', id = 'rpt') => ({ type: 'artifact_end', id, status });

const completeArtifact = (content = '旧版正文'): Artifact => ({
  id: 'rpt',
  type: 'markdown',
  title: '研报',
  content,
  status: 'complete',
  createdAt: 1,
  versions: [{ id: 'v1', seq: 1, content, createdAt: 1, source: { kind: 'generated' } }],
});

describe('chat-store 产物收尾可信化与版本引擎接入 (ADR-0037 / 工单 02)', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    vi.restoreAllMocks();
  });

  it('同 identifier 的第二次生成完成后内容恰等于第二次输出，不拼接第一次内容', async () => {
    const session = makeSession([completeArtifact('第一次独有的蓝色天空')]);
    const outcome = await session.run([
      startEvent(),
      deltaEvent('第二次'),
      deltaEvent('的输出'),
      endEvent('complete'),
      { type: 'done' },
    ]);
    expect(outcome).toBe('sent');
    const [art] = session.getArtifacts();
    expect(art.content).toBe('第二次的输出');
    expect(art.content).not.toContain('蓝色天空');
    expect(art.versions).toHaveLength(2);
  });

  it('流式中用户中止后产物池无 streaming 产物：已有正式版保持上一版', async () => {
    const session = makeSession([completeArtifact()]);
    const outcome = await session.run([startEvent(), deltaEvent('写到一半'), 'abort']);
    expect(outcome).toBe('aborted');
    const arts = session.getArtifacts();
    expect(arts.some((a) => a.status === 'streaming')).toBe(false);
    expect(arts[0].content).toBe('旧版正文');
    expect(arts[0].versions).toHaveLength(1);
    expect(arts[0].notice).toBe('draft-discarded');
  });

  it('流式中用户中止后全新产物保留半成品并标记未完成（error）', async () => {
    const session = makeSession();
    await session.run([startEvent(), deltaEvent('只写了开头'), 'abort']);
    const [art] = session.getArtifacts();
    expect(art.status).toBe('error');
    expect(art.content).toBe('只写了开头');
    expect(art.versions).toHaveLength(0);
  });

  it('网络失败时同样无残留 streaming 产物并保留上一版，且收尾结果已落盘事件', async () => {
    const session = makeSession([completeArtifact()]);
    const outcome = await session.run([startEvent(), deltaEvent('写到一半'), 'network-error']);
    expect(outcome).toBe('failed');
    const arts = session.getArtifacts();
    expect(arts.some((a) => a.status === 'streaming')).toBe(false);
    expect(arts[0].content).toBe('旧版正文');
    const lastEmit = session.emitted[session.emitted.length - 1];
    expect(lastEmit.artifacts?.some((a) => a.status === 'streaming')).toBe(false);
  });

  it('流正常结束但产物未收到 artifact_end 时也被收尾，不残留 streaming', async () => {
    const session = makeSession();
    await session.run([startEvent(), deltaEvent('没等到结束帧'), { type: 'done' }]);
    const [art] = session.getArtifacts();
    expect(art.status).toBe('error');
    expect(art.content).toBe('没等到结束帧');
  });

  it('产物以 error 结束（输出触顶）时：全新产物状态为 error，已有产物保持上一版且不入链', async () => {
    const fresh = makeSession();
    await fresh.run([startEvent('new'), deltaEvent('被截断', 'new'), endEvent('error', 'new'), { type: 'done' }]);
    expect(fresh.getArtifacts()[0].status).toBe('error');

    const existing = makeSession([completeArtifact()]);
    await existing.run([startEvent(), deltaEvent('被截断'), endEvent('error'), { type: 'done' }]);
    const [art] = existing.getArtifacts();
    expect(art.status).not.toBe('streaming');
    expect(art.content).toBe('旧版正文');
    expect(art.versions).toHaveLength(1);
  });

  it('loadConversation 还原遇到存储中残留 streaming 的产物时收尾为确定状态并回写会话', () => {
    const emitted: unknown[] = [];
    setConversationPort({
      saveMessages: (id, messages, artifacts) =>
        emitted.push(artifacts ? { id, messages, artifacts } : { id, messages }),
      saveToolOverrides: () => {},
      appendHistory: () => {},
    });
    const stuckWithPrev: Artifact = { ...completeArtifact(), content: '半截草稿', status: 'streaming' };
    const stuckFresh: Artifact = {
      id: 'fresh',
      type: 'markdown',
      title: '新稿',
      content: '半截新稿',
      status: 'streaming',
    };
    useChatStore
      .getState()
      .loadConversation('conv-stuck', [{ id: 'm1', role: 'assistant', content: 'x' }], 'doubao', 'm', null, {}, [
        stuckWithPrev,
        stuckFresh,
      ]);
    resetConversationPort();
    const arts = useChatStore.getState().artifacts;
    expect(arts.some((a) => a.status === 'streaming')).toBe(false);
    expect(arts.find((a) => a.id === 'rpt')?.content).toBe('旧版正文');
    expect(arts.find((a) => a.id === 'fresh')?.status).toBe('error');
    expect(emitted.length).toBeGreaterThan(0);
  });
});

// ==================== 工单 03：Markdown 章节补丁端到端（ADR-0037） ====================

const PATCH_DOC = '# 研报\n\n## 第一章\n一章正文\n\n## 第二章\n二章正文\n';

const patchStart = (section: string, id = 'rpt') => ({
  type: 'artifact_start',
  artifact: { id, type: 'markdown', title: '研报', section },
});

describe('chat-store 章节补丁接入 (ADR-0037 / 工单 03)', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    vi.restoreAllMocks();
  });

  it('经流式事件应用章节补丁：只替换目标章节、产生补丁来源的新版本并记录结果', async () => {
    const session = makeSession([completeArtifact(PATCH_DOC)]);
    const outcome = await session.run([
      patchStart('## 第二章'),
      deltaEvent('## 第二章\n二章新正文\n'),
      endEvent('complete'),
      { type: 'done' },
    ]);
    expect(outcome).toBe('sent');
    const [art] = session.getArtifacts();
    expect(art.content).toBe('# 研报\n\n## 第一章\n一章正文\n\n## 第二章\n二章新正文\n');
    expect(art.versions).toHaveLength(2);
    expect(art.versions?.[1].source).toEqual({ kind: 'patch' });
    expect(art.patchReport).toEqual([{ section: '## 第二章', status: 'applied' }]);
    expect(art.status).toBe('complete');
  });

  it('标题抄错的补丁不改动当前版，结果记录失败章节与原因并随会话事件落盘', async () => {
    const session = makeSession([completeArtifact(PATCH_DOC)]);
    await session.run([
      patchStart('## 第三章'),
      deltaEvent('## 第三章\n新\n'),
      endEvent('complete'),
      { type: 'done' },
    ]);
    const [art] = session.getArtifacts();
    expect(art.content).toBe(PATCH_DOC);
    expect(art.versions).toHaveLength(1);
    expect(art.patchReport).toEqual([{ section: '## 第三章', status: 'failed', reason: 'not-found' }]);
    const last = session.emitted.at(-1);
    expect(last?.artifacts?.[0].patchReport?.[0]).toMatchObject({ status: 'failed', reason: 'not-found' });
  });

  it('补丁流式中途中止：保持上一版，补丁草稿被清除，不残留 streaming', async () => {
    const session = makeSession([completeArtifact(PATCH_DOC)]);
    await session.run([patchStart('## 第二章'), deltaEvent('## 第二章\n写了一半'), 'abort']);
    const [art] = session.getArtifacts();
    expect(art.status).toBe('complete');
    expect(art.content).toBe(PATCH_DOC);
    expect(art.patchDraft).toBeUndefined();
    expect(art.notice).toBe('draft-discarded');
  });
});

describe('chat-store 产物版本查看、回滚与入库版本绑定 (ADR-0037)', () => {
  const makeVersioned = (): Artifact => ({
    id: 'art-v',
    type: 'markdown',
    title: '研报',
    content: '# 研报\n\n第三版',
    status: 'complete',
    versions: [
      { id: 'v1', seq: 1, content: '# 研报\n\n第一版', createdAt: 1, source: { kind: 'generated' } },
      { id: 'v2', seq: 2, content: '# 研报\n\n第二版', createdAt: 2, source: { kind: 'patch' } },
      { id: 'v3', seq: 3, content: '# 研报\n\n第三版', createdAt: 3, source: { kind: 'patch' } },
    ],
  });

  beforeEach(() => {
    useChatStore.getState().reset();
    useChatStore.setState({ artifacts: [makeVersioned()], activeArtifactId: 'art-v' });
  });

  it('viewArtifactVersion 选择历史版本进入查看态；选择当前版或 null 则清除查看态', () => {
    const store = useChatStore.getState();
    store.viewArtifactVersion('art-v', 1);
    expect(useChatStore.getState().viewingVersions['art-v']).toBe(1);

    // 选择末尾版本等同于回到当前版
    useChatStore.getState().viewArtifactVersion('art-v', 3);
    expect(useChatStore.getState().viewingVersions['art-v']).toBeUndefined();

    useChatStore.getState().viewArtifactVersion('art-v', 2);
    useChatStore.getState().viewArtifactVersion('art-v', null);
    expect(useChatStore.getState().viewingVersions['art-v']).toBeUndefined();
  });

  it('viewArtifactVersion 对不存在的版本序号不进入查看态', () => {
    useChatStore.getState().viewArtifactVersion('art-v', 99);
    expect(useChatStore.getState().viewingVersions['art-v']).toBeUndefined();
  });

  it('rollbackArtifactToVersion 追加新末尾版本、清除查看态，并经会话端口落盘', () => {
    const handler = vi.fn();
    setConversationPort({
      saveMessages: (id, messages, artifacts) =>
        handler(artifacts ? { id, messages, artifacts } : { id, messages }),
      saveToolOverrides: () => {},
      appendHistory: () => {},
    });
    useChatStore.setState({ activeConversationId: 'conv-rb' });
    useChatStore.getState().viewArtifactVersion('art-v', 1);

    useChatStore.getState().rollbackArtifactToVersion('art-v', 1);
    resetConversationPort();

    const state = useChatStore.getState();
    const art = state.artifacts[0];
    expect(art.versions?.map((v) => v.seq)).toEqual([1, 2, 3, 4]);
    expect(art.versions?.[3]).toMatchObject({ content: '# 研报\n\n第一版', source: { kind: 'rollback', fromSeq: 1 } });
    expect(art.content).toBe('# 研报\n\n第一版');
    expect(state.viewingVersions['art-v']).toBeUndefined();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({ id: 'conv-rb' });
    expect(handler.mock.calls[0][0].artifacts[0].versions).toHaveLength(4);
  });

  it('rollbackArtifactToVersion 对不存在的版本或产物不产生任何改动', () => {
    const before = useChatStore.getState().artifacts;
    useChatStore.getState().rollbackArtifactToVersion('art-v', 99);
    useChatStore.getState().rollbackArtifactToVersion('nope', 1);
    expect(useChatStore.getState().artifacts).toBe(before);
  });

  it('markArtifactDeposited 把入库状态绑定到当时的当前版本', () => {
    useChatStore.getState().markArtifactDeposited('art-v', {
      knowledgeBaseId: 'kb_1',
      knowledgeBaseName: '研报库',
      documentId: 'doc_1',
      depositedAt: '2026-10-28T00:00:00.000Z',
    });
    expect(useChatStore.getState().artifacts[0].kbDeposit).toMatchObject({
      deposited: true,
      documentId: 'doc_1',
      versionId: 'v3',
    });
  });
});

describe('chat-store 章节补丁结果埋点 (ADR-0037 §8 / TC12)', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    vi.restoreAllMocks();
    trackerMock.trackEvent.mockReset();
  });

  const eventsOf = () => trackerMock.trackEvent.mock.calls.map((c) => c[0] as string);

  it('[TC12-4] 补丁应用成功上报 artifact.patch_applied，属性只含类型、版本序号与区间', async () => {
    const session = makeSession([completeArtifact(PATCH_DOC)]);
    await session.run([patchStart('## 第二章'), deltaEvent('## 第二章\n新\n'), endEvent('complete'), { type: 'done' }]);

    expect(eventsOf()).toEqual(['artifact.patch_applied']);
    const props = trackerMock.trackEvent.mock.calls[0][1];
    expect(props).toEqual({ artifactType: 'markdown', versionSeq: 2, sizeBucket: 'lt_1k' });
  });

  it('[TC12-4] 补丁失败上报 artifact.patch_failed，序列化后不含失败章节标题原文', async () => {
    const session = makeSession([completeArtifact(PATCH_DOC)]);
    await session.run([patchStart('## 第五章'), deltaEvent('## 第五章\n新\n'), endEvent('complete'), { type: 'done' }]);

    expect(eventsOf()).toEqual(['artifact.patch_failed']);
    const json = JSON.stringify(trackerMock.trackEvent.mock.calls[0][1]);
    expect(json).not.toContain('第五章');
    expect(json).not.toContain('研报');
  });

  it('同一轮多个补丁各自上报一次：一成一败得到各一条事件，且不重复上报先前结果', async () => {
    const session = makeSession([completeArtifact(PATCH_DOC)]);
    await session.run([
      patchStart('## 第一章'),
      deltaEvent('## 第一章\n改\n'),
      endEvent('complete'),
      patchStart('## 第九章'),
      deltaEvent('## 第九章\n x\n'),
      endEvent('complete'),
      { type: 'done' },
    ]);
    expect(eventsOf()).toEqual(['artifact.patch_applied', 'artifact.patch_failed']);
  });

  it('整篇生成（非补丁）与中止的草稿不上报补丁事件', async () => {
    const session = makeSession([completeArtifact(PATCH_DOC)]);
    await session.run([patchStart('## 第二章'), deltaEvent('## 第二章\n写了一半'), 'abort']);
    expect(eventsOf()).toEqual([]);
  });
});
