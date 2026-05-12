DROP TABLE IF EXISTS "user_usage";

CREATE TABLE "ai_usage_records" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "endpoint" TEXT,
    "requestId" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "cachedTokens" INTEGER,
    "reasoningTokens" INTEGER,
    "taskCount" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'success',
    "rawUsage" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_usage_records_userId_createdAt_idx" ON "ai_usage_records"("userId", "createdAt");
CREATE INDEX "ai_usage_records_userId_feature_createdAt_idx" ON "ai_usage_records"("userId", "feature", "createdAt");
CREATE INDEX "ai_usage_records_provider_model_idx" ON "ai_usage_records"("provider", "model");

ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
