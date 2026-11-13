import { describe, expect, it } from 'vitest';
import { manualSseStream } from './manual-sse-stream';

describe('manualSseStream 共享 SSE 测试夹具', () => {
  it('返回正确 status 与 text/event-stream content-type 的 Response', () => {
    const sse = manualSseStream();
    expect(sse.response.status).toBe(200);
    expect(sse.response.headers.get('Content-Type')).toBe('text/event-stream');
    sse.close();
  });

  it('支持 push 结构化对象自动序列化为 data: JSON\\n\\n 帧', async () => {
    const sse = manualSseStream();
    const reader = sse.response.body?.getReader();
    expect(reader).toBeDefined();

    const decoder = new TextDecoder();
    sse.push({ type: 'delta', text: '你好' });
    sse.close();

    const firstChunk = await reader!.read();
    expect(firstChunk.done).toBe(false);
    expect(decoder.decode(firstChunk.value)).toBe('data: {"type":"delta","text":"你好"}\n\n');

    const endChunk = await reader!.read();
    expect(endChunk.done).toBe(true);
  });

  it('支持 push 原始字符串并在 close 后完成流读取', async () => {
    const sse = manualSseStream();
    const reader = sse.response.body?.getReader();
    expect(reader).toBeDefined();

    const decoder = new TextDecoder();
    sse.push(': ping\n\n');
    sse.push('data: {"step":"completed"}\n\n');
    sse.close();

    const chunk1 = await reader!.read();
    expect(decoder.decode(chunk1.value)).toBe(': ping\n\n');

    const chunk2 = await reader!.read();
    expect(decoder.decode(chunk2.value)).toBe('data: {"step":"completed"}\n\n');

    const chunk3 = await reader!.read();
    expect(chunk3.done).toBe(true);
  });
});
