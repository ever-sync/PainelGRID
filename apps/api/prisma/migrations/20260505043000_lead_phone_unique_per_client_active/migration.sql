-- Prevent duplicate active leads per client and phone
CREATE UNIQUE INDEX IF NOT EXISTS "leads_client_id_phone_active_unique"
  ON "leads" ("client_id", "phone")
  WHERE "deleted_at" IS NULL
    AND "phone" IS NOT NULL;
