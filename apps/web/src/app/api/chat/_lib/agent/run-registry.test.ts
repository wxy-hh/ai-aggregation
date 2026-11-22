/**
 * 运行注册表不变量测试（ADR-0061 / 工单 01）
 *
 * 只通过公开接口观察：创建、追加、订阅、终态、淘汰与上限。
 */
import { describe, expect, it, vi } from 'vitest';
import { createRunRegistry, type RunRegistryLimits } from './run-registry';

const frame = (text: string) =>
  new TextEncoder().encode(`data: ${JSON.stringify({ type: 'text-delta', text })}\n\n`);

function setup(overrides: Partial<RunRegistryLimits> = {}) {
  let now = 1_000_000;
  let seq = 0;
  const warn = vi.fn();
  const registry = createRunRegistry({
    now: () => now,
    createRunId: () => `run-${++seq}`,
    logger: { warn },
    limits: {
      retentionMs: 30 * 60 * 1000,
      maxRuns: 128,
      maxBytes: 64 * 1024 * 1024,
      maxActiveRuns: 16,
      maxActiveBytes: 32 * 1024 * 1024,
      maxRunBytes: 8 * 1024 * 1024,
      ...overrides,
    },
  });
  return {
    registry,
    warn,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('运行注册表', () => {
  it('原子挂载：订阅返回历史帧，随后追加的帧不会丢失', () => {
    const { registry } = setup();
    const run = registry.start({ userId: 'u1', conversationId: 'c1' })!;
    run.append(frame('历史'));

    const received: Uint8Array[] = [];
    const subscription = registry.subscribe(run.runId, 'u1', (f) => received.push(f))!;

    expect(subscription.frames.map((f) => new TextDecoder().decode(f))).toEqual([
      'data: {"type":"text-delta","text":"历史"}\n\n',
    ]);

    run.append(frame('实时'));
    expect(received).toHaveLength(1);
    expect(new TextDecoder().decode(received[0])).toContain('实时');
  });

  it('两个订阅各自收到完整序列，取消其一不影响另一个', () => {
    const { registry } = setup();
    const run = registry.start({ userId: 'u1', conversationId: 'c1' })!;
    run.append(frame('一'));

    const a: string[] = [];
    const b: string[] = [];
    const subA = registry.subscribe(run.runId, 'u1', (f) => a.push(new TextDecoder().decode(f)))!;
    const subB = registry.subscribe(run.runId, 'u1', (f) => b.push(new TextDecoder().decode(f)))!;

    run.append(frame('二'));
    subA.unsubscribe();
    run.append(frame('三'));

    expect(a.join('')).toContain('二');
    expect(a.join('')).not.toContain('三');
    expect(b.join('')).toContain('二');
    expect(b.join('')).toContain('三');
    expect(subB.frames).toHaveLength(1);
  });

  it('终态后保留 30 分钟，超过保留期不可订阅', () => {
    const { registry, advance } = setup();
    const run = registry.start({ userId: 'u1', conversationId: 'c1' })!;
    run.finalize('completed');

    advance(30 * 60 * 1000 - 1);
    expect(registry.subscribe(run.runId, 'u1', () => {})).not.toBeNull();

    advance(1);
    expect(registry.subscribe(run.runId, 'u1', () => {})).toBeNull();
  });

  it('超过全局上限时只淘汰最久未访问的终态 run，活跃 run 保留', () => {
    const { registry } = setup({ maxRuns: 2 });
    const active = registry.start({ userId: 'u1', conversationId: 'c1' })!;
    const firstDone = registry.start({ userId: 'u1', conversationId: 'c2' })!;
    firstDone.finalize('completed');

    registry.start({ userId: 'u1', conversationId: 'c3' })!;

    expect(registry.inspect(active.runId)).not.toBeNull();
    expect(registry.inspect(firstDone.runId)).toBeNull();
  });

  it('活跃 run 达到数量上限时拒绝创建新 run', () => {
    const { registry } = setup({ maxActiveRuns: 2 });
    expect(registry.start({ userId: 'u1', conversationId: 'c1' })).not.toBeNull();
    expect(registry.start({ userId: 'u1', conversationId: 'c2' })).not.toBeNull();
    expect(registry.start({ userId: 'u1', conversationId: 'c3' })).toBeNull();
  });

  it('单 run 日志超过软上限时告警且不截断', () => {
    const { registry, warn } = setup({ maxRunBytes: 10 });
    const run = registry.start({ userId: 'u1', conversationId: 'c1' })!;
    run.append(frame('1234567890'));
    run.append(frame('1234567890'));

    expect(warn).toHaveBeenCalledTimes(1);
    expect(registry.inspect(run.runId)?.bytes).toBeGreaterThan(10);
    expect(registry.subscribe(run.runId, 'u1', () => {})?.frames).toHaveLength(2);
  });

  it('重复写入终态不改变终态与 settledAt', () => {
    const { registry, advance } = setup();
    const run = registry.start({ userId: 'u1', conversationId: 'c1' })!;
    run.finalize('completed');
    const first = registry.inspect(run.runId)!;

    advance(5_000);
    run.finalize('failed');

    expect(registry.inspect(run.runId)).toEqual(first);
    expect(first.status).toBe('completed');
  });

  it('按会话查询活跃 run，终态后不再返回', () => {
    const { registry } = setup();
    const run = registry.start({ userId: 'u1', conversationId: 'c1' })!;
    expect(registry.getActiveByConversation('c1')).toEqual({
      runId: run.runId,
      userId: 'u1',
    });

    run.finalize('aborted');
    expect(registry.getActiveByConversation('c1')).toBeNull();
  });

  it('非归属用户不能订阅', () => {
    const { registry } = setup();
    const run = registry.start({ userId: 'u1', conversationId: 'c1' })!;
    expect(registry.subscribe(run.runId, 'u2', () => {})).toBeNull();
  });
});
