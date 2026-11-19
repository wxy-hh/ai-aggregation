import { describe, expect, it, vi } from 'vitest';
import {
  createKnowledgeFaqMatchPolicy,
  type FaqCandidateFact,
  type KnowledgeFaqPolicyDeps,
} from './faq-match-policy';

const KB_A = {
  id: 'kb-a',
  updatedAt: new Date('2026-01-03T00:00:00.000Z'),
  status: 'active' as const,
};

function candidate(overrides: Partial<FaqCandidateFact> = {}): FaqCandidateFact {
  return {
    faqId: 'faq-1',
    knowledgeBaseId: 'kb-a',
    userId: 'user-1',
    question: '如何申请退款？',
    answer: '在订单中心申请退款即可。',
    matchedQuestionText: '如何申请退款？',
    similarity: 0.95,
    enabled: true,
    knowledgeBaseUpdatedAt: KB_A.updatedAt,
    ...overrides,
  };
}

function createHarness(overrides: Partial<KnowledgeFaqPolicyDeps> = {}) {
  const deps: KnowledgeFaqPolicyDeps = {
    findActiveKnowledgeBases: vi.fn(async () => [KB_A]),
    validateKnowledgeBase: vi.fn(async () => true),
    embedQuery: vi.fn(async () => [1, 0]),
    findCandidates: vi.fn(async () => [candidate()]),
    incrementHitCount: vi.fn(async () => {}),
    warn: vi.fn(),
    ...overrides,
  };
  return { policy: createKnowledgeFaqMatchPolicy(deps), deps };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user-1',
    query: '如何申请退款？',
    scene: 'chat-short-circuit' as const,
    ...overrides,
  };
}

describe('KnowledgeFaqMatchPolicy 场景与阈值决策表', () => {
  it('TC04-1: 普通场景无附件、500 字符以内且 0.95 -> short-circuit', async () => {
    const { policy } = createHarness();
    await expect(policy.match(input())).resolves.toMatchObject({
      kind: 'short-circuit',
      faq: { faqId: 'faq-1', answer: '在订单中心申请退款即可。' },
    });
  });

  it('TC04-2: 普通场景当前附件存在 -> no-match', async () => {
    const { policy } = createHarness();
    await expect(policy.match(input({ hasCurrentAttachments: true }))).resolves.toMatchObject({
      kind: 'no-match',
    });
  });

  it('TC04-3: 普通场景 501 字符 -> no-match，恰好 500 字符 -> short-circuit', async () => {
    const { policy } = createHarness();
    await expect(policy.match(input({ query: 'a'.repeat(501) }))).resolves.toMatchObject({
      kind: 'no-match',
    });
    await expect(policy.match(input({ query: 'b'.repeat(500) }))).resolves.toMatchObject({
      kind: 'short-circuit',
    });
  });

  it('TC04-4: 普通场景 0.78 与 0.919 不直出，恰好 0.92 直出', async () => {
    for (const similarity of [0.78, 0.919]) {
      const { policy } = createHarness({
        findCandidates: vi.fn(async () => [candidate({ similarity })]),
      });
      await expect(policy.match(input())).resolves.toMatchObject({ kind: 'no-match' });
    }

    const { policy } = createHarness({
      findCandidates: vi.fn(async () => [candidate({ similarity: 0.92 })]),
    });
    await expect(policy.match(input())).resolves.toMatchObject({ kind: 'short-circuit' });
  });

  it('TC04-5: Agent 场景 0.78/0.92/0.93 均为 ground-truth，0.779 为 no-match', async () => {
    for (const similarity of [0.78, 0.92, 0.93]) {
      const { policy } = createHarness({
        findCandidates: vi.fn(async () => [candidate({ similarity })]),
      });
      await expect(policy.match(input({ scene: 'agent-retrieval' }))).resolves.toMatchObject({
        kind: 'ground-truth',
      });
    }

    const { policy } = createHarness({
      findCandidates: vi.fn(async () => [candidate({ similarity: 0.779 })]),
    });
    await expect(policy.match(input({ scene: 'agent-retrieval' }))).resolves.toMatchObject({
      kind: 'no-match',
    });
  });

  it('TC04-6: 对比场景 0.95 -> no-match 且不读取候选', async () => {
    const { policy, deps } = createHarness();
    await expect(policy.match(input({ scene: 'comparison' }))).resolves.toMatchObject({
      kind: 'no-match',
    });
    expect(deps.findCandidates).not.toHaveBeenCalled();
  });

  it('TC04-7: FAQ 停用或候选为空 -> no-match', async () => {
    const disabled = createHarness({
      findCandidates: vi.fn(async () => [candidate({ enabled: false })]),
    });
    await expect(disabled.policy.match(input())).resolves.toMatchObject({ kind: 'no-match' });

    const empty = createHarness({ findCandidates: vi.fn(async () => []) });
    await expect(empty.policy.match(input())).resolves.toMatchObject({ kind: 'no-match' });
  });
});

