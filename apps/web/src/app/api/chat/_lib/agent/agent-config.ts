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

/**
 * 单轮工具调用数量上限：决策步一次可返回多个 toolCall，会逐个真实执行（真实上游成本）。
 * 无上限时一轮可被诱导出 N 次出图/抓取，成本与时长双双失控（B-1 审查发现）。
 * 超出上限的调用不执行：仍推成对事件并给模型「未执行」结果，保证协议完整。
 */
export const AGENT_MAX_TOOL_CALLS_PER_ROUND = 3;

/**
 * 整轮 wall-clock 预算（毫秒）：路由 maxDuration 为 300s（含决策步/总结步，豆包首 token
 * 可达 60s），留 60s 余量收口。超限后剩余工具调用按「未执行」处理，避免被部署层硬杀
 * 导致 onFinish 不执行、预留只能等 10 分钟 TTL 兜底。
 */
export const AGENT_ROUND_TIME_BUDGET_MS = 240_000;

/**
 * image_generate 的单次执行超时。
 *
 * 上游 Agnes 出图实测 10.7–13.9s（5 次采样），而通用工具超时是 15s ——
 * 最慢一次只剩 1.1s 余量，上游稍有波动就会被判「超时」。
 * 40s 约等于实测 p100 的 2.9 倍，且仍在 /api/chat 的 300s 预算内
 * （nginx `proxy_read_timeout 300s` 与路由 maxDuration 一致）。
 */
export const AGENT_IMAGE_TOOL_TIMEOUT_MS = 40_000;
