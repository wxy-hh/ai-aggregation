import type { BillingErrorCode } from '@repo/shared';

export class BillingError extends Error {
  constructor(
    public readonly code: BillingErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'BillingError';
  }
}

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
