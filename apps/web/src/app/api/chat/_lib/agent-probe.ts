/**
 * 智能体运行环境探针 (Agent Environment Probe)
 *
 * 职责：
 * 在执行智能体多步自主循环前，前置校验核心依赖凭据与配额门槛：
 * 1. 探针检测 DEEPSEEK_API_KEY 是否有效配置；
 * 2. 探针检测用户可用 Token 配额是否达到最低运行门槛（4,096 tokens）；
 * 3. 任一条件不满足时返回 fallback: true 与友好的中文原因，
 *    由聊天处理器平滑转换为极速对话，消除 500 级联报错与 402 门槛拦截。
 */

export const AGENT_MIN_REQUIRED_TOKENS = 4096;

export interface AgentProbeOptions {
  /** 可用 Token 配额（可选传入，未传入时不校验配额） */
  availableQuota?: number;
  /** 自定义 API Key 覆盖值（用于单测与沙箱测试，缺省取 process.env.DEEPSEEK_API_KEY） */
  envApiKey?: string;
}

export interface AgentProbeResult {
  /** 是否需要降级为极速对话 */
  fallback: boolean;
  /** 友好中文降级原因说明 */
  reason?: string;
}

/**
 * 校验智能体执行环境与配额条件
 */
export function checkAgentEnvironment(options: AgentProbeOptions = {}): AgentProbeResult {
  const apiKey =
    options.envApiKey !== undefined
      ? options.envApiKey
      : (process.env.DEEPSEEK_API_KEY?.trim() || process.env.DEEPSEEK_MODEL?.trim());

  // 1. 检查 API Key 配置
  if (!apiKey || apiKey.trim() === '') {
    return {
      fallback: true,
      reason: '未配置 DeepSeek 密钥，已自动为您平滑切换为极速对话',
    };
  }

  // 2. 检查可用 Token 额度是否达到最低运行门槛
  if (options.availableQuota !== undefined && options.availableQuota < AGENT_MIN_REQUIRED_TOKENS) {
    return {
      fallback: true,
      reason: 'Token 余额不足以支持多步智能体运行，已自动为您平滑切换为极速对话',
    };
  }

  return {
    fallback: false,
  };
}
