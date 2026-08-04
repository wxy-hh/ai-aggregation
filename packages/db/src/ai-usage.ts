import { Prisma } from '@prisma/client';
import { prisma } from './client';
import type {
  AiUsageFeature,
  AiUsageRecordInput,
  NormalizedAiUsage,
  ProfileUsageDetailItem,
  ProfileUsageItem,
  ProfileUsageSummary,
  UsageSourceKind,
} from '../../shared/src/types/ai-usage';

const FEATURE_LABEL_MAP: Record<AiUsageFeature, string> = {
  chat: '智能对话',
  voice: '语音',
  image: '图片生成',
  video: '视频生成',
  video_prompt: '视频提示词优化',
  destiny: 'AI 命理大师',
  resume: '简历制作',
};

/** AI 命理大师展开明细固定顺序；「其他」兜底保证加总对齐 */
const DESTINY_DETAIL_ORDER = [
  { key: 'bazi', label: '八字' },
  { key: 'bazi-compatibility', label: '八字合盘' },
  { key: 'ziwei', label: '紫微斗数' },
  { key: 'qimen', label: '奇门遁甲' },
  { key: 'other', label: '其他' },
] as const;

type DetailBucketKey = (typeof DESTINY_DETAIL_ORDER)[number]['key'];

type UsageBucket = {
  totalTokens: number;
  audioSeconds: number;
  taskCount: number;
  billableUnits: number;
  billingStatus: string | null;
};

function emptyBucket(): UsageBucket {
  return {
    totalTokens: 0,
    audioSeconds: 0,
    taskCount: 0,
    billableUnits: 0,
    billingStatus: null,
  };
}

function resolveSourceKind(bucket: UsageBucket): UsageSourceKind {
  const kinds = [
    bucket.totalTokens > 0 ? 'tokens' : null,
    bucket.audioSeconds > 0 ? 'audio_seconds' : null,
    bucket.taskCount > 0 ? 'tasks' : null,
  ].filter(Boolean) as UsageSourceKind[];
  return kinds.length > 1 ? 'mixed' : (kinds[0] ?? 'tokens');
}

function accumulateRecord(
  bucket: UsageBucket,
  record: {
    feature: string;
    totalTokens: number | null;
    taskCount: number;
    meterType: string | null;
    billableUnits: number | null;
    billingStatus: string | null;
  }
) {
  const feature = record.feature as AiUsageFeature;
  const isMediaTask =
    record.meterType === 'image_task' ||
    record.meterType === 'video_task' ||
    ((feature === 'image' || feature === 'video') && record.meterType === null);
  const isAudio = record.meterType === 'audio_seconds';
  const isToken = record.meterType === 'tokens' || (!record.meterType && !isMediaTask);

  if (isToken) {
    bucket.totalTokens += record.totalTokens ?? record.billableUnits ?? 0;
  }
  if (isAudio) {
    bucket.audioSeconds += record.billableUnits ?? record.totalTokens ?? 0;
  }
  if (isMediaTask) {
    bucket.taskCount += record.taskCount;
  }
  bucket.billableUnits += record.billableUnits ?? 0;
  bucket.billingStatus = record.billingStatus ?? bucket.billingStatus;
}

/**
 * 将 destiny 用量归入五档明细。
 * 合盘优先 action；历史记录用 metadata.reportType 回退。
 */
function resolveDestinyDetailKey(
  action: string | null | undefined,
  metadata: unknown
): DetailBucketKey {
  const reportType =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>).reportType
      : undefined;

  if (
    action === 'destiny-compatibility-report' ||
    reportType === 'bazi-compatibility'
  ) {
    return 'bazi-compatibility';
  }
  if (action === 'destiny-ziwei-report') return 'ziwei';
  if (action?.startsWith('destiny-qimen')) return 'qimen';
  if (action === 'destiny-report') return 'bazi';
  return 'other';
}

function toInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.round(parsed));
    }
  }

  return null;
}

function pickTokenCount(...values: unknown[]): number | null {
  for (const value of values) {
    const result = toInteger(value);
    if (result !== null) {
      return result;
    }
  }

  return null;
}

export function normalizeUsage(rawUsage: unknown): NormalizedAiUsage {
  if (!rawUsage || typeof rawUsage !== 'object') {
    return {
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      cachedTokens: null,
      reasoningTokens: null,
      taskCount: 1,
    };
  }

  const usage = rawUsage as Record<string, unknown>;
  const inputDetails =
    usage.input_tokens_details && typeof usage.input_tokens_details === 'object'
      ? (usage.input_tokens_details as Record<string, unknown>)
      : null;
  const outputDetails =
    usage.output_tokens_details && typeof usage.output_tokens_details === 'object'
      ? (usage.output_tokens_details as Record<string, unknown>)
      : null;
  const inputTokenDetails =
    usage.inputTokenDetails && typeof usage.inputTokenDetails === 'object'
      ? (usage.inputTokenDetails as Record<string, unknown>)
      : null;
  const outputTokenDetails =
    usage.outputTokenDetails && typeof usage.outputTokenDetails === 'object'
      ? (usage.outputTokenDetails as Record<string, unknown>)
      : null;

  const inputTokens = pickTokenCount(
    usage.inputTokens,
    usage.input_tokens,
    usage.promptTokens,
    usage.prompt_tokens
  );
  const outputTokens = pickTokenCount(
    usage.outputTokens,
    usage.output_tokens,
    usage.completionTokens,
    usage.completion_tokens
  );
  const totalTokens = pickTokenCount(usage.totalTokens, usage.total_tokens);
  const cachedTokens = pickTokenCount(
    usage.cachedTokens,
    usage.cachedInputTokens,
    inputDetails?.cached_tokens,
    inputTokenDetails?.cacheReadTokens
  );
  const reasoningTokens = pickTokenCount(
    usage.reasoningTokens,
    outputDetails?.reasoning_tokens,
    outputTokenDetails?.reasoningTokens
  );

  return {
    inputTokens,
    outputTokens,
    totalTokens:
      totalTokens ??
      (inputTokens !== null || outputTokens !== null
        ? (inputTokens ?? 0) + (outputTokens ?? 0)
        : null),
    cachedTokens,
    reasoningTokens,
    taskCount: 1,
    rawUsage,
  };
}

