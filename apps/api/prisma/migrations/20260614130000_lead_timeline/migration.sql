-- CreateEnum
CREATE TYPE "LeadTimelineEventType" AS ENUM ('created', 'stage_moved', 'status_changed', 'assigned', 'unassigned', 'tag_added', 'tag_removed', 'note', 'message');

-- CreateEnum
CREATE TYPE "LeadTimelineOrigin" AS ENUM ('crm', 'whatsapp', 'vendor', 'gestor', 'automation', 'integration', 'n8n', 'system');

-- CreateTable
CREATE TABLE "lead_timeline" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "event_type" "LeadTimelineEventType" NOT NULL,
    "origin" "LeadTimelineOrigin" NOT NULL DEFAULT 'system',
    "from_stage_id" UUID,
    "to_stage_id" UUID,
    "from_value" VARCHAR(160),
    "to_value" VARCHAR(160),
    "actor_id" UUID,
    "actor_label" VARCHAR(160),
    "notes" TEXT,
    "metadata" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_timeline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_timeline_lead_id_occurred_at_idx" ON "lead_timeline"("lead_id", "occurred_at");

-- CreateIndex
CREATE INDEX "lead_timeline_client_id_idx" ON "lead_timeline"("client_id");

-- AddForeignKey
ALTER TABLE "lead_timeline" ADD CONSTRAINT "lead_timeline_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
