/**
 * 断点挂载与主动中止 HTTP 级测试（ADR-0061 / 工单 02）
 *
 * 只验证外部可观察契约：状态码、首帧、历史重放、实时衔接、归属与幂等。
 */
import { describe, expect, it, vi } from 'vitest';
import { parseChatStreamEvent } from '@repo/shared';
import { createRunRegistry, type RunRegistry } from './agent/run-registry';
import { createAgentAbortHandler, createAgentResumeHandler } from './agent-resume';

const frame = (text: string) =>
  new TextEncoder().encode(`data: ${JSON.stringify({ type: 'text-delta', text })}\n\n`);

function setup() {
  let now = 1_000_000;
  let seq = 0;
  const registry = createRunRegistry({
    now: () => now,
    createRunId: () => `run-${++seq}`,
  });
  return {
    registry,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

function resumeRequest(runId: string) {
  return new Request(`http://localhost/api/chat/agent/resume?runId=${encodeURIComponent(runId)}`);
}

function abortRequest(runId: string) {
  return new Request('http://localhost/api/chat/agent/abort', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ runId }),
  });
}

function eventFromChunk(chunk: Uint8Array) {
  const text = new TextDecoder().decode(chunk);
  const block = text.split('\n\n').find((item) => item.startsWith('data:'));
  return block ? parseChatStreamEvent(JSON.parse(block.replace(/^data:\s*/, ''))) : null;
}

function handlers(registry: RunRegistry, userId = 'u1') {
  const getUser = vi.fn(async () => ({ id: userId }));
  return {
    resume: createAgentResumeHandler({ runRegistry: registry, getUser }),
    abort: createAgentAbortHandler({ runRegistry: registry, getUser }),
  };
}

describe('断点挂载与主动中止', () => {
  it('resume 首帧为 run_attached（resumed=true），随后全量重放并转实时', async () => {
    const { registry } = setup();
    const run = registry.start({ userId: 'u1', conversationId: 'c1' })!;
    run.append(frame('历史一'));
    run.append(frame('历史二'));
    const { resume } = handlers(registry);

    const response = await resume(resumeRequest(run.runId));
    expect(response.status).toBe(200);

    const reader = response.body!.getReader();
    expect(eventFromChunk((await reader.read()).value!)).toEqual({
      type: 'run_attached',
      runId: run.runId,
      resumed: true,
    });
    expect(eventFromChunk((await reader.read()).value!)).toMatchObject({
      type: 'text-delta',
      text: '历史一',
    });
    expect(eventFromChunk((await reader.read()).value!)).toMatchObject({
      type: 'text-delta',
      text: '历史二',
    });

    run.append(frame('实时三'));
    expect(eventFromChunk((await reader.read()).value!)).toMatchObject({
      type: 'text-delta',
      text: '实时三',
    });

    await reader.cancel();
  });

  it('同一 run 的两个订阅各自完整重放且互不影响', async () => {
    const { registry } = setup();
    const run = registry.start({ userId: 'u1', conversationId: 'c1' })!;
    run.append(frame('共同历史'));
    const { resume } = handlers(registry);

    const first = await resume(resumeRequest(run.runId));
    const second = await resume(resumeRequest(run.runId));
    const firstReader = first.body!.getReader();
    const secondReader = second.body!.getReader();

    await firstReader.read(); // run_attached
    await secondReader.read();
    expect(eventFromChunk((await firstReader.read()).value!)).toMatchObject({
      text: '共同历史',
    });
    expect(eventFromChunk((await secondReader.read()).value!)).toMatchObject({
      text: '共同历史',
    });

    await firstReader.cancel();
    run.append(frame('只给第二个订阅'));
    expect(eventFromChunk((await secondReader.read()).value!)).toMatchObject({
      text: '只给第二个订阅',
    });

    await secondReader.cancel();
  });

  it('非归属用户 resume 返回 403', async () => {
    const { registry } = setup();
    const run = registry.start({ userId: 'u1', conversationId: 'c1' })!;
    const { resume } = handlers(registry, 'u2');

    const response = await resume(resumeRequest(run.runId));
    expect(response.status).toBe(403);
  });

  it('不存在或已过期的 run 返回 410 RUN_UNAVAILABLE', async () => {
    const { registry, advance } = setup();
    const { resume } = handlers(registry);

    const missing = await resume(resumeRequest('missing-run'));
    expect(missing.status).toBe(410);
    expect(await missing.json()).toMatchObject({ code: 'RUN_UNAVAILABLE' });

    const run = registry.start({ userId: 'u1', conversationId: 'c1' })!;
    run.finalize('completed');
    advance(30 * 60 * 1000);
    const expired = await resume(resumeRequest(run.runId));
    expect(expired.status).toBe(410);
  });

  it('abort 触发中止信号；重复调用幂等并返回当前状态', async () => {
    const { registry } = setup();
    const run = registry.start({ userId: 'u1', conversationId: 'c1' })!;
    const { abort } = handlers(registry);

    const first = await abort(abortRequest(run.runId));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ success: true, status: 'aborting' });
    expect(run.controller.signal.aborted).toBe(true);

    const second = await abort(abortRequest(run.runId));
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ success: true, status: 'aborting' });

    run.finalize('aborted');
    const third = await abort(abortRequest(run.runId));
    expect(third.status).toBe(200);
    expect(await third.json()).toEqual({ success: true, status: 'aborted' });
  });

  it('abort 非归属返回 403，不存在返回 410', async () => {
    const { registry } = setup();
    const run = registry.start({ userId: 'u1', conversationId: 'c1' })!;
    const { abort } = handlers(registry, 'u2');

    const forbidden = await abort(abortRequest(run.runId));
    expect(forbidden.status).toBe(403);

    const missing = await handlers(registry).abort(abortRequest('missing-run'));
    expect(missing.status).toBe(410);
    expect(await missing.json()).toMatchObject({ code: 'RUN_UNAVAILABLE' });
  });
});
