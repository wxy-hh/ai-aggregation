/**
 * 跨模态单引用接力 — 确定性目标适配器
 *
 * 设计 §11 目标适配规则：执行确定性转换，不调用模型：
 * - 文本到对话：保留原文，作为引用上下文。
 * - 文本到图像：原文进入 Prompt，不自动添加风格、镜头或质量词。
 * - 文本到视频：原文进入视频描述，不自动添加时长、镜头运动和比例。
 * - 图片到视频：图片进入参考图字段，视频描述保持原状态。
 * - 文本到命理：标记为问题或背景，等待用户手动选择术数。
 * - 报告段落到命理：标记为命理追问上下文，绑定原报告标识。
 */

import type { RelayReferenceItem } from '@repo/shared';
import type { RelayAdaptResult, RelayTargetOption } from './types';

/**
 * 把来源引用项确定性适配为目标模块的可写字段。
 * 纯函数：不调用模型、不添加风格/时长/质量等任何修饰词。
 *
 * @param item 来源引用项（快照已在 Dexie）
 * @param target 目标能力项（来自 getAvailableTargets）
 * @returns 适配结果；目标与来源不匹配时 field='none'
 */
export function adaptForTarget(
  item: RelayReferenceItem,
  target: RelayTargetOption,
): RelayAdaptResult {
  const { field, targetRole } = target;

  // 媒体类（图片/视频）→ 参考图/附件：带媒体地址
  if (field === 'image_reference' || field === 'video_reference_image') {
    return { field, role: targetRole, mediaUrl: item.snapshotMediaUrl };
  }

  // 图片「再次绘图」：沿用原 Prompt（快照文本），不伪装成参考图
  if (field === 'image_prompt' && item.sourceType === 'image') {
    return { field, role: targetRole, draftText: item.snapshotText };
  }

  // 文本/转写/报告段落 → Prompt/描述/上下文/待解读：带原文快照
  if (
    field === 'chat_context' ||
    field === 'image_prompt' ||
    field === 'video_description' ||
    field === 'destiny_pending'
  ) {
    return { field, role: targetRole, draftText: item.snapshotText };
  }

  return { field: 'none', role: targetRole };
}
