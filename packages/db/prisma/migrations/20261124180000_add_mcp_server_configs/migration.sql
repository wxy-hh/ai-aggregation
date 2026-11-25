-- 新增 MCP 服务器配置、工具定义快照、工具策略与元数据审计（ADR-0064）
--
-- 说明：
-- - 全部归属用户，删除用户时级联清理；
-- - 审计表的 serverId 在服务器删除时置空（保留审计痕迹）；
-- - 静态鉴权头取值以 AES-256-GCM 密文存储（复用 WEBHOOK_SECRET_KEY）。

CREATE TABLE IF NOT EXISTS "mcp_server_configs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "authHeaderName" TEXT,
    "authHeaderValueEnc" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "discovery_status" TEXT NOT NULL DEFAULT 'never',
    "discovery_error" TEXT,
    "snapshot_version" INTEGER,
    "config_fingerprint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcp_server_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "mcp_tool_snapshots" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "total_bytes" INTEGER NOT NULL DEFAULT 0,
    "tools" JSONB NOT NULL DEFAULT '[]',
    "config_fingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_tool_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "mcp_tool_policies" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tool_name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "allow_auto_execute" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcp_tool_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "mcp_audit_records" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serverId" TEXT,
    "server_name" TEXT,
    "tool_name" TEXT,
    "hostname" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "snapshot_version" INTEGER,
    "status_code" INTEGER,
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "response_bytes" INTEGER NOT NULL DEFAULT 0,
    "error_kind" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_audit_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mcp_server_configs_userId_idx" ON "mcp_server_configs"("userId");
CREATE INDEX IF NOT EXISTS "mcp_server_configs_userId_is_active_idx" ON "mcp_server_configs"("userId", "is_active");
CREATE INDEX IF NOT EXISTS "mcp_tool_snapshots_userId_idx" ON "mcp_tool_snapshots"("userId");
CREATE INDEX IF NOT EXISTS "mcp_tool_snapshots_serverId_version_idx" ON "mcp_tool_snapshots"("serverId", "version");
CREATE INDEX IF NOT EXISTS "mcp_tool_policies_userId_idx" ON "mcp_tool_policies"("userId");
CREATE INDEX IF NOT EXISTS "mcp_tool_policies_userId_enabled_idx" ON "mcp_tool_policies"("userId", "enabled");
CREATE INDEX IF NOT EXISTS "mcp_audit_records_userId_idx" ON "mcp_audit_records"("userId");
CREATE INDEX IF NOT EXISTS "mcp_audit_records_serverId_idx" ON "mcp_audit_records"("serverId");
CREATE INDEX IF NOT EXISTS "mcp_audit_records_createdAt_idx" ON "mcp_audit_records"("createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "mcp_tool_snapshots_serverId_version_key" ON "mcp_tool_snapshots"("serverId", "version");
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_tool_policies_serverId_tool_name_key" ON "mcp_tool_policies"("serverId", "tool_name");

ALTER TABLE "mcp_server_configs"
    ADD CONSTRAINT "mcp_server_configs_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mcp_tool_snapshots"
    ADD CONSTRAINT "mcp_tool_snapshots_serverId_fkey"
    FOREIGN KEY ("serverId") REFERENCES "mcp_server_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mcp_tool_snapshots"
    ADD CONSTRAINT "mcp_tool_snapshots_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mcp_tool_policies"
    ADD CONSTRAINT "mcp_tool_policies_serverId_fkey"
    FOREIGN KEY ("serverId") REFERENCES "mcp_server_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mcp_tool_policies"
    ADD CONSTRAINT "mcp_tool_policies_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mcp_audit_records"
    ADD CONSTRAINT "mcp_audit_records_serverId_fkey"
    FOREIGN KEY ("serverId") REFERENCES "mcp_server_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "mcp_audit_records"
    ADD CONSTRAINT "mcp_audit_records_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
