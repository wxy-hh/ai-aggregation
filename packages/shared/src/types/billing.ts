/**
 * 统一计费领域类型。
 *
 * 计量单位描述供应商返回的原始用量，quotaUnits 描述最终影响平台额度的单位。
 */

export type MeterType = 'tokens' | 'audio_seconds' | 'image_task' | 'video_task';

export type BillingStatus = 'reserved' | 'settled' | 'released' | 'failed' | 'billing_pending';

/** 预留的供应商调用权状态；与财务结算状态分离，避免重试重复调用上游。 */
export type QuotaExecutionState = 'ready' | 'processing' | 'completed';

export type BillingEventType =
  | 'opening'
  | 'reserve'
  | 'settle'
  | 'release'
  | 'refund'
  | 'adjustment';

export type BillingErrorCode =
  | 'QUOTA_INSUFFICIENT'
  | 'QUOTA_LIMIT_REACHED'
  | 'BILLING_PENDING'
  | 'TASK_RECORDED'
  | 'REQUEST_IN_PROGRESS'
  | 'REQUEST_ALREADY_PROCESSED';

export interface BillingMeasurement {
  meterType: MeterType;
  sourceUnits: number;
  quotaUnits: number;
  inputUnits?: number | null;
  outputUnits?: number | null;
  /**
   * provider：供应商响应中的用量；local_measurement：服务端对真实输入媒体的测量；
   * local_estimate：仅用于无法取得真实用量时的保守预留，不能直接结算 Token。
   */
  source: 'provider' | 'local_measurement' | 'local_estimate';
  rawUsage?: unknown;
}

export interface BillingPolicy {
  meterType: MeterType;
  quotaMultiplier: number;
  requiresProviderUsage: boolean;
  taskCount?: number;
}

export interface QuotaReservationSummary {
  id: string;
  userId: string;
  requestId: string;
  estimatedUnits: number;
  settledUnits: number;
  status: BillingStatus;
  executionState: QuotaExecutionState;
  metadata?: Record<string, unknown> | null;
}
