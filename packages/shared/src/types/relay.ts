/**
 * 跨模态单引用接力 — 共享引用协议类型
 *
 * 设计来源：docs/plans/2026-07-14-cross-modal-reference-relay-design.md §12/§13
 * 约定：
 * - 首版界面只允许一条引用，但 `items` 从第一天就是集合（数组），
 *   为后续多引用关系图与素材篮留基础；界面/Store 用 `MAX_RELAY_ITEMS` 限制。
 * - URL 跳转只携带 `relayId`，快照正文/媒体地址存 Dexie，不进 URL。
 */

/** 引用内容类型 */
export type RelayContentType =
  | 'text'
  | 'transcript'
  | 'image'
  | 'video'
  | 'destiny_report_section';

/** 参与接力的模块 */
export type RelayModule = 'chat' | 'image' | 'voice' | 'video' | 'destiny';

/** 接力在目标模块扮演的角色 */
export type RelayTargetRole =
  | 'context'
  | 'prompt'
  | 'reference_image'
  | 'question'
  | 'background';

/** 单条引用项（来源快照） */
export interface RelayReferenceItem {
  id: string;
  /** 来源模块 */
  sourceModule: RelayModule;
  /** 来源内容类型 */
  sourceType: RelayContentType;
  /** 来源对象标识（历史项/消息/段落等 id） */
  sourceId: string;
  /** 来源子标识（如对比模式某列 modelKey、报告某段落 key） */
  sourceSubId?: string;
  /** 来源标题（展示用） */
  sourceTitle: string;
  /** 来源模型（展示用，如 qwen-max / glm-4） */
  sourceModel?: string;
  /** 文本快照（与 snapshotMediaUrl 至少一种） */
  snapshotText?: string;
  /** 媒体快照地址（可恢复地址/DataURL，禁 objectURL） */
  snapshotMediaUrl?: string;
  /** 创建时间 ISO 字符串 */
  createdAt: string;
  /** 媒体快照失效标记（写入失败/过大时置 true，仅保留元信息） */
  mediaInvalid?: boolean;
}

/** 接力包（一次跨模块引用的载体） */
export interface RelayBundle {
  id: string;
  items: RelayReferenceItem[];
  targetModule: RelayModule;
  targetRole: RelayTargetRole;
  createdAt: string;
}

/** 首版单引用上限；协议不假设单元素，提上限只改此常量 */
export const MAX_RELAY_ITEMS = 1;

/** 派生关系元数据（挂到历史项，记录「由什么生成」） */
export interface DerivationMetadata {
  derivedFromRelayId?: string;
  derivedFromReferenceIds?: string[];
}

/** 命理必要输入 */
export type DestinyRequiredInput = 'birth_profile' | 'question' | 'cast_time';

/** 命理引用角色（文本只作问题/背景，绝不进出生字段） */
export type DestinyReferenceRole = 'question' | 'background';

/** 命理术数能力声明（只描述能力，不推荐/排序/自动路由） */
export interface DestinyMethodCapability {
  id: string;
  label: string;
  acceptedReferenceTypes: RelayContentType[];
  requiredInputs: DestinyRequiredInput[];
  referenceRole: DestinyReferenceRole;
}

/** 命理接力就绪状态 */
export type DestinyReadiness = 'ready' | 'needs_input' | 'unsupported';
