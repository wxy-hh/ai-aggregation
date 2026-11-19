import { getCurrentUser } from '@/lib/auth/get-current-user';
import { AuthError } from '@/lib/auth/errors';
import { reserveChatQuotaBatch } from '@/lib/billing/quota-service';
import { BillingError, billingErrorResponse } from '@/lib/billing/billing-errors';
import { createBillingRequestId } from '@/lib/billing/request-id';
import { parseBatchReserveBody, type BatchReserveResponseBody } from '@repo/shared';

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser(req);
    // 传输契约解析（评审 C4 / ADR-0050）：复用 WireMessage 校验与 provider 枚举，
    // 空/超限模型列表与逐元素非法输入直接 400，不再静默放行
    const parsed = parseBatchReserveBody(await req.json());
    if (!parsed.ok) {
      const errorId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      return new Response(
        JSON.stringify({ error: parsed.error.message, code: parsed.error.code, errorId, details: parsed.error.details }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    const { messages, models } = parsed.body;

    if (user.role === 'admin') {
      return Response.json({ reservations: [] } satisfies BatchReserveResponseBody);
    }

    const requests = models.map((model) => ({ ...model, requestId: createBillingRequestId() }));
    const result = await reserveChatQuotaBatch({
      userId: user.id,
      messages,
      models: requests,
      metadata: { batch: true, modelCount: models.length },
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

    return Response.json({ reservations } satisfies BatchReserveResponseBody);
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
