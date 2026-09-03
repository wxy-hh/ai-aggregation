import { BillingError } from '@repo/db';

export { BillingError };

// billingErrorResponse 依赖 web 的 Response，属于路由层，留在 web 侧实现。
export function billingErrorResponse(error: BillingError, status = 402): Response {
  const responseStatus =
    error.code === 'REQUEST_IN_PROGRESS' || error.code === 'REQUEST_ALREADY_PROCESSED'
      ? 409
      : status;
  return new Response(
    JSON.stringify({
      error: error.message,
      code: error.code,
      requestId: error.details?.requestId,
      reservationId: error.details?.reservationId,
    }),
    { status: responseStatus, headers: { 'Content-Type': 'application/json' } }
  );
}