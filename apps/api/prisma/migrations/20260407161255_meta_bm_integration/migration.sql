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
