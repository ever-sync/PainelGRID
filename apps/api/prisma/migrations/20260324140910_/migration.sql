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
