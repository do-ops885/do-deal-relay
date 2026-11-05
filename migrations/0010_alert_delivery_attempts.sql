-- Migration 0010: Alert delivery attempt tracking
-- Mirrors runtime migration v16 (add_alert_delivery_attempts) in
-- worker/lib/d1/migrations/schema-part-9.ts.
--
-- The queue consumer records a delivery after each attempt. Without these
-- columns a failed attempt could never be upgraded to `sent` on a later
-- retry because the pre-existing row kept status `failed`. recordDelivery
-- now performs an idempotent upsert that preserves `sent` as terminal and
-- increments `attempts` for retries, so redeliveries can be suppressed.

ALTER TABLE alert_deliveries ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE alert_deliveries ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
