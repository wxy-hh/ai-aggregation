import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { requireAdmin } from '@/lib/auth/require-admin';
import { AuthError } from '@/lib/auth/errors';
import { createSuccessResponse, handleAuthError, ApiError } from '@/lib/api/responses';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(req);
    const { id } = await context.params;

    const run = await prisma.agentEvalRun.findUnique({
      where: { id },
      include: {
        caseResults: {
          orderBy: { caseId: 'asc' },
        },
      },
    });

    if (!run) {
      return ApiError.notFound('未找到指定评测运行记录');
    }

    return createSuccessResponse({ run });
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    return ApiError.internalError('获取评测详情异常');
  }
}
