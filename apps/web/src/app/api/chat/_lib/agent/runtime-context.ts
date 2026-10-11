/**
 * Agent 运行时上下文深模块（AgentRuntimeContext）— 架构评审 Candidate 04 / ADR-0011
 *
 * 核心职责（把低阶工具脚手架从 HTTP 路由层收归运行时内部）：
 * 1. 按需加载用户自定义 Webhook 工具：缺省查库（enabled=true 且非匿名，spec §4.6），
 *    加载失败降级为「无用户工具」路径，仅告警留痕、不阻断对话；
 * 2. 装配快照：调用 createUserWebhookToolsSnapshot 合并内置工具与用户 Webhook 工具注册表，
 *    并持有每请求生命周期内的调次闭包计数器；
 * 3. 统一产出完成态观测元数据：finishMetadata() 在流完成时读取实际派发次数，
 *    由编排器随 ChatStreamFinish 一次性交付给结算侧，路由层不再触碰闭包 getter。
 *
 * 接口即测试表面：loadUserTools 为可注入数据源（测试替身），baseRegistry 支持注入内存注册表，
 * 全流程可脱离数据库与网络进行确定性验证。
 */

import { prisma, type UserWebhookTool } from '@repo/db';
import { getCapabilityPack } from '@repo/shared';
import { createToolRegistry, type ToolRegistry } from '@/lib/agent/registry';
import { createUserWebhookToolsSnapshot } from './tools/user-webhook';
import { getDefaultToolRegistry } from './tools';

/** 完成态观测元数据（仅观测，不影响计费口径） */
export interface AgentRuntimeFinishMetadata {
  /** 本次请求用户 Webhook 工具实际派发次数（被每请求上限拦截的调用不计入） */
  webhookCalls: number;
}

/** Agent 运行时上下文：工具注册表与结算观测元数据的唯一来源 */
export interface AgentRuntimeContext {
  /** 合并后的工具注册表（内置工具 + 用户自定义 Webhook 工具），供编排器派发 */
  readonly registry: ToolRegistry;
  /** 流完成时索取观测元数据（窄接口：读取运行时内部闭包计数） */
  finishMetadata(): AgentRuntimeFinishMetadata;
}

export interface AgentRuntimeContextOptions {
  /** 当前请求用户 id */
  userId: string;
  /** 日志关联 id（工具加载失败时留痕用） */
  errorId?: string;
  /** 用户工具加载注入点（测试替身 / 自定义数据源），缺省走数据库查询 */
  loadUserTools?: (userId: string) => Promise<UserWebhookTool[]>;
  /** 基础注册表（缺省为内置工具注册表单例），供测试注入内存注册表 */
  baseRegistry?: ToolRegistry;
  /** 可选场景能力包 key（ADR-0014 / 工单 01） */
  capabilityPack?: string;
  /** 会话级临时停用的工具键名列表（ADR-0014 / 工单 02） */
  disabledToolKeys?: string[];
}

/**
 * 默认加载实现：查询该用户已启用的 Webhook 工具（spec §4.6 匿名用户不加载）。
 * 与旧路由层 defaultGetUserTools 行为完全一致，仅归属地迁移至此。
 */
async function defaultLoadUserTools(userId: string): Promise<UserWebhookTool[]> {
  return prisma.userWebhookTool.findMany({
    where: { userId, enabled: true, user: { isAnonymous: false } },
  });
}

/**
 * 创建单次请求的 Agent 运行时上下文。
 *
 * 异步：内部可能发起数据库查询；任何加载异常均被吞掉并降级（不向外抛）。
 */
export async function createAgentRuntimeContext(
  options: AgentRuntimeContextOptions
): Promise<AgentRuntimeContext> {
  const { userId, errorId, loadUserTools, baseRegistry, capabilityPack, disabledToolKeys } = options;

  // 0. 规范化临时停用键名集合（容错清洗非字符串项）
  const disabledSet = new Set(
    Array.isArray(disabledToolKeys)
      ? disabledToolKeys.filter((k): k is string => typeof k === 'string' && Boolean(k.trim()))
      : []
  );

  // 1. 加载用户工具：失败降级为无用户工具（沿用既有告警文案，测试接缝保持不变）
  let userTools: UserWebhookTool[] = [];
  try {
    userTools = (await (loadUserTools ?? defaultLoadUserTools)(userId)) ?? [];
  } catch (error) {
    console.warn('[chat] 加载用户自定义工具失败，按无用户工具继续', {
      errorId,
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    userTools = [];
  }

  // 二次过滤用户自定义 Webhook 工具：剔除被临时停用的工具（支持按 id、callName 或 wh_ 前缀）
  const effectiveUserTools = userTools.filter((tool) => {
    if (disabledSet.has(tool.id)) return false;
    if (disabledSet.has(tool.callName)) return false;
    if (disabledSet.has(`wh_${tool.callName}`)) return false;
    return true;
  });

  // 2. 基础内置工具注册表：依据能力包白名单严格收敛并剔除 disabledToolKeys（双重安全闸门，ADR-0014）
  const initialBaseRegistry = baseRegistry ?? getDefaultToolRegistry();
  let effectiveBaseRegistry = initialBaseRegistry;
  const pack = getCapabilityPack(capabilityPack);
  if (pack || disabledSet.size > 0) {
    const whitelist = pack ? new Set(pack.toolWhitelist) : null;
    const initialSpecs = initialBaseRegistry.list();
    const filteredSpecs = initialSpecs.filter((spec) => {
      if (whitelist && !whitelist.has(spec.name)) return false;
      if (disabledSet.has(spec.name)) return false;
      return true;
    });
    // 仅在实际发生过滤或能力包指定时创建新注册表；若无变化则复用 initialBaseRegistry 保持零开销
    if (filteredSpecs.length !== initialSpecs.length || pack) {
      effectiveBaseRegistry = createToolRegistry(filteredSpecs);
    }
  }

  // 3. 装配快照：合并已收敛的内置工具与用户 Webhook 扩展插槽 + 每请求调次闭包计数器
  const snapshot = createUserWebhookToolsSnapshot(effectiveUserTools, effectiveBaseRegistry);

  // 4. 窄接口暴露：注册表给编排器，观测元数据给完成态结算
  return {
    registry: snapshot.registry,
    finishMetadata: () => ({ webhookCalls: snapshot.getWebhookCallsCount() }),
  };
}
