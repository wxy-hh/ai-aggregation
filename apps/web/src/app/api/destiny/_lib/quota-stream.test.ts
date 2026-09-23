import { describe, expect, it, vi } from 'vitest';
import { createQuotaStream } from './quota-stream';
import type { QuotaSession } from '@/lib/billing/quota-session';

const baseContext = {
  requestId: 'req-test',
  action: 'destiny-report' as const,
  endpoint: '/api/destiny/test',
};

async function drainStream(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return chunks;
}

describe('createQuotaStream 配额流管道', () => {
  it('finish(success)：finalize 收到 success + usage + 累计 outputText；二次 finish 被忽略', async () => {
    const session = { finalize: vi.fn().mockResolvedValue(undefined) } as unknown as QuotaSession;
    const { control, wrap } = createQuotaStream({ context: baseContext, logLabel: 'test' });
    control.bindSession(session);

    const source = new ReadableStream<Uint8Array>({
      async start(c) {
        control.appendOutputText('第一段');
        control.appendOutputText('第二段');
        c.enqueue(new Uint8Array([1]));
        await control.finish({ outcome: 'success', usage: { total_tokens: 100 } });
        // 二次 finish 应被忽略
        await control.finish({ outcome: 'failed', reason: '测试二次调用' });
        c.close();
      },
    });

    await drainStream(wrap(source));

    expect(session.finalize).toHaveBeenCalledTimes(1);
    expect(session.finalize).toHaveBeenCalledWith(
      'success',
      expect.objectContaining({
        requestId: 'req-test',
        action: 'destiny-report',
        outputText: '第一段第二段',
        usage: { total_tokens: 100 },
      })
    );
  });

  it('finish 显式 outputText 覆盖累计文本', async () => {
    const session = { finalize: vi.fn().mockResolvedValue(undefined) } as unknown as QuotaSession;
    const { control, wrap } = createQuotaStream({ context: baseContext, logLabel: 'test' });
    control.bindSession(session);

    const source = new ReadableStream<Uint8Array>({
      async start(c) {
        control.appendOutputText('增量累计文本');
        await control.finish({ outcome: 'success', outputText: '覆盖后的完整文本' });
        c.close();
      },
    });

    await drainStream(wrap(source));

    expect(session.finalize).toHaveBeenCalledWith(
      'success',
      expect.objectContaining({
        outputText: '覆盖后的完整文本',
      })
    );
  });

  it('绑定 session 但流正常关闭未 finish → finalize(failed) 且 console.error 被调用', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const session = { finalize: vi.fn().mockResolvedValue(undefined) } as unknown as QuotaSession;
    const { control, wrap } = createQuotaStream({ context: baseContext, logLabel: 'test' });
    control.bindSession(session);

    const source = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array([1]));
        c.close();
      },
    });

    await drainStream(wrap(source));

    expect(session.finalize).toHaveBeenCalledTimes(1);
    expect(session.finalize).toHaveBeenCalledWith(
      'failed',
      expect.objectContaining({
        requestId: 'req-test',
        action: 'destiny-report',
      })
    );
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('未显式声明 finish 终态'));
    errorSpy.mockRestore();
  });

  it('未绑定 session 流关闭 → finalize 与 console.error 均不被调用', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { wrap } = createQuotaStream({ context: baseContext, logLabel: 'test' });

    const source = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array([1]));
        c.close();
      },
    });

    await drainStream(wrap(source));

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('finish 时未绑定 session → console.error 且不抛错', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { control } = createQuotaStream({ context: baseContext, logLabel: 'test' });

    await expect(control.finish({ outcome: 'success' })).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('未绑定会话'));
    errorSpy.mockRestore();
  });

  it('读异常：有产出 → partial（reason=错误 message）', async () => {
    const session = { finalize: vi.fn().mockResolvedValue(undefined) } as unknown as QuotaSession;
    const { control, wrap } = createQuotaStream({ context: baseContext, logLabel: 'test' });
    control.bindSession(session);

    const source = new ReadableStream<Uint8Array>({
      start(c) {
        control.appendOutputText('部分正文文本');
        c.error(new Error('上游网络异常中断'));
      },
    });

    await expect(drainStream(wrap(source))).rejects.toThrow('上游网络异常中断');

    expect(session.finalize).toHaveBeenCalledTimes(1);
    expect(session.finalize).toHaveBeenCalledWith(
      'partial',
      expect.objectContaining({
        outputText: '部分正文文本',
        reason: '上游网络异常中断',
      })
    );
  });

  it('读异常：无产出 → failed', async () => {
    const session = { finalize: vi.fn().mockResolvedValue(undefined) } as unknown as QuotaSession;
    const { control, wrap } = createQuotaStream({ context: baseContext, logLabel: 'test' });
    control.bindSession(session);

    const source = new ReadableStream<Uint8Array>({
      start(c) {
        c.error(new Error('首次建连超时'));
      },
    });

    await expect(drainStream(wrap(source))).rejects.toThrow('首次建连超时');

    expect(session.finalize).toHaveBeenCalledTimes(1);
    expect(session.finalize).toHaveBeenCalledWith(
      'failed',
      expect.objectContaining({
        reason: '首次建连超时',
      })
    );
  });

  it('cancel：有产出 → partial', async () => {
    const session = { finalize: vi.fn().mockResolvedValue(undefined) } as unknown as QuotaSession;
    const { control, wrap } = createQuotaStream({ context: baseContext, logLabel: 'test' });
    control.bindSession(session);

    const source = new ReadableStream<Uint8Array>({
      start(c) {
        control.appendOutputText('用户断开前的文本');
        c.enqueue(new Uint8Array([1]));
      },
    });

    const reader = wrap(source).getReader();
    await reader.read();
    await reader.cancel('客户端主动离开');

    expect(session.finalize).toHaveBeenCalledTimes(1);
    expect(session.finalize).toHaveBeenCalledWith(
      'partial',
      expect.objectContaining({
        outputText: '用户断开前的文本',
        reason: '客户端主动离开',
      })
    );
  });

  it('cancel：无产出 → failed', async () => {
    const session = { finalize: vi.fn().mockResolvedValue(undefined) } as unknown as QuotaSession;
    const { control, wrap } = createQuotaStream({ context: baseContext, logLabel: 'test' });
    control.bindSession(session);

    const source = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array([1]));
      },
    });

    const reader = wrap(source).getReader();
    await reader.read();
    await reader.cancel('刚开始就取消');

    expect(session.finalize).toHaveBeenCalledTimes(1);
    expect(session.finalize).toHaveBeenCalledWith(
      'failed',
      expect.objectContaining({
        reason: '刚开始就取消',
      })
    );
  });

  it('重复绑定 session 时打印 console.error 并忽略', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const session1 = { finalize: vi.fn() } as unknown as QuotaSession;
    const session2 = { finalize: vi.fn() } as unknown as QuotaSession;
    const { control } = createQuotaStream({ context: baseContext, logLabel: 'test' });

    control.bindSession(session1);
    control.bindSession(session2);

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('重复绑定'));
    errorSpy.mockRestore();
  });
});
