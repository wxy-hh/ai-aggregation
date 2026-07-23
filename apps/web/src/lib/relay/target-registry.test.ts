/**
 * 接力目标能力注册表 + 确定性适配器 — 单元测试
 *
 * 覆盖 REQ-003（按能力过滤、确定性适配不调模型）与设计 §10/§11。
 */

import { describe, it, expect } from 'vitest';
import { getAvailableTargets } from './target-registry';
import { adaptForTarget } from './adapters';
import type { RelayReferenceItem } from '@repo/shared';

function makeItem(overrides: Partial<RelayReferenceItem>): RelayReferenceItem {
  return {
    id: 'r1',
    sourceModule: 'chat',
    sourceType: 'text',
    sourceId: 's1',
    sourceTitle: '标题',
    createdAt: '2026-07-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('getAvailableTargets', () => {
  it('文本来源支持 对话/图像/视频/命理，不含语音目标', () => {
    const targets = getAvailableTargets('text');
    const modules = targets.map((t) => t.targetModule);
    expect(modules).toContain('chat');
    expect(modules).toContain('image');
    expect(modules).toContain('video');
    expect(modules).toContain('destiny');
    expect(modules).not.toContain('voice');
  });

  it('图片来源不含命理目标，含参考图与再次绘图', () => {
    const targets = getAvailableTargets('image');
    const modules = targets.map((t) => t.targetModule);
    expect(modules).not.toContain('destiny');
    const fields = targets.map((t) => t.field);
    expect(fields).toContain('image_reference');
    expect(fields).toContain('image_prompt');
    expect(fields).toContain('video_reference_image');
  });

  it('视频来源不支持图像目标', () => {
    const targets = getAvailableTargets('video');
    expect(targets.map((t) => t.targetModule)).not.toContain('image');
  });

  it('excludeModule 可排除指定目标', () => {
    const targets = getAvailableTargets('text', 'image');
    expect(targets.map((t) => t.targetModule)).not.toContain('image');
  });
});

describe('adaptForTarget（确定性，不调模型）', () => {
  it('文本→图像 Prompt：原文进入，不加修饰词', () => {
    const item = makeItem({ snapshotText: '一只猫' });
    const target = getAvailableTargets('text').find((t) => t.targetModule === 'image')!;
    const result = adaptForTarget(item, target);
    expect(result.field).toBe('image_prompt');
    expect(result.draftText).toBe('一只猫');
    expect(result.mediaUrl).toBeUndefined();
  });

  it('文本→视频描述：原文进入，不加时长/镜头词', () => {
    const item = makeItem({ snapshotText: '日落海边' });
    const target = getAvailableTargets('text').find((t) => t.targetModule === 'video')!;
    const result = adaptForTarget(item, target);
    expect(result.field).toBe('video_description');
    expect(result.draftText).toBe('日落海边');
  });

  it('图片→视频参考图：带媒体地址，不带描述文本', () => {
    const item = makeItem({
      sourceType: 'image',
      snapshotMediaUrl: 'data:image/png;base64,xxx',
      snapshotText: undefined,
    });
    const target = getAvailableTargets('image').find((t) => t.field === 'video_reference_image')!;
    const result = adaptForTarget(item, target);
    expect(result.field).toBe('video_reference_image');
    expect(result.mediaUrl).toBe('data:image/png;base64,xxx');
    expect(result.draftText).toBeUndefined();
  });

  it('图片→再次绘图：沿用原 Prompt，不伪装成参考图', () => {
    const item = makeItem({ sourceType: 'image', snapshotText: '原 prompt' });
    const target = getAvailableTargets('image').find((t) => t.field === 'image_prompt')!;
    const result = adaptForTarget(item, target);
    expect(result.field).toBe('image_prompt');
    expect(result.draftText).toBe('原 prompt');
  });

  it('文本→命理：进入待解读引用（destiny_pending）', () => {
    const item = makeItem({ snapshotText: '我今年事业如何' });
    const target = getAvailableTargets('text').find((t) => t.targetModule === 'destiny')!;
    const result = adaptForTarget(item, target);
    expect(result.field).toBe('destiny_pending');
    expect(result.draftText).toBe('我今年事业如何');
  });
});
