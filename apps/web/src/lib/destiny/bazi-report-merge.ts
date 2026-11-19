import type {
  BaziLockedSections,
  DestinyReport,
  PartialDestinyReport,
} from '@/app/destiny/_components/types';

/**
 * 将流式过程中锁定的八字分区组装为部分报告对象，供渐进渲染使用
 */
export function buildPartialReport(sections: BaziLockedSections): PartialDestinyReport {
  const partial: PartialDestinyReport = {};
  if (sections.baziBasis) {
    partial.baziBasis = {
      ...sections.baziBasis,
      decadeFortuneInsights:
        sections.decadeFortuneInsights ?? sections.baziBasis.decadeFortuneInsights,
    };
  }
  if (sections.profileOverview) partial.profile = sections.profileOverview;
  if (sections.coreDestinyTone) partial.coreTone = sections.coreDestinyTone;
  if (sections.pillars) partial.pillars = sections.pillars;
  if (sections.elementsAndTenGods) {
    partial.elements = sections.elementsAndTenGods.elements;
    partial.tenGods = sections.elementsAndTenGods.tenGods;
    partial.balanceInsight = sections.elementsAndTenGods.balanceInsight;
    partial.patternHighlights = sections.elementsAndTenGods.patternHighlights;
    partial.lifeDimensions = sections.elementsAndTenGods.lifeDimensions;
    partial.lifeDimensionHighlights = sections.elementsAndTenGods.lifeDimensionHighlights;
    partial.tenGodDomains = sections.elementsAndTenGods.tenGodDomains;
  }
  const partialModules: Partial<DestinyReport['modules']> = {};
  if (sections.modulePersonality) partialModules.personality = sections.modulePersonality;
  if (sections.moduleCareer) partialModules.career = sections.moduleCareer;
  if (sections.moduleLove) partialModules.love = sections.moduleLove;
  if (sections.moduleWealth) partialModules.wealth = sections.moduleWealth;
  if (sections.moduleHealth) partialModules.health = sections.moduleHealth;
  if (Object.keys(partialModules).length > 0) partial.modules = partialModules;
  if (sections.timeline) partial.timeline = sections.timeline;
  return partial;
}

/**
 * 将流式过程中锁定的八字分区覆盖合并入服务端完整的 final 报告
 *
 * 合并规则：锁定分区优先于服务端返回的同名字段，modules 下各子模块逐键覆盖
 */
export function mergeLockedSectionsIntoReport(
  nextReport: DestinyReport,
  sections: BaziLockedSections
): DestinyReport {
  return {
    ...nextReport,
    baziBasis: sections.baziBasis
      ? {
          ...sections.baziBasis,
          decadeFortuneInsights:
            sections.decadeFortuneInsights ?? sections.baziBasis.decadeFortuneInsights,
        }
      : nextReport.baziBasis,
    profile: sections.profileOverview ?? nextReport.profile,
    coreTone: sections.coreDestinyTone ?? nextReport.coreTone,
    pillars: sections.pillars ?? nextReport.pillars,
    elements: sections.elementsAndTenGods?.elements ?? nextReport.elements,
    tenGods: sections.elementsAndTenGods?.tenGods ?? nextReport.tenGods,
    balanceInsight: sections.elementsAndTenGods?.balanceInsight ?? nextReport.balanceInsight,
    patternHighlights:
      sections.elementsAndTenGods?.patternHighlights ?? nextReport.patternHighlights,
    lifeDimensions: sections.elementsAndTenGods?.lifeDimensions ?? nextReport.lifeDimensions,
    lifeDimensionHighlights:
      sections.elementsAndTenGods?.lifeDimensionHighlights ?? nextReport.lifeDimensionHighlights,
    tenGodDomains: sections.elementsAndTenGods?.tenGodDomains ?? nextReport.tenGodDomains,
    modules: {
      personality: sections.modulePersonality ?? nextReport.modules.personality,
      career: sections.moduleCareer ?? nextReport.modules.career,
      love: sections.moduleLove ?? nextReport.modules.love,
      wealth: sections.moduleWealth ?? nextReport.modules.wealth,
      health: sections.moduleHealth ?? nextReport.modules.health,
    },
    timeline: sections.timeline ?? nextReport.timeline,
  };
}
