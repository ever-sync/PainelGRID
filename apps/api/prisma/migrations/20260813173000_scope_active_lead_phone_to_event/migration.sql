-- A person may participate in more than one event for the same client.
-- Keep duplicate protection inside the operational context where the lead is
-- created, while retaining client-wide protection for leads without an event.
DROP INDEX IF EXISTS "leads_client_id_phone_active_unique";

CREATE UNIQUE INDEX IF NOT EXISTS "leads_client_event_phone_active_unique"
  ON "leads" ("client_id", "event_interest_id", "phone")
  WHERE "deleted_at" IS NULL
    AND "phone" IS NOT NULL
    AND "event_interest_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "leads_client_phone_without_event_active_unique"
  ON "leads" ("client_id", "phone")
  WHERE "deleted_at" IS NULL
    AND "phone" IS NOT NULL
    AND "event_interest_id" IS NULL;
