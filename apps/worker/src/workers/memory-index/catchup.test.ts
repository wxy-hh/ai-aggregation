import { describe, expect, it, vi } from 'vitest';
import { dispatchMemoryCatchup } from './catchup';

describe('记忆索引补派发', () => {
  it('使用非冲突 jobId 追加一次追赶任务', async () => {
    const queue = { add: vi.fn().mockResolvedValue({ id: 'catchup-job' }) };
    const data = { userId: 'user-1', sessionId: 'sess-1' };

    await dispatchMemoryCatchup(queue, data);

    expect(queue.add).toHaveBeenCalledTimes(1);
    const [name, payload, options] = queue.add.mock.calls[0];
    expect(name).toBe('memory-index');
    expect(payload).toEqual(data);
    expect(options.jobId).toMatch(/^memory-index-sess-1-catchup-/);
    expect(options.jobId).not.toBe('memory-index-sess-1');
    expect(options.removeOnComplete).toBe(true);
  });
});
