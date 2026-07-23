ALTER TABLE "quota_reservations"
  ADD COLUMN "meterType" TEXT NOT NULL DEFAULT 'tokens',
  ADD COLUMN "executionState" TEXT NOT NULL DEFAULT 'ready';

ALTER TABLE "quota_reservations"
  ADD CONSTRAINT "quota_reservations_meter_type_valid"
  CHECK ("meterType" IN ('tokens', 'audio_seconds', 'image_task', 'video_task')),
  ADD CONSTRAINT "quota_reservations_execution_state_valid"
  CHECK ("executionState" IN ('ready', 'processing', 'completed'));

DROP INDEX IF EXISTS "quota_reservations_status_expiresAt_idx";
CREATE INDEX "quota_reservations_status_executionState_expiresAt_idx"
  ON "quota_reservations"("status", "executionState", "expiresAt");
