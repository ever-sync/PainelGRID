ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "registered_by_id" UUID;

ALTER TABLE "leads"
  ADD CONSTRAINT "leads_registered_by_id_fkey"
  FOREIGN KEY ("registered_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "leads_registered_by_id_idx" ON "leads"("registered_by_id");

UPDATE "leads"
SET "registered_by_id" = "assigned_vendor_id"
WHERE "assigned_vendor_id" IS NOT NULL
  AND "registered_by_id" IS NULL;
