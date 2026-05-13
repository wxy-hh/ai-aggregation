export type AiUsageFeature = 'chat' | 'voice' | 'image' | 'video' | 'destiny' | 'resume';

export type AiUsageAction =
  | 'chat-stream'
  | 'voice-translate'
  | 'voice-transcribe'
  | 'image-generate'
  | 'resume-polish'
  | 'resume-diagnose'
  | 'destiny-report'
  | 'destiny-ziwei-report'
  | 'destiny-copilot'
  | 'destiny-qimen-analyze'
  | 'destiny-qimen-base'
  | 'destiny-qimen-strategy-overview'
  | 'destiny-qimen-timing-windows'
  | 'destiny-qimen-chart-summary';

export type UsageSourceKind = 'tokens' | 'tasks';

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
  status?: 'success' | 'failed';
  usage?: NormalizedAiUsage | null;
  metadata?: Record<string, unknown> | null;
}

export interface ProfileUsageItem {
  feature: AiUsageFeature;
  label: string;
  totalTokens: number;
  taskCount: number;
  percent: number;
  hasTokenData: boolean;
  sourceKind: UsageSourceKind;
}

export interface ProfileUsageSummary {
  totalTokens: number;
  totalTaskCount: number;
  features: ProfileUsageItem[];
  tokenRemaining?: number | null;
}
