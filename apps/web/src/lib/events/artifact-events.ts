/**
 * 产物工作台埋点（ADR-0037 §8）
 *
 * 隐私红线：props 只含产物类型、版本序号、字符数区间；绝不携带标题、正文或章节标题原文。
 * 这里是唯一构造产物事件属性的入口，调用方传入产物与版本，由本模块摘出允许的字段。
 * 本期只建立使用基线，不以「复制/导出转化率提升」或阅读停留作为验收条件。
 */

import type {
  ArtifactEventName,
  ArtifactEventProps,
} from '@/schemas/product-event.schema';
import { trackEvent } from './tracker';

/** 字符数 → 区间（与注入上限 6,000 / 30,000 对齐） */
export function toSizeBucket(length: number): ArtifactEventProps['sizeBucket'] {
  if (length < 1_000) return 'lt_1k';
  if (length < 6_000) return '1k_6k';
  if (length <= 30_000) return '6k_30k';
  return 'gt_30k';
}

/** 构造产物事件属性：只从入参摘出类型、版本序号与内容长度，丢弃其余一切 */
export function buildArtifactEventProps(input: {
  type: ArtifactEventProps['artifactType'];
  versionSeq: number;
  contentLength: number;
}): ArtifactEventProps {
  return {
    artifactType: input.type,
    versionSeq: Math.max(1, Math.floor(input.versionSeq)),
    sizeBucket: toSizeBucket(input.contentLength),
  };
}

/** 上报一个产物事件（fire-and-forget，失败静默） */
export function trackArtifactEvent(
  event: ArtifactEventName,
  input: Parameters<typeof buildArtifactEventProps>[0]
): void {
  trackEvent(event, buildArtifactEventProps(input));
}
