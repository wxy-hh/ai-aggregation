// ============================================
// destiny UI 类型聚合出口（shim）
// --------------------------------------------
// 领域类型的唯一权威定义已迁至 @repo/shared：
//   - 领域模型（DestinyReport / ZiweiChartData 等）→ destiny-report.ts
//   - 分区键与载荷映射（BaziSectionKey / BaziSectionPayloadMap 等）→ destiny-report-stream-maps.ts
//   - 流式事件契约（BaziStreamEvent / ZiweiStreamEvent / encodeDestinyStreamEvent）→ destiny-stream-contract.ts
// 本文件仅为存量 UI 组件保留统一的 `./types` 导入路径，后续可渐进迁移为直接从 @repo/shared 导入。
// 禁止新增类型定义到此文件；API 层（app/api/**）禁止从本文件导入（架构评审 2.2 C2）。
// ============================================

export type {
  FiveElementKey,
  TenGodDomainKey,
  LifeDimensionKey,
  DestinyProfile,
  DestinyCoreTone,
  DestinyBalanceInsight,
  DestinyPatternInsight,
  DestinyLifeDimension,
  DestinyLifeDimensionHighlights,
  DestinyTenGodDomain,
  ZiweiCenterInfo,
  ZiweiStarInfo,
  ZiweiChartPalace,
  ZiweiSihua,
  ZiweiChartData,
  ZiweiPalaceAnalysis,
  BaZiPillar,
  DestinyModule,
  DestinyTimelineItem,
  ZiweiPalace,
  DestinyReport,
  PartialDestinyReport,
  DestinyReportRequest,
  DestinyReportResponse,
  DestinyStreamStatus,
  BaziSectionKey,
  ZiweiSectionKey,
  BaziSectionPayloadMap,
  ZiweiSectionPayloadMap,
  BaziLockedSections,
  ZiweiLockedSections,
  BaziStreamEvent,
  ZiweiStreamEvent,
  DestinyCopilotMessage,
  DestinyCopilotRequest,
  DestinyCopilotResponse,
} from '@repo/shared';
