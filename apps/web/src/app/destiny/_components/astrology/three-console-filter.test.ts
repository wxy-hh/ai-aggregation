/**
 * three-console-filter.test.ts —— three 控制台过滤（临时补丁）
 *
 * 锁定的外部行为：
 * - three@0.185 的 Clock 弃用警告被静默（r3f 仍在 new THREE.Clock()，属依赖侧噪音）；
 * - 其余 three 日志（log / warn / error）原样转发，参数不丢；
 * - 安装幂等：重复调用只包一层，不叠加转发。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { getConsoleFunction } from 'three';
import { installThreeConsoleFilter } from './three-console-filter';

describe('installThreeConsoleFilter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('静默 Clock 弃用警告，其余 three 日志原样转发', () => {
    installThreeConsoleFilter();
    const emit = getConsoleFunction();
    expect(emit).not.toBeNull();

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    // 已知弃用：不落地
    (emit as (t: string, m: string, ...p: unknown[]) => void)(
      'warn',
      'THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.'
    );
    expect(warn).not.toHaveBeenCalled();

    // 其它警告 / 错误 / 日志：原样转发（含参数）
    (emit as (t: string, m: string, ...p: unknown[]) => void)('warn', 'THREE.Something: 需要关注的告警', 'detail');
    expect(warn).toHaveBeenCalledWith('THREE.Something: 需要关注的告警', 'detail');

    (emit as (t: string, m: string, ...p: unknown[]) => void)('error', 'THREE.Real: 真错误');
    expect(error).toHaveBeenCalledWith('THREE.Real: 真错误');

    (emit as (t: string, m: string, ...p: unknown[]) => void)('log', 'THREE.Info: 普通日志');
    expect(log).toHaveBeenCalledWith('THREE.Info: 普通日志');
  });

  it('重复安装幂等：只保留一层转发（转发的调用次数不随安装次数增长）', () => {
    installThreeConsoleFilter();
    installThreeConsoleFilter();
    const emit = getConsoleFunction();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    (emit as (t: string, m: string, ...p: unknown[]) => void)('warn', 'THREE.Once: 只应转发一次');

    expect(warn).toHaveBeenCalledTimes(1);
  });
});
