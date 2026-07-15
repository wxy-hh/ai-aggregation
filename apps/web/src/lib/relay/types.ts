/**
 * 跨模态单引用接力 — 接力层内部类型
 *
 * 设计：docs/plans/2026-07-14-cross-modal-reference-relay-design.md §10/§11
 */

import type { RelayContentType, RelayModule, RelayTargetRole } from '@repo/shared';

/** 可选接力目标（菜单项） */
export interface RelayTargetOption {
  /** 目标模块 */
  targetModule: RelayModule;
  /** 接力在目标扮演的角色 */
  targetRole: RelayTargetRole;
  /** 菜单展示文案（中文） */
  label: string;
  /** 目标字段（适配器落地用） */
  field: RelayTargetField;
}

/** 目标字段：适配器确定性转换后写入的位置 */
export type RelayTargetField =
  | 'chat_context' // 对话引用上下文
  | 'image_prompt' // 图像 Prompt
  | 'image_reference' // 图像参考图
  | 'video_description' // 视频描述
  | 'video_reference_image' // 视频参考图
  | 'destiny_pending' // 命理「待解读引用」（等待选术数）
  | 'none'; // 不支持

/** 适配器确定性转换结果（不调模型、不加任何修饰词） */
export interface RelayAdaptResult {
  /** 目标字段 */
  field: RelayTargetField;
  /** 目标角色 */
  role: RelayTargetRole;
  /** 草稿文本（文本/转写/报告段落类） */
  draftText?: string;
  /** 媒体地址（图片/视频类） */
  mediaUrl?: string;
}

/** 来源类型 → 支持的目标（§10 映射表的机器可读形式） */
export type RelaySourceCapability = Record<
  RelayContentType,
  ReadonlyArray<{
    targetModule: RelayModule;
    targetRole: RelayTargetRole;
    field: RelayTargetField;
    label: string;
  }>
>;
