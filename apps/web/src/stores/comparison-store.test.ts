import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useComparisonStore } from './comparison-store';
import { authFetch } from '@/lib/api/client';

// 评审 C4：comparison-store 此前无测试，锁定 runModel 编排（经 streamChatResponse）
// 的「故障局部化」语义：单模型失败不阻塞其它模型，轮次仍执行成功。
vi.mock('@/lib/api/client', () => ({
  authFetch: vi.fn(),
  fetchWithAuth: vi.fn(),
  authHeaders: vi.fn(),
}));

const mockedAuthFetch = vi.mocked(authFetch);

/** 构造 SSE 流式 Response */
function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
  });
}

function resetState() {
  useComparisonStore.setState({
    mode: 'compare',
    selectedModels: [],
    turns: [],
    activeComparisonId: null,
    input: '测试 prompt',
    error: null,
  });
}

// 默认对比组合：xunfei:lite 与 doubao:doubao-seed-evolving（见 chat-models.ts）
const DEFAULT_RESERVATIONS = {
  reservations: [
    { provider: 'xunfei', model: 'lite', requestId: 'req-x', reservationId: 'res-x' },
    { provider: 'doubao', model: 'doubao-seed-evolving', requestId: 'req-d', reservationId: 'res-d' },
  ],
};

describe('useComparisonStore.sendComparison（评审 C4：故障局部化）', () => {
  beforeEach(() => {
    mockedAuthFetch.mockReset();
    resetState();
  });

  it('成功模型写入完成结果；失败模型标记 failed 并带错误，轮次仍返回 sent', async () => {
    // 恢复默认已选模型（复制 defaultSelected 组合：xunfei lite + doubao seed）
    useComparisonStore.setState({
      selectedModels: [
        {
          provider: 'xunfei',
          model: 'lite',
          providerLabel: '讯飞星火',
          label: '讯飞星火 · Spark Lite（免费）',
        },
        {
          provider: 'doubao',
          model: 'doubao-seed-evolving',
          providerLabel: '豆包',
          label: '豆包 · Doubao Seed',
        },
      ],
    });

    mockedAuthFetch.mockImplementation(async (url, init) => {
      if (url === '/api/chat/batch-reserve') {
        return new Response(JSON.stringify(DEFAULT_RESERVATIONS), { status: 200 });
      }
      const body = JSON.parse((init as RequestInit).body as string);
      if (body.model === 'lite') {
        return sseResponse([
          'data: {"type":"text-delta","text":"我是讯飞"}\n\n',
          'data: {"type":"done"}\n\n',
        ]);
      }
      // doubao 模型失败：HTTP 500
      return new Response(JSON.stringify({ error: '模型暂时不可用' }), { status: 500 });
    });

    const result = await useComparisonStore.getState().sendComparison();

    expect(result).toBe('sent');
    const runs = useComparisonStore.getState().turns[0].runs;
    expect(runs['xunfei:lite'].status).toBe('completed');
    expect(runs['xunfei:lite'].content).toBe('我是讯飞');
    expect(runs['doubao:doubao-seed-evolving'].status).toBe('failed');
    expect(runs['doubao:doubao-seed-evolving'].error).toContain('模型暂时不可用');
    expect(useComparisonStore.getState().error).toBeNull();
  });
});
