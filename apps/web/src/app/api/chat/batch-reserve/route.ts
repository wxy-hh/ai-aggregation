import { getCurrentUser } from '@/lib/auth/get-current-user';
import { AuthError } from '@/lib/auth/errors';
import { reserveChatQuotaBatch } from '@/lib/billing/quota-service';
import { BillingError, billingErrorResponse } from '@/lib/billing/billing-errors';
import { createBillingRequestId } from '@/lib/billing/request-id';
import type { ProviderName } from '@repo/providers';

interface BatchModelInput {
  provider: ProviderName;
  model: string;
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser(req);
    const body = (await req.json()) as {
      messages?: Array<{ content?: string }>;
      models?: BatchModelInput[];
    };

    if (
      !Array.isArray(body.messages) ||
      body.messages.length === 0 ||
      !Array.isArray(body.models)
    ) {
      return new Response(JSON.stringify({ error: '消息和模型列表不能为空' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (user.role === 'admin') {
      return Response.json({ reservations: [] });
    }

    const requests = body.models.map((model) => ({ ...model, requestId: createBillingRequestId() }));
    const result = await reserveChatQuotaBatch({
      userId: user.id,
      messages: body.messages,
      models: requests,
      metadata: { batch: true, modelCount: body.models.length },
    });
    const reservations = result.reservations.map((reservation) => {
      const request = requests.find((item) => item.requestId === reservation.requestId);
      if (!request) throw new Error('批量预留结果与请求不一致');
      return {
        provider: request.provider,
        model: request.model,
        requestId: request.requestId,
        reservationId: reservation.id,
      };
    });

    return Response.json({ reservations });
  } catch (error) {
    if (error instanceof AuthError) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: error.code === 'FORBIDDEN' ? 403 : 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (error instanceof BillingError) return billingErrorResponse(error);
    console.error('[chat/batch-reserve] 失败:', error);
    return new Response(JSON.stringify({ error: '批量预留额度失败，请稍后重试' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
