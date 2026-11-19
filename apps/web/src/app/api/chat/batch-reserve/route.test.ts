/**
 * 批量预留路由传输契约测试（评审 C4 / ADR-0050）。
 *
 * 覆盖 qa-plan TC09：空 models 400、超上限 400、逐元素 provider 校验、
 * 响应四键形状、admin 短路。计费估算口径不在本契约范围（spec Out of Scope）。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { currentUserMock, reserveBatchMock } = vi.hoisted(() => ({
  currentUserMock: vi.fn(),
  reserveBatchMock: vi.fn(),
}));

vi.mock('@/lib/auth/get-current-user', () => ({ getCurrentUser: currentUserMock }));
vi.mock('@/lib/billing/quota-service', () => ({ reserveChatQuotaBatch: reserveBatchMock }));

import { POST } from './route';

function postJson(body: Record<string, unknown>) {
  return new Request('http://localhost/api/chat/batch-reserve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('批量预留路由传输契约（评审 C4）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUserMock.mockResolvedValue({ id: 'test-user-id', role: 'user' });
    // 预留服务替身：按传入的 requestId 生成对应预留结果（与真实服务协议一致）
    reserveBatchMock.mockImplementation(
      async (input: { models: Array<{ provider: string; model: string; requestId: string }> }) => ({
        reservations: input.models.map((m) => ({ id: `res-${m.requestId}`, requestId: m.requestId })),
      })
    );
  });

  it('TC09-1: models 为空数组 → 400 且响应含 errorId', async () => {
    const response = await POST(postJson({ messages: [{ role: 'user', content: '对比' }], models: [] }));
    expect(response.status).toBe(400);
    const data = (await response.json()) as Record<string, unknown>;
    expect(typeof data.errorId).toBe('string');
    expect(reserveBatchMock).not.toHaveBeenCalled();
  });

  it('TC09-7: messages 全部非 user 角色 → 400', async () => {
    const response = await POST(
      postJson({ messages: [{ role: 'assistant', content: '只有助手' }], models: [{ provider: 'xunfei', model: 'spark' }] })
    );
    expect(response.status).toBe(400);
    expect(reserveBatchMock).not.toHaveBeenCalled();
  });

  it('TC09-2: models 含 9 项 → 400（上限 8）', async () => {
    const models = Array.from({ length: 9 }, (_, i) => ({ provider: 'xunfei', model: `m${i}` }));
    const response = await POST(postJson({ messages: [{ role: 'user', content: '对比' }], models }));
    expect(response.status).toBe(400);
    expect(reserveBatchMock).not.toHaveBeenCalled();
  });

  it('TC09-3: models[0].provider="openai" → 400', async () => {
    const response = await POST(
      postJson({
        messages: [{ role: 'user', content: '对比' }],
        models: [{ provider: 'openai', model: 'gpt' }],
      })
    );
    expect(response.status).toBe(400);
    expect(reserveBatchMock).not.toHaveBeenCalled();
  });

  it('TC09-4: 合法 2 模型 → 200 且每项恰含 provider/model/requestId/reservationId 四键', async () => {
    const response = await POST(
      postJson({
        messages: [{ role: 'user', content: '对比' }],
        models: [
          { provider: 'xunfei', model: 'spark' },
          { provider: 'doubao', model: 'lite' },
        ],
      })
    );
    expect(response.status).toBe(200);
    const data = (await response.json()) as { reservations: Array<Record<string, unknown>> };
    expect(data.reservations).toHaveLength(2);
    for (const item of data.reservations) {
      expect(Object.keys(item).sort()).toEqual(['model', 'provider', 'requestId', 'reservationId']);
    }
    expect(reserveBatchMock).toHaveBeenCalledTimes(1);
  });

  it('TC09-5: admin 合法请求 → 200 且 reservations 为空数组、不触预留服务', async () => {
    currentUserMock.mockResolvedValue({ id: 'admin-id', role: 'admin' });
    const response = await POST(
      postJson({
        messages: [{ role: 'user', content: '对比' }],
        models: [{ provider: 'xunfei', model: 'spark' }],
      })
    );
    expect(response.status).toBe(200);
    const data = (await response.json()) as { reservations: unknown[] };
    expect(data.reservations).toEqual([]);
    expect(reserveBatchMock).not.toHaveBeenCalled();
  });
});
