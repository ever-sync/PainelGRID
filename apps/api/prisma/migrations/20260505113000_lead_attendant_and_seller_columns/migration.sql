ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "attendant_type" "AppointmentActorType",
  ADD COLUMN IF NOT EXISTS "attendant_user_id" UUID,
  ADD COLUMN IF NOT EXISTS "sold_by_vendor_id" UUID;

CREATE INDEX IF NOT EXISTS "leads_attendant_user_id_idx" ON "leads" ("attendant_user_id");
CREATE INDEX IF NOT EXISTS "leads_sold_by_vendor_id_idx" ON "leads" ("sold_by_vendor_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leads_attendant_user_id_fkey'
  ) THEN
    ALTER TABLE "leads"
      ADD CONSTRAINT "leads_attendant_user_id_fkey"
      FOREIGN KEY ("attendant_user_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leads_sold_by_vendor_id_fkey'
  ) THEN
    ALTER TABLE "leads"
      ADD CONSTRAINT "leads_sold_by_vendor_id_fkey"
      FOREIGN KEY ("sold_by_vendor_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill do atendente com base no último agendamento do lead.
UPDATE "leads" l
SET
  attendant_type = latest.created_by_type,
  attendant_user_id = CASE
    WHEN latest.created_by_type = 'user' THEN latest.created_by_id
    ELSE NULL
  END
FROM (
  SELECT DISTINCT ON (lead_id)
    lead_id,
    created_by_type,
    created_by_id
  FROM "appointments"
  ORDER BY lead_id, created_at DESC, id DESC
) latest
WHERE latest.lead_id = l.id;

-- Backfill do vendedor da venda com base na venda mais recente do lead.
UPDATE "leads" l
SET sold_by_vendor_id = latest.vendor_id
FROM (
  SELECT DISTINCT ON (lead_id)
    lead_id,
    vendor_id
  FROM "sales"
  ORDER BY lead_id, sold_at DESC, created_at DESC, id DESC
) latest
WHERE latest.lead_id = l.id;
