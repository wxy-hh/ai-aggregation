import { logger } from '@repo/logger';
import { WorkerHeartbeatStore, getRedisConnectionSummary } from '@repo/shared';
import { sttWorker } from './workers/stt';
import { pptWorker } from './workers/ppt';
import { imageWorker } from './workers/image';
import { qimenBaseWorker } from './workers/qimen-base';
import { qimenSectionWorker } from './workers/qimen-section';

let isRunning = false;
let heartbeatTimer: NodeJS.Timeout | null = null;
let isShuttingDown = false;

async function main() {
  if (isRunning) {
    logger.warn('Worker 服务已在运行中，跳过重复启动');
    return;
  }

  logger.info('启动 Worker 服务...', {
    pid: process.pid,
    arkApiKey: process.env.ARK_API_KEY ? 'SET' : 'UNSET',
    redis: getRedisConnectionSummary(process.env),
  });
  isRunning = true;
  const heartbeatStore = new WorkerHeartbeatStore();
  const workers = [sttWorker, pptWorker, imageWorker, qimenBaseWorker, qimenSectionWorker];

  const shutdown = async (exitCode = 0) => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    logger.info('收到关闭信号，开始关闭...');

    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }

    await Promise.allSettled(workers.map((worker) => worker.close()));
    await heartbeatStore.disconnect();
    isRunning = false;
    isShuttingDown = false;
    process.exit(exitCode);
  };

  try {
    // 检查 Worker 是否已经在运行（开发模式热重载场景）
    const runningWorkers = workers.filter((w) => w.isRunning());

    if (runningWorkers.length > 0) {
      logger.info('检测到已运行的 Workers，先关闭它们...');
      await Promise.all(runningWorkers.map((w) => w.close()));
      // 等待一小段时间确保完全关闭
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // BullMQ 的 run 会持续阻塞到 worker 关闭，所以这里改为后台启动，
    // 再单独等待连接 ready，确保能继续写入心跳。
    for (const worker of workers) {
      worker.run().catch((error) => {
        logger.error('Worker 运行失败', error as Error, { queueName: worker.name });
        void shutdown(1);
      });
    }

    await Promise.all(workers.map((worker) => worker.waitUntilReady()));

    logger.info('所有 Workers 已启动');
    await heartbeatStore.beat('apps-worker');
    heartbeatTimer = setInterval(() => {
      void heartbeatStore.beat('apps-worker');
    }, 30_000);
  } catch (error) {
    isRunning = false;
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    await heartbeatStore.disconnect();
    logger.error('Worker 启动失败', error instanceof Error ? error : new Error(String(error)));
    throw error;
  }

  process.on('SIGTERM', () => void shutdown(0));
  process.on('SIGINT', () => void shutdown(0));
}

main().catch((error) => {
  logger.error('Worker 启动失败', error);
  isRunning = false;
  process.exit(1);
});
