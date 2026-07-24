-- Prevent duplicate active leads per client and email.
-- Keep the oldest active row and soft-delete newer duplicates so the unique index can be created.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY client_id, email
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM leads
  WHERE deleted_at IS NULL
    AND email IS NOT NULL
)
UPDATE leads
SET deleted_at = NOW()
WHERE id IN (
  SELECT id
  FROM ranked
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS "leads_client_id_email_active_unique"
  ON "leads" ("client_id", "email")
  WHERE "deleted_at" IS NULL
    AND "email" IS NOT NULL;
