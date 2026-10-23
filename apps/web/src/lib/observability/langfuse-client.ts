/**
 * Langfuse 本地自托管可观测深模块（Langfuse Client）
 *
 * 职责：
 * 1. 封装 Langfuse v3 客户端单例与生命周期管理；
 * 2. 窄接口抽象（Root Trace / Generation / Span）；
 * 3. 环境变量守卫与无缝 No-op 降级：未配置时完全无外部 I/O，对现有单测和主业务流程零影响；
 * 4. 集成脱敏中间件（sanitizer），防止任何明文 Key 或凭证进入 Trace（QA-014 场景预演）；
 * 5. Token Usage 口径管理：显式标注 actual / estimated / missing，价格与版本记录独立存储，杜绝混用。
 */

import { sanitizeForTrace } from './sanitizer';

/** Token Usage 口径三态 */
export type UsageAccountingType = 'actual' | 'estimated' | 'missing';

/** 统一 Token Usage 结构 */
export interface ObservabilityTokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

/** 决策步 Generation 参数 */
export interface GenerationParams {
  name: string;
  model?: string;
  input?: unknown;
  output?: unknown;
  usage?: ObservabilityTokenUsage;
  usageType?: UsageAccountingType;
  metadata?: Record<string, unknown>;
  startTime?: Date | number;
  endTime?: Date | number;
}

/** 工具执行 Span 参数 */
export interface SpanParams {
  name: string;
  input?: unknown;
  output?: unknown;
  status?: 'success' | 'failed';
  durationMs?: number;
  metadata?: Record<string, unknown>;
  startTime?: Date | number;
  endTime?: Date | number;
}

/** Generation 观测对象接口 */
export interface ObservabilityGeneration {
  update(params: Partial<GenerationParams>): void;
  end(): void;
}

/** Span 观测对象接口 */
export interface ObservabilitySpan {
  update(params: Partial<SpanParams>): void;
  end(): void;
}

/** Root Trace 观测对象接口 */
export interface ObservabilityTrace {
  readonly traceId: string;
  generation(params: GenerationParams): ObservabilityGeneration;
  span(params: SpanParams): ObservabilitySpan;
  update(params: { output?: unknown; metadata?: Record<string, unknown> }): void;
  end(): void;
}

/** 创建 Root Trace 参数 */
export interface CreateTraceOptions {
  traceId?: string;
  name?: string;
  userId?: string;
  runId?: string;
  conversationId?: string;
  input?: unknown;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * 判定当前环境是否启用了可观测性配置。
 * 必须同时具备公钥和私钥方视为开启。
 */
export function isObservabilityConfigured(): boolean {
  const pub = process.env.LANGFUSE_PUBLIC_KEY;
  const sec = process.env.LANGFUSE_SECRET_KEY;
  return Boolean(pub && pub.trim() && sec && sec.trim());
}

// ==================== No-op 降级实现 ====================

class NoopGeneration implements ObservabilityGeneration {
  update(_params: Partial<GenerationParams>): void {}
  end(): void {}
}

class NoopSpan implements ObservabilitySpan {
  update(_params: Partial<SpanParams>): void {}
  end(): void {}
}

class NoopTrace implements ObservabilityTrace {
  readonly traceId: string;

  constructor(traceId?: string) {
    this.traceId = traceId || 'noop-trace';
  }

  generation(_params: GenerationParams): ObservabilityGeneration {
    return new NoopGeneration();
  }

  span(_params: SpanParams): ObservabilitySpan {
    return new NoopSpan();
  }

  update(_params: { output?: unknown; metadata?: Record<string, unknown> }): void {}
  end(): void {}
}

// ==================== 真实 Langfuse Client 封装 ====================

let langfuseInstance: any = null;

function getLangfuseClient(): any {
  if (!isObservabilityConfigured()) {
    return null;
  }

  if (!langfuseInstance) {
    try {
      // 动态引入避免在无 langfuse 环境下报错
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Langfuse } = require('langfuse');
      langfuseInstance = new Langfuse({
        publicKey: process.env.LANGFUSE_PUBLIC_KEY,
        secretKey: process.env.LANGFUSE_SECRET_KEY,
        baseUrl: process.env.LANGFUSE_BASEURL || 'http://localhost:3100',
        flushAt: 1, // 本地开发单会话快速就绪
        flushInterval: 500,
      });

      if (typeof langfuseInstance.on === 'function') {
        langfuseInstance.on('error', (err: any) => {
          // 容错捕获异步上报网络错误（如本地 Docker 未拉起），防未捕获异常抛出
          console.warn('[observability] Langfuse 异步上报异常 (容错忽略):', err?.message || err);
        });
      }
    } catch (err) {
      console.warn('[observability] Langfuse 客户端初始化失败，自动降级为 no-op:', err);
      return null;
    }
  }

