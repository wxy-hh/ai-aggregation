import { Prisma } from '@prisma/client';
import { prisma } from './client';

export type MediaTaskFeature = 'image' | 'video';

export type BeginMediaTaskResult =
  | { state: 'started'; taskId: string }
  | { state: 'completed'; taskId: string; output: unknown }
  | { state: 'processing'; taskId: string; output: unknown | null };

/** 使用 userId + requestId 防止同一次媒体请求因网络重试重复调用上游服务。 */
export async function beginMediaTask(input: {
  userId: string;
  requestId: string;
  feature: MediaTaskFeature;
  provider: string;
  model: string;
  payload: Record<string, unknown>;
}): Promise<BeginMediaTaskResult> {
  const type = `${input.feature}:generation`;
  const existing = await prisma.task.findUnique({
    where: { userId_requestId: { userId: input.userId, requestId: input.requestId } },
  });
  if (existing?.status === 'completed') {
    return { state: 'completed', taskId: existing.id, output: existing.output };
  }
  if (existing?.status === 'processing' || existing?.status === 'pending') {
    return { state: 'processing', taskId: existing.id, output: existing.output };
  }
  if (existing) {
    const restarted = await prisma.task.update({
      where: { id: existing.id },
      data: {
        status: 'processing',
        error: null,
        input: input.payload as Prisma.InputJsonValue,
        output: Prisma.JsonNull,
        providerTaskId: null,
        completedAt: null,
      },
    });
    return { state: 'started', taskId: restarted.id };
  }

  const task = await prisma.task.create({
    data: {
      userId: input.userId,
      requestId: input.requestId,
      type,
      status: 'processing',
      input: input.payload as Prisma.InputJsonValue,
    },
  });
  return { state: 'started', taskId: task.id };
}

/** 供应商受理异步媒体任务后保存外部任务标识，但不能提前标记为成功。 */
export async function markMediaTaskSubmitted(input: {
  taskId: string;
  providerTaskId: string;
  output: unknown;
}): Promise<void> {
  await prisma.task.update({
    where: { id: input.taskId },
    data: {
      status: 'processing',
      providerTaskId: input.providerTaskId,
      output: input.output as Prisma.InputJsonValue,
      error: null,
    },
  });
}

/** 仅允许当前用户通过供应商任务标识查询自己的本地媒体任务。 */
export async function findMediaTaskByProviderTaskId(userId: string, providerTaskId: string) {
  return prisma.task.findFirst({
    where: { userId, providerTaskId },
    select: { id: true, requestId: true },
  });
}

export async function completeMediaTask(taskId: string, output: unknown): Promise<void> {
  await prisma.task.update({
    where: { id: taskId },
    data: {
      status: 'completed',
      output: output as Prisma.InputJsonValue,
      completedAt: new Date(),
      error: null,
    },
  });
}

export async function failMediaTask(taskId: string, error: string): Promise<void> {
  await prisma.task.update({
    where: { id: taskId },
    data: { status: 'failed', error },
  });
}
