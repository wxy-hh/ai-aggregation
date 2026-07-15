import { describe, expect, it } from 'vitest';
import {
  createAudioMeasurement,
  createTaskMeasurement,
  createTokenMeasurement,
  estimateTextTokens,
} from './usage-measurement';

describe('统一计量适配', () => {
  it('按供应商 token usage 作为文本结算依据', () => {
    expect(createTokenMeasurement({ input_tokens: 12, output_tokens: 8 })).toMatchObject({
      meterType: 'tokens',
      sourceUnits: 20,
      quotaUnits: 20,
      source: 'provider',
      inputUnits: 12,
      outputUnits: 8,
    });
  });

  it('usage 缺失时只使用明确的本地估算，不隐式扣 1', () => {
    expect(createTokenMeasurement(undefined, 37)).toMatchObject({
      sourceUnits: 37,
      quotaUnits: 37,
      source: 'local_estimate',
    });
  });

  it('语音按秒数计量，图片视频按任务计量', () => {
    expect(createAudioMeasurement(12.2)).toMatchObject({
      meterType: 'audio_seconds',
      sourceUnits: 13,
      quotaUnits: 13,
      source: 'local_measurement',
    });
    expect(createTaskMeasurement('image_task')).toMatchObject({
      meterType: 'image_task',
      sourceUnits: 1,
      quotaUnits: 0,
    });
  });

  it('聊天估算至少保留一单位额度', () => {
    expect(estimateTextTokens([])).toBe(1);
    expect(estimateTextTokens([{ content: 'a'.repeat(8) }])).toBe(18);
    expect(estimateTextTokens([{ content: '你好' }])).toBe(19);
  });
});
