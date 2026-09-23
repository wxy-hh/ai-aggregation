'use client';

/**
 * astrology-result-view.tsx —— 星盘结果页薄编排壳（章节组装、状态桥接与深度区下发）
 *
 * 编排结构（首屏双栏 + 全宽章节带，DOM 树与视觉层逐节点不变）：
 * 1. SummarySection：主栏（8 栏：护照头 + 主轴金句 + 大三要素 + 移动端本周行动入口）
 * 2. WheelSection：交互星盘轮章节（全宽渐变舞台：3D 轮盘 + 白话清单 + 事实解构台 + 移动端抽屉）
 * 3. LifeModulesSection：五大生活模块与本周行动三角
 * 4. InsightsSection：洞察轨（4 栏：校准状态卡 + 分享海报入口 + 星语问答入口）
 * 5. AstrologyDeepDive：P0 深度区（星盘轮完整清单 / 关键相位）
 *
 * 状态管辖：
 * - 壳负责：工作区 store 订阅、跨段落共享状态（selectedBody、openModuleId）、深度区组装、路由与滚动复位。
 * - 段落负责：各区域私有展开折叠状态与局部派生数据就近下沉自持。
 */

import { useEffect, useMemo, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useShallow } from 'zustand/react/shallow';
import { useDestinyWorkspaceStore } from '@/stores/destiny-workspace-store';
import type { PlanetBody } from '@/lib/astrology/chart-facts';
import {
  attachWeeklyGuidance,
  orderModulesByTopic,
  resolveKeyAspectList,
  type ModuleId,
} from '@/lib/astrology/interpretation';
import { astrologySession } from '@/lib/astrology/chart-request';
import { AstrologyDeepDive } from './astrology-deep-dive';
import { resetAstrologyScroll } from './astrology-scroll';
import { precisionBadge } from './astrology-passport-header';
import { AstrologySummarySection } from './astrology-summary-section';
import { AstrologyWheelSection } from './astrology-wheel-section';
import { AstrologyLifeModulesSection } from './astrology-life-modules-section';
import { AstrologyInsightsSection } from './astrology-insights-section';

export type AstrologyResultViewProps = {
  /** 转场插槽：同一 layoutId 的星盘轮在这里落定（附带点选交互参数） */
  wheelSlot: (
    slotClass: string,
    wheelProps?: {
      selectedBody: PlanetBody | null;
      onSelectBody: (body: PlanetBody | null) => void;
    }
  ) => React.ReactNode;
};

