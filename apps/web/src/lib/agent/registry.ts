/**
 * Agent 工具注册表（spec §5.3）
 *
 * 本文件位于 lib 层，禁止 import `@/app/**` 下任何模块（分层守卫）。
 *
 * 工具协议：每个工具声明 name / description / parameters(zod) / execute，
 * 新增工具只需注册一条 spec，编排层（agent-runner）无需改动 —— 开放的扩展点。
 *
 * 架构分工（ADR-0008 / ADR-0009）：
 * - 本注册表管理平台本地执行的自有工具（带 execute 实现）；
 * - 服务端执行工具（如 Ark web_search）由 ToolStreamProjector 在事件流层统一投影与动作规约，
 *   无需注册到本表，抹平双轨差异。
 *
 * parameters 用 zod 声明：既作服务端入参校验的唯一真源，又在交给
 * Vercel AI SDK 时经 zodSchema() 转为模型可见的 JSON Schema（避免双份定义漂移）。
 */

import type { z } from 'zod';
export { ToolError } from './tool-error';

/** 工具执行上下文（由编排层注入） */
export interface ToolExecutionContext {
  userId: string;
  /** 用户中断信号：工具执行需尽早响应中止（spec §7） */
  signal: AbortSignal;
  /** 本次请求的错误追踪 id（日志用） */
  errorId: string;
}

/** 工具执行结果（服务端内部结构） */
export interface ToolExecutionResult {
  /** 是否成功；失败时仍须给出可读的 contentForModel（供模型向用户解释） */
  ok: boolean;
  /** 进模型上下文的完整内容（未截断，由 tool-policy 统一按上限截断） */
  contentForModel: string;
  /** 下发前端事件的展示摘要（截断由 tool-policy 负责） */
  summaryForDisplay: string;
  /** 图像类工具的附件（进 Message.attachments，复用前端既有渲染通道） */
  attachment?: { kind: 'image'; url: string };
  /** 结构化切片引用映射字典（进 Message.citations，供前端直达溯源抽屉） */
  citations?: Record<number, import('@/lib/rag/hybrid-retrieval').CitationAnchor>;
}

/** 工具规格 */
export interface AgentToolSpec {
  /** 唯一工具名（模型可见，蛇形命名） */
  name: string;
  /** 给模型看的工具说明（中文） */
  description: string;
  /** 入参 schema（zod） */
  parameters: z.ZodType;
  /**
   * 单次执行超时（毫秒）。缺省时回落到 `ToolPolicy.timeoutMs`。
   * 供耗时量级明显高于其它工具者声明（如文生图实测 10.7–13.9s，远超通用 15s 的合理余量）。
   */
  timeoutMs?: number;
  /** 执行工具；抛出的 ToolError 会被 policy 原样透传给用户文案 */
  execute(args: unknown, ctx: ToolExecutionContext): Promise<ToolExecutionResult>;
}

export interface ToolRegistry {
  /** 按名查找工具 */
  get(name: string): AgentToolSpec | undefined;
  /** 全部工具（交给模型时使用） */
  list(): AgentToolSpec[];
  /** 是否已注册 */
  has(name: string): boolean;
}

/** 创建工具注册表；重名时后者覆盖前者并告警，避免静默丢失 */
export function createToolRegistry(specs: AgentToolSpec[]): ToolRegistry {
  const map = new Map<string, AgentToolSpec>();
  for (const spec of specs) {
    if (map.has(spec.name)) {
      console.warn(`[agent] 工具重名，后者覆盖前者: ${spec.name}`);
    }
    map.set(spec.name, spec);
  }
  return {
    get: (name) => map.get(name),
    list: () => [...map.values()],
    has: (name) => map.has(name),
  };
}

/** 参数校验结果 */
export type ToolArgsValidation =
  | { ok: true; args: unknown }
  | { ok: false; reason: string };

/**
 * 用工具的 zod schema 校验模型给出的参数。
 * 失败时给出可读原因（会作为工具失败文案回给模型，帮助其修正重试）。
 */
export function validateToolArgs(spec: AgentToolSpec, rawArgs: unknown): ToolArgsValidation {
  const parsed = spec.parameters.safeParse(rawArgs);
  if (parsed.success) {
    return { ok: true, args: parsed.data };
  }
  const first = parsed.error.issues[0];
  const path = first?.path?.length ? `${first.path.join('.')}: ` : '';
  return { ok: false, reason: `参数校验失败（${path}${first?.message ?? '不符合要求'}）` };
}
