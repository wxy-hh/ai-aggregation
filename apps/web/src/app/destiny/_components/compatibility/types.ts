/** 八字合盘前端类型 */

export type RelationType = 'romance' | 'marriage' | 'friendship' | 'partnership';

export type CompatibilityFlowStep = 'idle' | 'partner-form' | 'generating' | 'report';

export type CompatibilityStreamStatus =
  | 'validating'
  | 'charting'
  | 'analyzing'
  | 'finalizing';

export type PartnerProfileForm = {
  displayName: string;
  gender: 'male' | 'female' | 'unspecified';
  calendarType: 'lunar' | 'solar';
  birthDate: { year: number; month: number; day: number; isLeapMonth?: boolean };
  /** null 表示不清楚出生时间，禁止默填 12:00 */
  birthTime: { hour: string; minute: string } | null;
  location: { name: string; lat: number | null; lon: number | null } | null;
  locationSkipped: boolean;
  consentConfirmed: boolean;
  focusTags: string[];
};

export type CompatibilityCompleteness = {
  self: 'full' | 'partial-time' | 'partial-location' | 'partial';
  partner: 'full' | 'partial-time' | 'partial-location' | 'partial';
  labels: string[];
};

export type CompatibilityNeedItem = {
  text: string;
  why?: string;
};

export type CompatibilityAttraction = {
  title: string;
  detail: string;
  why?: string;
};

export type CompatibilityFriction = {
  trigger: string;
  reaction: string;
  action: string;
  why?: string;
};

export type CompatibilityDimension = {
  key: string;
  label: string;
  value: number;
  note?: string;
};

export type CompatibilityRhythmNode = {
  when: string;
  tone: 'warm' | 'patience' | 'advance';
  advice: string;
};

export type CompatibilityWeeklyAction = {
  id: string;
  text: string;
  done?: boolean;
};

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

export type CompatibilityPillarSummary = {
  label: string;
  name: string;
  stem: string;
  branch: string;
  element: string;
};

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

export type CompatibilityStreamEvent =
  | { type: 'status'; status: CompatibilityStreamStatus }
  | { type: 'section-final'; sectionKey: 'chartFacts'; payload: CompatibilityChartFacts }
  | { type: 'section-final'; sectionKey: 'view'; payload: CompatibilityViewPayload }
  | { type: 'complete'; report: CompatibilityReport }
  | { type: 'error'; error: string };
