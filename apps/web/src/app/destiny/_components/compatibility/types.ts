/**
 * 八字合盘前端类型
 *
 * 领域权威契约已下沉至 @repo/shared（候选 03 重构），
 * 本文件保留 UI 交互专有状态并透明透传领域类型，保证现有前端组件零破坏。
 */

export type {
  RelationType,
  CompatibilityStreamStatus,
  CompatibilityCompleteness,
  CompatibilityNeedItem,
  CompatibilityAttraction,
  CompatibilityFriction,
  CompatibilityDimension,
  CompatibilityRhythmNode,
  CompatibilityWeeklyAction,
  CompatibilityViewPayload,
  CompatibilityPillarSummary,
  CompatibilityChartFacts,
  CompatibilityReport,
  CompatibilityStreamEvent,
} from '@repo/shared';

/** 前端交互流程阶段 */
export type CompatibilityFlowStep = 'idle' | 'partner-form' | 'generating' | 'report';

/** 伴侣资料填写表单状态（UI 专有） */
export type PartnerProfileForm = {
  displayName: string;
  gender: 'male' | 'female' | 'unspecified';
  calendarType: 'lunar' | 'solar';
  birthDate: { year: number; month: number; day: number; isLeapMonth?: boolean };
  /** 空值表示不清楚出生时间，禁止默填 12:00 */
  birthTime: { hour: string; minute: string } | null;
  location: { name: string; lat: number | null; lon: number | null } | null;
  locationSkipped: boolean;
  consentConfirmed: boolean;
  focusTags: string[];
};
