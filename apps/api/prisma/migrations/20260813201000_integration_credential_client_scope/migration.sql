ALTER TABLE "integration_credentials"
  ADD COLUMN IF NOT EXISTS "allowed_client_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];

UPDATE "integration_credentials"
SET "allowed_client_ids" = ARRAY[
  '062e24b9-7f4f-4906-b749-2dfecf2f3c87'::UUID,
  '2370a610-3e07-4a84-8f6e-fd49af6fa2f6'::UUID
]
WHERE "name" = 'n8n produção'
  AND "revoked_at" IS NULL;