  return langfuseInstance;
}

/** 供测试注入自定义 client 或重置单例状态使用 */
export function _setLangfuseClientForTesting(client: any = null): void {
  langfuseInstance = client;
}

export function _resetClientForTesting(): void {
  langfuseInstance = null;
}

class LiveGeneration implements ObservabilityGeneration {
  private rawGeneration: any;

  constructor(rawGeneration: any) {
    this.rawGeneration = rawGeneration;
  }

  update(params: Partial<GenerationParams>): void {
    if (!this.rawGeneration) return;
    try {
      const updatePayload: Record<string, unknown> = {};
      if (params.output !== undefined) {
        updatePayload.output = sanitizeForTrace(params.output);
      }
      if (params.usage) {
        updatePayload.usage = {
          promptTokens: params.usage.promptTokens,
          completionTokens: params.usage.completionTokens,
          totalTokens: params.usage.totalTokens,
        };
      }
      if (params.usageType || params.metadata) {
        updatePayload.metadata = sanitizeForTrace({
          ...(params.metadata ?? {}),
          ...(params.usageType ? { usageAccountingType: params.usageType } : {}),
        });
      }
      if (params.endTime) {
        updatePayload.endTime = params.endTime instanceof Date ? params.endTime : new Date(params.endTime);
      }
      this.rawGeneration.update(updatePayload);
    } catch (err) {
      console.warn('[observability] generation.update 异常 (容错忽略):', err);
    }
  }

  end(): void {
    if (!this.rawGeneration) return;
    try {
      if (typeof this.rawGeneration.end === 'function') {
        this.rawGeneration.end();
      }
    } catch (err) {
      console.warn('[observability] generation.end 异常 (容错忽略):', err);
    }
  }
}

class LiveSpan implements ObservabilitySpan {
  private rawSpan: any;

  constructor(rawSpan: any) {
    this.rawSpan = rawSpan;
  }

  update(params: Partial<SpanParams>): void {
    if (!this.rawSpan) return;
    try {
      const updatePayload: Record<string, unknown> = {};
      if (params.output !== undefined) {
        updatePayload.output = sanitizeForTrace(params.output);
      }
      if (params.status !== undefined) {
        updatePayload.statusMessage = params.status;
      }
      if (params.metadata || params.durationMs !== undefined) {
        updatePayload.metadata = sanitizeForTrace({
          ...(params.metadata ?? {}),
          ...(params.durationMs !== undefined ? { durationMs: params.durationMs } : {}),
        });
      }
      if (params.endTime) {
        updatePayload.endTime = params.endTime instanceof Date ? params.endTime : new Date(params.endTime);
      }
      this.rawSpan.update(updatePayload);
    } catch (err) {
      console.warn('[observability] span.update 异常 (容错忽略):', err);
    }
  }

  end(): void {
    if (!this.rawSpan) return;
    try {
      if (typeof this.rawSpan.end === 'function') {
        this.rawSpan.end();
      }
    } catch (err) {
      console.warn('[observability] span.end 异常 (容错忽略):', err);
    }
  }
}

class LiveTrace implements ObservabilityTrace {
  readonly traceId: string;
  private rawTrace: any;

  constructor(traceId: string, rawTrace: any) {
    this.traceId = traceId;
    this.rawTrace = rawTrace;
  }

