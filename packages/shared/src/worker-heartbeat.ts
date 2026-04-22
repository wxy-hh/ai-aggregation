import type Redis from 'ioredis';
import { createRedisClient } from './rate-limit';

const DEFAULT_HEARTBEAT_TTL_SECONDS = 90;

export class WorkerHeartbeatStore {
  constructor(private readonly redis: Redis = createRedisClient()) {}

  async beat(workerName: string, ttlSeconds = DEFAULT_HEARTBEAT_TTL_SECONDS) {
    await this.redis.set(this.workerKey(workerName), new Date().toISOString(), 'EX', ttlSeconds);
  }

  async isHealthy(workerName: string) {
    return (await this.redis.exists(this.workerKey(workerName))) === 1;
  }

  async disconnect() {
    await this.redis.quit();
  }

  private workerKey(workerName: string) {
    return `worker:heartbeat:${workerName}`;
  }
}
