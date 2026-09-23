/**
 * astrology-wheel.test.tsx —— 星盘深模块（AstrologyWheel）测试
 *
 * 验证核心时序与降级逻辑：
 * 1. 场景代码未就绪/首帧未画出：SVG 兜底始终在，交接期不出现空白空窗；
 * 2. 场景首帧画出（onReady）：撤下 SVG 兜底，只留 WebGL 场景；
 * 3. WebGL 不可用：永久停留在 SVG 兜底，绝不挂载 WebGL 场景；
 * 4. scene={false} 纯 SVG 模式：不探测 WebGL、不挂载场景，仅渲染 SVG 轮。
 */

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** 场景替身：真实场景在首帧画出后回调 onReady，这里用按钮手动触发 */
let dynamicMountCount = 0;
vi.mock('next/dynamic', () => ({
  default: () => (props: { onReady?: () => void }) => {
    dynamicMountCount += 1;
    return (
      <button type="button" data-testid="wheel-scene" onClick={() => props.onReady?.()}>
        场景
      </button>
    );
  },
}));

import { AstrologyWheel, __resetWebGLCacheForTest } from './astrology-wheel';
import { SAMPLE_CHART_ACCURATE } from '@/lib/astrology/sample-chart';

/** WebGL 探测结果可控：默认「可用」，按用例切成不可用 */
let webglAvailable = true;

describe('AstrologyWheel（深模块场景交接与降级）', () => {
  beforeEach(() => {
    dynamicMountCount = 0;
    webglAvailable = true;
    __resetWebGLCacheForTest();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => (webglAvailable ? ({} as never) : null)
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('场景首帧未就绪：SVG 兜底始终在，交接期不出现空窗', async () => {
    const { container } = render(<AstrologyWheel facts={SAMPLE_CHART_ACCURATE} />);

    // 代码块加载中：只有 SVG 兜底
    expect(container.querySelector('[aria-label="本命星盘"]')).toBeInTheDocument();
    expect(screen.queryByTestId('wheel-scene')).not.toBeInTheDocument();

    // 代码块就绪、场景已挂载，但还没画出首帧：SVG 兜底仍在下层（aria-hidden 保护）
    expect(await screen.findByTestId('wheel-scene', {}, { timeout: 4000 })).toBeInTheDocument();
    expect(container.querySelector('[aria-label="本命星盘"]')).toBeInTheDocument();
  });

  it('场景首帧就绪：撤下 SVG 兜底，只留场景', async () => {
    const user = userEvent.setup();
    const { container } = render(<AstrologyWheel facts={SAMPLE_CHART_ACCURATE} />);

    const scene = await screen.findByTestId('wheel-scene', {}, { timeout: 4000 });
    await user.click(scene);

    // 首帧回调后撤下 SVG 兜底，只留 WebGL 场景
    expect(container.querySelector('[aria-label="本命星盘"]')).not.toBeInTheDocument();
    expect(screen.getByTestId('wheel-scene')).toBeInTheDocument();
  });

  it('WebGL 不可用：永久停留在 SVG 兜底，不挂载场景', async () => {
    webglAvailable = false;
    const { container } = render(<AstrologyWheel facts={SAMPLE_CHART_ACCURATE} />);

    // 探测为同步/微任务结论，等待一轮微任务确认场景未挂载
    await Promise.resolve();
    expect(container.querySelector('[aria-label="本命星盘"]')).toBeInTheDocument();
    expect(screen.queryByTestId('wheel-scene')).not.toBeInTheDocument();
    expect(dynamicMountCount).toBe(0);
  });

  it('scene={false} 模式：不探测、不挂载场景，仅渲染 SVG 轮', async () => {
    const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    const { container } = render(<AstrologyWheel facts={SAMPLE_CHART_ACCURATE} scene={false} />);

    expect(container.querySelector('[aria-label="本命星盘"]')).toBeInTheDocument();
    expect(screen.queryByTestId('wheel-scene')).not.toBeInTheDocument();
    expect(dynamicMountCount).toBe(0);
    // 验证 scene={false} 模式完全不执行 WebGL 探测
    expect(getContextSpy).not.toHaveBeenCalled();
  });
});