describe('KnowledgeFaqMatchPolicy 选库与跨库仲裁', () => {
  const bases = [
    { id: 'kb-newest', updatedAt: new Date('2026-01-04T00:00:00.000Z'), status: 'active' },
    { id: 'kb-middle', updatedAt: new Date('2026-01-03T00:00:00.000Z'), status: 'active' },
    { id: 'kb-oldest', updatedAt: new Date('2026-01-02T00:00:00.000Z'), status: 'active' },
    { id: 'kb-fourth', updatedAt: new Date('2026-01-01T00:00:00.000Z'), status: 'active' },
    { id: 'kb-archived', updatedAt: new Date('2026-01-05T00:00:00.000Z'), status: 'archived' },
  ];

  it('TC05-1: 普通与 Agent 未显式选库均取最近更新的三个活跃库', async () => {
    const { policy, deps } = createHarness({
      findActiveKnowledgeBases: vi.fn(async () => bases),
    });
    await policy.match(input());
    await policy.match(input({ scene: 'agent-retrieval' }));

    expect(deps.findCandidates).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ knowledgeBaseIds: ['kb-newest', 'kb-middle', 'kb-oldest'] })
    );
    expect(deps.findCandidates).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ knowledgeBaseIds: ['kb-newest', 'kb-middle', 'kb-oldest'] })
    );
  });

  it('TC05-2: 显式活跃库只查询该库，归档或跨用户库不查询候选', async () => {
    const active = createHarness({
      validateKnowledgeBase: vi.fn(async () => true),
    });
    await active.policy.match(input({ knowledgeBaseId: 'kb-explicit' }));
    expect(active.deps.findCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ knowledgeBaseIds: ['kb-explicit'] })
    );

    const denied = createHarness({
      validateKnowledgeBase: vi.fn(async () => false),
    });
    await expect(denied.policy.match(input({ knowledgeBaseId: 'kb-archived' }))).resolves.toMatchObject({
      kind: 'no-match',
    });
    expect(denied.deps.findCandidates).not.toHaveBeenCalled();
  });

  it('TC05-3: 较高相似度的旧知识库候选胜过较低相似度的新知识库候选', async () => {
    const oldHigh = candidate({
      faqId: 'faq-old-high',
      knowledgeBaseId: 'kb-oldest',
      similarity: 0.96,
      knowledgeBaseUpdatedAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    const newLow = candidate({
      faqId: 'faq-new-low',
      knowledgeBaseId: 'kb-newest',
      similarity: 0.95,
      knowledgeBaseUpdatedAt: new Date('2026-01-04T00:00:00.000Z'),
    });
    const { policy } = createHarness({
      findActiveKnowledgeBases: vi.fn(async () => bases),
      findCandidates: vi.fn(async () => [newLow, oldHigh]),
    });

    await expect(policy.match(input())).resolves.toMatchObject({
      kind: 'short-circuit',
      faq: { faqId: 'faq-old-high' },
    });
  });

  it('TC05-4: 相似度同分时最近更新知识库胜出', async () => {
    const oldTie = candidate({
      faqId: 'faq-old-tie',
      knowledgeBaseId: 'kb-oldest',
      similarity: 0.95,
      knowledgeBaseUpdatedAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    const newTie = candidate({
      faqId: 'faq-new-tie',
      knowledgeBaseId: 'kb-newest',
      similarity: 0.95,
      knowledgeBaseUpdatedAt: new Date('2026-01-04T00:00:00.000Z'),
    });
    const { policy } = createHarness({
      findActiveKnowledgeBases: vi.fn(async () => bases),
      findCandidates: vi.fn(async () => [oldTie, newTie]),
    });

    await expect(policy.match(input())).resolves.toMatchObject({
      kind: 'short-circuit',
      faq: { faqId: 'faq-new-tie' },
    });
  });

  it('TC05-5: 同库同分时稳定标识字典序较小者胜出', async () => {
    const faqB = candidate({ faqId: 'faq-b', similarity: 0.95 });
    const faqA = candidate({ faqId: 'faq-a', similarity: 0.95 });
    const { policy } = createHarness({
      findCandidates: vi.fn(async () => [faqB, faqA]),
    });

    await expect(policy.match(input())).resolves.toMatchObject({
      kind: 'short-circuit',
      faq: { faqId: 'faq-a' },
    });
  });
});

describe('KnowledgeFaqMatchPolicy 计数与异常降级', () => {
  it('TC06-1: short-circuit 与 ground-truth 各发起一次计数，no-match 不计数', async () => {
    const short = createHarness();
    await short.policy.match(input());
    expect(short.deps.incrementHitCount).toHaveBeenCalledTimes(1);
    expect(short.deps.incrementHitCount).toHaveBeenCalledWith('faq-1');

    const ground = createHarness();
    await ground.policy.match(input({ scene: 'agent-retrieval' }));
    expect(ground.deps.incrementHitCount).toHaveBeenCalledTimes(1);

    const none = createHarness({
      findCandidates: vi.fn(async () => [candidate({ similarity: 0.5 })]),
    });
    await none.policy.match(input());
    expect(none.deps.incrementHitCount).not.toHaveBeenCalled();
  });

  it('TC06-2: 同一请求两次采用分别计数', async () => {
    const { policy, deps } = createHarness();
    await policy.match(input());
    await policy.match(input());
    expect(deps.incrementHitCount).toHaveBeenCalledTimes(2);
  });

  it('TC06-3: 计数写入失败不改变已作出的决策', async () => {
    const { policy, deps } = createHarness({
      incrementHitCount: vi.fn(async () => {
        throw new Error('counter down');
      }),
    });
    await expect(policy.match(input())).resolves.toMatchObject({ kind: 'short-circuit' });
    expect(deps.incrementHitCount).toHaveBeenCalledTimes(1);
  });

  it('TC06-4: 候选查询抛错时降级为 no-match 且不计数', async () => {
    const { policy, deps } = createHarness({
      findCandidates: vi.fn(async () => {
        throw new Error('db down');
      }),
    });
    await expect(policy.match(input())).resolves.toMatchObject({
      kind: 'no-match',
      reason: 'lookup-failed',
    });
    expect(deps.incrementHitCount).not.toHaveBeenCalled();
    expect(deps.warn).toHaveBeenCalledTimes(1);
  });
});
