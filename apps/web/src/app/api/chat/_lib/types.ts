/**
 * 聊天提供方适配器 — 统一接口
 *
 * 每个 AI 提供方（讯飞、豆包、通用）实现此接口，
 * chat/route.ts 只负责鉴权、限流、配额，其余委派给适配器。
 */

import type { ProviderName } from '@repo/providers';
import type { Message as ChatMessage } from '@/stores/chat-store';

/**
 * 聊天流结束结果（adapter → handler 的唯一结算输入）。
 *
 * - outcome='success'：流正常结束（收到终止事件且无异常）。
 * - outcome='partial'：流异常结束但已有部分输出文本（上游截断、网络中断、用户中断）。
 * - outcome='failed'：流异常结束且没有任何输出文本（上游空流、取消、初始化失败）。
 *
 * adapter 只负责报告流的物理完成态，不做任何结算分支；
 * 三态结算决策由 handler 侧 QuotaSession.finalize 统一处理（评审 C1）。
 */
export interface ChatStreamFinish {
  outcome: 'success' | 'partial' | 'failed';
  /** 上游返回的 usage（可为 null；无效时由结算侧按估算兜底） */
  usage: unknown;
  /** 累计的输出文本（用于输出 token 估算兜底） */
  outputText: string;
  /** 失败/取消原因（release 记录与日志用） */
  reason?: string;
}

export interface ChatContext {
  userId: string;
  provider: ProviderName;
  model: string;
  messages: ChatMessage[];
  /** 本次预留允许的输出 token 上限（adapter 据此限制生成） */
  outputLimit: number;
  signal: AbortSignal;
  errorId: string;
  /**
   * 流结束时回调：结算由 handler 侧的 QuotaSession 统一处理，
   * adapter 不持有任何结算句柄、不写结算逻辑。
   */
  onFinish: (finish: ChatStreamFinish) => Promise<void>;
}

export interface ChatProviderAdapter {
  /** 创建并返回 SSE 流；由调用方包装为 HTTP 响应 */
  stream(ctx: ChatContext): Promise<ReadableStream<Uint8Array>>;
}

/**
 * 提供方客户端错误 — 适配器 → handler 的唯一异常类型。
 * 各适配器必须把厂商私有错误翻译为此类型（status 为透传给客户端的 HTTP 状态码，
 * message 为用户可读中文文案）；handler 只认此类型，不 import 任何厂商私有异常。
 */
export class ProviderClientError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'ProviderClientError';
  }
}
