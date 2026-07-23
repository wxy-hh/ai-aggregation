-- 匿名身份与请求幂等字段属于当前正式 Schema，保证全新数据库重放迁移时这些字段存在。
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "deviceHash" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "users_deviceHash_key" ON "users"("deviceHash");

ALTER TABLE "tasks" ADD COLUMN "requestId" TEXT;

CREATE UNIQUE INDEX "ai_usage_records_userId_requestId_key"
ON "ai_usage_records"("userId", "requestId");

CREATE UNIQUE INDEX "tasks_userId_requestId_key"
ON "tasks"("userId", "requestId");
