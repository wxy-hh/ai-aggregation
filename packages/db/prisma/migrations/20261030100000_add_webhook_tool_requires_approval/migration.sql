-- AlterTable: 为用户 Webhook 工具新增「调用前需要用户确认」字段（AGENT-HITL-ACTION / ADR-0041）
ALTER TABLE "user_webhook_tools" ADD COLUMN IF NOT EXISTS "requiresApproval" BOOLEAN NOT NULL DEFAULT true;

-- 存量回填：POST 工具一律需要确认（安全优先），GET 工具保持原有直接执行行为
UPDATE "user_webhook_tools" SET "requiresApproval" = true WHERE "method" = 'POST';
UPDATE "user_webhook_tools" SET "requiresApproval" = false WHERE "method" = 'GET';
