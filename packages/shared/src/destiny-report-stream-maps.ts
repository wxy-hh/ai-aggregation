// ============================================
// Destiny 流式分区键与载荷映射 — destiny-stream-contract.ts 的支撑类型
// --------------------------------------------
// section-final 事件的 payload 类型随 sectionKey 收窄：通过 BaziSectionPayloadMap /
// ZiweiSectionPayloadMap 把 key → payload 的映射集中在此，消费端可以用
// `Extract<...>` 或索引访问做判别收窄。
// ============================================

import type { BaziChartBasis } from './bazi-chart';
import type {
  DestinyReport,
  DestinyModule,
  ZiweiChartData,
  ZiweiPalaceAnalysis,
} from './destiny-report';

export type BaziSectionKey =
  | 'baziBasis'
  | 'profileOverview'
  | 'coreDestinyTone'
  | 'pillars'
  | 'elementsAndTenGods'
  | 'decadeFortuneInsights'
  | 'modulePersonality'
  | 'moduleCareer'
  | 'moduleLove'
  | 'moduleWealth'
  | 'moduleHealth'
  | 'timeline';

export type ZiweiSectionKey =
  | 'chartData'
  | 'profileOverview'
  | 'overviewModules'
  | 'timeline'
  | 'relations'
  | 'palaceAnalysis'
  | 'love'
  | 'health';

export type BaziSectionPayloadMap = {
  baziBasis: NonNullable<DestinyReport['baziBasis']>;
  profileOverview: DestinyReport['profile'];
  coreDestinyTone: DestinyReport['coreTone'];
  pillars: DestinyReport['pillars'];
  elementsAndTenGods: {
    elements: DestinyReport['elements'];
    tenGods: DestinyReport['tenGods'];
    balanceInsight: DestinyReport['balanceInsight'];
    patternHighlights: DestinyReport['patternHighlights'];
    lifeDimensions?: DestinyReport['lifeDimensions'];
    lifeDimensionHighlights?: DestinyReport['lifeDimensionHighlights'];
    tenGodDomains?: DestinyReport['tenGodDomains'];
  };
  decadeFortuneInsights: NonNullable<
    NonNullable<DestinyReport['baziBasis']>['decadeFortuneInsights']
  >;
  modulePersonality: DestinyReport['modules']['personality'];
  moduleCareer: DestinyReport['modules']['career'];
  moduleLove: DestinyReport['modules']['love'];
  moduleWealth: DestinyReport['modules']['wealth'];
  moduleHealth: DestinyReport['modules']['health'];
  timeline: DestinyReport['timeline'];
};

export type ZiweiSectionPayloadMap = {
  chartData: ZiweiChartData;
  profileOverview: DestinyReport['profile'];
  overviewModules: Pick<DestinyReport['modules'], 'personality' | 'career' | 'wealth'>;
  timeline: DestinyReport['timeline'];
  relations: {
    summary: string;
    opportunities: string[];
    risks: string[];
    actions: string[];
  };
  palaceAnalysis: ZiweiPalaceAnalysis[];
  love: DestinyModule;
  health: DestinyModule;
};

export type BaziLockedSections = Partial<BaziSectionPayloadMap>;
export type ZiweiLockedSections = Partial<ZiweiSectionPayloadMap>;
