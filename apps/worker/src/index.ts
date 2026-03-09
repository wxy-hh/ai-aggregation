import { logger } from '@repo/logger';
import { sttWorker } from './workers/stt';
import { pptWorker } from './workers/ppt';
import { imageWorker } from './workers/image';

let isRunning = false;

async function main() {
  if (isRunning) {
    logger.warn('Worker 服务已在运行中，跳过重复启动');
    return;
  }

  logger.info('启动 Worker 服务...');
  isRunning = true;

  try {
    // 检查 Worker 是否已经在运行（开发模式热重载场景）
    const workers = [sttWorker, pptWorker, imageWorker];
    const runningWorkers = workers.filter((w) => w.isRunning());

    if (runningWorkers.length > 0) {
      logger.info('检测到已运行的 Workers，先关闭它们...');
      await Promise.all(runningWorkers.map((w) => w.close()));
      // 等待一小段时间确保完全关闭
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // 启动所有 workers
    await Promise.all([sttWorker.run(), pptWorker.run(), imageWorker.run()]);

    logger.info('所有 Workers 已启动');
  } catch (error) {
    isRunning = false;
    logger.error('Worker 启动失败', error instanceof Error ? error : new Error(String(error)));
    throw error;
  }

  // 优雅关闭
  const shutdown = async () => {
    logger.info('收到关闭信号，开始关闭...');
    await Promise.all([sttWorker.close(), pptWorker.close(), imageWorker.close()]);
    isRunning = false;
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((error) => {
  logger.error('Worker 启动失败', error);
  isRunning = false;
  process.exit(1);
});
