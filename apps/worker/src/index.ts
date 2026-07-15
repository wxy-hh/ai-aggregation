import { logger } from '@repo/logger';
import {
  markExpiredProcessingQuotaReservationsPending,
  reconcilePendingQuotas,
  releaseExpiredQuotaReservations,
} from '@repo/db';
import { WorkerHeartbeatStore, getRedisConnectionSummary } from '@repo/shared/server';
import { sttWorker } from './workers/stt';
import { pptWorker } from './workers/ppt';
import { imageWorker } from './workers/image';
import { qimenBaseWorker } from './workers/qimen-base';
import { qimenSectionWorker } from './workers/qimen-section';

let isRunning = false;
let heartbeatTimer: NodeJS.Timeout | null = null;
let billingReconcileTimer: NodeJS.Timeout | null = null;
let isShuttingDown = false;

function getBillingReconcileIntervalMs(): number {
  const configured = Number(process.env.BILLING_RECONCILE_INTERVAL_MS ?? 60_000);
  if (!Number.isInteger(configured) || configured < 30_000 || configured > 3_600_000) {
    return 60_000;
  }
  return configured;
}

/** 定期释放未开始的预留，锁定执行超时的成本，并对已有真实 usage 的待补账记录执行重试。 */
async function reconcileBilling(): Promise<void> {
  try {
    const [releasedReservations, processingReservations, pending] = await Promise.all([
      releaseExpiredQuotaReservations(),
      markExpiredProcessingQuotaReservationsPending(),
      reconcilePendingQuotas(),
    ]);
    if (releasedReservations > 0 || processingReservations > 0 || pending.settled > 0) {
      logger.info('额度账本对账完成', { releasedReservations, processingReservations, pending });
    }
    if (processingReservations > 0 || pending.pending > 0) {
      logger.warn('存在等待真实用量的额度记录，需要供应商回调或受保护对账接口完成补账', {
        processingReservations,
        pending,
      });
    }
  } catch (error) {
    logger.error('额度账本对账失败', error instanceof Error ? error : new Error(String(error)));
  }
}

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
    if (billingReconcileTimer) {
      clearInterval(billingReconcileTimer);
      billingReconcileTimer = null;
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
    await reconcileBilling();
    billingReconcileTimer = setInterval(() => {
      void reconcileBilling();
    }, getBillingReconcileIntervalMs());
  } catch (error) {
    isRunning = false;
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (billingReconcileTimer) {
      clearInterval(billingReconcileTimer);
      billingReconcileTimer = null;
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
