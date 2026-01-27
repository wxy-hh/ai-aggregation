import { logger } from '@repo/logger';
import { sttWorker } from './workers/stt';
import { pptWorker } from './workers/ppt';
import { imageWorker } from './workers/image';

async function main() {
  logger.info('启动 Worker 服务...');

  // 启动所有 workers
  await Promise.all([
    sttWorker.run(),
    pptWorker.run(),
    imageWorker.run(),
  ]);

  logger.info('所有 Workers 已启动');

  // 优雅关闭
  process.on('SIGTERM', async () => {
    logger.info('收到 SIGTERM 信号，开始关闭...');
    await Promise.all([
      sttWorker.close(),
      pptWorker.close(),
      imageWorker.close(),
    ]);
    process.exit(0);
  });
}

main().catch((error) => {
  logger.error('Worker 启动失败', error);
  process.exit(1);
});
