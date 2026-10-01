/**
 * 工具执行策略（spec §7）
 *
 * 统一负责三件事，让每个工具只关心自己的业务逻辑：
 * - 执行超时：工具不得无限挂起，超时按失败处理
 * - 结果截断：进模型的内容与下发前端的摘要各自有上限
 * - 错误规范化：任何异常都转成模型可读的中文文本（模型据此向用户解释）
 */

import {
  ToolError,
  type AgentToolSpec,
  type ToolExecutionContext,
  type ToolExecutionResult,
} from './tools/registry';

export interface ToolPolicy {
  /** 单次工具执行超时（毫秒） */
  timeoutMs: number;
  /** 进模型上下文的正文上限（字符） */
  maxContentChars: number;
  /** 下发前端的结果摘要上限（字符） */
  maxSummaryChars: number;
  /** 下发前端的参数摘要上限（字符） */
  maxArgsSummaryChars: number;
}

export const DEFAULT_TOOL_POLICY: ToolPolicy = {
  timeoutMs: 15_000,
  maxContentChars: 8_000,
  maxSummaryChars: 240,
  maxArgsSummaryChars: 200,
};

/** 超长文本截断，附省略标记 */
export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}…（已截断）`;
}

/**
 * 生成参数展示摘要（用于 tool_call 事件）。
 * 参数已在推送事件前由 registry 校验，这里只做稳定序列化与截断。
 */
export function summarizeArgs(args: unknown, maxChars = DEFAULT_TOOL_POLICY.maxArgsSummaryChars): string {
  let text: string;
  if (args === undefined || args === null) {
    text = '（无参数）';
  } else if (typeof args === 'string') {
    text = args;
  } else {
    try {
      text = JSON.stringify(args);
    } catch {
      text = String(args);
    }
  }
  return truncate(text, maxChars);
}

/** 把任意异常规范化为面向用户/模型的中文文案 */
export function normalizeToolError(error: unknown): string {
  // 工具主动抛出的领域错误：文案本身就是用户可读的，原样透传
  if (error instanceof ToolError) return error.message;

  const raw = error instanceof Error ? error.message : String(error);
  if (/abort|cancel|取消/i.test(raw)) return '已取消';
  if (/timeout|timed out|超时|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT/i.test(raw)) {
    return '连接超时，请稍后重试';
  }
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo|DNS/i.test(raw)) return '域名无法解析，请检查网址是否正确';
  if (/ECONNREFUSED/i.test(raw)) return '目标服务器拒绝连接';
  if (/ECONNRESET|socket hang up/i.test(raw)) return '连接被中断，请稍后重试';
  if (/certificate|CERT_|TLS|SSL|证书/i.test(raw)) return '目标网站证书校验失败，无法访问';
  if (/ENETUNREACH|EHOSTUNREACH/i.test(raw)) return '目标网络不可达';
  return raw.slice(0, 200) || '未知错误';
}

/** 给 Promise 加超时；超时抛 ToolError（文案对用户可读） */
async function withTimeout<T>(promise: Promise<T>, ms: number, toolName: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ToolError(`「${toolName}」执行超时`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * 在策略约束下执行工具：
 * - 超时 / 异常 → 归一化为 ok:false 的结果（不抛出，保证编排层始终拿到可结算的结果）
 * - 成功结果同样按上限截断（内容与摘要）
 */
export async function runToolWithPolicy(
  spec: AgentToolSpec,
  args: unknown,
  ctx: ToolExecutionContext,
  policy: ToolPolicy = DEFAULT_TOOL_POLICY
): Promise<ToolExecutionResult> {
  try {
    const raw = await withTimeout(spec.execute(args, ctx), policy.timeoutMs, spec.name);
    return {
      ok: raw.ok,
      contentForModel: truncate(raw.contentForModel, policy.maxContentChars),
      summaryForDisplay: truncate(raw.summaryForDisplay, policy.maxSummaryChars),
      ...(raw.attachment ? { attachment: raw.attachment } : {}),
    };
  } catch (error) {
    const reason = normalizeToolError(error);
    console.warn('[agent] 工具执行失败', { tool: spec.name, reason, errorId: ctx.errorId });
    return {
      ok: false,
      // 必须显式要求模型转述失败：只给一句错误原因时，模型（实测 doubao-seed-evolving）
      // 会绕开失败、改用自身既有知识回答用户问的那个对象——内网地址被拦时尤其糟糕，
      // 用户会以为模型真的读到了内容。summaryForDisplay 保持纯事实，不加指令。
      contentForModel:
        `工具「${spec.name}」执行失败：${reason}\n` +
        '请在回答中如实告知用户这次调用失败及其原因；不要凭自身既有知识替用户回答本该由该工具获取的内容。',
      summaryForDisplay: `执行失败：${reason}`,
    };
  }
}
