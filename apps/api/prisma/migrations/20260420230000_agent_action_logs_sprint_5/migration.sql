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
