/**
 * 用户自定义 Webhook 工具到 AgentToolSpec 适配器（spec §4.4 / §4.5 / D-三期-6）
 *
 * 核心职责：
 * 1. 将数据库中查询出的 UserWebhookTool 记录适配为 AgentToolSpec；
 * 2. 模型侧命名空间加前缀：name = 'wh_' + callName，杜绝与内置工具/未来工具冲突；
 * 3. 描述与参数定义：description 为用户设置文案，parameters 由 buildZodSchemaFromParams 确定性生成；
 * 4. 闭包上限拦截：以请求为生命周期构建快照，闭包内计数器控制每请求最多调用 3 次（AGENT_MAX_WEBHOOK_CALLS）；
 *    先判后增控制实际派发次数，达到上限直接拦截，返回模型与前端可读的「次数已用完」文案，并异步写入 outcome='skipped' 审计；
 * 5. 状态暴露：暴露 getWebhookCallsCount getter，供流完成回调（onFinish）将实际派发调用次数带入结算元数据。
 */

import type { UserWebhookTool } from '@repo/db';
import { AGENT_MAX_WEBHOOK_CALLS } from '../agent-config';
import type {
  AgentToolSpec,
  ToolExecutionContext,
  ToolExecutionResult,
  ToolRegistry,
} from '@/lib/agent/registry';
import { getDefaultToolRegistry } from './index';
import { buildZodSchemaFromParams } from '@/lib/webhook/param-schema';
import { executeWebhookTool, tryExtractHostname, writeAuditRecord } from '@/lib/webhook/executor';

/** 用户自定义 Webhook 工具快照对象 */
export interface UserWebhookToolsSnapshot {
  /** 合并后的工具注册表（内置工具 + 用户自定义 Webhook 工具） */
  registry: ToolRegistry;
  /** 获取本次请求已发起的 Webhook 调用次数（供 onFinish 结算 metadata 读取） */
  getWebhookCallsCount: () => number;
}

/**
 * 为单个用户 Webhook 工具记录创建 AgentToolSpec 规格定义。
 *
 * @param record 用户 Webhook 工具数据库实体
 * @param onBeforeExecute 执行前回调（用于闭包计数与上限拦截）
 */
function createWebhookToolSpec(
  record: UserWebhookTool,
  onBeforeExecute: (
    ctx: ToolExecutionContext
  ) => Promise<{ allow: true } | { allow: false; result: ToolExecutionResult }>
): AgentToolSpec {
  const schema = buildZodSchemaFromParams(record.params);

  return {
    name: `wh_${record.callName}`,
    description: record.description,
    parameters: schema,
    execute: async (args: unknown, ctx: ToolExecutionContext): Promise<ToolExecutionResult> => {
      // 1. 闭包上限拦截检查
      const check = await onBeforeExecute(ctx);
      if (!check.allow) {
        return check.result;
      }

      // 2. 委派真实 Webhook 执行器（含安全红线、DNS 重绑定防御、凭证解密与全量审计）
      const result = await executeWebhookTool(record, args, {
        userId: ctx.userId,
        signal: ctx.signal,
        errorId: ctx.errorId,
      });

      return {
        ok: result.ok,
        contentForModel: result.contentForModel,
        summaryForDisplay: result.summaryForDisplay,
      };
    },
  };
}

/**
 * 创建针对单次请求的用户自定义 Webhook 工具快照。
 *
 * @param userTools 用户已启用的 Webhook 工具列表
 * @param baseRegistry 基础内置工具注册表，缺省时使用 getDefaultToolRegistry()
 * @returns 包含合并注册表与计数 getter 的快照对象
 */
export function createUserWebhookToolsSnapshot(
  userTools: UserWebhookTool[],
  baseRegistry: ToolRegistry = getDefaultToolRegistry()
): UserWebhookToolsSnapshot {
  // 过滤仅保留已启用的工具（双重防线）
  const activeTools = userTools.filter((tool) => tool.enabled);

  // 无用户工具时直接复用基础注册表单例，零额外开销
  if (activeTools.length === 0) {
    return {
      registry: baseRegistry,
      getWebhookCallsCount: () => 0,
    };
  }

  // 本请求生命周期内的 Webhook 调用闭包计数器
  let webhookCallsCount = 0;

  const userToolSpecs: AgentToolSpec[] = [];
  for (const record of activeTools) {
    try {
      const spec = createWebhookToolSpec(record, async (ctx) => {
        // 先判后增：达到每请求上限时拦截执行（spec D-三期-6），计数语义为实际派发次数
        if (webhookCallsCount >= AGENT_MAX_WEBHOOK_CALLS) {
          const hostname = tryExtractHostname(record.url);
          await writeAuditRecord({
            userId: ctx.userId,
            toolId: record.id,
            hostname,
            method: record.method,
            statusCode: null,
            durationMs: 0,
            responseBytes: 0,
            outcome: 'skipped',
            errorKind: null,
          });

          return {
            allow: false,
            result: {
              ok: false,
              contentForModel: `本次对话的 webhook 调用次数已用完（${AGENT_MAX_WEBHOOK_CALLS} 次），请基于已有内容作答`,
              summaryForDisplay: `未执行：webhook 调用次数已用完（${AGENT_MAX_WEBHOOK_CALLS} 次）`,
            },
          };
        }

        webhookCallsCount++;
        return { allow: true };
      });
      userToolSpecs.push(spec);
    } catch (error) {
      console.warn(`[agent] 用户 Webhook 工具「${record.name}」转换失败，已忽略:`, error);
    }
  }

  const userMap = new Map<string, AgentToolSpec>();
  for (const spec of userToolSpecs) {
    userMap.set(spec.name, spec);
  }

  // 合并注册表：优先匹配用户工具，其次回落内置工具
  const mergedRegistry: ToolRegistry = {
    get: (name: string) => userMap.get(name) ?? baseRegistry.get(name),
    list: () => [...baseRegistry.list(), ...userToolSpecs],
    has: (name: string) => userMap.has(name) || baseRegistry.has(name),
  };

  return {
    registry: mergedRegistry,
    getWebhookCallsCount: () => webhookCallsCount,
  };
}
