/**
 * Agent 模式配置常量（spec §5.4 / §5.6）
 *
 * 「抽成常量可配」是 spec 的明确要求：步数系数与单步上限都是调参点，
 * 集中在此避免散落在编排逻辑里。
 */

import type { ProviderName } from '@repo/providers';

/** agent 模式强制使用的提供方（T01 实测确认支持 function calling） */
export const AGENT_PROVIDER: ProviderName = 'doubao';

/** agent 模式强制使用的模型（T01 实测选定；reasoning 消耗低于 pro 型号） */
export const AGENT_MODEL = 'doubao-seed-evolving';

/**
 * 步数系数：预留额度 = 单步预估 × 本系数。
 * 一期固定 2（决策步 + 总结步）；二期多步循环时随 maxSteps 联动。
 */
export const AGENT_STEP_FACTOR = 2;

/** 单步输出 token 基准上限；预留按「基准 × 步数系数」，单步生成受基准约束 */
export const AGENT_STEP_OUTPUT_LIMIT = 2048;
