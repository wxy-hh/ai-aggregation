import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useRelayStore } from '@/stores/relay-store';
import type { RelayBundle, RelayReferenceItem } from '@repo/shared';
import { prepareDestinyRelay, commitDestinyRelay } from './relay-execution';

const EMPTY_ACTIVE = {
  chat: null,
  image: null,
  voice: null,
  video: null,
  destiny: null,
};

const EMPTY_DRAFT = {
  chat: '',
  image: '',
  voice: '',
  video: '',
  destiny: '',
};

/**
 * 辅助函数：重置 relay store 至干净初始状态
 */
function resetRelayStore(): void {
  useRelayStore.setState({
    bundles: {},
    activeByTarget: { ...EMPTY_ACTIVE },
    draftByTarget: { ...EMPTY_DRAFT },
    replaceCandidate: null,
    isInitialized: true,
  });
}

/**
 * 辅助函数：构造测试用接力引用项
 */
function createReferenceItem(id: string, title: string): RelayReferenceItem {
  return {
    id,
    sourceModule: 'chat',
    sourceType: 'text',
    sourceId: `src-${id}`,
    sourceTitle: title,
    snapshotText: `快照文本-${title}`,
    createdAt: '2026-11-13T00:00:00.000Z',
  };
}

describe('prepareDestinyRelay 与 commitDestinyRelay 契约（TC01）', () => {
  beforeEach(() => {
    resetRelayStore();
  });

  afterEach(() => {
    resetRelayStore();
  });

  it('注入含 2 个 item 的 destiny 活动接力包后，prepare 返回精确 derivation 元数据（保持 id 与顺序）', () => {
    const item1 = createReferenceItem('item-tc01-1', '参考1');
    const item2 = createReferenceItem('item-tc01-2', '参考2');

    const bundle: RelayBundle = {
      id: 'bundle-tc01',
      items: [item1, item2],
      targetModule: 'destiny',
      targetRole: 'question',
      createdAt: '2026-11-13T00:00:00.000Z',
    };

    useRelayStore.setState({
      bundles: { [bundle.id]: bundle },
      activeByTarget: { ...EMPTY_ACTIVE, destiny: bundle.id },
      draftByTarget: { ...EMPTY_DRAFT, destiny: '用户在命理输入的草稿' },
    });

    const derivation = prepareDestinyRelay();

    expect(derivation).toEqual({
      derivedFromRelayId: 'bundle-tc01',
      derivedFromReferenceIds: ['item-tc01-1', 'item-tc01-2'],
    });

    // 只读快照，执行前不改写 store
    const state = useRelayStore.getState();
    expect(state.activeByTarget.destiny).toBe('bundle-tc01');
    expect(state.draftByTarget.destiny).toBe('用户在命理输入的草稿');
  });

  it('无活动接力包时 prepare 返回 undefined', () => {
    // 场景 1：activeByTarget['destiny'] 为 null
    expect(prepareDestinyRelay()).toBeUndefined();

    // 场景 2：activeByTarget['destiny'] 指向不存在的 bundle id
    useRelayStore.setState({
      activeByTarget: { ...EMPTY_ACTIVE, destiny: 'non-existent-bundle' },
    });
    expect(prepareDestinyRelay()).toBeUndefined();
  });

  it('commit 后 activeByTarget["destiny"] 为 null 且 draftByTarget["destiny"] 被清除', () => {
    const item = createReferenceItem('item-tc01-1', '参考1');
    const bundle: RelayBundle = {
      id: 'bundle-tc01',
      items: [item],
      targetModule: 'destiny',
      targetRole: 'question',
      createdAt: '2026-11-13T00:00:00.000Z',
    };

    useRelayStore.setState({
      bundles: { [bundle.id]: bundle },
      activeByTarget: { ...EMPTY_ACTIVE, destiny: bundle.id },
      draftByTarget: { ...EMPTY_DRAFT, destiny: '待清除的草稿' },
    });

    commitDestinyRelay();

    const state = useRelayStore.getState();
    expect(state.activeByTarget.destiny).toBeNull();
    expect(state.draftByTarget.destiny).toBe('');
    // bundles 本身不被破坏，留存字典中（符合 clearActiveForTarget / clearDraftForTarget 行为）
    expect(state.bundles['bundle-tc01']).toBeDefined();
  });

  it('用例间完全隔离：未注入接力包时不受上一个用例影响', () => {
    const state = useRelayStore.getState();
    expect(state.activeByTarget.destiny).toBeNull();
    expect(state.draftByTarget.destiny).toBe('');
    expect(prepareDestinyRelay()).toBeUndefined();
  });
});
