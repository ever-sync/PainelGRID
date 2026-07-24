-- CreateTable
CREATE TABLE "crm_pipelines" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_pipelines_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "leads" ADD COLUMN "crm_pipeline_id" UUID;

-- AlterTable
ALTER TABLE "crm_stages" ADD COLUMN "pipeline_id" UUID;
ALTER TABLE "crm_stages" ADD COLUMN "code" VARCHAR(40);
ALTER TABLE "crm_stages" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Seed migration pipeline for existing clients that already have stages
WITH source_clients AS (
  SELECT DISTINCT "client_id" FROM "crm_stages"
),
prepared AS (
  SELECT
    "client_id",
    md5((random()::text || clock_timestamp()::text || "client_id"::text)) AS h
  FROM source_clients
)
INSERT INTO "crm_pipelines" (
  "id",
  "client_id",
  "code",
  "name",
  "description",
  "is_active",
  "created_at",
  "updated_at"
)
SELECT
  (
    substr(h, 1, 8) || '-' ||
    substr(h, 9, 4) || '-' ||
    substr(h, 13, 4) || '-' ||
    substr(h, 17, 4) || '-' ||
    substr(h, 21, 12)
  )::uuid,
  "client_id",
  'PIP-' || upper(substr(h, 1, 8)),
  'Pipeline Padrao',
  'Pipeline criado automaticamente durante migracao',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM prepared;

-- Backfill crm_stages.pipeline_id and crm_stages.code based on each client pipeline
WITH ranked_stages AS (
  SELECT
    cs."id",
    cp."id" AS "pipeline_id",
    row_number() OVER (
      PARTITION BY cs."client_id"
      ORDER BY cs."display_order" ASC, cs."created_at" ASC, cs."id" ASC
    ) AS rn
  FROM "crm_stages" cs
  INNER JOIN "crm_pipelines" cp ON cp."client_id" = cs."client_id"
)
UPDATE "crm_stages" cs
SET
  "pipeline_id" = rs."pipeline_id",
  "display_order" = rs.rn,
  "code" = 'STG-' || upper(replace(substr(cs."id"::text, 1, 8), '-', ''))
FROM ranked_stages rs
WHERE cs."id" = rs."id";

-- Fill any edge case not covered by the UPDATE above
UPDATE "crm_stages"
SET "code" = 'STG-' || upper(replace(substr("id"::text, 1, 8), '-', ''))
WHERE "code" IS NULL;

-- Backfill lead.crm_pipeline_id from current lead stage relation
UPDATE "leads" l
SET "crm_pipeline_id" = cs."pipeline_id"
FROM "crm_stages" cs
WHERE l."crm_stage_id" = cs."id"
  AND l."crm_pipeline_id" IS NULL;

-- AlterTable
ALTER TABLE "crm_stages" ALTER COLUMN "pipeline_id" SET NOT NULL;
ALTER TABLE "crm_stages" ALTER COLUMN "code" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "crm_pipelines_code_key" ON "crm_pipelines"("code");
CREATE INDEX "crm_pipelines_client_id_idx" ON "crm_pipelines"("client_id");
CREATE INDEX "crm_pipelines_is_active_idx" ON "crm_pipelines"("is_active");
CREATE UNIQUE INDEX "crm_stages_code_key" ON "crm_stages"("code");
CREATE INDEX "crm_stages_pipeline_id_idx" ON "crm_stages"("pipeline_id");
CREATE UNIQUE INDEX "crm_stages_pipeline_id_display_order_key" ON "crm_stages"("pipeline_id", "display_order");
CREATE INDEX "leads_crm_pipeline_id_idx" ON "leads"("crm_pipeline_id");

-- AddForeignKey
ALTER TABLE "crm_pipelines" ADD CONSTRAINT "crm_pipelines_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "crm_stages" ADD CONSTRAINT "crm_stages_pipeline_id_fkey"
  FOREIGN KEY ("pipeline_id") REFERENCES "crm_pipelines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "leads" ADD CONSTRAINT "leads_crm_pipeline_id_fkey"
  FOREIGN KEY ("crm_pipeline_id") REFERENCES "crm_pipelines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