export async function recordAiUsage(input: AiUsageRecordInput) {
  const usage =
    input.usage ??
    ({
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      cachedTokens: null,
      reasoningTokens: null,
      taskCount: 1,
    } satisfies NormalizedAiUsage);

  const data = {
    userId: input.userId,
    feature: input.feature,
    action: input.action,
    provider: input.provider ?? null,
    model: input.model ?? null,
    endpoint: input.endpoint ?? null,
    requestId: input.requestId ?? null,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    cachedTokens: usage.cachedTokens,
    reasoningTokens: usage.reasoningTokens,
    taskCount: usage.taskCount,
    status: input.status ?? 'success',
    meterType: input.meterType ?? null,
    billableUnits: input.billableUnits ?? null,
    billingStatus: input.billingStatus ?? null,
    reservationId: input.reservationId ?? null,
    rawUsage:
      usage.rawUsage === undefined
        ? undefined
        : usage.rawUsage === null
          ? Prisma.JsonNull
          : (usage.rawUsage as Prisma.InputJsonValue),
    metadata:
      input.metadata === undefined
        ? undefined
        : input.metadata === null
          ? Prisma.JsonNull
          : (input.metadata as Prisma.InputJsonValue),
  };

  if (input.reservationId) {
    return prisma.aIUsageRecord.upsert({
      where: { reservationId: input.reservationId },
      update: data,
      create: data,
    });
  }

  if (input.requestId) {
    return prisma.aIUsageRecord.upsert({
      where: { userId_requestId: { userId: input.userId, requestId: input.requestId } },
      update: data,
      create: data,
    });
  }

  return prisma.aIUsageRecord.create({ data });
}

export async function getProfileUsageSummary(
  userId: string,
  _date?: Date
): Promise<ProfileUsageSummary> {
  const records = await prisma.aIUsageRecord.findMany({
    where: {
      userId,
      status: { in: ['success', 'partial', 'billing_pending'] },
    },
    select: {
      feature: true,
      action: true,
      totalTokens: true,
      taskCount: true,
      meterType: true,
      billableUnits: true,
      billingStatus: true,
      metadata: true,
    },
  });

  const grouped = new Map<AiUsageFeature, UsageBucket>();
  const destinyDetails = new Map<DetailBucketKey, UsageBucket>();
  for (const item of DESTINY_DETAIL_ORDER) {
    destinyDetails.set(item.key, emptyBucket());
  }

  for (const record of records) {
    const feature = record.feature as AiUsageFeature;
    const current = grouped.get(feature) ?? emptyBucket();
    accumulateRecord(current, record);
    grouped.set(feature, current);

    if (feature === 'destiny') {
      const detailKey = resolveDestinyDetailKey(record.action, record.metadata);
      const detailBucket = destinyDetails.get(detailKey) ?? emptyBucket();
      accumulateRecord(detailBucket, record);
      destinyDetails.set(detailKey, detailBucket);
    }
  }

  const items: ProfileUsageItem[] = (Object.keys(FEATURE_LABEL_MAP) as AiUsageFeature[]).map(
    (feature) => {
      const current = grouped.get(feature) ?? emptyBucket();

      const item: ProfileUsageItem = {
        feature,
        label: FEATURE_LABEL_MAP[feature],
        totalTokens: current.totalTokens,
        audioSeconds: current.audioSeconds,
        taskCount: current.taskCount,
        percent: 0,
        sourceKind: resolveSourceKind(current),
        billableUnits: current.billableUnits,
        billingStatus: current.billingStatus as ProfileUsageItem['billingStatus'],
      };

      if (feature === 'destiny') {
        const details: ProfileUsageDetailItem[] = DESTINY_DETAIL_ORDER.map((def) => {
          const bucket = destinyDetails.get(def.key) ?? emptyBucket();
          return {
            key: def.key,
            label: def.label,
            totalTokens: bucket.totalTokens,
            audioSeconds: bucket.audioSeconds,
            taskCount: bucket.taskCount,
            sourceKind: resolveSourceKind(bucket),
          };
        }).filter(
          (detail) =>
            detail.totalTokens > 0 || detail.audioSeconds > 0 || detail.taskCount > 0
        );
        if (details.length > 0) {
          item.details = details;
        }
      }

      return item;
    }
  );

  const features = items;

  return {
    totalTokens: features.reduce((sum, item) => sum + item.totalTokens, 0),
    totalAudioSeconds: features.reduce((sum, item) => sum + item.audioSeconds, 0),
    totalTaskCount: features.reduce((sum, item) => sum + item.taskCount, 0),
    features: features.filter(
      (item) => item.totalTokens > 0 || item.audioSeconds > 0 || item.taskCount > 0
    ),
  };
}
