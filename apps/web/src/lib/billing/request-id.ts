/** 为一次用户动作生成可重试的幂等标识。调用方重试同一次动作时必须复用该值。 */
export function createBillingRequestId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

export function getBillingRequestId(request: Request, body?: Record<string, unknown>): string {
  const headerValue = request.headers.get('idempotency-key')?.trim();
  if (headerValue) return headerValue.slice(0, 128);
  const bodyValue = typeof body?.requestId === 'string' ? body.requestId.trim() : '';
  return bodyValue ? bodyValue.slice(0, 128) : createBillingRequestId();
}
