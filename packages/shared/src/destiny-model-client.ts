// ============================================
// Destiny 多模型调用抽象层（服务端）
// --------------------------------------------
// 统一封装两套协议：
//   - doubao  ：火山方舟 Responses API（POST {baseUrl}/responses）
//   - deepseek：DeepSeek 官方 Chat Completions（POST {baseUrl}/chat/completions）
// 提供非流式 callModel、流式 streamModel、配置解析 resolveModelConfig、
// 错误映射 mapModelError、用量归一 normalizeModelUsage。
//
// 安全约定：密钥仅来自 process.env；错误信息不回显任何 key；非 2xx 不向上游回显 errText。
// ============================================

// ─── 类型 ───

export type DestinyProvider = 'doubao' | 'deepseek';

export type ModelProtocol = 'ark-responses' | 'deepseek-chat';

export type ModelMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ModelConfig = {
  provider: DestinyProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  protocol: ModelProtocol;
};

export type ModelUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type ModelStreamEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'done'; usage: ModelUsage | null; rawUsage?: unknown }
  | { type: 'error'; error: string };

export type JsonSchemaRef = {
  name: string;
  schema: Record<string, unknown>;
};

export type CallModelOptions = {
  config: ModelConfig;
  messages: ModelMessage[];
  maxTokens: number;
  temperature?: number;
  timeoutMs: number;
  json?: { schema?: JsonSchemaRef };
};

export type CallModelResult = {
  text: string;
  usage: ModelUsage | null;
  raw: unknown;
  /** 结束原因：doubao 取 incomplete_details.reason；deepseek 取 choices[0].finish_reason。调用方可据此做截断重试。 */
  finishReason?: string;
};

export type StreamModelOptions = {
  config: ModelConfig;
  messages: ModelMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs: number;
  json?: { schema?: JsonSchemaRef };
};

// ─── 默认配置 ───

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';
const DEEPSEEK_DEFAULT_MODEL = 'deepseek-v4-flash';
const ARK_DEFAULT_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const ARK_DEFAULT_MODEL = 'doubao-seed-2-1-pro-260628';

// ─── 错误类型 ───

export class ModelConfigError extends Error {
  readonly status = 500;
  constructor(message: string) {
    super(message);
    this.name = 'ModelConfigError';
  }
}

export class ModelUpstreamError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ModelUpstreamError';
    this.status = status;
  }
}

// ─── 配置解析 ───

/**
 * 根据 provider 解析上游配置。
 * - deepseek：baseUrl=https://api.deepseek.com/v1，model=deepseek-v4-flash，apiKey=DEEPSEEK_MODEL（承载官方 apikey）。
 * - doubao  ：baseUrl=ARK_BASE_URL(默认火山方舟)，model=ARK_DESTINY_MODEL(默认 doubao-seed-2-1-pro-260628)，apiKey=ARK_API_KEY。
 * 缺 key 抛 ModelConfigError（message 不含 key 值）。
 */
export function resolveModelConfig(
  provider: DestinyProvider,
  env: NodeJS.ProcessEnv = process.env
): ModelConfig {
  if (provider === 'deepseek') {
    const apiKey = env.DEEPSEEK_MODEL;
    if (!apiKey) {
      throw new ModelConfigError('DeepSeek 模型未配置（缺少 DEEPSEEK_MODEL）');
    }
    return {
      provider,
      baseUrl: DEEPSEEK_BASE_URL,
      apiKey,
      model: DEEPSEEK_DEFAULT_MODEL,
      protocol: 'deepseek-chat',
    };
  }

  const apiKey = env.ARK_API_KEY;
  if (!apiKey) {
    throw new ModelConfigError('doubao 模型未配置（缺少 ARK_API_KEY）');
  }
  return {
    provider: 'doubao',
    baseUrl: env.ARK_BASE_URL || ARK_DEFAULT_BASE_URL,
    apiKey,
    model: env.ARK_DESTINY_MODEL || ARK_DEFAULT_MODEL,
    protocol: 'ark-responses',
  };
}

