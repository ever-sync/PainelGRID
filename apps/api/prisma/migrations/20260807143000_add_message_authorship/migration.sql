ALTER TABLE "messages"
  ADD COLUMN "author_type" VARCHAR(40) NOT NULL DEFAULT 'legacy_unknown',
  ADD COLUMN "origin" VARCHAR(40) NOT NULL DEFAULT 'legacy',
  ADD COLUMN "workflow_key" VARCHAR(160),
  ADD COLUMN "template_name" VARCHAR(512),
  ADD COLUMN "agent_action_log_id" UUID;

UPDATE "messages"
SET
  "author_type" = CASE
    WHEN "sender_type" = 'lead' THEN 'lead'
    WHEN "external_id" LIKE 'n8n-history:%' AND "sender_type" = 'user' THEN 'rubinho'
    WHEN "content" LIKE 'Template WhatsApp enviado:%' THEN 'template'
    WHEN "sender_type" = 'user' AND "sender_id" IS NOT NULL THEN 'human'
    WHEN "sender_type" = 'system' THEN 'system'
    ELSE 'automation'
  END,
  "origin" = CASE
    WHEN "sender_type" = 'lead' THEN 'whatsapp'
    WHEN "external_id" LIKE 'n8n-history:%' THEN 'n8n'
    WHEN "content" LIKE 'Template WhatsApp enviado:%' THEN 'meta_template'
    WHEN "sender_type" = 'user' AND "sender_id" IS NOT NULL THEN 'panel'
    WHEN "sender_type" = 'system' THEN 'system'
    ELSE 'legacy'
  END,
  "workflow_key" = CASE
    WHEN "external_id" LIKE 'n8n-history:%' THEN 'n8n-agent-history'
    ELSE NULL
  END,
  "template_name" = CASE
    WHEN "content" LIKE 'Template WhatsApp enviado:%'
      THEN trim(substring("content" FROM length('Template WhatsApp enviado:') + 1))
    ELSE NULL
  END;

CREATE INDEX "messages_author_type_created_at_idx"
  ON "messages"("author_type", "created_at");
CREATE INDEX "messages_workflow_key_idx" ON "messages"("workflow_key");
CREATE INDEX "messages_agent_action_log_id_idx"
  ON "messages"("agent_action_log_id");

ALTER TABLE "messages" ADD CONSTRAINT "messages_agent_action_log_id_fkey"
  FOREIGN KEY ("agent_action_log_id") REFERENCES "agent_action_logs"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
