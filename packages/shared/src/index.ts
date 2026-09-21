// ============================================
// 客户端 + 服务端通用模块
// ============================================
export * from './types';
export * from './schemas';
export * from './constants';
export * from './file-validation';
export * from './bazi-chart';
export * from './decade-fortune';
export * from './qimen-analysis';
export * from './qimen-chart';
export * from './ziwei-glossary';
export * from './destiny-model-client';
export * from './chat-stream-contract';
export * from './destiny-report';
export * from './destiny-report-stream-maps';
export * from './destiny-stream-contract';
export * from './usage-normalize';
export * from './token-estimate';
export * from './model-json';
export * from './compatibility-contract';

// 城市经纬度数据 (用于八字测算真太阳时修正)
export * from './data/china-cities';
export type { ChinaCity, ChinaCitiesData } from './data/china-cities.types';

// ============================================
// 注意: 仅以下模块依赖 Node.js / ioredis，只限服务端使用
// 请从 '@repo/shared/server' 导入
// ============================================
// - rate-limit (纯契约类：RateLimiter / QuotaManager，构造注入 Redis)
// - redis-config (连接选项解析)
//
// 有状态 Redis 运行时已迁至 '@repo/redis'（单例连接 / 限流工厂 / 心跳 / 奇门存储）
