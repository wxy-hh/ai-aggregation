/**
 * 并发初始化 Hook
 *
 * 演示如何使用 Promise.all 并发执行多个独立的初始化任务
 * 这是性能优化的最佳实践，可以显著减少总等待时间
 */

import { useEffect, useState } from 'react';
import { executeInParallel } from '@/lib/async-utils';

interface InitStatus {
  isLoading: boolean;
  isReady: boolean;
  errors: Error[];
}

/**
 * 并发执行多个初始化任务
 *
 * @example
 * const { isLoading, isReady, errors } = useParallelInit([
 *   async () => await loadUserPreferences(),
 *   async () => await loadTemplates(),
 *   async () => await loadRecentDocuments()
 * ]);
 */
export function useParallelInit(initTasks: Array<() => Promise<void>>): InitStatus {
  const [isLoading, setIsLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [errors, setErrors] = useState<Error[]>([]);

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      try {
        setIsLoading(true);
        setErrors([]);

        // 使用 Promise.all 并发执行所有初始化任务
        // 这比串行执行快得多
        await executeInParallel(initTasks.map((task) => task()));

        if (isMounted) {
          setIsReady(true);
        }
      } catch (error) {
        if (isMounted) {
          setErrors([error instanceof Error ? error : new Error(String(error))]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    init();

    return () => {
      isMounted = false;
    };
  }, []); // 仅在组件挂载时执行一次

  return { isLoading, isReady, errors };
}

/**
 * 并发执行多个初始化任务，即使部分失败也继续
 * 使用 Promise.allSettled 处理部分失败场景
 *
 * @example
 * const { isLoading, isReady, results } = useParallelInitSettled([
 *   async () => await loadUserPreferences(),
 *   async () => await loadTemplates(),
 *   async () => await loadRecentDocuments()
 * ]);
 */
export function useParallelInitSettled(
  initTasks: Array<() => Promise<void>>
): InitStatus & { results: PromiseSettledResult<void>[] } {
  const [isLoading, setIsLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [results, setResults] = useState<PromiseSettledResult<void>[]>([]);
  const [errors, setErrors] = useState<Error[]>([]);

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      try {
        setIsLoading(true);
        setErrors([]);

        // 使用 Promise.allSettled 并发执行所有任务
        // 即使部分任务失败，其他任务也会继续执行
        const settledResults = await Promise.allSettled(initTasks.map((task) => task()));

        if (isMounted) {
          setResults(settledResults);

          // 收集所有失败的任务
          const failedErrors = settledResults
            .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
            .map((result) =>
              result.reason instanceof Error ? result.reason : new Error(String(result.reason))
            );

          setErrors(failedErrors);
          setIsReady(true); // 即使有失败，也标记为就绪
        }
      } catch (error) {
        // 这个 catch 不应该被触发，因为 allSettled 不会抛出错误
        if (isMounted) {
          setErrors([error instanceof Error ? error : new Error(String(error))]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    init();

    return () => {
      isMounted = false;
    };
  }, []); // 仅在组件挂载时执行一次

  return { isLoading, isReady, errors, results };
}
