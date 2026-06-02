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
export * from './qimen-analysis-store';
export * from './qimen-chart';
export * from './ziwei-glossary';

// 城市经纬度数据 (用于八字测算真太阳时修正)
export * from './data/china-cities';
export type { ChinaCity, ChinaCitiesData } from './data/china-cities.types';

// ============================================
// 注意: 以下模块仅限服务端使用
// 请从 '@repo/shared/server' 导入
// ============================================
// - rate-limit (依赖 ioredis)
// - redis-config (依赖 ioredis)
// - worker-heartbeat (依赖 ioredis)
