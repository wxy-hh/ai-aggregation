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
    // 启动所有 workers
    await Promise.all([sttWorker.run(), pptWorker.run(), imageWorker.run()]);

    logger.info('所有 Workers 已启动');
  } catch (error) {
    isRunning = false;
    throw error;
  }

  // 优雅关闭
  process.on('SIGTERM', async () => {
    logger.info('收到 SIGTERM 信号，开始关闭...');
    await Promise.all([sttWorker.close(), pptWorker.close(), imageWorker.close()]);
    isRunning = false;
    process.exit(0);
  });
}

main().catch((error) => {
  logger.error('Worker 启动失败', error);
  isRunning = false;
  process.exit(1);
});
