/**
 * compatibility-contract.ts —— 八字合盘领域契约与流式通信协议权威定义
 *
 * 核心定义：
 * - 关系视角（恋爱、婚姻、友谊、合伙）；
 * - 双人命盘确定性事实（天干地支、五行分布、完整度与合拍度）；
 * - 视角生成产物（核心引力、摩擦点与相处周律）；
 * - 完整合盘报告与 SSE 流式事件契约。
 *
 * 前后端统一从 @repo/shared 导入，严禁服务端反向依赖前端组件目录。
 */

/** 关系类型视角 */
export type RelationType = 'romance' | 'marriage' | 'friendship' | 'partnership';

/** 流式进度状态 */
export type CompatibilityStreamStatus =
  | 'validating'
  | 'charting'
  | 'analyzing'
  | 'finalizing';

/** 盘面资料完整度 */
export type CompatibilityCompleteness = {
  self: 'full' | 'partial-time' | 'partial-location' | 'partial';
  partner: 'full' | 'partial-time' | 'partial-location' | 'partial';
  labels: string[];
};

/** 关系需求项 */
export type CompatibilityNeedItem = {
  text: string;
  why?: string;
};

/** 相互吸引点 */
export type CompatibilityAttraction = {
  title: string;
  detail: string;
  why?: string;
};

/** 潜在磨合点 */
export type CompatibilityFriction = {
  trigger: string;
  reaction: string;
  action: string;
  why?: string;
};

/** 关系多维评分 */
export type CompatibilityDimension = {
  key: string;
  label: string;
  value: number;
  note?: string;
};

/** 相处节奏建议节点 */
export type CompatibilityRhythmNode = {
  when: string;
  tone: 'warm' | 'patience' | 'advance';
  advice: string;
};

/** 本周相处行动建议 */
export type CompatibilityWeeklyAction = {
  id: string;
  text: string;
  done?: boolean;
};

/** 视角解读有效载荷 */
export type CompatibilityViewPayload = {
  relationType: RelationType;
  oneLiner: string;
  needs: { self: CompatibilityNeedItem[]; partner: CompatibilityNeedItem[] };
  attractions: CompatibilityAttraction[];
  frictions: CompatibilityFriction[];
  dimensions: CompatibilityDimension[];
  rhythm: CompatibilityRhythmNode[];
  weeklyActions: CompatibilityWeeklyAction[];
  disclaimers: string[];
};

/** 柱面要素摘要（年柱、月柱、日柱、时柱） */
export type CompatibilityPillarSummary = {
  label: string;
  name: string;
  stem: string;
  branch: string;
  element: string;
};

/** 双人八字盘面确定性事实 */
export type CompatibilityChartFacts = {
  self: {
    name: string;
    dayMaster: string;
    dayMasterElement: string;
    pillars: CompatibilityPillarSummary[];
    elements: Array<{ key: string; label: string; value: number }>;
  };
  partner: {
    name: string;
    dayMaster: string;
    dayMasterElement: string;
    pillars: CompatibilityPillarSummary[];
    elements: Array<{ key: string; label: string; value: number }>;
    hasHourPillar: boolean;
  };
  completeness: CompatibilityCompleteness;
  /** 确定性合拍指数 0–100 */
  score: number;
  scoreBand: 'high' | 'mid' | 'low';
  scoreHints: string[];
};

/** 完整的八字合盘报告 */
export type CompatibilityReport = {
  id: string;
  relationType: RelationType;
  focusTags: string[];
  chartFacts: CompatibilityChartFacts;
  views: Partial<Record<RelationType, CompatibilityViewPayload>>;
  partnerDisplayName: string;
  createdAt: string;
  sourceBaziHistoryId?: string | null;
};

/** 合盘报告流式推送事件 */
export type CompatibilityStreamEvent =
  | { type: 'status'; status: CompatibilityStreamStatus }
  | { type: 'section-final'; sectionKey: 'chartFacts'; payload: CompatibilityChartFacts }
  | { type: 'section-final'; sectionKey: 'view'; payload: CompatibilityViewPayload }
  | { type: 'complete'; report: CompatibilityReport }
  | { type: 'error'; error: string };
