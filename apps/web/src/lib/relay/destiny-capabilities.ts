/**
 * 跨模态单引用接力 — 命理能力注册
 *
 * 设计 §13：命理接力层不写死术数列表，每个术数声明支持的引用类型和必要输入。
 * 本注册只描述能力，不提供智能推荐、排序或自动路由。
 */

import type {
  DestinyMethodCapability,
  DestinyReadiness,
  RelayContentType,
} from '@repo/shared';

/** 三术数能力声明（平级，无推荐/预选/自动路由） */
export const DESTINY_CAPABILITIES: DestinyMethodCapability[] = [
  {
    id: 'bazi',
    label: '八字',
    acceptedReferenceTypes: ['text', 'transcript', 'destiny_report_section'],
    requiredInputs: ['birth_profile'],
    referenceRole: 'background',
  },
  {
    id: 'ziwei',
    label: '紫微斗数',
    acceptedReferenceTypes: ['text', 'transcript', 'destiny_report_section'],
    requiredInputs: ['birth_profile'],
    referenceRole: 'background',
  },
  {
    id: 'qimen',
    label: '奇门遁甲',
    acceptedReferenceTypes: ['text', 'transcript', 'destiny_report_section'],
    requiredInputs: ['question', 'cast_time'],
    referenceRole: 'question',
  },
];

/** 取所有能力声明（UI 平级展示用） */
export function getDestinyCapabilities(): DestinyMethodCapability[] {
  return DESTINY_CAPABILITIES;
}

/** 按 id 取单个能力声明 */
export function getDestinyCapability(id: string): DestinyMethodCapability | undefined {
  return DESTINY_CAPABILITIES.find((c) => c.id === id);
}

/**
 * 计算某术数对给定引用类型的就绪状态。
 * - unsupported：引用类型不在该术数支持列表（UI 不展示）
 * - needs_input：支持但缺少必要输入（出生资料/问题/起局时间）
 * - ready：信息足够，可进入确认页
 *
 * @param capability 术数能力声明
 * @param ctx.sourceType 来源引用类型
 * @param ctx.hasBirthProfile 是否已有出生资料
 * @param ctx.hasQuestion 是否已有所问之事
 * @param ctx.hasCastTime 是否已有起局时间
 */
export function computeDestinyReadiness(
  capability: DestinyMethodCapability,
  ctx: {
    sourceType: RelayContentType;
    hasBirthProfile?: boolean;
    hasQuestion?: boolean;
    hasCastTime?: boolean;
  },
): DestinyReadiness {
  if (!capability.acceptedReferenceTypes.includes(ctx.sourceType)) {
    return 'unsupported';
  }
  const needs: string[] = [];
  if (capability.requiredInputs.includes('birth_profile') && !ctx.hasBirthProfile) {
    needs.push('birth_profile');
  }
  if (capability.requiredInputs.includes('question') && !ctx.hasQuestion) {
    needs.push('question');
  }
  if (capability.requiredInputs.includes('cast_time') && !ctx.hasCastTime) {
    needs.push('cast_time');
  }
  return needs.length > 0 ? 'needs_input' : 'ready';
}