// ─── 错误映射 ───

/** 吸收四个 route 的 mapArkError 文案，统一中文提示。 */
export function mapModelError(status: number): string {
  if (status === 401) return '模型鉴权失败，请联系管理员检查密钥';
  if (status === 402) return '模型账户余额不足';
  if (status === 429) return '请求过于频繁，请稍后重试';
  if (status >= 500) return '模型服务暂时不可用，请稍后重试';
  return '模型调用失败，请稍后重试';
}

// ─── 用量归一 ───

function toFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * 兼容 ARK（input_tokens/output_tokens 或 prompt_tokens/completion_tokens）
 * 与 DeepSeek（prompt_tokens/completion_tokens/total_tokens）的 usage 字段。
 */
export function normalizeModelUsage(raw: unknown): ModelUsage | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const prompt = toFiniteNumber(r.prompt_tokens ?? r.input_tokens);
  const completion = toFiniteNumber(r.completion_tokens ?? r.output_tokens);
  const totalExplicit = toFiniteNumber(r.total_tokens);
  const total = totalExplicit ?? (prompt != null || completion != null ? (prompt ?? 0) + (completion ?? 0) : null);

  if (prompt == null && completion == null && total == null) return null;
  return {
    promptTokens: prompt ?? 0,
    completionTokens: completion ?? 0,
    totalTokens: total ?? 0,
  };
}

// ─── 内部：ARK Responses 解析 ───

function extractArkText(result: unknown): string {
  if (!result || typeof result !== 'object') {
    throw new ModelUpstreamError('模型响应为空', 502);
  }
  const payload = result as Record<string, unknown>;
  const topLevelText = payload.output_text;
  if (typeof topLevelText === 'string' && topLevelText.trim()) {
    return topLevelText.trim();
  }
  const output = payload.output;
  if (!Array.isArray(output)) {
    throw new ModelUpstreamError('模型响应格式不合法', 502);
  }
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const typed = item as Record<string, unknown>;
    if (typed.type !== 'message') continue;
    if (typeof typed.content === 'string' && typed.content.trim()) {
      return typed.content.trim();
    }
    if (!Array.isArray(typed.content)) continue;
    for (const content of typed.content) {
      if (!content || typeof content !== 'object') continue;
      const part = content as Record<string, unknown>;
      const partType = part.type;
      const text = part.text;
      if ((partType === 'output_text' || partType === 'text') && typeof text === 'string') {
        const trimmed = text.trim();
        if (trimmed) return trimmed;
      }
      if (partType === 'output_json' && part.json && typeof part.json === 'object') {
        return JSON.stringify(part.json);
      }
    }
  }
  throw new ModelUpstreamError('模型未返回有效文本', 502);
}

function extractArkUsage(result: unknown): unknown {
  if (!result || typeof result !== 'object') return null;
  const payload = result as Record<string, unknown>;
  return (
    payload.usage ??
    (payload.response && typeof payload.response === 'object'
      ? (payload.response as Record<string, unknown>).usage
      : null) ??
    null
  );
}

// ─── 内部：DeepSeek JSON 结构样例注入（plan-review HIGH-1） ───

/**
 * DeepSeek 官方 json_object 为弱约束：要求 prompt 含「json」字样并给出目标结构样例。
 * 当带 json.schema 时，把 schema 序列化为结构样例追加到 system prompt 末尾（doubao 不变）。
 * 不 mutate 入参 messages。
 */
function injectJsonSchemaSample(messages: ModelMessage[], schema: JsonSchemaRef): ModelMessage[] {
  const sampleText =
    '\n\n你必须严格只输出符合下述 JSON 结构的对象，不要包含任何额外文字、不要使用 markdown 代码块：\n' +
    JSON.stringify(schema.schema, null, 2);
  const cloned = messages.map((m) => ({ ...m }));
  const systemIndex = cloned.findIndex((m) => m.role === 'system');
  if (systemIndex >= 0) {
    cloned[systemIndex] = { ...cloned[systemIndex], content: cloned[systemIndex].content + sampleText };
  } else {
    cloned.unshift({ role: 'system', content: sampleText.trimStart() });
  }
  return cloned;
}

