ALTER TABLE "quota_accounts"
  ADD CONSTRAINT "quota_accounts_units_non_negative"
  CHECK (
    "grantedUnits" >= 0
    AND "availableUnits" >= 0
    AND "reservedUnits" >= 0
    AND "settledUnits" >= 0
  ),
  ADD CONSTRAINT "quota_accounts_balance_consistent"
  CHECK (
    "grantedUnits" = "availableUnits" + "reservedUnits" + "settledUnits"
  );

ALTER TABLE "quota_reservations"
  ADD CONSTRAINT "quota_reservations_units_non_negative"
  CHECK ("estimatedUnits" > 0 AND "settledUnits" >= 0);

ALTER TABLE "quota_ledger_entries"
  ADD CONSTRAINT "quota_ledger_entries_event_type_valid"
  CHECK ("eventType" IN ('opening', 'reserve', 'settle', 'release', 'refund', 'adjustment')),
  ADD CONSTRAINT "quota_ledger_entries_meter_type_valid"
  CHECK ("meterType" IN ('tokens', 'audio_seconds', 'image_task', 'video_task'));
