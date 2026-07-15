-- 视频生成只有在供应商异步任务明确成功后才计入成功任务次数。
-- 保存供应商任务 ID，用于轮询终态时精确关联本地幂等任务。
ALTER TABLE "tasks"
  ADD COLUMN "providerTaskId" TEXT;

CREATE UNIQUE INDEX "tasks_userId_providerTaskId_key"
  ON "tasks"("userId", "providerTaskId");
