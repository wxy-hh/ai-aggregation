-- ADR-0058：记忆输入消息的轮次/完成身份与幂等键
ALTER TABLE "messages" ADD COLUMN "turn_id" TEXT;
ALTER TABLE "messages" ADD COLUMN "request_id" TEXT;
ALTER TABLE "messages" ADD COLUMN "idempotency_key" TEXT;

CREATE UNIQUE INDEX "messages_sessionId_idempotencyKey_key"
  ON "messages"("sessionId", "idempotency_key");

CREATE INDEX "messages_sessionId_turnId_idx"
  ON "messages"("sessionId", "turn_id");
