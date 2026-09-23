'use client';

/**
 * astrology-life-modules-section.tsx —— 结果页五大生活模块与行动三角容器段
 *
 * 承接五大生活模块章节：
 * 1. 模块分区未到：同构骨架占位（aria-busy，章节标题先立）
 * 2. 分区到达：真实卡栅格替换（手风琴受控于壳，支持反向展开）
 * 3. 解读降级：整段不渲染（由主栏诚实卡统一说明）
 */

import type { AstrologyChartFacts, PlanetBody } from '@/lib/astrology/chart-facts';
import type { ModuleId, ModuleReading } from '@/lib/astrology/interpretation';
import { AstrologyLifeModules } from './astrology-life-modules';
import { LifeModulesSkeleton } from './astrology-skeletons';

export type AstrologyLifeModulesSectionProps = {
  chartFacts: AstrologyChartFacts;
  modules: ModuleReading[];
  modulesArrived: boolean;
  interpretationUnavailable: boolean;
  openModuleId: ModuleId | null;
  onOpenChange: (id: ModuleId | null) => void;
  onLocateBody: (body: PlanetBody | null) => void;
};

export function AstrologyLifeModulesSection({
  chartFacts,
  modules,
  modulesArrived,
  interpretationUnavailable,
  openModuleId,
  onOpenChange,
  onLocateBody,
}: AstrologyLifeModulesSectionProps) {
  return (
    <div className="order-3 min-w-0 xl:order-4 xl:col-span-12">
      {interpretationUnavailable ? null : !modulesArrived ? (
        <LifeModulesSkeleton />
      ) : (
        <AstrologyLifeModules
          facts={chartFacts}
          modules={modules}
          openId={openModuleId}
          onOpenChange={onOpenChange}
          onLocateBody={onLocateBody}
        />
      )}
    </div>
  );
}
