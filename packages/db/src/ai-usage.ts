import { Prisma } from '@prisma/client';
import { prisma } from './client';
import type {
  AiUsageFeature,
  AiUsageRecordInput,
  NormalizedAiUsage,
  ProfileUsageItem,
  ProfileUsageSummary,
} from '../../shared/src/types/ai-usage';

const FEATURE_LABEL_MAP: Record<AiUsageFeature, string> = {
  chat: '智能对话',
  voice: '语音',
  image: '图片生成',
  destiny: 'AI 命理大师',
  resume: '简历制作',
};

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

  return prisma.aIUsageRecord.create({
    data: {
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
    },
  });
}

export async function getProfileUsageSummary(
  userId: string,
  _date?: Date
): Promise<ProfileUsageSummary> {
  let records: Array<{
    feature: string;
    totalTokens: number | null;
    taskCount: number;
  }> = [];

  try {
    records = await prisma.aIUsageRecord.findMany({
      where: {
        userId,
        status: 'success',
      },
      select: {
        feature: true,
        totalTokens: true,
        taskCount: true,
      },
    });
  } catch (error) {
    // 兼容尚未执行迁移或 Prisma Client 未重新生成的本地环境，避免个人中心直接报 500。
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: string }).code)
        : '';
    const message = error instanceof Error ? error.message : String(error);

    const isModelMissing =
      error instanceof TypeError &&
      message.includes("Cannot read properties of undefined") &&
      message.includes("findMany");

    if (
      code === 'P2021' ||
      isModelMissing ||
      (message.includes('ai_usage_records') && message.includes('does not exist')) ||
      message.includes("Can't reach database server")
    ) {
      return {
        period: 'all',
        totalTokens: 0,
        totalTaskCount: 0,
        features: [],
      };
    }

    throw error;
  }

  const grouped = new Map<
    AiUsageFeature,
    {
      totalTokens: number;
      taskCount: number;
      hasTokenData: boolean;
    }
  >();

  for (const record of records) {
    const feature = record.feature as AiUsageFeature;
    const current = grouped.get(feature) ?? {
      totalTokens: 0,
      taskCount: 0,
      hasTokenData: false,
    };

    current.totalTokens += record.totalTokens ?? 0;
    current.taskCount += record.taskCount;
    current.hasTokenData ||= record.totalTokens !== null;
    grouped.set(feature, current);
  }

  const items: ProfileUsageItem[] = (Object.keys(FEATURE_LABEL_MAP) as AiUsageFeature[]).map(
    (feature) => {
      const current = grouped.get(feature) ?? {
        totalTokens: 0,
        taskCount: 0,
        hasTokenData: false,
      };

      return {
        feature,
        label: FEATURE_LABEL_MAP[feature],
        totalTokens: current.totalTokens,
        taskCount: current.taskCount,
        percent: 0,
        hasTokenData: current.hasTokenData,
        sourceKind: current.hasTokenData ? 'tokens' : 'tasks',
      };
    }
  );

  const totalDisplayValue = items.reduce((sum, item) => {
    return sum + (item.hasTokenData ? item.totalTokens : item.taskCount);
  }, 0);

  const features = items.map((item) => ({
    ...item,
    percent:
      totalDisplayValue > 0
        ? Number(
            (
              ((item.hasTokenData ? item.totalTokens : item.taskCount) / totalDisplayValue) *
              100
            ).toFixed(1)
          )
        : 0,
  }));

  return {
    period: 'all',
    totalTokens: features.reduce((sum, item) => sum + item.totalTokens, 0),
    totalTaskCount: features.reduce((sum, item) => sum + item.taskCount, 0),
    features: features.filter((item) => item.totalTokens > 0 || item.taskCount > 0),
  };
}
