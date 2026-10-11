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
export const PRODUCT_EVENT_NAMES = [
  'agent_intent_chip.impression',
  'agent_intent_chip.click',
  'agent_intent_chip.dismiss',
] as const;

export type ProductEventName = (typeof PRODUCT_EVENT_NAMES)[number];

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

/**
 * 通用产品事件上报请求体 Schema
 * 顶层对象亦使用 strict()，拒绝多余未定义字段
 */
export const trackProductEventSchema = z
  .object({
    event: z.enum(PRODUCT_EVENT_NAMES, {
      errorMap: () => ({ message: '不支持的事件类型' }),
    }),
    props: agentIntentChipPropsSchema,
  })
  .strict();

export type TrackProductEventInput = z.infer<typeof trackProductEventSchema>;
