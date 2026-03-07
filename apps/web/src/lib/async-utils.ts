/**
 * 异步工具函数
 * 提供并发执行、错误处理等异步操作的辅助函数
 */

/**
 * 并发执行多个独立的异步操作
 * 使用 Promise.all 提高性能
 *
 * @example
 * const [user, posts, comments] = await executeInParallel([
 *   fetchUser(userId),
 *   fetchPosts(userId),
 *   fetchComments(userId)
 * ]);
 */
export async function executeInParallel<T extends readonly unknown[]>(
  promises: readonly [...{ [K in keyof T]: Promise<T[K]> }]
): Promise<T> {
  return Promise.all(promises) as Promise<T>;
}

/**
 * 并发执行多个异步操作，即使部分失败也继续执行
 * 使用 Promise.allSettled 处理部分失败场景
 *
 * @example
 * const results = await executeInParallelSettled([
 *   fetchUser(userId),
 *   fetchPosts(userId),
 *   fetchComments(userId)
 * ]);
 *
 * results.forEach((result, index) => {
 *   if (result.status === 'fulfilled') {
 *     console.log(`任务 ${index} 成功:`, result.value);
 *   } else {
 *     console.error(`任务 ${index} 失败:`, result.reason);
 *   }
 * });
 */
export async function executeInParallelSettled<T extends readonly unknown[]>(
  promises: readonly [...{ [K in keyof T]: Promise<T[K]> }]
): Promise<PromiseSettledResult<T[number]>[]> {
  return Promise.allSettled(promises);
}

/**
 * 并发执行多个异步操作，返回成功的结果和失败的错误
 *
 * @returns { successes: 成功的结果数组, failures: 失败的错误数组 }
 */
export async function executeInParallelWithResults<T>(promises: Promise<T>[]): Promise<{
  successes: T[];
  failures: Error[];
}> {
  const results = await Promise.allSettled(promises);

  const successes: T[] = [];
  const failures: Error[] = [];

  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      successes.push(result.value);
    } else {
      failures.push(
        result.reason instanceof Error ? result.reason : new Error(String(result.reason))
      );
    }
  });

  return { successes, failures };
}

/**
 * 批量执行异步操作，支持并发控制
 *
 * @param items - 要处理的项目数组
 * @param asyncFn - 异步处理函数
 * @param concurrency - 并发数量限制（默认不限制）
 *
 * @example
 * // 并发处理所有用户
 * const results = await batchExecute(userIds, async (userId) => {
 *   return fetchUserData(userId);
 * });
 *
 * // 限制并发数为 3
 * const results = await batchExecute(userIds, fetchUserData, 3);
 */
export async function batchExecute<T, R>(
  items: T[],
  asyncFn: (item: T) => Promise<R>,
  concurrency?: number
): Promise<R[]> {
  if (!concurrency || concurrency >= items.length) {
    // 无并发限制，直接使用 Promise.all
    return Promise.all(items.map(asyncFn));
  }

  // 有并发限制，分批执行
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(asyncFn));
    results.push(...batchResults);
  }

  return results;
}
