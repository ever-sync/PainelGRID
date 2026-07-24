-- ================================================
-- Migration: 20260324140910_
-- ================================================
-- CreateEnum
CREATE TYPE "Role" AS ENUM ('gestor', 'cliente', 'vendedor', 'recepcao');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('facebook_ads', 'form_page', 'whatsapp', 'import_excel', 'manual');

-- CreateEnum
CREATE TYPE "ConfirmationStatus" AS ENUM ('pending', 'confirmed', 'cancelled', 'checked_in');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('draft', 'active', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "DistributionMethod" AS ENUM ('round_robin', 'weighted', 'manual');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('draft', 'active', 'paused', 'completed');

-- CreateEnum
CREATE TYPE "ConversationChannel" AS ENUM ('whatsapp', 'internal');

-- CreateEnum
CREATE TYPE "SenderType" AS ENUM ('system', 'user', 'lead');

-- CreateEnum
CREATE TYPE "FacebookAccountStatus" AS ENUM ('active', 'expired', 'disconnected');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "Role" NOT NULL,
    "avatar_url" VARCHAR(500),
    "phone" VARCHAR(20),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "gestor_id" UUID NOT NULL,
    "company_name" VARCHAR(255) NOT NULL,
    "cnpj" VARCHAR(18),
    "logo_url" VARCHAR(500),
    "plan" VARCHAR(50) NOT NULL DEFAULT 'basic',
    "webhook_url_n8n" VARCHAR(500),
    "facebook_page_id" VARCHAR(100),
    "facebook_access_token" TEXT,
    "whatsapp_number" VARCHAR(20),
    "phone_number" VARCHAR(20),
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(20),
    "source" "LeadSource" NOT NULL,
    "crm_stage_id" UUID,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "event_interest_id" UUID,
    "confirmation_status" "ConfirmationStatus" NOT NULL DEFAULT 'pending',
    "confirmation_date" TIMESTAMP(3),
    "store_visit_datetime" TIMESTAMP(3),
    "assigned_vendor_id" UUID,
    "campaign_id" UUID,
    "notes" TEXT,
    "facebook_lead_id" VARCHAR(100),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "event_date" TIMESTAMP(3) NOT NULL,
    "location" VARCHAR(500),
    "capacity" INTEGER,
    "status" "EventStatus" NOT NULL DEFAULT 'draft',
    "cover_image_url" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_stages" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "display_order" INTEGER NOT NULL,
    "color" VARCHAR(7) NOT NULL DEFAULT '#6B7280',
    "is_final_stage" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_history" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "from_stage_id" UUID,
    "to_stage_id" UUID NOT NULL,
    "changed_by_user_id" UUID NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "lead_filter_rules" JSONB NOT NULL,
    "distribution_method" "DistributionMethod" NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_vendors" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "max_leads" INTEGER,
    "leads_assigned_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "campaign_vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "channel" "ConversationChannel" NOT NULL,
    "last_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_type" "SenderType" NOT NULL,
    "sender_id" UUID,
    "content" TEXT NOT NULL,
    "media_url" VARCHAR(500),
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "category" VARCHAR(100),
    "cover_image_url" VARCHAR(500),
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lessons" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "video_url" VARCHAR(500),
    "content_text" TEXT,
    "display_order" INTEGER NOT NULL,
    "duration_minutes" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_progress" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "score" INTEGER,

    CONSTRAINT "course_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "payload" JSONB NOT NULL,
    "destination_url" VARCHAR(500) NOT NULL,
    "http_status" INTEGER,
    "retries" INTEGER NOT NULL DEFAULT 0,
    "max_retries" INTEGER NOT NULL DEFAULT 5,
    "next_retry_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facebook_ad_accounts" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "ad_account_id" VARCHAR(100) NOT NULL,
    "access_token" TEXT NOT NULL,
    "page_id" VARCHAR(100) NOT NULL,
    "status" "FacebookAccountStatus" NOT NULL DEFAULT 'active',
    "last_sync_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facebook_ad_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "clients_gestor_id_idx" ON "clients"("gestor_id");

-- CreateIndex
CREATE INDEX "leads_client_id_idx" ON "leads"("client_id");

-- CreateIndex
CREATE INDEX "leads_assigned_vendor_id_idx" ON "leads"("assigned_vendor_id");

-- CreateIndex
CREATE INDEX "leads_crm_stage_id_idx" ON "leads"("crm_stage_id");

-- CreateIndex
CREATE INDEX "leads_source_idx" ON "leads"("source");

-- CreateIndex
CREATE INDEX "leads_confirmation_status_idx" ON "leads"("confirmation_status");

-- CreateIndex
CREATE INDEX "leads_store_visit_datetime_idx" ON "leads"("store_visit_datetime");

-- CreateIndex
CREATE INDEX "leads_deleted_at_idx" ON "leads"("deleted_at");

-- CreateIndex
CREATE INDEX "events_client_id_idx" ON "events"("client_id");

-- CreateIndex
CREATE INDEX "events_event_date_idx" ON "events"("event_date");

-- CreateIndex
CREATE INDEX "events_status_idx" ON "events"("status");

-- CreateIndex
CREATE INDEX "crm_stages_client_id_idx" ON "crm_stages"("client_id");

-- CreateIndex
CREATE INDEX "crm_history_lead_id_idx" ON "crm_history"("lead_id");

-- CreateIndex
CREATE INDEX "crm_history_created_at_idx" ON "crm_history"("created_at");

-- CreateIndex
CREATE INDEX "campaigns_client_id_idx" ON "campaigns"("client_id");

-- CreateIndex
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_vendors_campaign_id_vendor_id_key" ON "campaign_vendors"("campaign_id", "vendor_id");

-- CreateIndex
CREATE INDEX "conversations_client_id_idx" ON "conversations"("client_id");

-- CreateIndex
CREATE INDEX "conversations_lead_id_idx" ON "conversations"("lead_id");

-- CreateIndex
CREATE INDEX "conversations_last_message_at_idx" ON "conversations"("last_message_at");

-- CreateIndex
CREATE INDEX "messages_conversation_id_idx" ON "messages"("conversation_id");

-- CreateIndex
CREATE INDEX "messages_created_at_idx" ON "messages"("created_at");

-- CreateIndex
CREATE INDEX "lessons_course_id_idx" ON "lessons"("course_id");

-- CreateIndex
CREATE INDEX "course_progress_vendor_id_course_id_idx" ON "course_progress"("vendor_id", "course_id");

-- CreateIndex
CREATE UNIQUE INDEX "course_progress_vendor_id_lesson_id_key" ON "course_progress"("vendor_id", "lesson_id");

-- CreateIndex
CREATE INDEX "webhook_events_client_id_idx" ON "webhook_events"("client_id");

-- CreateIndex
CREATE INDEX "webhook_events_event_type_idx" ON "webhook_events"("event_type");

-- CreateIndex
CREATE INDEX "webhook_events_next_retry_at_idx" ON "webhook_events"("next_retry_at");

-- CreateIndex
CREATE INDEX "facebook_ad_accounts_client_id_idx" ON "facebook_ad_accounts"("client_id");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_gestor_id_fkey" FOREIGN KEY ("gestor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_crm_stage_id_fkey" FOREIGN KEY ("crm_stage_id") REFERENCES "crm_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_event_interest_id_fkey" FOREIGN KEY ("event_interest_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_vendor_id_fkey" FOREIGN KEY ("assigned_vendor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_stages" ADD CONSTRAINT "crm_stages_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_history" ADD CONSTRAINT "crm_history_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_history" ADD CONSTRAINT "crm_history_from_stage_id_fkey" FOREIGN KEY ("from_stage_id") REFERENCES "crm_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_history" ADD CONSTRAINT "crm_history_to_stage_id_fkey" FOREIGN KEY ("to_stage_id") REFERENCES "crm_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_history" ADD CONSTRAINT "crm_history_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_vendors" ADD CONSTRAINT "campaign_vendors_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_vendors" ADD CONSTRAINT "campaign_vendors_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_progress" ADD CONSTRAINT "course_progress_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_progress" ADD CONSTRAINT "course_progress_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_progress" ADD CONSTRAINT "course_progress_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facebook_ad_accounts" ADD CONSTRAINT "facebook_ad_accounts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ================================================
-- Migration: 20260331103000_crm_pipelines_and_codes
-- ================================================
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

-- ================================================
-- Migration: 20260331111500_api_idempotency_requests
-- ================================================
-- CreateTable
CREATE TABLE "api_idempotency_requests" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "endpoint" VARCHAR(120) NOT NULL,
    "idempotency_key" VARCHAR(120) NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "response" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_idempotency_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_idempotency_requests_client_id_endpoint_idempotency_key_key"
  ON "api_idempotency_requests"("client_id", "endpoint", "idempotency_key");
CREATE INDEX "api_idempotency_requests_created_at_idx" ON "api_idempotency_requests"("created_at");

-- AddForeignKey
ALTER TABLE "api_idempotency_requests" ADD CONSTRAINT "api_idempotency_requests_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ================================================
-- Migration: 20260407123333_gpdevendas
-- ================================================
-- AlterTable
ALTER TABLE "crm_stages" ALTER COLUMN "updated_at" DROP DEFAULT;

-- ================================================
-- Migration: 20260407161255_meta_bm_integration
-- ================================================
-- CreateEnum
CREATE TYPE "MetaConnectionStatus" AS ENUM ('pending', 'connected', 'expired', 'disconnected');

-- CreateEnum
CREATE TYPE "MetaSyncJobStatus" AS ENUM ('pending', 'running', 'completed', 'failed');

-- CreateTable
CREATE TABLE "meta_connections" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "business_id" VARCHAR(100) NOT NULL,
    "business_name" VARCHAR(255) NOT NULL,
    "access_token" TEXT NOT NULL,
    "token_expires_at" TIMESTAMP(3),
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "MetaConnectionStatus" NOT NULL DEFAULT 'pending',
    "oauth_state" VARCHAR(120),
    "last_sync_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_asset_selections" (
    "id" UUID NOT NULL,
    "meta_connection_id" UUID NOT NULL,
    "ad_account_id" VARCHAR(100),
    "ad_account_name" VARCHAR(255),
    "page_id" VARCHAR(100),
    "page_name" VARCHAR(255),
    "form_id" VARCHAR(100),
    "form_name" VARCHAR(255),
    "waba_id" VARCHAR(100),
    "phone_number_id" VARCHAR(100),
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_asset_selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_campaigns" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "meta_connection_id" UUID NOT NULL,
    "meta_campaign_id" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "status" VARCHAR(50),
    "objective" VARCHAR(100),
    "daily_budget" DECIMAL(12,2),
    "lifetime_budget" DECIMAL(12,2),
    "start_time" TIMESTAMP(3),
    "stop_time" TIMESTAMP(3),
    "raw_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_ad_sets" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "meta_connection_id" UUID NOT NULL,
    "meta_campaign_id" VARCHAR(100),
    "meta_ad_set_id" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "status" VARCHAR(50),
    "daily_budget" DECIMAL(12,2),
    "lifetime_budget" DECIMAL(12,2),
    "raw_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_ad_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_ads" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "meta_connection_id" UUID NOT NULL,
    "meta_campaign_id" VARCHAR(100),
    "meta_ad_set_id" VARCHAR(100),
    "meta_ad_id" VARCHAR(100) NOT NULL,
    "meta_creative_id" VARCHAR(100),
    "name" VARCHAR(255) NOT NULL,
    "status" VARCHAR(50),
    "effective_status" VARCHAR(50),
    "raw_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_ads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_creatives" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "meta_connection_id" UUID NOT NULL,
    "meta_creative_id" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255),
    "title" VARCHAR(255),
    "body" TEXT,
    "image_url" VARCHAR(500),
    "video_id" VARCHAR(100),
    "url_tags" TEXT,
    "object_story_id" VARCHAR(100),
    "raw_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_creatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_lead_forms" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "meta_connection_id" UUID NOT NULL,
    "page_id" VARCHAR(100),
    "meta_form_id" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "status" VARCHAR(50),
    "questions_payload" JSONB,
    "raw_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_lead_forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_lead_imports" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "meta_connection_id" UUID NOT NULL,
    "lead_id" UUID,
    "meta_lead_id" VARCHAR(100) NOT NULL,
    "meta_form_id" VARCHAR(100),
    "meta_campaign_id" VARCHAR(100),
    "meta_ad_set_id" VARCHAR(100),
    "meta_ad_id" VARCHAR(100),
    "meta_creative_id" VARCHAR(100),
    "utm_campaign" VARCHAR(255),
    "utm_content" VARCHAR(255),
    "utm_term" VARCHAR(255),
    "referral_context" VARCHAR(255),
    "raw_payload" JSONB,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meta_lead_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_daily_insights" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "meta_connection_id" UUID NOT NULL,
    "level" VARCHAR(20) NOT NULL,
    "entity_id" VARCHAR(100) NOT NULL,
    "entity_name" VARCHAR(255),
    "date" TIMESTAMP(3) NOT NULL,
    "spend" DECIMAL(12,2),
    "impressions" INTEGER,
    "clicks" INTEGER,
    "cpc" DECIMAL(12,4),
    "ctr" DECIMAL(12,4),
    "leads" INTEGER,
    "reach" INTEGER,
    "frequency" DECIMAL(12,4),
    "raw_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_daily_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_attribution_events" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "meta_connection_id" UUID,
    "lead_id" UUID,
    "conversation_id" UUID,
    "meta_lead_id" VARCHAR(100),
    "ctwa_clid" VARCHAR(255),
    "meta_campaign_id" VARCHAR(100),
    "meta_ad_set_id" VARCHAR(100),
    "meta_ad_id" VARCHAR(100),
    "event_type" VARCHAR(50) NOT NULL,
    "event_value" DECIMAL(12,2),
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "raw_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_attribution_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_sync_jobs" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "meta_connection_id" UUID,
    "job_type" VARCHAR(50) NOT NULL,
    "status" "MetaSyncJobStatus" NOT NULL DEFAULT 'pending',
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "error_message" TEXT,
    "context" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meta_connections_oauth_state_key" ON "meta_connections"("oauth_state");

-- CreateIndex
CREATE INDEX "meta_connections_client_id_idx" ON "meta_connections"("client_id");

-- CreateIndex
CREATE INDEX "meta_connections_status_idx" ON "meta_connections"("status");

-- CreateIndex
CREATE UNIQUE INDEX "meta_connections_client_id_business_id_key" ON "meta_connections"("client_id", "business_id");

-- CreateIndex
CREATE INDEX "meta_asset_selections_meta_connection_id_idx" ON "meta_asset_selections"("meta_connection_id");

-- CreateIndex
CREATE INDEX "meta_campaigns_client_id_idx" ON "meta_campaigns"("client_id");

-- CreateIndex
CREATE INDEX "meta_campaigns_meta_connection_id_idx" ON "meta_campaigns"("meta_connection_id");

-- CreateIndex
CREATE UNIQUE INDEX "meta_campaigns_meta_connection_id_meta_campaign_id_key" ON "meta_campaigns"("meta_connection_id", "meta_campaign_id");

-- CreateIndex
CREATE INDEX "meta_ad_sets_client_id_idx" ON "meta_ad_sets"("client_id");

-- CreateIndex
CREATE INDEX "meta_ad_sets_meta_connection_id_idx" ON "meta_ad_sets"("meta_connection_id");

-- CreateIndex
CREATE UNIQUE INDEX "meta_ad_sets_meta_connection_id_meta_ad_set_id_key" ON "meta_ad_sets"("meta_connection_id", "meta_ad_set_id");

-- CreateIndex
CREATE INDEX "meta_ads_client_id_idx" ON "meta_ads"("client_id");

-- CreateIndex
CREATE INDEX "meta_ads_meta_connection_id_idx" ON "meta_ads"("meta_connection_id");

-- CreateIndex
CREATE UNIQUE INDEX "meta_ads_meta_connection_id_meta_ad_id_key" ON "meta_ads"("meta_connection_id", "meta_ad_id");

-- CreateIndex
CREATE INDEX "meta_creatives_client_id_idx" ON "meta_creatives"("client_id");

-- CreateIndex
CREATE INDEX "meta_creatives_meta_connection_id_idx" ON "meta_creatives"("meta_connection_id");

-- CreateIndex
CREATE UNIQUE INDEX "meta_creatives_meta_connection_id_meta_creative_id_key" ON "meta_creatives"("meta_connection_id", "meta_creative_id");

-- CreateIndex
CREATE INDEX "meta_lead_forms_client_id_idx" ON "meta_lead_forms"("client_id");

-- CreateIndex
CREATE INDEX "meta_lead_forms_meta_connection_id_idx" ON "meta_lead_forms"("meta_connection_id");

-- CreateIndex
CREATE UNIQUE INDEX "meta_lead_forms_meta_connection_id_meta_form_id_key" ON "meta_lead_forms"("meta_connection_id", "meta_form_id");

-- CreateIndex
CREATE INDEX "meta_lead_imports_client_id_idx" ON "meta_lead_imports"("client_id");

-- CreateIndex
CREATE INDEX "meta_lead_imports_meta_connection_id_idx" ON "meta_lead_imports"("meta_connection_id");

-- CreateIndex
CREATE INDEX "meta_lead_imports_lead_id_idx" ON "meta_lead_imports"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "meta_lead_imports_meta_connection_id_meta_lead_id_key" ON "meta_lead_imports"("meta_connection_id", "meta_lead_id");

-- CreateIndex
CREATE INDEX "meta_daily_insights_client_id_idx" ON "meta_daily_insights"("client_id");

-- CreateIndex
CREATE INDEX "meta_daily_insights_meta_connection_id_idx" ON "meta_daily_insights"("meta_connection_id");

-- CreateIndex
CREATE UNIQUE INDEX "meta_daily_insights_meta_connection_id_level_entity_id_date_key" ON "meta_daily_insights"("meta_connection_id", "level", "entity_id", "date");

-- CreateIndex
CREATE INDEX "whatsapp_attribution_events_client_id_idx" ON "whatsapp_attribution_events"("client_id");

-- CreateIndex
CREATE INDEX "whatsapp_attribution_events_meta_connection_id_idx" ON "whatsapp_attribution_events"("meta_connection_id");

-- CreateIndex
CREATE INDEX "whatsapp_attribution_events_lead_id_idx" ON "whatsapp_attribution_events"("lead_id");

-- CreateIndex
CREATE INDEX "whatsapp_attribution_events_conversation_id_idx" ON "whatsapp_attribution_events"("conversation_id");

-- CreateIndex
CREATE INDEX "whatsapp_attribution_events_event_type_idx" ON "whatsapp_attribution_events"("event_type");

-- CreateIndex
CREATE INDEX "meta_sync_jobs_client_id_idx" ON "meta_sync_jobs"("client_id");

-- CreateIndex
CREATE INDEX "meta_sync_jobs_meta_connection_id_idx" ON "meta_sync_jobs"("meta_connection_id");

-- CreateIndex
CREATE INDEX "meta_sync_jobs_status_idx" ON "meta_sync_jobs"("status");

-- AddForeignKey
ALTER TABLE "meta_connections" ADD CONSTRAINT "meta_connections_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_asset_selections" ADD CONSTRAINT "meta_asset_selections_meta_connection_id_fkey" FOREIGN KEY ("meta_connection_id") REFERENCES "meta_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_campaigns" ADD CONSTRAINT "meta_campaigns_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_campaigns" ADD CONSTRAINT "meta_campaigns_meta_connection_id_fkey" FOREIGN KEY ("meta_connection_id") REFERENCES "meta_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_ad_sets" ADD CONSTRAINT "meta_ad_sets_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_ad_sets" ADD CONSTRAINT "meta_ad_sets_meta_connection_id_fkey" FOREIGN KEY ("meta_connection_id") REFERENCES "meta_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_ads" ADD CONSTRAINT "meta_ads_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_ads" ADD CONSTRAINT "meta_ads_meta_connection_id_fkey" FOREIGN KEY ("meta_connection_id") REFERENCES "meta_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_creatives" ADD CONSTRAINT "meta_creatives_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_creatives" ADD CONSTRAINT "meta_creatives_meta_connection_id_fkey" FOREIGN KEY ("meta_connection_id") REFERENCES "meta_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_lead_forms" ADD CONSTRAINT "meta_lead_forms_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_lead_forms" ADD CONSTRAINT "meta_lead_forms_meta_connection_id_fkey" FOREIGN KEY ("meta_connection_id") REFERENCES "meta_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_lead_imports" ADD CONSTRAINT "meta_lead_imports_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_lead_imports" ADD CONSTRAINT "meta_lead_imports_meta_connection_id_fkey" FOREIGN KEY ("meta_connection_id") REFERENCES "meta_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_lead_imports" ADD CONSTRAINT "meta_lead_imports_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_daily_insights" ADD CONSTRAINT "meta_daily_insights_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_daily_insights" ADD CONSTRAINT "meta_daily_insights_meta_connection_id_fkey" FOREIGN KEY ("meta_connection_id") REFERENCES "meta_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_attribution_events" ADD CONSTRAINT "whatsapp_attribution_events_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_attribution_events" ADD CONSTRAINT "whatsapp_attribution_events_meta_connection_id_fkey" FOREIGN KEY ("meta_connection_id") REFERENCES "meta_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_attribution_events" ADD CONSTRAINT "whatsapp_attribution_events_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_attribution_events" ADD CONSTRAINT "whatsapp_attribution_events_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_sync_jobs" ADD CONSTRAINT "meta_sync_jobs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_sync_jobs" ADD CONSTRAINT "meta_sync_jobs_meta_connection_id_fkey" FOREIGN KEY ("meta_connection_id") REFERENCES "meta_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ================================================
-- Migration: 20260410120000_user_client_id
-- ================================================
-- AlterTable
ALTER TABLE "users" ADD COLUMN "client_id" UUID;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "users_client_id_idx" ON "users"("client_id");

-- ================================================
-- Migration: 20260410140000_lead_checkin_token
-- ================================================
-- AlterTable
ALTER TABLE "leads" ADD COLUMN "checkin_token" VARCHAR(64);

-- CreateIndex
CREATE UNIQUE INDEX "leads_checkin_token_key" ON "leads"("checkin_token");

-- ================================================
-- Migration: 20260410160000_user_meta_gestor_token
-- ================================================
-- AlterTable
ALTER TABLE "users" ADD COLUMN "meta_gestor_access_token" TEXT,
ADD COLUMN "meta_gestor_token_expires_at" TIMESTAMP(3),
ADD COLUMN "meta_gestor_scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "meta_gestor_connected_at" TIMESTAMP(3);

-- ================================================
-- Migration: 20260420210105_appointments_sprint_3
-- ================================================
-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM (
    'proposed',
    'scheduled',
    'confirmed',
    'cancelled',
    'completed',
    'no_show',
    'rescheduled'
);

-- CreateEnum
CREATE TYPE "AppointmentChannel" AS ENUM (
    'whatsapp',
    'internal',
    'manual'
);

-- CreateEnum
CREATE TYPE "AppointmentSource" AS ENUM (
    'n8n_ai_agent',
    'gestor',
    'cliente',
    'vendedor',
    'recepcao',
    'system'
);

-- CreateEnum
CREATE TYPE "AppointmentActorType" AS ENUM (
    'user',
    'system',
    'external_agent'
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "conversation_id" UUID,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "timezone" VARCHAR(80) NOT NULL DEFAULT 'America/Sao_Paulo',
    "status" "AppointmentStatus" NOT NULL DEFAULT 'scheduled',
    "channel" "AppointmentChannel" NOT NULL DEFAULT 'whatsapp',
    "source" "AppointmentSource" NOT NULL DEFAULT 'n8n_ai_agent',
    "created_by_type" "AppointmentActorType" NOT NULL DEFAULT 'external_agent',
    "created_by_id" UUID,
    "confirmed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "no_show_at" TIMESTAMP(3),
    "rescheduled_from_appointment_id" UUID,
    "notes" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointments_client_id_idx" ON "appointments"("client_id");

-- CreateIndex
CREATE INDEX "appointments_lead_id_idx" ON "appointments"("lead_id");

-- CreateIndex
CREATE INDEX "appointments_event_id_idx" ON "appointments"("event_id");

-- CreateIndex
CREATE INDEX "appointments_conversation_id_idx" ON "appointments"("conversation_id");

-- CreateIndex
CREATE INDEX "appointments_scheduled_at_idx" ON "appointments"("scheduled_at");

-- CreateIndex
CREATE INDEX "appointments_status_idx" ON "appointments"("status");

-- CreateIndex
CREATE INDEX "appointments_rescheduled_from_appointment_id_idx" ON "appointments"("rescheduled_from_appointment_id");

-- AddForeignKey
ALTER TABLE "appointments"
ADD CONSTRAINT "appointments_client_id_fkey"
FOREIGN KEY ("client_id") REFERENCES "clients"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments"
ADD CONSTRAINT "appointments_lead_id_fkey"
FOREIGN KEY ("lead_id") REFERENCES "leads"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments"
ADD CONSTRAINT "appointments_event_id_fkey"
FOREIGN KEY ("event_id") REFERENCES "events"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments"
ADD CONSTRAINT "appointments_conversation_id_fkey"
FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments"
ADD CONSTRAINT "appointments_rescheduled_from_appointment_id_fkey"
FOREIGN KEY ("rescheduled_from_appointment_id") REFERENCES "appointments"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- ================================================
-- Migration: 20260420211717_conversation_states_sprint_4
-- ================================================
-- CreateTable
CREATE TABLE "conversation_states" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "current_intent" VARCHAR(120),
    "awaiting_confirmation" BOOLEAN NOT NULL DEFAULT false,
    "last_offered_event_id" UUID,
    "last_offered_slot" TIMESTAMP(3),
    "last_agent_action" VARCHAR(120),
    "handoff_required" BOOLEAN NOT NULL DEFAULT false,
    "handoff_reason" TEXT,
    "state_payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conversation_states_conversation_id_key" ON "conversation_states"("conversation_id");

-- CreateIndex
CREATE INDEX "conversation_states_client_id_idx" ON "conversation_states"("client_id");

-- CreateIndex
CREATE INDEX "conversation_states_lead_id_idx" ON "conversation_states"("lead_id");

-- CreateIndex
CREATE INDEX "conversation_states_last_offered_event_id_idx" ON "conversation_states"("last_offered_event_id");

-- CreateIndex
CREATE INDEX "conversation_states_updated_at_idx" ON "conversation_states"("updated_at");

-- AddForeignKey
ALTER TABLE "conversation_states"
ADD CONSTRAINT "conversation_states_conversation_id_fkey"
FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_states"
ADD CONSTRAINT "conversation_states_client_id_fkey"
FOREIGN KEY ("client_id") REFERENCES "clients"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_states"
ADD CONSTRAINT "conversation_states_lead_id_fkey"
FOREIGN KEY ("lead_id") REFERENCES "leads"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_states"
ADD CONSTRAINT "conversation_states_last_offered_event_id_fkey"
FOREIGN KEY ("last_offered_event_id") REFERENCES "events"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- ================================================
-- Migration: 20260420230000_agent_action_logs_sprint_5
-- ================================================
CREATE TABLE "agent_action_logs" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "provider" VARCHAR(80),
    "model" VARCHAR(120),
    "trigger_type" VARCHAR(80) NOT NULL,
    "decision_type" VARCHAR(80) NOT NULL,
    "confidence" DOUBLE PRECISION,
    "input_summary" TEXT,
    "output_summary" TEXT,
    "action_payload" JSONB NOT NULL DEFAULT '{}',
    "result_status" VARCHAR(80) NOT NULL,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_action_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "agent_action_logs_client_id_idx" ON "agent_action_logs"("client_id");
CREATE INDEX "agent_action_logs_lead_id_idx" ON "agent_action_logs"("lead_id");
CREATE INDEX "agent_action_logs_conversation_id_created_at_idx" ON "agent_action_logs"("conversation_id", "created_at");
CREATE INDEX "agent_action_logs_decision_type_idx" ON "agent_action_logs"("decision_type");
CREATE INDEX "agent_action_logs_result_status_idx" ON "agent_action_logs"("result_status");
CREATE INDEX "agent_action_logs_created_at_idx" ON "agent_action_logs"("created_at");

ALTER TABLE "agent_action_logs"
ADD CONSTRAINT "agent_action_logs_client_id_fkey"
FOREIGN KEY ("client_id") REFERENCES "clients"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "agent_action_logs"
ADD CONSTRAINT "agent_action_logs_lead_id_fkey"
FOREIGN KEY ("lead_id") REFERENCES "leads"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "agent_action_logs"
ADD CONSTRAINT "agent_action_logs_conversation_id_fkey"
FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- ================================================
-- Migration: 20260428_add_sales_and_score
-- ================================================
-- CreateEnum
CREATE TYPE "SaleType" AS ENUM ('NOVO', 'SEMINOVO', 'VENDA_DIRETA', 'PCD');

-- CreateEnum
CREATE TYPE "ScoreEventKind" AS ENUM ('scheduled', 'checked_in', 'sold');

-- CreateTable
CREATE TABLE "sales" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "type" "SaleType" NOT NULL,
    "model" VARCHAR(255) NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "sold_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "sale_id" UUID,
    "kind" "ScoreEventKind" NOT NULL,
    "points" INTEGER NOT NULL,
    "earned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "score_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_appointment_id_key" ON "sales"("appointment_id");

-- CreateIndex
CREATE INDEX "sales_client_id_idx" ON "sales"("client_id");

-- CreateIndex
CREATE INDEX "sales_lead_id_idx" ON "sales"("lead_id");

-- CreateIndex
CREATE INDEX "sales_vendor_id_idx" ON "sales"("vendor_id");

-- CreateIndex
CREATE INDEX "sales_sold_at_idx" ON "sales"("sold_at");

-- CreateIndex
CREATE UNIQUE INDEX "score_events_appointment_id_kind_key" ON "score_events"("appointment_id", "kind");

-- CreateIndex
CREATE INDEX "score_events_client_id_idx" ON "score_events"("client_id");

-- CreateIndex
CREATE INDEX "score_events_vendor_id_idx" ON "score_events"("vendor_id");

-- CreateIndex
CREATE INDEX "score_events_lead_id_idx" ON "score_events"("lead_id");

-- CreateIndex
CREATE INDEX "score_events_sale_id_idx" ON "score_events"("sale_id");

-- CreateIndex
CREATE INDEX "score_events_earned_at_idx" ON "score_events"("earned_at");

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_lead_id_fkey"
    FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_appointment_id_fkey"
    FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_vendor_id_fkey"
    FOREIGN KEY ("vendor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_events" ADD CONSTRAINT "score_events_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_events" ADD CONSTRAINT "score_events_vendor_id_fkey"
    FOREIGN KEY ("vendor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_events" ADD CONSTRAINT "score_events_lead_id_fkey"
    FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_events" ADD CONSTRAINT "score_events_appointment_id_fkey"
    FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_events" ADD CONSTRAINT "score_events_sale_id_fkey"
    FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ================================================
-- Migration: 20260428_add_sales_teams
-- ================================================
-- CreateTable: SalesTeam
CREATE TABLE "sales_teams" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sales_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable: SalesTeamMember
CREATE TABLE "sales_team_members" (
    "team_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sales_team_members_pkey" PRIMARY KEY ("team_id","user_id")
);

-- CreateIndex
CREATE INDEX "sales_teams_client_id_idx" ON "sales_teams"("client_id");

-- CreateIndex
CREATE INDEX "sales_team_members_user_id_idx" ON "sales_team_members"("user_id");

-- AddForeignKey
ALTER TABLE "sales_teams" ADD CONSTRAINT "sales_teams_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_team_members" ADD CONSTRAINT "sales_team_members_team_id_fkey"
    FOREIGN KEY ("team_id") REFERENCES "sales_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_team_members" ADD CONSTRAINT "sales_team_members_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ================================================
-- Migration: 20260503_add_message_external_id_wamid
-- ================================================
ALTER TABLE "messages"
ADD COLUMN "external_id" VARCHAR(191);

CREATE UNIQUE INDEX "messages_external_id_key"
ON "messages"("external_id");

-- ================================================
-- Migration: 20260503_add_message_media_id
-- ================================================
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "media_id" VARCHAR(191);

-- ================================================
-- Migration: 20260503_add_perf_indexes
-- ================================================
-- Performance indexes recommended by MELHORIAS.md (Sec. 4)
-- Partial composite index for the most common Leads listing query
-- (filter por cliente + ordenar por created_at desc, ignorando soft-deleted).
CREATE INDEX IF NOT EXISTS "idx_leads_client_created"
  ON "leads" ("client_id", "created_at" DESC)
  WHERE "deleted_at" IS NULL;

-- Nota: crm_stages já possui UNIQUE (pipeline_id, display_order) — esse
-- índice único atende as consultas de Kanban; nenhuma criação adicional necessária.

-- ================================================
-- Migration: 20260504051614_npx_prisma_generate_schema_apps_api_prisma_schema_prisma
-- ================================================
-- AlterTable
ALTER TABLE "sales" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "sales_teams" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- ================================================
-- Migration: 20260722220000_add_closed_to_confirmation_status
-- ================================================
-- AlterEnum
ALTER TYPE "ConfirmationStatus" ADD VALUE IF NOT EXISTS 'closed';

-- ================================================
-- Migration: 20260722223000_add_cpf_and_wristband_to_lead
-- ================================================
-- AlterTable
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "cpf" VARCHAR(20),
ADD COLUMN IF NOT EXISTS "wristband_number" VARCHAR(50);

-- ================================================
-- Migration: 20260722225000_add_require_wristband_to_event
-- ================================================
-- AlterTable
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "require_wristband" BOOLEAN NOT NULL DEFAULT false;



