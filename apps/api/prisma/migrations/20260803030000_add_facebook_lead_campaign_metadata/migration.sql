-- Metadados recebidos por integracoes de Facebook Lead Ads.
-- `created_at` continua representando a ingestao no PainelGRID; o horario da
-- plataforma de origem fica separado em `source_created_at`.
ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "facebook_form_id" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "facebook_ad_id" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "facebook_ad_name" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "facebook_campaign_id" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "facebook_campaign_name" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "preferred_contact_channel" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "source_created_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "source_payload" JSONB;

CREATE INDEX IF NOT EXISTS "leads_client_id_facebook_lead_id_idx"
  ON "leads"("client_id", "facebook_lead_id");

CREATE INDEX IF NOT EXISTS "leads_client_id_facebook_campaign_id_idx"
  ON "leads"("client_id", "facebook_campaign_id");
