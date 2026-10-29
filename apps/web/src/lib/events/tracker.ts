/**
 * 前端行为埋点客户端上报封装（ADR-0013 / P0a 工单 03）
 *
 * 设计原则：
 * - fire-and-forget：同步返回 void，调用方无需 await，无论网络或服务端状态如何均不阻塞用户界面交互；
 * - 失败静默：请求失败、4xx、5xx 或网络异常静默捕获，仅输出 console.debug 日志，绝不向上抛错；
 * - 统一客户端：遵循项目规范使用 fetchWithAuth，不裸写 fetch；
 * - 严格类型：入参强类型绑定事件白名单与受控 props 形状。
 */

import { fetchWithAuth } from '@/lib/api/client';
import type { ProductEventName, ProductEventPropsMap } from '@/schemas/product-event.schema';

/**
 * 上报前端行为埋点事件（fire-and-forget，静默失败）
 *
 * @param event 事件名称（须为白名单中的枚举值，格式 `<surface>.<action>`）
 * @param props 事件元数据（严格受控，遵循隐私红线）
 */
export function trackEvent<E extends ProductEventName>(event: E, props: ProductEventPropsMap[E]): void {
  try {
    fetchWithAuth('/api/events', {
      method: 'POST',
      body: JSON.stringify({ event, props }),
    })
      .then((res) => {
        if (!res.ok) {
          console.debug(`[trackEvent] 埋点事件上报返回非 2xx 状态码: ${res.status}`);
        }
      })
      .catch((error) => {
        console.debug('[trackEvent] 埋点事件上报网络异常 (已静默):', error);
      });
  } catch (error) {
    // 捕获可能的同步异常，确保完全不阻塞交互
    console.debug('[trackEvent] 埋点事件调用异常 (已静默):', error);
  }
}
