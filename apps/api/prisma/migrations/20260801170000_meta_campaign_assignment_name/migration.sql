-- Nome da campanha no momento do vinculo, para exibir sem depender de sync
-- nem de ida a Graph API a cada render.
ALTER TABLE "meta_campaign_assignments"
  ADD COLUMN IF NOT EXISTS "campaign_name" VARCHAR(255);