  generation(params: GenerationParams): ObservabilityGeneration {
    try {
      const sanitizedInput = sanitizeForTrace(params.input);
      const sanitizedOutput = params.output !== undefined ? sanitizeForTrace(params.output) : undefined;
      const metadata = sanitizeForTrace({
        ...(params.metadata ?? {}),
        usageAccountingType: params.usageType ?? 'actual',
        // 价格版本与估算元数据独立记录，不与实测混用
        priceBookVersion: '2026.1',
      });

      const raw = this.rawTrace.generation({
        name: params.name,
        model: params.model,
        input: sanitizedInput,
        output: sanitizedOutput,
        usage: params.usage
          ? {
              promptTokens: params.usage.promptTokens,
              completionTokens: params.usage.completionTokens,
              totalTokens: params.usage.totalTokens,
            }
          : undefined,
        metadata,
        startTime: params.startTime ? (params.startTime instanceof Date ? params.startTime : new Date(params.startTime)) : undefined,
        endTime: params.endTime ? (params.endTime instanceof Date ? params.endTime : new Date(params.endTime)) : undefined,
      });

      return new LiveGeneration(raw);
    } catch (err) {
      console.warn('[observability] trace.generation 异常，回退 no-op:', err);
      return new NoopGeneration();
    }
  }

  span(params: SpanParams): ObservabilitySpan {
    try {
      const sanitizedInput = sanitizeForTrace(params.input);
      const sanitizedOutput = params.output !== undefined ? sanitizeForTrace(params.output) : undefined;
      const metadata = sanitizeForTrace({
        ...(params.metadata ?? {}),
        ...(params.durationMs !== undefined ? { durationMs: params.durationMs } : {}),
      });

      const raw = this.rawTrace.span({
        name: params.name,
        input: sanitizedInput,
        output: sanitizedOutput,
        statusMessage: params.status,
        metadata,
        startTime: params.startTime ? (params.startTime instanceof Date ? params.startTime : new Date(params.startTime)) : undefined,
        endTime: params.endTime ? (params.endTime instanceof Date ? params.endTime : new Date(params.endTime)) : undefined,
      });

      return new LiveSpan(raw);
    } catch (err) {
      console.warn('[observability] trace.span 异常，回退 no-op:', err);
      return new NoopSpan();
    }
  }

  update(params: { output?: unknown; metadata?: Record<string, unknown> }): void {
    try {
      const payload: Record<string, unknown> = {};
      if (params.output !== undefined) {
        payload.output = sanitizeForTrace(params.output);
      }
      if (params.metadata !== undefined) {
        payload.metadata = sanitizeForTrace(params.metadata);
      }
      this.rawTrace.update(payload);
    } catch (err) {
      console.warn('[observability] trace.update 异常 (容错忽略):', err);
    }
  }

  end(): void {
    // trace 不需要显式 end，但在某些流式场景支持记录完成
  }
}

/**
 * 创建 Root Trace 观察实例。
 * 当可观测性未配置时，自动返回 No-op 对象；
 * 当配置了环境变量时，创建真正的 Langfuse Trace，并在 Trace 元数据中关联 runId 与 conversationId。
 */
export function createRootTrace(options: CreateTraceOptions): ObservabilityTrace {
  const client = getLangfuseClient();
  const traceId = options.traceId || `trace-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  if (!client) {
    return new NoopTrace(traceId);
  }

  try {
    const rawTrace = client.trace({
      id: traceId,
      name: options.name || 'agent-chat-root',
      userId: options.userId,
      sessionId: options.conversationId, // 会话聚合标识
      input: sanitizeForTrace(options.input),
      tags: options.tags || ['agent-rag'],
      metadata: sanitizeForTrace({
        ...(options.metadata ?? {}),
        runId: options.runId,
        conversationId: options.conversationId,
      }),
    });

    return new LiveTrace(traceId, rawTrace);
  } catch (err) {
    console.warn('[observability] 创建 Root Trace 异常，降级为 no-op:', err);
    return new NoopTrace(traceId);
  }
}

/**
 * 刷新可观测事件队列。
 * 在每次 Agent 会话结束或请求响应流关闭后调用，确保异步上报不丢失。
 */
export async function flushObservability(): Promise<void> {
  const client = getLangfuseClient();
  if (!client) {
    return;
  }

  try {
    if (typeof client.flushAsync === 'function') {
      await client.flushAsync();
    }
  } catch (err) {
    console.warn('[observability] Langfuse flush 异常 (容错忽略):', err);
  }
}
