/**
 * 相位计算：基于容许度表判定星体间主要相位。
 */

import { ASPECT_TABLE, type AspectDefinition, type AspectType } from './constants';
import { shortestArcDistance } from './geo';
import type { PlanetBody } from './ephemeris';

/** 单个相位结果。 */
export interface AspectResult {
  /** 源星体。 */
  source: PlanetBody;
  /** 目标星体。 */
  target: PlanetBody;
  /** 相位类型英文标识。 */
  type: AspectType;
  /** 相位中文名。 */
  typeCn: string;
  /** 实际最短弧角度（度）。 */
  angle: number;
  /** 与理想相位的容许度（度，非负）。 */
  orb: number;
  /** 是否接近精确相位（orb < 0.1°）。 */
  exact: boolean;
  /** 强度 [0, 1]，orb 越小越强。 */
  strength: number;
}

/** 判定精确相位的容许度阈值（度）。 */
const EXACT_ORB_THRESHOLD = 0.1;

/**
 * 计算一组星体两两之间的相位。
 *
 * 对每一对无序星体 (i < j)，按 ASPECT_TABLE 顺序依次检查：
 * 若两星黄经的最短弧距离 ≤ 理想角度 ± 容许度，则记录该相位并停止检查
 * （同一距离不会同时落在两个不同相位的容许度内）。
 *
 * strength 按 1 - orb / aspectOrb 线性计算，并在 [0, 1] 裁剪。
 */
export function computeAspects(longitudes: Record<PlanetBody, number>): AspectResult[] {
  const bodies = Object.keys(longitudes) as PlanetBody[];
  const results: AspectResult[] = [];

  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const source = bodies[i];
      const target = bodies[j];
      const angle = shortestArcDistance(longitudes[source], longitudes[target]);

      for (const aspect of ASPECT_TABLE) {
        const orb = Math.abs(angle - aspect.angle);
        if (orb <= aspect.orb) {
          const strength = Math.max(0, Math.min(1, 1 - orb / aspect.orb));
          results.push({
            source,
            target,
            type: aspect.type,
            typeCn: aspect.cn,
            angle,
            orb,
            exact: orb < EXACT_ORB_THRESHOLD,
            strength,
          });
          break;
        }
      }
    }
  }

  return results;
}
