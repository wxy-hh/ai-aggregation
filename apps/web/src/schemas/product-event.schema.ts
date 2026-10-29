/**
 * 前端行为埋点事件校验 Schema（ADR-0013 / P0a 工单 03）
 *
 * 事件命名约定：
 * `<surface>.<action>`
 * - surface: 交互载体/界面组件标识（例如 agent_intent_chip）
 * - action: 用户或系统行为动作（例如 impression / click / dismiss）
 *
 * 后续所有新埋点项均须严格遵循此命名约定，并在本文件的白名单中显式登记。
 *
 * 隐私红线（强制）：
 * - props 只允许放事件元数据与受控枚举；
 * - URL 原文、消息内容、对话片段等用户隐私数据绝不入库；
 * - Schema 必须采用 strict() 严格模式，任何未经声明的多余字段一律拒绝（返回 400）。
 */

import { z } from 'zod';

/** 本期支持的产品事件名称白名单 */
export const AGENT_INTENT_CHIP_EVENT_NAMES = [
  'agent_intent_chip.impression',
  'agent_intent_chip.click',
  'agent_intent_chip.dismiss',
] as const;

/** 产物工作台事件（ADR-0037 §8）：复制、导出、章节补丁成败、回滚、差异打开 */
export const ARTIFACT_EVENT_NAMES = [
  'artifact.copy',
  'artifact.export',
  'artifact.patch_applied',
  'artifact.patch_failed',
  'artifact.rollback',
  'artifact.diff_open',
] as const;

export const PRODUCT_EVENT_NAMES = [...AGENT_INTENT_CHIP_EVENT_NAMES, ...ARTIFACT_EVENT_NAMES] as const;

export type ProductEventName = (typeof PRODUCT_EVENT_NAMES)[number];
export type AgentIntentChipEventName = (typeof AGENT_INTENT_CHIP_EVENT_NAMES)[number];
export type ArtifactEventName = (typeof ARTIFACT_EVENT_NAMES)[number];

/**
 * 智能意图升级芯片事件属性 Schema
 * 严格模式（strict）：拒绝任何多余属性，确保 URL 原文与消息内容绝不入库
 */
export const agentIntentChipPropsSchema = z
  .object({
    signal: z.enum(['url', 'keyword'], {
      errorMap: () => ({ message: 'signal 仅支持 url 或 keyword' }),
    }),
    keyword: z.string().trim().max(100, '关键词长度不能超过 100 个字符').optional(),
  })
  .strict();

export type AgentIntentChipProps = z.infer<typeof agentIntentChipPropsSchema>;

/** 产物内容字符数区间：与 ADR-0037 的注入上限（6,000 / 30,000）对齐，只记区间不记精确长度 */
export const ARTIFACT_SIZE_BUCKETS = ['lt_1k', '1k_6k', '6k_30k', 'gt_30k'] as const;

/**
 * 产物事件属性 Schema（ADR-0037 §8）
 * 只允许产物类型、版本序号、字符数区间；严格模式拒绝 title、content、章节标题等任何多余字段。
 */
export const artifactEventPropsSchema = z
  .object({
    artifactType: z.enum(['markdown', 'table', 'code', 'image'], {
      errorMap: () => ({ message: 'artifactType 不合法' }),
    }),
    versionSeq: z.number().int().min(1).max(100_000),
    sizeBucket: z.enum(ARTIFACT_SIZE_BUCKETS, {
      errorMap: () => ({ message: 'sizeBucket 不合法' }),
    }),
  })
  .strict();

export type ArtifactEventProps = z.infer<typeof artifactEventPropsSchema>;

/** 事件名到属性形状的映射：trackEvent 据此做到「事件名与 props 一一对应」的编译期约束 */
export type ProductEventPropsMap = {
  [K in AgentIntentChipEventName]: AgentIntentChipProps;
} & {
  [K in ArtifactEventName]: ArtifactEventProps;
};

/**
 * 通用产品事件上报请求体 Schema
 * 顶层对象亦使用 strict()，拒绝多余未定义字段；事件名决定 props 的形状
 */
export const trackProductEventSchema = z.union(
  [
    z
      .object({
        event: z.enum(AGENT_INTENT_CHIP_EVENT_NAMES),
        props: agentIntentChipPropsSchema,
      })
      .strict(),
    z
      .object({
        event: z.enum(ARTIFACT_EVENT_NAMES),
        props: artifactEventPropsSchema,
      })
      .strict(),
  ],
  { errorMap: () => ({ message: '不支持的事件类型或属性不合法' }) }
);

export type TrackProductEventInput = z.infer<typeof trackProductEventSchema>;
