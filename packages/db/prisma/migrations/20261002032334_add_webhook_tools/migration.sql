-- CreateEnum
CREATE TYPE "WebhookHttpMethod" AS ENUM ('GET', 'POST');

-- CreateTable
CREATE TABLE "user_webhook_tools" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "callName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "method" "WebhookHttpMethod" NOT NULL DEFAULT 'POST',
    "authHeaderName" TEXT,
    "authHeaderValueEnc" TEXT,
    "params" JSONB NOT NULL DEFAULT '[]',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_webhook_tools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_tool_calls" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "toolId" TEXT,
    "hostname" TEXT NOT NULL,
    "method" "WebhookHttpMethod" NOT NULL,
    "statusCode" INTEGER,
    "durationMs" INTEGER NOT NULL,
    "responseBytes" INTEGER NOT NULL DEFAULT 0,
    "outcome" TEXT NOT NULL,
    "errorKind" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_tool_calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_webhook_tools_userId_idx" ON "user_webhook_tools"("userId");

-- CreateIndex
CREATE INDEX "user_webhook_tools_userId_enabled_idx" ON "user_webhook_tools"("userId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "user_webhook_tools_userId_callName_key" ON "user_webhook_tools"("userId", "callName");

-- CreateIndex
CREATE INDEX "webhook_tool_calls_userId_idx" ON "webhook_tool_calls"("userId");

-- CreateIndex
CREATE INDEX "webhook_tool_calls_toolId_idx" ON "webhook_tool_calls"("toolId");

-- CreateIndex
CREATE INDEX "webhook_tool_calls_createdAt_idx" ON "webhook_tool_calls"("createdAt");

-- AddForeignKey
ALTER TABLE "user_webhook_tools" ADD CONSTRAINT "user_webhook_tools_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_tool_calls" ADD CONSTRAINT "webhook_tool_calls_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_tool_calls" ADD CONSTRAINT "webhook_tool_calls_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "user_webhook_tools"("id") ON DELETE SET NULL ON UPDATE CASCADE;
