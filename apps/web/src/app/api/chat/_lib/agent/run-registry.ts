/**
 * 运行注册表（LiveRun / RunEventLog）— ADR-0061 / 工单 01
 *
 * 进程内存是运行态唯一真源：
 * - 一次 Agent 执行对应一个 LiveRun，持有完整 SSE 事件帧、中止信号与归属信息；
 * - 订阅在同一同步调用内取得「历史帧快照 + 订阅内游标」并完成回调注册，避免事件间隙；
 * - 终态后保留一段时间供重连消费，全局与活跃运行均有上限；
 * - 不写数据库、不写 Redis、不支持跨进程读取。
 *
 * 本模块只负责运行态存储与订阅，不解析 SSE 语义，也不负责结算。
 */

/** 运行注册表上限配置 */
export interface RunRegistryLimits {
  /** 终态后保留时长（毫秒） */
  retentionMs: number;
  /** 全部 run（活跃 + 终态）数量上限 */
  maxRuns: number;
  /** 全部 run 日志字节上限 */
  maxBytes: number;
  /** 活跃 run 数量上限 */
  maxActiveRuns: number;
  /** 活跃 run 日志字节上限 */
  maxActiveBytes: number;
  /** 单 run 日志软上限（超出只告警，不截断） */
  maxRunBytes: number;
}

/** 默认上限：30 分钟保留、128 个 / 64MB 全局、16 个 / 32MB 活跃、单 run 8MB 软上限 */
export const DEFAULT_RUN_REGISTRY_LIMITS: Readonly<RunRegistryLimits> = Object.freeze({
  retentionMs: 30 * 60 * 1000,
  maxRuns: 128,
  maxBytes: 64 * 1024 * 1024,
  maxActiveRuns: 16,
  maxActiveBytes: 32 * 1024 * 1024,
  maxRunBytes: 8 * 1024 * 1024,
});

/** 运行状态；只有 running 可继续追加帧 */
export type LiveRunStatus = 'running' | 'completed' | 'aborted' | 'failed';

/** 终态集合 */
type TerminalStatus = Exclude<LiveRunStatus, 'running'>;

/** 订阅句柄：历史帧快照、当前状态与取消函数 */
export interface RunSubscription {
  frames: Uint8Array[];
  status: LiveRunStatus;
  unsubscribe(): void;
}

/** 运行句柄：编排器只通过它追加帧、标记终态与获取中止信号 */
export interface LiveRunHandle {
  runId: string;
  userId: string;
  conversationId: string;
  controller: AbortController;
  append(frame: Uint8Array): void;
  finalize(status: TerminalStatus): void;
}

/** 运行态检视结果（测试与观测用） */
export interface RunInspection {
  status: LiveRunStatus;
  settledAt?: number;
  bytes: number;
}

/** 主动中止结果 */
export type RunAbortResult =
  | { outcome: 'aborted' }
  | { outcome: 'already_terminal'; status: LiveRunStatus }
  | { outcome: 'forbidden' }
  | { outcome: 'not_found' };

/** 运行注册表公开接口 */
export interface RunRegistry {
  /**
   * 创建运行；活跃上限已满时返回 null（调用方决定拒绝语义）。
   */
  start(input: { userId: string; conversationId: string }): LiveRunHandle | null;
  /**
   * 原子订阅：同步返回历史帧快照并注册后续回调。
   * 非归属用户、run 不存在或已过期返回 null。
   */
  subscribe(
    runId: string,
    userId: string,
    onFrame: (frame: Uint8Array) => void
  ): RunSubscription | null;
  /** 查询某会话当前的活跃 run */
  getActiveByConversation(conversationId: string): { runId: string; userId: string } | null;
  /** 查询运行归属用户（不存在或已过期返回 null） */
  ownerOf(runId: string): string | null;
  /** 是否仍有活跃运行容量（供配额预留前拒绝过载请求） */
  hasCapacity(): boolean;
  /** 主动中止：只触发信号，终态由运行器收尾后写入 */
  abort(runId: string, userId: string): RunAbortResult;
  /** 检视运行态（不存在或已过期返回 null） */
  inspect(runId: string): RunInspection | null;
  /** 当前注册表内的 run 数量（含终态保留期内的 run） */
  size(): number;
}

interface RunRecord {
  runId: string;
  userId: string;
  conversationId: string;
  status: LiveRunStatus;
  frames: Uint8Array[];
  bytes: number;
  controller: AbortController;
  subscribers: Set<(frame: Uint8Array) => void>;
  lastAccessAt: number;
  settledAt?: number;
  overLimitWarned: boolean;
}

export interface RunRegistryDeps {
  /** 时钟注入（测试用） */
  now?: () => number;
  /** runId 生成器注入（测试用）；缺省使用 crypto.randomUUID */
  createRunId?: () => string;
  /** 上限覆盖 */
  limits?: Partial<RunRegistryLimits>;
  /** 告警日志注入 */
  logger?: { warn: (...args: unknown[]) => void };
}

