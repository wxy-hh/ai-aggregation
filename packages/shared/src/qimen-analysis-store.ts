import type Redis from 'ioredis';
import { createRedisClient } from './rate-limit';
import type {
  QimenAnalysisBaseResult,
  QimenAnalyzeRequest,
  QimenQuerySectionKey,
  QimenSectionKey,
  QimenSectionResponseMap,
  QimenSectionTaskStatus,
} from './qimen-analysis';

const ANALYSIS_TTL_SECONDS = 24 * 60 * 60;

type QimenStatusSnapshot = {
  baseResult: QimenSectionTaskStatus;
  strategyOverview: QimenSectionTaskStatus;
  timingWindows: QimenSectionTaskStatus;
  chartSummary: QimenSectionTaskStatus;
};

export class QimenAnalysisStore {
  constructor(private readonly redis: Redis = createRedisClient()) {}

  async initializeAnalysis(analysisId: string) {
    const multi = this.redis.multi();
    multi.hset(this.statusKey(analysisId), {
      baseResult: 'pending',
      strategyOverview: 'pending',
      timingWindows: 'pending',
      chartSummary: 'pending',
    });
    multi.expire(this.statusKey(analysisId), ANALYSIS_TTL_SECONDS);
    await multi.exec();
  }

  async saveBaseResult(analysisId: string, result: QimenAnalysisBaseResult) {
    const existing = await this.getBaseResult(analysisId);
    if (existing) return false;

    const multi = this.redis.multi();
    multi.set(this.baseKey(analysisId), JSON.stringify(result), 'EX', ANALYSIS_TTL_SECONDS);
    multi.hset(this.statusKey(analysisId), 'baseResult', 'completed');
    multi.expire(this.statusKey(analysisId), ANALYSIS_TTL_SECONDS);
    await multi.exec();
    return true;
  }

  async markBaseResultFailed(analysisId: string, error: string) {
    const current = await this.redis.hget(this.statusKey(analysisId), 'baseResult');
    if (current === 'completed') return false;

    const multi = this.redis.multi();
    multi.hset(this.statusKey(analysisId), 'baseResult', 'failed');
    multi.hset(this.errorKey(analysisId), 'baseResult', error);
    multi.expire(this.statusKey(analysisId), ANALYSIS_TTL_SECONDS);
    multi.expire(this.errorKey(analysisId), ANALYSIS_TTL_SECONDS);
    await multi.exec();
    return true;
  }

  async markSectionPending(analysisId: string, sectionKey: QimenSectionKey) {
    const current = await this.redis.hget(this.statusKey(analysisId), sectionKey);
    if (current === 'completed') return false;
    await this.redis.hset(this.statusKey(analysisId), sectionKey, 'pending');
    await this.redis.expire(this.statusKey(analysisId), ANALYSIS_TTL_SECONDS);
    return true;
  }

  async saveSectionResult<K extends QimenSectionKey>(
    analysisId: string,
    sectionKey: K,
    result: QimenSectionResponseMap[K]
  ) {
    const current = await this.redis.hget(this.statusKey(analysisId), sectionKey);
    if (current === 'completed') return false;

    const multi = this.redis.multi();
    multi.set(this.sectionKey(analysisId, sectionKey), JSON.stringify(result), 'EX', ANALYSIS_TTL_SECONDS);
    multi.hset(this.statusKey(analysisId), sectionKey, 'completed');
    multi.hdel(this.errorKey(analysisId), sectionKey);
    multi.expire(this.statusKey(analysisId), ANALYSIS_TTL_SECONDS);
    multi.expire(this.errorKey(analysisId), ANALYSIS_TTL_SECONDS);
    await multi.exec();
    return true;
  }

  async markSectionFailed(analysisId: string, sectionKey: QimenSectionKey, error: string) {
    const current = await this.redis.hget(this.statusKey(analysisId), sectionKey);
    if (current === 'completed') return false;

    const multi = this.redis.multi();
    multi.hset(this.statusKey(analysisId), sectionKey, 'failed');
    multi.hset(this.errorKey(analysisId), sectionKey, error);
    multi.expire(this.statusKey(analysisId), ANALYSIS_TTL_SECONDS);
    multi.expire(this.errorKey(analysisId), ANALYSIS_TTL_SECONDS);
    await multi.exec();
    return true;
  }

  async getBaseResult(analysisId: string) {
    const raw = await this.redis.get(this.baseKey(analysisId));
    return raw ? (JSON.parse(raw) as QimenAnalysisBaseResult) : null;
  }

  async getSectionResult<K extends QimenSectionKey>(analysisId: string, sectionKey: K) {
    const raw = await this.redis.get(this.sectionKey(analysisId, sectionKey));
    return raw ? (JSON.parse(raw) as QimenSectionResponseMap[K]) : null;
  }

  async getSectionStatus(analysisId: string, sectionKey: QimenQuerySectionKey) {
    const status = await this.redis.hget(this.statusKey(analysisId), sectionKey);
    return (status as QimenSectionTaskStatus | null) ?? null;
  }

  async getAllStatuses(analysisId: string): Promise<QimenStatusSnapshot | null> {
    const raw = await this.redis.hgetall(this.statusKey(analysisId));
    if (Object.keys(raw).length === 0) return null;

    return {
      baseResult: (raw.baseResult as QimenSectionTaskStatus) ?? 'pending',
      strategyOverview: (raw.strategyOverview as QimenSectionTaskStatus) ?? 'pending',
      timingWindows: (raw.timingWindows as QimenSectionTaskStatus) ?? 'pending',
      chartSummary: (raw.chartSummary as QimenSectionTaskStatus) ?? 'pending',
    };
  }

  async getSectionError(analysisId: string, sectionKey: QimenQuerySectionKey) {
    return (await this.redis.hget(this.errorKey(analysisId), sectionKey)) ?? null;
  }

  async waitForSection<K extends QimenSectionKey>(
    analysisId: string,
    sectionKey: K,
    timeoutMs: number,
    intervalMs = 500
  ) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const result = await this.getSectionResult(analysisId, sectionKey);
      if (result) {
        return {
          status: 'completed' as const,
          data: result,
        };
      }

      const status = await this.getSectionStatus(analysisId, sectionKey);
      if (status === 'failed') {
        return {
          status: 'failed' as const,
          error: (await this.getSectionError(analysisId, sectionKey)) ?? '分块生成失败',
        };
      }

      await sleep(intervalMs);
    }

    const status = await this.getSectionStatus(analysisId, sectionKey);
    if (status === 'completed') {
      const result = await this.getSectionResult(analysisId, sectionKey);
      if (result) {
        return {
          status: 'completed' as const,
          data: result,
        };
      }
    }

    if (status === 'failed') {
      return {
        status: 'failed' as const,
        error: (await this.getSectionError(analysisId, sectionKey)) ?? '分块生成失败',
      };
    }

    return {
      status: 'pending' as const,
    };
  }

  async disconnect() {
    await this.redis.quit();
  }

  private baseKey(analysisId: string) {
    return `qimen:analysis:${analysisId}:base`;
  }

  private sectionKey(analysisId: string, sectionKey: QimenSectionKey) {
    return `qimen:analysis:${analysisId}:section:${sectionKey}`;
  }

  private statusKey(analysisId: string) {
    return `qimen:analysis:${analysisId}:status`;
  }

  private errorKey(analysisId: string) {
    return `qimen:analysis:${analysisId}:errors`;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type QimenSectionJobPayload = {
  analysisId: string;
  sectionKey: QimenSectionKey;
  input: QimenAnalyzeRequest;
};
