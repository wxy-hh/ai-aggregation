import type { NextRequest } from 'next/server';

/**
 * 取出客户端 IP，作为认证接口的限流键。
 *
 * 优先级与匿名建号接口的既有实现一致：
 * 1. x-real-ip（边缘/代理注入，不可由客户端伪造）；
 * 2. x-forwarded-for 最右侧（最近可信代理），降低客户端伪造风险；
 * 3. 全部缺失时回退到 'unknown'（NextRequest 在 Edge Runtime 不提供 ip 属性）。
 */
export function getClientIp(req: NextRequest): string {
  const realIp = req.headers.get('x-real-ip');
  if (realIp) {
    return realIp.split(',')[0].trim();
  }

  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded.split(',');
    return parts[parts.length - 1].trim();
  }

  return 'unknown';
}