/** 创建运行注册表；每次调用创建独立实例 */
export function createRunRegistry(deps: RunRegistryDeps = {}): RunRegistry {
  const now = deps.now ?? Date.now;
  const createRunId =
    deps.createRunId ??
    (() =>
      globalThis.crypto?.randomUUID?.() ??
      `run-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const logger = deps.logger ?? console;
  const limits: RunRegistryLimits = { ...DEFAULT_RUN_REGISTRY_LIMITS, ...deps.limits };
  const runs = new Map<string, RunRecord>();

  const activeStats = () => {
    let count = 0;
    let bytes = 0;
    for (const record of runs.values()) {
      if (record.status === 'running') {
        count += 1;
        bytes += record.bytes;
      }
    }
    return { count, bytes };
  };

  /** 清理过期终态并按全局上限淘汰最久未访问的终态 run */
  const purge = () => {
    const current = now();
    for (const [runId, record] of runs) {
      if (
        record.status !== 'running' &&
        record.settledAt !== undefined &&
        current - record.settledAt >= limits.retentionMs
      ) {
        runs.delete(runId);
      }
    }

    while (runs.size > limits.maxRuns || totalBytes() > limits.maxBytes) {
      let victimId: string | null = null;
      let victimAccess = Number.POSITIVE_INFINITY;
      for (const [runId, record] of runs) {
        if (record.status === 'running') continue;
        if (record.lastAccessAt < victimAccess) {
          victimAccess = record.lastAccessAt;
          victimId = runId;
        }
      }
      // 没有终态可淘汰时停止：活跃 run 永不因全局上限被静默删除
      if (victimId === null) break;
      runs.delete(victimId);
    }
  };

  const totalBytes = () => {
    let bytes = 0;
    for (const record of runs.values()) bytes += record.bytes;
    return bytes;
  };

  return {
    start({ userId, conversationId }) {
      purge();
      const active = activeStats();
      if (
        active.count >= limits.maxActiveRuns ||
        active.bytes >= limits.maxActiveBytes
      ) {
        logger.warn('[run-registry] 活跃运行已达上限，拒绝创建新运行', {
          activeCount: active.count,
          activeBytes: active.bytes,
        });
        return null;
      }

      const runId = createRunId();
      const record: RunRecord = {
        runId,
        userId,
        conversationId,
        status: 'running',
        frames: [],
        bytes: 0,
        controller: new AbortController(),
        subscribers: new Set(),
        lastAccessAt: now(),
        overLimitWarned: false,
      };
      runs.set(runId, record);

      return {
        runId,
        userId,
        conversationId,
        controller: record.controller,
        append(frame) {
          if (record.status !== 'running') return;
          record.frames.push(frame);
          record.bytes += frame.byteLength;
          record.lastAccessAt = now();

          if (!record.overLimitWarned && record.bytes > limits.maxRunBytes) {
            record.overLimitWarned = true;
            logger.warn('[run-registry] 单 run 事件日志超过软上限，继续保留不截断', {
              runId,
              bytes: record.bytes,
              maxRunBytes: limits.maxRunBytes,
            });
          }

          // 订阅者异常不得影响运行主流程
          for (const subscriber of [...record.subscribers]) {
            try {
              subscriber(frame);
            } catch (error) {
              record.subscribers.delete(subscriber);
              logger.warn('[run-registry] 订阅回调异常，已移除该订阅', {
                runId,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        },
        finalize(status) {
          if (record.status !== 'running') return;
          record.status = status;
          record.settledAt = now();
          record.lastAccessAt = record.settledAt;
          // 终态帧已通过 append 投递；清理订阅，避免长时间持有引用
          record.subscribers.clear();
        },
      };
    },

    subscribe(runId, userId, onFrame) {
      purge();
      const record = runs.get(runId);
      if (!record || record.userId !== userId) return null;

      record.lastAccessAt = now();
      // 同一同步调用内完成「快照 + 注册」：此间不会有其他帧插入
      const frames = [...record.frames];
      if (record.status === 'running') {
        record.subscribers.add(onFrame);
      }

      return {
        frames,
        status: record.status,
        unsubscribe: () => {
          record.subscribers.delete(onFrame);
        },
      };
    },

    getActiveByConversation(conversationId) {
      purge();
      for (const record of runs.values()) {
        if (record.status === 'running' && record.conversationId === conversationId) {
          return { runId: record.runId, userId: record.userId };
        }
      }
      return null;
    },

    ownerOf(runId) {
      purge();
      return runs.get(runId)?.userId ?? null;
    },

    hasCapacity() {
      purge();
      const active = activeStats();
      return active.count < limits.maxActiveRuns && active.bytes < limits.maxActiveBytes;
    },

    abort(runId, userId) {
      purge();
      const record = runs.get(runId);
      if (!record) return { outcome: 'not_found' };
      if (record.userId !== userId) return { outcome: 'forbidden' };
      if (record.status !== 'running') {
        return { outcome: 'already_terminal', status: record.status };
      }
      record.lastAccessAt = now();
      record.controller.abort();
      return { outcome: 'aborted' };
    },

    inspect(runId) {
      purge();
      const record = runs.get(runId);
      if (!record) return null;
      return {
        status: record.status,
        ...(record.settledAt !== undefined ? { settledAt: record.settledAt } : {}),
        bytes: record.bytes,
      };
    },

    size() {
      purge();
      return runs.size;
    },
  };
}

let defaultRegistry: RunRegistry | null = null;

/** 进程内默认注册表单例（路由与运行时共用） */
export function getDefaultRunRegistry(): RunRegistry {
  if (!defaultRegistry) {
    defaultRegistry = createRunRegistry();
  }
  return defaultRegistry;
}

/** 仅测试使用：重置默认单例，避免跨用例串状态 */
export function resetDefaultRunRegistryForTests(): void {
  defaultRegistry = null;
}
