/**
 * 服务端专用模块入口
 *
 * 这些模块依赖 Node.js 专用库 (如 ioredis),不能在浏览器端使用
 *
 * 使用方式:
 * ```typescript
 * // ❌ 错误 - 会导致客户端组件构建失败
 * import { getRateLimiter } from '@repo/shared';
 *
 * // ✅ 正确 - 仅在服务端使用
 * import { getRateLimiter } from '@repo/shared/server';
 * ```
 */

export * from './rate-limit';
export * from './redis-config';
export * from './worker-heartbeat';
