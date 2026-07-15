import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  process.env.ZHIPU_API_KEY = 'test-zhipu-key';
  return {
    beginMediaTask: vi.fn(),
    completeMediaTask: vi.fn(),
    failMediaTask: vi.fn(),
    findMediaTaskByProviderTaskId: vi.fn(),
    markMediaTaskSubmitted: vi.fn(),
    recordMediaTask: vi.fn(),
  };
});

vi.mock('@/lib/api/with-auth', () => ({
  withAuth: (_request: Request, handler: (user: { id: string; role: string }) => Promise<Response>) =>
    handler({ id: 'user_1', role: 'user' }),
}));

vi.mock('@/lib/zhipu-auth', () => ({ generateZhipuToken: () => 'test-zhipu-token' }));
vi.mock('@/lib/constants/video-generation', () => ({ getProviderByModel: () => 'zhipu' }));
vi.mock('@/lib/billing/quota-service', () => ({ recordMediaTask: mocks.recordMediaTask }));
vi.mock('@repo/db', () => ({
  beginMediaTask: mocks.beginMediaTask,
  completeMediaTask: mocks.completeMediaTask,
  failMediaTask: mocks.failMediaTask,
  findMediaTaskByProviderTaskId: mocks.findMediaTaskByProviderTaskId,
  markMediaTaskSubmitted: mocks.markMediaTaskSubmitted,
}));

import { GET, POST } from './route';

describe('/api/video 的媒体任务计数', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
      mock.mockResolvedValue(undefined);
    }
    mocks.beginMediaTask.mockResolvedValue({ state: 'started', taskId: 'local-task-1' });
    mocks.findMediaTaskByProviderTaskId.mockResolvedValue({
      id: 'local-task-1',
      requestId: 'billing-request-1',
      provider: 'zhipu',
      model: 'cogvideox-flash',
    });
  });

  it('视频任务仅被供应商受理时保留处理中状态，不提前记录成功次数', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ id: 'provider-task-1', model: 'cogvideox-flash', task_status: 'PROCESSING' }),
          { status: 200 }
        )
      )
    );

    const response = await POST(
      new Request('http://localhost/api/video', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': 'billing-request-1' },
        body: JSON.stringify({ prompt: '海边日落', requestId: 'billing-request-1' }),
      }) as never
    );

    expect(response.status).toBe(200);
    expect(mocks.markMediaTaskSubmitted).toHaveBeenCalledWith({
      taskId: 'local-task-1',
      providerTaskId: 'provider-task-1',
      output: expect.objectContaining({ id: 'provider-task-1' }),
    });
    expect(mocks.completeMediaTask).not.toHaveBeenCalled();
    expect(mocks.recordMediaTask).not.toHaveBeenCalled();
  });

  it('供应商明确成功后才完成本地任务并记录一次视频任务', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 'provider-task-1',
            model: 'cogvideox-flash',
            task_status: 'SUCCESS',
            video_result: [{ url: 'https://example.com/video.mp4' }],
          }),
          { status: 200 }
        )
      )
    );

    const response = await GET(
      new Request('http://localhost/api/video?id=provider-task-1&provider=zhipu') as never
    );

    expect(response.status).toBe(200);
    expect(mocks.completeMediaTask).toHaveBeenCalledWith(
      'local-task-1',
      expect.objectContaining({ id: 'provider-task-1', task_status: 'SUCCESS' })
    );
    expect(mocks.recordMediaTask).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_1',
        requestId: 'billing-request-1',
        feature: 'video',
      })
    );
  });

  it('供应商明确失败时标记任务失败且不记录视频成功次数', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ id: 'provider-task-1', model: 'cogvideox-flash', task_status: 'FAIL' }),
          { status: 200 }
        )
      )
    );

    const response = await GET(
      new Request('http://localhost/api/video?id=provider-task-1&provider=zhipu') as never
    );

    expect(response.status).toBe(200);
    expect(mocks.failMediaTask).toHaveBeenCalledWith('local-task-1', '供应商返回视频生成失败');
    expect(mocks.recordMediaTask).not.toHaveBeenCalled();
  });
});
