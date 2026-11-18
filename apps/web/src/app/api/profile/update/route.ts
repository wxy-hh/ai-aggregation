import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { withAuth } from '@/lib/api/with-auth';
import { AuthError } from '@/lib/auth/errors';
import { updateProfileSchema } from '@/schemas/auth.schema';
import { ApiError, createSuccessResponse, handleAuthError } from '@/lib/api/responses';

export async function PATCH(req: NextRequest) {
  return withAuth(req, async (user) => {
    try {
      const body = await req.json();
      const parsed = updateProfileSchema.safeParse(body);

      if (!parsed.success) {
        return ApiError.badRequest('请求参数错误', 'INVALID_REQUEST', {
          errors: parsed.error.flatten().fieldErrors,
        });
      }

      const { username, name, avatar, memorySearchEnabled } = parsed.data;

      // 如果修改用户名，检查唯一性
      if (username) {
        const existing = await prisma.user.findUnique({ where: { username } });
        if (existing && existing.id !== user.id) {
          return ApiError.badRequest('该用户名已被使用', 'USERNAME_EXISTS');
        }
      }

      const updateData = {
        ...(username !== undefined && { username }),
        ...(name !== undefined && { name }),
        ...(avatar !== undefined && { avatar }),
        ...(memorySearchEnabled !== undefined && { memorySearchEnabled }),
      };
      const userSelect = {
        id: true,
        username: true,
        email: true,
        name: true,
        avatar: true,
        memorySearchEnabled: true,
      } as const;

      // 关闭会话记忆检索：同一事务内锁定用户行、更新开关并物理删除记忆会话与切片。
      // 用户行锁与 Worker 插入切片前的事务复核互斥，避免「删除之后又被写入」（ADR-0058）。
      const updatedUser =
        memorySearchEnabled === false
          ? await prisma.$transaction(async (tx) => {
              await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${user.id} FOR UPDATE`;
              const updated = await tx.user.update({
                where: { id: user.id },
                data: updateData,
                select: userSelect,
              });
              await tx.conversationMemoryChunk.deleteMany({ where: { userId: user.id } });
              await tx.chatSession.deleteMany({ where: { userId: user.id } });
              return updated;
            })
          : await prisma.user.update({
              where: { id: user.id },
              data: updateData,
              select: userSelect,
            });

      return createSuccessResponse({ user: updatedUser }, '个人资料已更新');
    } catch (error) {
      console.error('更新个人资料失败:', error);
      if (error instanceof AuthError) {
        return handleAuthError(error);
      }
      return ApiError.internalError('更新个人资料失败', {
        error: error instanceof Error ? error.message : '未知错误',
      });
    }
  });
}
