/**
 * 额度耗尽全局事件封装。
 *
 * 目前仍使用 DOM CustomEvent 与 quota-exhausted-dialog.tsx 通信，
 * 后续可在此替换为 React Query 全局错误处理或 Zustand 状态触发。
 */

const EVENT_NAME = 'quota-exhausted';

/** 触发全局额度耗尽事件 */
export function dispatchQuotaExhausted(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

/** 监听全局额度耗尽事件，返回取消监听函数 */
export function onQuotaExhausted(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
