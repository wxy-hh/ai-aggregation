/**
 * 工具执行策略（spec §7）
 *
 * 本文件位于 lib 层，禁止 import `@/app/**` 下任何模块（分层守卫）。
 *
 * 统一负责四件事，让每个工具只关心自己的业务逻辑：
 * - 执行超时：工具不得无限挂起，超时按失败处理，且**超时会真正中止工具的 I/O**
 * - 结果截断：进模型的内容与下发前端的摘要各自有上限
 * - 错误规范化：任何异常都转成模型可读的中文文本（模型据此向用户解释）
 * - **取消 / 超时的判定收口**：本模块是唯一同时掌握「父信号是否被用户中断」与
 *   「是否由自己触发超时」的地方，因此各工具不得自行用 `ctx.signal.aborted` 判断取消 ——
 *   交给工具的信号是**派生信号**（父信号或超时任一都会 abort 它），工具自己判必然误判。
 */

import {
  ToolError,
  type AgentToolSpec,
  type ToolExecutionContext,
  type ToolExecutionResult,
} from './registry';

export interface ToolPolicy {
  /** 单次工具执行超时（毫秒）；工具可用 spec.timeoutMs 覆盖 */
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

/** 超时对用户可见的文案（不带内部工具名；与「已取消」「上游繁忙」三者相互区分） */
export const TOOL_TIMEOUT_REASON = '用时过长，请重试';

/**
 * 组合父信号与超时信号：任一 abort 都会让返回的信号 abort。
 * 只用于交给工具的 I/O 取消，**不作为取消/超时的判定依据**（那由 runToolWithPolicy 负责）。
 */
function combineSignals(parent: AbortSignal, own: AbortSignal): AbortSignal {
  const controller = new AbortController();
  if (parent.aborted || own.aborted) {
    controller.abort();
    return controller.signal;
  }
  const forward = () => controller.abort();
  parent.addEventListener('abort', forward, { once: true });
  own.addEventListener('abort', forward, { once: true });
  return controller.signal;
}


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
  // 未知异常不透原始文案：可能是内部配置细节（如「XXX_API_KEY is not configured」），
  // 原样透出既泄内部信息也让用户困惑；原始错误由调用方记入服务端日志
  return '工具暂时不可用，请稍后重试';
}

/**
 * 在策略约束下执行工具：
 * - 超时 / 异常 → 归一化为 ok:false 的结果（不抛出，保证编排层始终拿到可结算的结果）
 * - 成功结果同样按上限截断（内容与摘要）
 * - 超时时**同时中止工具的 I/O**：`Promise.race` 不会取消输的一方，只靠它会让上游请求
 *   在后台跑完（成本已产生、结果被丢弃）；因此超时还会 abort 派生子信号
 * - 取消 / 超时的判定在本层完成，工具不得自查信号（见文件头注释）
 */
export async function runToolWithPolicy(
  spec: AgentToolSpec,
  args: unknown,
  ctx: ToolExecutionContext,
  policy: ToolPolicy = DEFAULT_TOOL_POLICY
): Promise<ToolExecutionResult> {
  const timeoutMs = spec.timeoutMs ?? policy.timeoutMs;
  const timeoutController = new AbortController();
  // 交给工具的是派生信号：用户中断 或 本层超时，任一都会 abort 它
  const toolCtx: ToolExecutionContext = {
    ...ctx,
    signal: combineSignals(ctx.signal, timeoutController.signal),
  };

  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutSignal = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      // 先abort再reject：让工具的网络请求尽早断开
      timeoutController.abort();
      // 仅用于结束 race；用户可见文案由下方按 timedOut 统一给出
      reject(new Error('tool-timeout'));
    }, timeoutMs);
  });

  try {
    const execution = spec.execute(args, toolCtx);
    // 超时后 execution 仍可能在跑：给它挂一个空 handler，
    // 避免它在 race 结束后抛错变成 unhandledRejection
    void execution.catch(() => {});
    const raw = await Promise.race([execution, timeoutSignal]);
    return {
      ok: raw.ok,
      contentForModel: truncate(raw.contentForModel, policy.maxContentChars),
      summaryForDisplay: truncate(raw.summaryForDisplay, policy.maxSummaryChars),
      ...(raw.attachment ? { attachment: raw.attachment } : {}),
    };
  } catch (error) {
    // 判定顺序：用户取消 > 本层超时 > 其它。
    // 必须按标志判、不靠错误文案匹配：工具拿到的派生信号在超时下同样是 aborted，
    // 若改由工具自查 `ctx.signal.aborted`，超时会被误报成「已取消」。
    const reason = ctx.signal.aborted
      ? '已取消'
      : timedOut
        ? TOOL_TIMEOUT_REASON
        : normalizeToolError(error);
    console.warn('[agent] 工具执行失败', {
      tool: spec.name,
      reason,
      timedOut,
      userAborted: ctx.signal.aborted,
      errorId: ctx.errorId,
      // 原始错误只进日志不透用户：排障需要真实原因（如未配置的上游密钥）
      rawError: error instanceof Error ? error.message : String(error),
    });
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
  } finally {
    if (timer) clearTimeout(timer);
  }
}
