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