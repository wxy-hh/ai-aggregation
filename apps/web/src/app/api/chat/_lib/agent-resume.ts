/**
 * 断点挂载与主动中止路由处理器工厂 — ADR-0061 / 工单 02
 *
 * - GET  /api/chat/agent/resume?runId=...：鉴权与归属校验后，全量重放运行事件日志并转实时；
 * - POST /api/chat/agent/abort：鉴权与归属校验后触发 LiveRun 的中止信号。
 *
 * 两个端点都只在进程内存中查运行态；进程重启、日志过期与非法 runId 统一返回 410。
 */

import { getCurrentUser } from '@/lib/auth/get-current-user';
import { AuthError } from '@/lib/auth/errors';
import { createSseResponse } from './sse';
import { createRunSubscriptionStream } from './agent/run-stream';
import { getDefaultRunRegistry, type RunRegistry } from './agent/run-registry';

const RUN_UNAVAILABLE = '任务已不可用，可重新执行';

export interface AgentResumeHandlerConfig {
  /** 运行注册表注入点；缺省使用进程内单例 */
  runRegistry?: RunRegistry;
  /** 鉴权注入点（测试用）；缺省使用 getCurrentUser */
  getUser?: (req: Request) => Promise<{ id: string }>;
}

function jsonResponse(data: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** 解析登录用户；未登录返回 null */
async function resolveUser(
  req: Request,
  getUser: (req: Request) => Promise<{ id: string }>
): Promise<{ id: string } | null> {
  try {
    return await getUser(req);
  } catch (error) {
    if (error instanceof AuthError) return null;
    throw error;
  }
}

/** 断点挂载处理器工厂 */
export function createAgentResumeHandler(config: AgentResumeHandlerConfig = {}) {
  const getUser = config.getUser ?? getCurrentUser;

  return async function GET(req: Request): Promise<Response> {
    const user = await resolveUser(req, getUser);
    if (!user) {
      return jsonResponse({ error: '请先登录' }, 401);
    }

    const runId = new URL(req.url).searchParams.get('runId')?.trim() ?? '';
    if (!runId) {
      return jsonResponse({ error: RUN_UNAVAILABLE, code: 'RUN_UNAVAILABLE' }, 410);
    }

    const registry = config.runRegistry ?? getDefaultRunRegistry();
    const owner = registry.ownerOf(runId);
    if (!owner) {
      return jsonResponse({ error: RUN_UNAVAILABLE, code: 'RUN_UNAVAILABLE' }, 410);
    }
    if (owner !== user.id) {
      return jsonResponse({ error: '无权访问该任务' }, 403);
    }

    const stream = createRunSubscriptionStream({
      registry,
      runId,
      userId: user.id,
      resumed: true,
      unavailableError: RUN_UNAVAILABLE,
    });
    return createSseResponse(stream);
  };
}

/** 主动中止处理器工厂 */
export function createAgentAbortHandler(config: AgentResumeHandlerConfig = {}) {
  const getUser = config.getUser ?? getCurrentUser;

  return async function POST(req: Request): Promise<Response> {
    const user = await resolveUser(req, getUser);
    if (!user) {
      return jsonResponse({ error: '请先登录' }, 401);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: '请求体不是合法 JSON' }, 400);
    }
    const runId =
      typeof body === 'object' && body !== null && typeof (body as { runId?: unknown }).runId === 'string'
        ? (body as { runId: string }).runId.trim()
        : '';
    if (!runId) {
      return jsonResponse({ error: '缺少 runId' }, 400);
    }

    const registry = config.runRegistry ?? getDefaultRunRegistry();
    const result = registry.abort(runId, user.id);

    switch (result.outcome) {
      case 'aborted':
        return jsonResponse({ success: true, status: 'aborting' }, 200);
      case 'already_terminal':
        return jsonResponse({ success: true, status: result.status }, 200);
      case 'forbidden':
        return jsonResponse({ error: '无权停止该任务' }, 403);
      case 'not_found':
        return jsonResponse({ error: RUN_UNAVAILABLE, code: 'RUN_UNAVAILABLE' }, 410);
    }
  };
}
