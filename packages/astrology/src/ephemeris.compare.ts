/**
 * 星历比较工具：用于金样测试的误差度量。
 */

import { shortestArcDistance } from './geo';

/**
 * 计算两黄经值的最短弧绝对误差（度）。
 *
 * 自动处理 0°/360° 跳变，结果范围 [0, 180]。
 */
export function absErrorDeg(actual: number, expected: number): number {
  return shortestArcDistance(actual, expected);
}
