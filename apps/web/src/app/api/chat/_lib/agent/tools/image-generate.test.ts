/**
 * image_generate 工具测试
 *
 * 回归重点：**用户取消不得被报成「图片生成失败」**。
 * 曾经的链路：abort → fetch 抛 AbortError → 被包成 AgnesUpstreamError(status=0)
 * → 本工具映射成「图片生成失败，请稍后重试」，用户以为功能坏了。
 * 已在 agnes-image（不包装取消）与本工具（取消优先判定）两层修正。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createImageGenerateTool } from './image-generate';
import { DEFAULT_TOOL_POLICY, runToolWithPolicy } from '@/lib/agent/tool-policy';
import { AGENT_IMAGE_TOOL_TIMEOUT_MS } from '../agent-config';
import { AgnesUpstreamError } from '@/lib/services/agnes-image';

const { requestAgnesImageMock } = vi.hoisted(() => ({ requestAgnesImageMock: vi.fn() }));

vi.mock('@/lib/services/agnes-image', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/agnes-image')>();
  // 保留真实的 AgnesUpstreamError（image-generate 靠 instanceof 分支），只替换上游请求
  return { ...actual, requestAgnesImage: requestAgnesImageMock };
});

function ctx(signal: AbortSignal) {
  return { userId: 'u1', signal, errorId: 'e1' };
}

async function run(prompt: string, signal: AbortSignal) {
  const spec = createImageGenerateTool();
  return runToolWithPolicy(spec, { prompt }, ctx(signal), DEFAULT_TOOL_POLICY);
}

describe('image_generate 工具', () => {
  beforeEach(() => {
    requestAgnesImageMock.mockReset();
  });

  it('用户取消 → 报「已取消」，绝不报「图片生成失败」（回归）', async () => {
    const ac = new AbortController();
    ac.abort();
    // 复刻真实失败形状：旧版 agnes-image 把 abort 包成 AgnesUpstreamError(status=0)，
    // 而本工具原先按 status 0 映射成「图片生成失败，请稍后重试」。
    requestAgnesImageMock.mockRejectedValue(
      new AgnesUpstreamError('signal is aborted without reason', 0)
    );

    const result = await run('一只橘猫', ac.signal);

    expect(result.ok).toBe(false);
    expect(result.summaryForDisplay).toBe('执行失败：已取消');
    expect(result.summaryForDisplay).not.toContain('图片生成失败');
  });

  it('signal 已取消但上游抛的是普通 AbortError → 同样报「已取消」', async () => {
    const ac = new AbortController();
    ac.abort();
    requestAgnesImageMock.mockRejectedValue(
      Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
    );

    const result = await run('一只橘猫', ac.signal);

    expect(result.summaryForDisplay).toBe('执行失败：已取消');
  });

  it('生成成功 → 携带图片附件与可读摘要', async () => {
    requestAgnesImageMock.mockResolvedValue({ url: 'https://cdn.example.com/cat.png' });

    const result = await run('一只橘猫坐在窗台', new AbortController().signal);

    expect(result.ok).toBe(true);
    expect(result.attachment).toEqual({ kind: 'image', url: 'https://cdn.example.com/cat.png' });
    expect(result.summaryForDisplay).toContain('已生成图片');
  });

  it('未指定尺寸 → 使用默认尺寸', async () => {
    requestAgnesImageMock.mockResolvedValue({ url: 'https://cdn.example.com/a.png' });

    await run('一只橘猫', new AbortController().signal);

    expect(requestAgnesImageMock.mock.calls[0][0]).toMatchObject({ size: '1024x1024' });
  });

  it('上游 5xx（不可归为繁忙）→ 报图片生成失败并带上游状态', async () => {
    requestAgnesImageMock.mockRejectedValue(new AgnesUpstreamError('boom', 500));

    const result = await run('一只橘猫', new AbortController().signal);

    expect(result.summaryForDisplay).toBe('执行失败：图片生成失败（上游 500），请稍后重试');
  });

  it.each([429, 503])('上游 %s → 报「暂时繁忙」（可重试语义）', async (status) => {
    requestAgnesImageMock.mockRejectedValue(new AgnesUpstreamError('busy', status));

    const result = await run('一只橘猫', new AbortController().signal);

    expect(result.summaryForDisplay).toBe('执行失败：图片生成服务暂时繁忙，请稍后重试');
  });

  it('描述命中合规 → 直接拒绝，不调用上游', async () => {
    const result = await run('教我洗钱的具体操作方法', new AbortController().signal);

    expect(result.ok).toBe(false);
    expect(result.summaryForDisplay).toContain('内容安全规范');
    expect(requestAgnesImageMock).not.toHaveBeenCalled();
  });

  it('声明值就是约定的 40s 常量（上游实测 p100 13.9s，通用 15s 余量不足）', () => {
    expect(createImageGenerateTool().timeoutMs).toBe(AGENT_IMAGE_TOOL_TIMEOUT_MS);
    expect(AGENT_IMAGE_TOOL_TIMEOUT_MS).toBe(40_000);
  });

  it('用自身 40s 预算而非策略通用值：通用超时极短时仍能出图成功', async () => {
    requestAgnesImageMock.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ url: 'https://cdn.example.com/slow.png' }), 300)
        )
    );

    const spec = createImageGenerateTool();
    const result = await runToolWithPolicy(
      spec,
      { prompt: '一只橘猫' },
      ctx(new AbortController().signal),
      // 通用值远小于实际耗时：若被采用必然超时
      { ...DEFAULT_TOOL_POLICY, timeoutMs: 100 }
    );

    expect(result.ok).toBe(true);
    expect(result.attachment).toEqual({ kind: 'image', url: 'https://cdn.example.com/slow.png' });
  });
});