// ─── 非流式 callModel ───

async function callArk(opts: CallModelOptions): Promise<CallModelResult> {
  const { config, messages, maxTokens, temperature, timeoutMs, json } = opts;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${config.baseUrl}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        input: messages,
        ...(typeof temperature === 'number' ? { temperature } : {}),
        max_output_tokens: maxTokens,
        reasoning: { effort: 'low' },
        text: json?.schema
          ? { format: { type: 'json_schema', name: json.schema.name, schema: json.schema.schema } }
          : { format: { type: 'json_object' } },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new ModelUpstreamError(mapModelError(response.status), response.status);
    }
    const raw = await response.json();
    const rawRecord = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
    const incompleteDetails = rawRecord?.incomplete_details;
    const finishReason =
      incompleteDetails && typeof incompleteDetails === 'object' &&
      typeof (incompleteDetails as Record<string, unknown>).reason === 'string'
        ? ((incompleteDetails as Record<string, unknown>).reason as string)
        : undefined;
    return {
      text: extractArkText(raw),
      usage: normalizeModelUsage(extractArkUsage(raw)),
      raw,
      finishReason,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callDeepSeek(opts: CallModelOptions): Promise<CallModelResult> {
  const { config, maxTokens, timeoutMs, json } = opts;
  // 思考模式默认开启，不发送 temperature/top_p（文档 §9.2：这些参数不生效）。
  const messages = json?.schema ? injectJsonSchemaSample(opts.messages, json.schema) : opts.messages;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new ModelUpstreamError(mapModelError(response.status), response.status);
    }
    const raw = (await response.json()) as Record<string, unknown>;
    const choices = Array.isArray(raw.choices) ? (raw.choices as Record<string, unknown>[]) : [];
    const message = choices[0]?.message as Record<string, unknown> | undefined;
    const content = typeof message?.content === 'string' ? message.content : '';
    const finishReason =
      typeof choices[0]?.finish_reason === 'string' ? (choices[0].finish_reason as string) : undefined;
    // 空 content / finish_reason==='length' 由调用方走 JSON 兜底，不在此处抛错。
    return {
      text: content,
      usage: normalizeModelUsage(raw.usage),
      raw,
      finishReason,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function callModel(opts: CallModelOptions): Promise<CallModelResult> {
  return opts.config.protocol === 'deepseek-chat' ? callDeepSeek(opts) : callArk(opts);
}

// ─── 流式 streamModel ───

type SseFrame = { data: string };

/** 把 SSE 缓冲切成帧，每帧取 data: 行内容（忽略 ': keep-alive' 注释）。 */
function parseSseFrames(buffer: string): { frames: SseFrame[]; rest: string } {
  const chunks = buffer.split('\n\n');
  const rest = chunks.pop() ?? '';
  const frames: SseFrame[] = [];
  for (const chunk of chunks) {
    const lines = chunk
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const dataLine = lines.find((line) => line.startsWith('data: '));
    if (dataLine) {
      frames.push({ data: dataLine.slice(6) });
    }
  }
  return { frames, rest };
}

async function* streamArk(opts: StreamModelOptions): AsyncGenerator<ModelStreamEvent> {
  const { config, messages, temperature, maxTokens, timeoutMs, json } = opts;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${config.baseUrl}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        input: messages,
        stream: true,
        ...(typeof temperature === 'number' ? { temperature } : {}),
        ...(typeof maxTokens === 'number' ? { max_output_tokens: maxTokens } : {}),
        reasoning: { effort: 'low' },
        ...(json?.schema
          ? { text: { format: { type: 'json_schema', name: json.schema.name, schema: json.schema.schema } } }
          : {}),
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new ModelUpstreamError(mapModelError(response.status), response.status);
    }
    if (!response.body) {
      throw new ModelUpstreamError('模型响应体为空', 502);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let done = false;
    try {
      while (!done) {
        const { done: readerDone, value } = await reader.read();
        if (readerDone) break;
        buffer += decoder.decode(value, { stream: true });
        const { frames, rest } = parseSseFrames(buffer);
        buffer = rest;
        for (const frame of frames) {
          if (!frame.data || frame.data === '[DONE]') {
            done = true;
            break;
          }
          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(frame.data) as Record<string, unknown>;
          } catch {
            continue;
          }
          const type = payload.type;
          if (type === 'response.output_text.delta' && typeof payload.delta === 'string') {
            yield { type: 'text-delta', text: payload.delta };
          } else if (type === 'response.done' || type === 'response.completed' || type === 'response.incomplete') {
            const responseObject =
              payload.response && typeof payload.response === 'object'
                ? (payload.response as Record<string, unknown>)
                : null;
            const rawUsage = responseObject?.usage ?? payload.usage ?? null;
            const usage = normalizeModelUsage(rawUsage);
            yield { type: 'done', usage, rawUsage };
            done = true;
            break;
          } else if (type === 'response.failed' || type === 'error') {
            const errorMessage =
              typeof payload.error === 'string'
                ? payload.error
                : payload.error && typeof payload.error === 'object'
                  ? ((payload.error as Record<string, unknown>).message as string | undefined)
                  : null;
            yield { type: 'error', error: errorMessage || '模型调用失败，请稍后重试' };
            done = true;
            break;
          }
        }
      }
      if (!done) {
        yield { type: 'done', usage: null };
      }
    } finally {
      reader.releaseLock();
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

async function* streamDeepSeek(opts: StreamModelOptions): AsyncGenerator<ModelStreamEvent> {
  const { config, maxTokens, timeoutMs, json } = opts;
  // 思考模式默认开启：只取 delta.content，丢弃 reasoning_content；不发送 temperature。
  const messages = json?.schema ? injectJsonSchemaSample(opts.messages, json.schema) : opts.messages;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: true,
        stream_options: { include_usage: true },
        ...(typeof maxTokens === 'number' ? { max_tokens: maxTokens } : {}),
        ...(json?.schema ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new ModelUpstreamError(mapModelError(response.status), response.status);
    }
    if (!response.body) {
      throw new ModelUpstreamError('模型响应体为空', 502);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let done = false;
    try {
      while (!done) {
        const { done: readerDone, value } = await reader.read();
        if (readerDone) break;
        buffer += decoder.decode(value, { stream: true });
        const { frames, rest } = parseSseFrames(buffer);
        buffer = rest;
        for (const frame of frames) {
          if (frame.data === '[DONE]') {
            yield { type: 'done', usage: null };
            done = true;
            break;
          }
          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(frame.data) as Record<string, unknown>;
          } catch {
            continue;
          }
          // include_usage 末帧：choices 为空、带 usage。
          const usage = normalizeModelUsage(payload.usage ?? null);
          const choices = Array.isArray(payload.choices) ? (payload.choices as Record<string, unknown>[]) : [];
          const delta = choices[0]?.delta as Record<string, unknown> | undefined;
          const content = typeof delta?.content === 'string' ? delta.content : '';
          if (content) {
            yield { type: 'text-delta', text: content };
          }
          if (usage && choices.length === 0) {
            yield { type: 'done', usage, rawUsage: payload.usage ?? null };
            done = true;
            break;
          }
        }
      }
      if (!done) {
        yield { type: 'done', usage: null };
      }
    } finally {
      reader.releaseLock();
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

export function streamModel(opts: StreamModelOptions): AsyncGenerator<ModelStreamEvent> {
  return opts.config.protocol === 'deepseek-chat' ? streamDeepSeek(opts) : streamArk(opts);
}
