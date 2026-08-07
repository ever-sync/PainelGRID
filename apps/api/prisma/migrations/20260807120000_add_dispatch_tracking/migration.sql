CREATE TABLE "dispatch_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "event_id" UUID,
    "lead_id" UUID NOT NULL,
    "conversation_id" UUID,
    "message_id" UUID,
    "appointment_id" UUID,
    "sale_id" UUID,
    "dispatch_key" VARCHAR(191) NOT NULL,
    "workflow_key" VARCHAR(160) NOT NULL,
    "dispatch_type" VARCHAR(80) NOT NULL,
    "channel" VARCHAR(40) NOT NULL,
    "provider" VARCHAR(80),
    "provider_message_id" VARCHAR(191),
    "template_name" VARCHAR(512),
    "status" VARCHAR(40) NOT NULL DEFAULT 'queued',
    "scheduled_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "replied_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "converted_at" TIMESTAMP(3),
    "conversion_type" VARCHAR(80),
    "revenue" DECIMAL(12,2),
    "failure_code" VARCHAR(100),
    "failure_reason" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispatch_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dispatch_events_client_id_dispatch_key_key"
    ON "dispatch_events"("client_id", "dispatch_key");
CREATE INDEX "dispatch_events_client_id_created_at_idx"
    ON "dispatch_events"("client_id", "created_at" DESC);
CREATE INDEX "dispatch_events_event_id_created_at_idx"
    ON "dispatch_events"("event_id", "created_at" DESC);
CREATE INDEX "dispatch_events_lead_id_created_at_idx"
    ON "dispatch_events"("lead_id", "created_at" DESC);
CREATE INDEX "dispatch_events_workflow_key_status_idx"
    ON "dispatch_events"("workflow_key", "status");
CREATE INDEX "dispatch_events_provider_message_id_idx"
    ON "dispatch_events"("provider_message_id");
CREATE INDEX "dispatch_events_appointment_id_idx"
    ON "dispatch_events"("appointment_id");
CREATE INDEX "dispatch_events_sale_id_idx"
    ON "dispatch_events"("sale_id");

ALTER TABLE "dispatch_events" ADD CONSTRAINT "dispatch_events_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dispatch_events" ADD CONSTRAINT "dispatch_events_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dispatch_events" ADD CONSTRAINT "dispatch_events_lead_id_fkey"
    FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dispatch_events" ADD CONSTRAINT "dispatch_events_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dispatch_events" ADD CONSTRAINT "dispatch_events_message_id_fkey"
    FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dispatch_events" ADD CONSTRAINT "dispatch_events_appointment_id_fkey"
    FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dispatch_events" ADD CONSTRAINT "dispatch_events_sale_id_fkey"
    FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
