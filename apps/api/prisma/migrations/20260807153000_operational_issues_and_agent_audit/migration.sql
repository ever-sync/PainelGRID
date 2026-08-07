ALTER TABLE "agent_action_logs"
  ADD COLUMN "previous_state" JSONB,
  ADD COLUMN "received_message" TEXT,
  ADD COLUMN "next_stage" VARCHAR(120),
  ADD COLUMN "tool_name" VARCHAR(120),
  ADD COLUMN "tool_input" JSONB,
  ADD COLUMN "api_response" JSONB,
  ADD COLUMN "resulting_state" JSONB,
  ADD COLUMN "block_reason" TEXT;

CREATE TABLE "operational_issues" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "client_id" UUID,
  "lead_id" UUID,
  "conversation_id" UUID,
  "event_id" UUID,
  "type" VARCHAR(80) NOT NULL,
  "severity" VARCHAR(20) NOT NULL DEFAULT 'warning',
  "status" VARCHAR(20) NOT NULL DEFAULT 'open',
  "title" VARCHAR(255) NOT NULL,
  "message" TEXT NOT NULL,
  "source" VARCHAR(80) NOT NULL,
  "fingerprint" VARCHAR(255) NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "occurrence_count" INTEGER NOT NULL DEFAULT 1,
  "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMP(3),
  "resolved_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "operational_issues_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "operational_issues_fingerprint_key" ON "operational_issues"("fingerprint");
CREATE INDEX "operational_issues_status_last_seen_at_idx" ON "operational_issues"("status", "last_seen_at" DESC);
CREATE INDEX "operational_issues_type_status_idx" ON "operational_issues"("type", "status");
CREATE INDEX "operational_issues_client_id_status_idx" ON "operational_issues"("client_id", "status");
CREATE INDEX "operational_issues_lead_id_idx" ON "operational_issues"("lead_id");
CREATE INDEX "operational_issues_conversation_id_idx" ON "operational_issues"("conversation_id");

CREATE TABLE "operational_heartbeats" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(120) NOT NULL,
  "client_id" UUID,
  "status" VARCHAR(20) NOT NULL DEFAULT 'healthy',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "operational_heartbeats_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "operational_heartbeats_name_key" ON "operational_heartbeats"("name");
CREATE INDEX "operational_heartbeats_status_last_seen_at_idx" ON "operational_heartbeats"("status", "last_seen_at");
CREATE INDEX "operational_heartbeats_client_id_idx" ON "operational_heartbeats"("client_id");
