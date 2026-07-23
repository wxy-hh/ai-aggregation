import { normalizeUsage } from '@/lib/ai-usage';
import type { BillingMeasurement, MeterType } from '@repo/shared';

export { estimateTextTokens, estimateOutputTokens } from '@repo/shared';

export function createTokenMeasurement(rawUsage: unknown, fallbackTokens = 0): BillingMeasurement {
  const usage = normalizeUsage(rawUsage);
  const totalTokens = usage.totalTokens ?? Math.max(0, Math.round(fallbackTokens));

  return {
    meterType: 'tokens',
    sourceUnits: totalTokens,
    quotaUnits: totalTokens,
    inputUnits: usage.inputTokens,
    outputUnits: usage.outputTokens,
    source: usage.totalTokens === null ? 'local_estimate' : 'provider',
    rawUsage: usage.rawUsage ?? rawUsage,
  };
}

export function createAudioMeasurement(seconds: number, rawUsage?: unknown): BillingMeasurement {
  const normalizedSeconds = Math.max(0, Math.ceil(seconds));
  return {
    meterType: 'audio_seconds',
    sourceUnits: normalizedSeconds,
    quotaUnits: normalizedSeconds,
    // 上传音频由服务端解析文件元数据，实时语音由实际转发的 PCM 字节数换算。
    source: rawUsage === undefined ? 'local_measurement' : 'provider',
    rawUsage,
  };
}

export function createTaskMeasurement(
  meterType: Extract<MeterType, 'image_task' | 'video_task'>
): BillingMeasurement {
  return {
    meterType,
    sourceUnits: 1,
    quotaUnits: 0,
    source: 'local_estimate',
  };
}
