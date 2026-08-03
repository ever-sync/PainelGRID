-- Mapeamento persistente formulario Meta -> cliente/evento/pipeline/etapas.
-- A tabela e independente de meta_asset_selections porque os ativos sao
-- apagados e recriados sempre que a conexao Meta e salva.

CREATE TABLE IF NOT EXISTS "meta_lead_routing_rules" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "form_id" VARCHAR(100) NOT NULL,
    "form_name" VARCHAR(255),
    "event_id" UUID NOT NULL,
    "crm_pipeline_id" UUID NOT NULL,
    "call_stage_id" UUID NOT NULL,
    "whatsapp_stage_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_lead_routing_rules_pkey" PRIMARY KEY ("id")
);

-- Um formulario Meta tem exatamente um dono operacional.
CREATE UNIQUE INDEX IF NOT EXISTS "meta_lead_routing_rules_form_id_key"
    ON "meta_lead_routing_rules"("form_id");
CREATE INDEX IF NOT EXISTS "meta_lead_routing_rules_client_id_idx"
    ON "meta_lead_routing_rules"("client_id");
CREATE INDEX IF NOT EXISTS "meta_lead_routing_rules_event_id_idx"
    ON "meta_lead_routing_rules"("event_id");
CREATE INDEX IF NOT EXISTS "meta_lead_routing_rules_crm_pipeline_id_idx"
    ON "meta_lead_routing_rules"("crm_pipeline_id");
CREATE INDEX IF NOT EXISTS "meta_lead_routing_rules_call_stage_id_idx"
    ON "meta_lead_routing_rules"("call_stage_id");
CREATE INDEX IF NOT EXISTS "meta_lead_routing_rules_whatsapp_stage_id_idx"
    ON "meta_lead_routing_rules"("whatsapp_stage_id");

ALTER TABLE "meta_lead_routing_rules"
    ADD CONSTRAINT "meta_lead_routing_rules_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "meta_lead_routing_rules"
    ADD CONSTRAINT "meta_lead_routing_rules_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meta_lead_routing_rules"
    ADD CONSTRAINT "meta_lead_routing_rules_crm_pipeline_id_fkey"
    FOREIGN KEY ("crm_pipeline_id") REFERENCES "crm_pipelines"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meta_lead_routing_rules"
    ADD CONSTRAINT "meta_lead_routing_rules_call_stage_id_fkey"
    FOREIGN KEY ("call_stage_id") REFERENCES "crm_stages"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meta_lead_routing_rules"
    ADD CONSTRAINT "meta_lead_routing_rules_whatsapp_stage_id_fkey"
    FOREIGN KEY ("whatsapp_stage_id") REFERENCES "crm_stages"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "meta_lead_routing_rules" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "meta_lead_routing_rules" FROM "anon", "authenticated";
