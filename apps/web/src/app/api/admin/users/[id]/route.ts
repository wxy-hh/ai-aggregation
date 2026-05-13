import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { requireAdmin } from '@/lib/auth/require-admin';
import { AuthError } from '@/lib/auth/errors';
import { ApiError, createSuccessResponse } from '@/lib/api/responses';
import { adminUpdateUserSchema } from '@/schemas/auth.schema';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminId = await requireAdmin(req);
    const { id: targetId } = await params;

    const targetUser = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, role: true },
    });

    if (!targetUser) {
      return ApiError.notFound('用户不存在');
    }

    const body = await req.json();
    const parsed = adminUpdateUserSchema.safeParse(body);

    if (!parsed.success) {
      return ApiError.badRequest('请求参数错误', 'INVALID_REQUEST', {
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { name, role, status, tokens } = parsed.data;

    // 不能对自身进行降权或禁用操作
    if (targetId === adminId) {
      if ((role && role !== 'admin') || (status && status === 'disabled')) {
        return ApiError.badRequest('不能限制自己的管理员权限', 'INVALID_REQUEST');
      }
    }

    // 不能修改管理员的 Token 额度
    if (targetUser.role === 'admin' && tokens !== undefined) {
      return ApiError.badRequest('不能修改管理员的 Token 额度', 'INVALID_REQUEST');
    }

    const user = await prisma.user.update({
      where: { id: targetId },
      data: {
        ...(name !== undefined && { name }),
        ...(role !== undefined && { role }),
        ...(status !== undefined && { status }),
        ...(tokens !== undefined && { tokens }),
      },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        status: true,
        tokens: true,
        createdAt: true,
      },
    });

    return createSuccessResponse({ user }, '更新成功');
  } catch (error) {
    if (error instanceof AuthError) {
      return error.code === 'UNAUTHORIZED'
        ? ApiError.unauthorized(error.message)
        : ApiError.forbidden(error.message);
    }
    return ApiError.internalError('更新用户失败');
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminId = await requireAdmin(req);
    const { id: targetId } = await params;

    if (targetId === adminId) {
      return ApiError.badRequest('不能删除自己的账号', 'INVALID_REQUEST');
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true },
    });

    if (!targetUser) {
      return ApiError.notFound('用户不存在');
    }

    await prisma.user.delete({ where: { id: targetId } });

    return createSuccessResponse(null, '用户已删除');
  } catch (error) {
    if (error instanceof AuthError) {
      return error.code === 'UNAUTHORIZED'
        ? ApiError.unauthorized(error.message)
        : ApiError.forbidden(error.message);
    }
    return ApiError.internalError('删除用户失败');
  }
}
