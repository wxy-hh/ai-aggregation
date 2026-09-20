/**
 * astrology-wheel-scene-switch.test.tsx —— 星渊场景与 SVG 兜底的交接时序
 *
 * 锁定的外部行为（「星盘要等一两秒才画出来」的修复口径）：
 * - 场景代码块未就绪：只渲染 SVG 兜底；
 * - 代码块就绪但 WebGL 首帧未画出：SVG 兜底**继续留在下层**（两套并存），交接期没有空窗；
 * - 场景首帧画出并淡入结束（onReady）：才撤下 SVG 兜底；
 * - WebGL 不可用：永久停留在 SVG 兜底。
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

import { AstrologyWheelSceneSwitch } from './astrology-wheel-scene-switch';
import { SAMPLE_CHART_ACCURATE } from '@/lib/astrology/sample-chart';

/** WebGL 探测结果可控：默认「可用」，按用例切成不可用 */
let webglAvailable = true;

function renderSwitch() {
  return render(
    <AstrologyWheelSceneSwitch facts={SAMPLE_CHART_ACCURATE} fallback={<div data-testid="wheel-fallback" />} />
  );
}

describe('AstrologyWheelSceneSwitch（SVG 兜底与场景交接）', () => {
  beforeEach(() => {
    dynamicMountCount = 0;
    webglAvailable = true;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => (webglAvailable ? ({} as never) : null)
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('场景首帧未就绪：SVG 兜底始终在，交接期不出现空窗', async () => {
    renderSwitch();

    // 代码块加载中：只有兜底
    expect(screen.getByTestId('wheel-fallback')).toBeInTheDocument();
    expect(screen.queryByTestId('wheel-scene')).not.toBeInTheDocument();

    // 代码块就绪、场景已挂载，但还没画出首帧：兜底仍在（这正是此前盘面消失一两秒的空窗）
    expect(await screen.findByTestId('wheel-scene')).toBeInTheDocument();
    expect(screen.getByTestId('wheel-fallback')).toBeInTheDocument();
  });

  it('场景首帧就绪：撤下 SVG 兜底，只留场景', async () => {
    const user = userEvent.setup();
    renderSwitch();

    const scene = await screen.findByTestId('wheel-scene');
    await user.click(scene);

    expect(screen.queryByTestId('wheel-fallback')).not.toBeInTheDocument();
    expect(screen.getByTestId('wheel-scene')).toBeInTheDocument();
  });

  it('WebGL 不可用：永久停留在 SVG 兜底，不挂载场景', async () => {
    webglAvailable = false;
    renderSwitch();

    // 探测为同步结论，等一轮微任务即可确认场景始终没挂载
    await Promise.resolve();
    expect(screen.getByTestId('wheel-fallback')).toBeInTheDocument();
    expect(screen.queryByTestId('wheel-scene')).not.toBeInTheDocument();
    expect(dynamicMountCount).toBe(0);
  });
});
