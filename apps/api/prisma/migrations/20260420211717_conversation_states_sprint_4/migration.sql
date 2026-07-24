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
