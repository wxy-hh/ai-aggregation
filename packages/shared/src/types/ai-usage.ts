import type { BillingStatus, MeterType } from './billing';

export type AiUsageFeature =
  | 'chat'
  | 'voice'
  | 'image'
  | 'video'
  | 'video_prompt'
  | 'destiny'
  | 'resume';

export type AiUsageAction =
  | 'chat-stream'
  | 'voice-translate'
  | 'voice-transcribe'
  | 'image-generate'
  | 'video-generate'
  | 'video-prompt-optimize'
  | 'resume-polish'
  | 'resume-diagnose'
  | 'destiny-report'
  /** 八字合盘（含首开与补生成视角） */
  | 'destiny-compatibility-report'
  | 'destiny-ziwei-report'
  | 'destiny-copilot'
  | 'destiny-qimen-analyze'
  | 'destiny-qimen-base'
  | 'destiny-qimen-strategy-overview'
  | 'destiny-qimen-timing-windows'
  | 'destiny-qimen-chart-summary';

export type UsageSourceKind = 'tokens' | 'tasks' | 'audio_seconds' | 'mixed';

/** 功能桶展开后的分项（如 AI 命理大师 → 八字 / 合盘 / 紫微 / 奇门） */
export type ProfileUsageDetailItem = {
  key: string;
  label: string;
  totalTokens: number;
  audioSeconds: number;
  taskCount: number;
  sourceKind: UsageSourceKind;
};

export interface NormalizedAiUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedTokens: number | null;
  reasoningTokens: number | null;
  taskCount: number;
  rawUsage?: unknown;
}

export interface AiUsageRecordInput {
  userId: string;
  feature: AiUsageFeature;
  action: AiUsageAction;
  provider?: string | null;
  model?: string | null;
  endpoint?: string | null;
  requestId?: string | null;
  status?: 'success' | 'failed' | 'partial' | 'billing_pending';
  meterType?: MeterType;
  billableUnits?: number | null;
  billingStatus?: BillingStatus | null;
  reservationId?: string | null;
  usage?: NormalizedAiUsage | null;
  metadata?: Record<string, unknown> | null;
}

export interface ProfileUsageItem {
  feature: AiUsageFeature;
  label: string;
  totalTokens: number;
  audioSeconds: number;
  taskCount: number;
  percent: number;
  sourceKind: UsageSourceKind;
  billableUnits?: number;
  billingStatus?: BillingStatus | null;
  /** 可选分项明细；有则个人中心展开时优先展示 */
  details?: ProfileUsageDetailItem[];
}

export interface ProfileUsageSummary {
  totalTokens: number;
  totalAudioSeconds: number;
  totalTaskCount: number;
  features: ProfileUsageItem[];
  tokenRemaining?: number | null;
  quota?: {
    grantedUnits: number;
    availableUnits: number;
    reservedUnits: number;
    settledUnits: number;
  } | null;
  taskUsage?: {
    imageCount: number;
    videoCount: number;
  };
}
