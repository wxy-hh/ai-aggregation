CREATE TABLE "quota_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedUnits" INTEGER NOT NULL DEFAULT 0,
    "availableUnits" INTEGER NOT NULL DEFAULT 0,
    "reservedUnits" INTEGER NOT NULL DEFAULT 0,
    "settledUnits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quota_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quota_reservations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "estimatedUnits" INTEGER NOT NULL,
    "settledUnits" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'reserved',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quota_reservations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quota_ledger_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reservationId" TEXT,
    "requestId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "units" INTEGER NOT NULL,
    "meterType" TEXT NOT NULL,
    "feature" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quota_ledger_entries_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ai_usage_records"
  ADD COLUMN "meterType" TEXT,
  ADD COLUMN "billableUnits" INTEGER,
  ADD COLUMN "billingStatus" TEXT,
  ADD COLUMN "reservationId" TEXT;

CREATE UNIQUE INDEX "quota_accounts_userId_key" ON "quota_accounts"("userId");
CREATE UNIQUE INDEX "quota_reservations_userId_requestId_key" ON "quota_reservations"("userId", "requestId");
CREATE UNIQUE INDEX "quota_ledger_entries_requestId_eventType_key" ON "quota_ledger_entries"("requestId", "eventType");
CREATE UNIQUE INDEX "ai_usage_records_reservationId_key" ON "ai_usage_records"("reservationId");
CREATE INDEX "quota_reservations_status_expiresAt_idx" ON "quota_reservations"("status", "expiresAt");
CREATE INDEX "quota_reservations_userId_createdAt_idx" ON "quota_reservations"("userId", "createdAt");
CREATE INDEX "quota_ledger_entries_userId_createdAt_idx" ON "quota_ledger_entries"("userId", "createdAt");
CREATE INDEX "quota_ledger_entries_reservationId_idx" ON "quota_ledger_entries"("reservationId");

-- 旧系统只有 users.tokens，没有可还原的“历史已消耗”明细，因此首轮迁移将当前余额作为可用额度和授予额度。
-- 后续新请求全部以 quota_accounts 为余额来源，并通过追加流水记录真实变化。
INSERT INTO "quota_accounts" ("id", "userId", "grantedUnits", "availableUnits", "reservedUnits", "settledUnits", "createdAt", "updatedAt")
SELECT
  md5(u."id" || clock_timestamp()::text || random()::text),
  u."id",
  GREATEST(u."tokens", 0) + COALESCE(usage."settledUnits", 0),
  GREATEST(u."tokens", 0),
  0,
  COALESCE(usage."settledUnits", 0),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "users" u
LEFT JOIN (
  SELECT "userId", COALESCE(SUM(GREATEST("totalTokens", 0)), 0)::INTEGER AS "settledUnits"
  FROM "ai_usage_records"
  WHERE "status" = 'success' AND "totalTokens" IS NOT NULL
  GROUP BY "userId"
) usage ON usage."userId" = u."id"
ON CONFLICT ("userId") DO NOTHING;

ALTER TABLE "quota_accounts"
  ADD CONSTRAINT "quota_accounts_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quota_reservations"
  ADD CONSTRAINT "quota_reservations_user_id_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quota_reservations"
  ADD CONSTRAINT "quota_reservations_account_user_id_fkey"
  FOREIGN KEY ("userId") REFERENCES "quota_accounts"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quota_ledger_entries"
  ADD CONSTRAINT "quota_ledger_entries_user_id_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quota_ledger_entries"
  ADD CONSTRAINT "quota_ledger_entries_account_user_id_fkey"
  FOREIGN KEY ("userId") REFERENCES "quota_accounts"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quota_ledger_entries"
  ADD CONSTRAINT "quota_ledger_entries_reservationId_fkey"
  FOREIGN KEY ("reservationId") REFERENCES "quota_reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai_usage_records"
  ADD CONSTRAINT "ai_usage_records_reservationId_fkey"
  FOREIGN KEY ("reservationId") REFERENCES "quota_reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
