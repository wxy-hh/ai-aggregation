import type { MemoryIndexJobData } from '@repo/queue';

export interface MemoryIndexQueueLike {
  add: (
    name: string,
    data: MemoryIndexJobData,
    options: Record<string, unknown>
  ) => Promise<unknown>;
}

/**
 * 为同一会话追加一次非冲突的追赶任务（ADR-0058）。
 * 不能复用 `memory-index-${sessionId}`：原任务仍在 active 时 BullMQ 会丢弃同名 add。
 */
export async function dispatchMemoryCatchup(
  queue: MemoryIndexQueueLike,
  data: MemoryIndexJobData
): Promise<void> {
  await queue.add('memory-index', data, {
    jobId: `memory-index-${data.sessionId}-catchup-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    removeOnComplete: true,
  });
}
