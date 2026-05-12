import { NextResponse } from 'next/server';
import { logger } from '@repo/logger';
import {
  QimenAnalysisStore,
  WorkerHeartbeatStore,
  qimenAnalyzeRequestSchema,
  type QimenSectionKey,
} from '@repo/shared';
import { qimenBaseQueue, qimenSectionQueue } from '@repo/queue';
import { getOptionalUserId } from '@/lib/auth/get-optional-user-id';

export const runtime = 'nodejs';
export const maxDuration = 30;

const SECTION_KEYS: QimenSectionKey[] = ['strategyOverview', 'timingWindows', 'chartSummary'];

export async function POST(request: Request) {
  const store = new QimenAnalysisStore();
  const heartbeatStore = new WorkerHeartbeatStore();

  try {
    const userId = await getOptionalUserId(request);
    if (process.env.NODE_ENV === 'production') {
      const workerHealthy = await heartbeatStore.isHealthy('apps-worker');

      if (!workerHealthy) {
        logger.error('奇门分析任务创建失败', new Error('异步 Worker 未就绪'), {
          reason: 'worker_heartbeat_missing',
        });
        return NextResponse.json(
          {
            success: false,
            error: '异步 Worker 未就绪，请先部署或启动 apps/worker 服务后再试。',
          },
          { status: 503 }
        );
      }
    }

    const body = await request.json();
    const parsed = qimenAnalyzeRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: '请求参数错误',
          details: parsed.error.errors.map((item) => ({
            path: item.path.join('.'),
            message: item.message,
          })),
        },
        { status: 400 }
      );
    }

    const analysisId = crypto.randomUUID();
    await store.initializeAnalysis(analysisId);
    logger.info('奇门分析任务初始化完成', {
      analysisId,
      chartMethod: parsed.data.context.chartMethod,
      questionCategory: parsed.data.question.category,
    });

    await qimenBaseQueue.add(
      analysisId,
      {
        analysisId,
        userId: userId ?? undefined,
        input: parsed.data,
      },
      {
        jobId: `${analysisId}-baseResult`,
      }
    );
    logger.info('奇门基础盘面任务入队完成', {
      analysisId,
      queueName: 'qimen-base',
      jobId: `${analysisId}-baseResult`,
    });

    await qimenSectionQueue.addBulk(
      SECTION_KEYS.map((sectionKey) => ({
        name: sectionKey,
        data: {
          analysisId,
          userId: userId ?? undefined,
          sectionKey,
          input: parsed.data,
        },
        jobId: `${analysisId}-${sectionKey}`,
      }))
    );
    logger.info('奇门分块任务入队完成', {
      analysisId,
      queueName: 'qimen-section',
      sectionKeys: SECTION_KEYS,
    });

    return NextResponse.json({
      success: true,
      analysisId,
    });
  } catch (error) {
    logger.error('奇门分析任务创建失败', error as Error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '服务暂时不可用，请稍后重试',
      },
      { status: 500 }
    );
  } finally {
    await heartbeatStore.disconnect();
    await store.disconnect();
  }
}
