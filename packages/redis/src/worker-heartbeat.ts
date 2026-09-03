import type Redis from 'ioredis';

const DEFAULT_HEARTBEAT_TTL_SECONDS = 90;

/**
 * Worker 心跳存储。连接通过构造显式注入（共享进程内单例连接），
 * 本模块不创建、不关闭连接。
 */
export class WorkerHeartbeatStore {
  constructor(private readonly redis: Redis) {}

  async beat(workerName: string, ttlSeconds = DEFAULT_HEARTBEAT_TTL_SECONDS) {
    await this.redis.set(this.workerKey(workerName), new Date().toISOString(), 'EX', ttlSeconds);
  }

  async isHealthy(workerName: string) {
    return (await this.redis.exists(this.workerKey(workerName))) === 1;
  }

  private workerKey(workerName: string) {
    return `worker:heartbeat:${workerName}`;
  }
}