export function AstrologyResultView({ wheelSlot }: AstrologyResultViewProps) {
  const reduceMotion = useReducedMotion();
  const {
    formData,
    chartFacts,
    interpretation: interpretationState,
    setWorkspaceState,
  } = useDestinyWorkspaceStore(
    useShallow((s) => ({
      formData: s.astrology.formData,
      chartFacts: s.astrology.chartFacts,
      interpretation: s.astrology.interpretation,
      setWorkspaceState: s.setWorkspaceState,
    }))
  );

  /** 跨段落点选共享星体（事实卡、轮盘、要素卡与问答联动） */
  const [selectedBody, setSelectedBody] = useState<PlanetBody | null>(null);
  /** 生活模块手风琴展开项（事实卡标签反向展开定位） */
  const [openModuleId, setOpenModuleId] = useState<ModuleId | null>(null);

  /** 结果页首次呈现时复位局部与文档滚动位置，保证护照头与主轴处于视口核心 */
  useEffect(() => {
    resetAstrologyScroll();
  }, []);

  const interpretation = interpretationState.report;

  /** 五大生活模块（解读分区 + 本周三角组装；关注主题只调整阅读顺序，不改变盘面与文案） */
  const modules = useMemo(() => {
    if (!interpretation) return [];
    const merged = attachWeeklyGuidance(interpretation.modules, interpretation.transits);
    const topicToModule: Record<string, ModuleId> = {
      self: 'who',
      love: 'love',
      career: 'career',
      recent: 'week',
    };
    const priority = formData.topic ? (topicToModule[formData.topic] ?? null) : null;
    return orderModulesByTopic(merged, priority);
  }, [interpretation, formData.topic]);

  const modulesArrived = interpretation !== null && interpretation.modules.length > 0;

  /** 关键相位（深度区）：AI 三段式文案与真值相位按引用键合并，只认盘面稳定存在的相位 */
  const keyAspects = useMemo(() => {
    if (!chartFacts) return { status: 'pending' as const, top: [], rest: [] };
    if (interpretation?.transits) {
      const { top, rest } = resolveKeyAspectList(chartFacts, interpretation.transits.keyAspects);
      return { status: 'ready' as const, top, rest };
    }
    return {
      status:
        interpretationState.status === 'unavailable'
          ? ('unavailable' as const)
          : ('pending' as const),
      top: [],
      rest: [],
    };
  }, [chartFacts, interpretation, interpretationState.status]);

  /** 解读在途与解读降级判定：有内容即为就绪，二者互斥 */
  const interpretationPending = interpretation === null && interpretationState.status === 'pending';
  const interpretationUnavailable = interpretation === null && !interpretationPending;

  const headlineReading = interpretation?.headline ?? null;
  const fullHeadline = headlineReading?.text ?? '';

  if (!chartFacts) return null;

  const badge = precisionBadge(formData, chartFacts);
  const sunPlacement = chartFacts.planets.find((p) => p.body === 'sun');
  const name = formData.name.trim() || '星盘主人';

  /** 重新测算：回表单并保留已填资料（step 一并回到 form） */
  const recalculate = () =>
    setWorkspaceState('astrology', {
      step: 'form',
      entryView: 'form',
      error: null,
      errorKind: null,
    });

  /** 模块事实片定位：选中星体并平滑滚回星盘轮区（上升等 angle/house 类引用仅滚动不选星体） */
  const handleLocateBody = (body: PlanetBody | null) => {
    if (body) setSelectedBody(body);
    document.getElementById('astrology-wheel-section')?.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'center',
    });
  };

  /** 反向定位：展开对应生活模块并平滑滚动到该卡 */
  const handleLocateModule = (id: ModuleId) => {
    setOpenModuleId(id);
    const delay = reduceMotion ? 50 : 320;
    window.setTimeout(() => {
      document.getElementById(`astrology-module-${id}`)?.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'center',
      });
    }, delay);
  };

  /** 重试解读：重走报告流且真值不重算 */
  const retryInterpretation = () => {
    void astrologySession.retryInterpretation(formData).catch(() => {});
  };

  return (
    <>
      <div className="mx-auto w-full max-w-6xl px-5 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-6 sm:px-8 xl:max-w-7xl xl:pt-8">
        <div className="grid gap-12 xl:grid-cols-12">
          {/* ═══ 主栏 8 栏（与洞察轨同行构成首屏）：护照头 → 主轴 → 大三要素 ═══ */}
          <AstrologySummarySection
            formData={formData}
            chartFacts={chartFacts}
            interpretation={interpretation}
            interpretationUnavailable={interpretationUnavailable}
            interpretationReason={interpretationState.reason}
            modules={modules}
            reduceMotion={reduceMotion}
            onRetryInterpretation={retryInterpretation}
            onLocateBody={handleLocateBody}
            onLocateModule={handleLocateModule}
          />

          {/* ── 4. 交互星盘轮（全宽章节带：轮盘列 + 白话清单 + 解构台 + 移动端抽屉） ── */}
          <AstrologyWheelSection
            chartFacts={chartFacts}
            modules={modules}
            selectedBody={selectedBody}
            onSelectBody={setSelectedBody}
            onLocateModule={handleLocateModule}
            wheelSlot={wheelSlot}
            reduceMotion={reduceMotion}
          />

          {/* ── 5. 五大生活模块与本周行动三角 ── */}
          <AstrologyLifeModulesSection
            chartFacts={chartFacts}
            modules={modules}
            modulesArrived={modulesArrived}
            interpretationUnavailable={interpretationUnavailable}
            openModuleId={openModuleId}
            onOpenChange={setOpenModuleId}
            onLocateBody={handleLocateBody}
          />

          {/* ═══ 右侧 4 栏洞察轨（校准状态卡 + 分享海报入口 + 星语问答入口） ═══ */}
          <AstrologyInsightsSection
            chartFacts={chartFacts}
            formData={formData}
            headlineReading={headlineReading}
            fullHeadline={fullHeadline}
            interpretationUnavailable={interpretationUnavailable}
            modulesArrived={modulesArrived}
            modules={modules}
            onRecalculate={recalculate}
            onLocateBody={handleLocateBody}
            onLocateModule={handleLocateModule}
          />
        </div>

        {/* ═══ 6. P0 深度区（星盘轮完整清单 / 关键相位两个页内标签） ═══ */}
        <AstrologyDeepDive
          facts={chartFacts}
          keyAspects={keyAspects}
          passport={{
            name,
            sunSign: sunPlacement?.sign ?? null,
            badgeText: badge.text,
            badgeClassName: badge.className,
          }}
          onLocateBody={handleLocateBody}
        />
      </div>
    </>
  );
}
