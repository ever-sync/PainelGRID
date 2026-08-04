-- Mantem no lead a atribuicao mais recente para consulta operacional rapida.
ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "facebook_ad_set_id" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "facebook_ad_set_name" VARCHAR(255);

-- MetaLeadImport e o historico imutavel de cada conversao recebida da Meta.
ALTER TABLE "meta_lead_imports"
  ADD COLUMN IF NOT EXISTS "event_id" UUID,
  ADD COLUMN IF NOT EXISTS "meta_campaign_name" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "meta_ad_set_name" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "meta_ad_name" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "preferred_contact_channel" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "source_created_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "meta_lead_imports_event_id_idx"
  ON "meta_lead_imports"("event_id");
CREATE INDEX IF NOT EXISTS "meta_lead_imports_client_id_event_id_idx"
  ON "meta_lead_imports"("client_id", "event_id");
CREATE INDEX IF NOT EXISTS "meta_lead_imports_meta_campaign_id_idx"
  ON "meta_lead_imports"("meta_campaign_id");
CREATE INDEX IF NOT EXISTS "meta_lead_imports_meta_ad_set_id_idx"
  ON "meta_lead_imports"("meta_ad_set_id");
CREATE INDEX IF NOT EXISTS "meta_lead_imports_meta_ad_id_idx"
  ON "meta_lead_imports"("meta_ad_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'meta_lead_imports_event_id_fkey'
  ) THEN
    ALTER TABLE "meta_lead_imports"
      ADD CONSTRAINT "meta_lead_imports_event_id_fkey"
      FOREIGN KEY ("event_id") REFERENCES "events"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Recupera o conjunto dos leads ja existentes por meio do anuncio sincronizado.
WITH resolved_ads AS (
  SELECT DISTINCT ON (lead_row."id")
    lead_row."id" AS lead_id,
    meta_ad."meta_ad_set_id",
    meta_ad_set."name" AS meta_ad_set_name
  FROM "leads" AS lead_row
  JOIN "meta_connections" AS connection
    ON connection."client_id" = lead_row."client_id"
  JOIN "meta_ads" AS meta_ad
    ON meta_ad."meta_connection_id" = connection."id"
   AND meta_ad."meta_ad_id" = lead_row."facebook_ad_id"
  LEFT JOIN "meta_ad_sets" AS meta_ad_set
    ON meta_ad_set."meta_connection_id" = connection."id"
   AND meta_ad_set."meta_ad_set_id" = meta_ad."meta_ad_set_id"
  WHERE lead_row."facebook_ad_id" IS NOT NULL
  ORDER BY lead_row."id", connection."updated_at" DESC
)
UPDATE "leads" AS lead_row
SET
  "facebook_ad_set_id" = COALESCE(lead_row."facebook_ad_set_id", resolved_ads."meta_ad_set_id"),
  "facebook_ad_set_name" = COALESCE(
    lead_row."facebook_ad_set_name",
    resolved_ads."meta_ad_set_name"
  )
FROM resolved_ads
WHERE lead_row."id" = resolved_ads.lead_id;

-- Cria a ponte analitica que faltava para leads recebidos pelo endpoint do n8n.
-- O evento e recuperado pela regra do formulario quando o lead antigo ainda nao
-- havia sido roteado operacionalmente.
INSERT INTO "meta_lead_imports" (
  "id",
  "client_id",
  "meta_connection_id",
  "lead_id",
  "event_id",
  "meta_lead_id",
  "meta_form_id",
  "meta_campaign_id",
  "meta_campaign_name",
  "meta_ad_set_id",
  "meta_ad_set_name",
  "meta_ad_id",
  "meta_ad_name",
  "meta_creative_id",
  "preferred_contact_channel",
  "source_created_at",
  "raw_payload",
  "imported_at"
)
SELECT
  gen_random_uuid(),
  lead_row."client_id",
  selected_asset."meta_connection_id",
  lead_row."id",
  COALESCE(lead_row."event_interest_id", routing_rule."event_id"),
  lead_row."facebook_lead_id",
  lead_row."facebook_form_id",
  COALESCE(lead_row."facebook_campaign_id", meta_ad."meta_campaign_id"),
  COALESCE(lead_row."facebook_campaign_name", meta_campaign."name"),
  COALESCE(lead_row."facebook_ad_set_id", meta_ad."meta_ad_set_id"),
  COALESCE(lead_row."facebook_ad_set_name", meta_ad_set."name"),
  lead_row."facebook_ad_id",
  COALESCE(lead_row."facebook_ad_name", meta_ad."name"),
  meta_ad."meta_creative_id",
  lead_row."preferred_contact_channel",
  lead_row."source_created_at",
  lead_row."source_payload",
  COALESCE(lead_row."source_created_at", lead_row."created_at")
FROM "leads" AS lead_row
JOIN LATERAL (
  SELECT asset."meta_connection_id"
  FROM "meta_asset_selections" AS asset
  JOIN "meta_connections" AS connection
    ON connection."id" = asset."meta_connection_id"
  WHERE asset."form_id" = lead_row."facebook_form_id"
    AND connection."client_id" = lead_row."client_id"
    AND connection."status" = 'connected'
  ORDER BY asset."is_primary" DESC, asset."updated_at" DESC
  LIMIT 1
) AS selected_asset ON TRUE
LEFT JOIN "meta_lead_routing_rules" AS routing_rule
  ON routing_rule."form_id" = lead_row."facebook_form_id"
 AND routing_rule."client_id" = lead_row."client_id"
LEFT JOIN "meta_ads" AS meta_ad
  ON meta_ad."meta_connection_id" = selected_asset."meta_connection_id"
 AND meta_ad."meta_ad_id" = lead_row."facebook_ad_id"
LEFT JOIN "meta_ad_sets" AS meta_ad_set
  ON meta_ad_set."meta_connection_id" = selected_asset."meta_connection_id"
 AND meta_ad_set."meta_ad_set_id" = COALESCE(
   lead_row."facebook_ad_set_id",
   meta_ad."meta_ad_set_id"
 )
LEFT JOIN "meta_campaigns" AS meta_campaign
  ON meta_campaign."meta_connection_id" = selected_asset."meta_connection_id"
 AND meta_campaign."meta_campaign_id" = COALESCE(
   lead_row."facebook_campaign_id",
   meta_ad."meta_campaign_id"
 )
WHERE lead_row."facebook_lead_id" IS NOT NULL
  AND lead_row."facebook_form_id" IS NOT NULL
ON CONFLICT ("meta_connection_id", "meta_lead_id") DO UPDATE
SET
  "lead_id" = EXCLUDED."lead_id",
  "event_id" = COALESCE("meta_lead_imports"."event_id", EXCLUDED."event_id"),
  "meta_form_id" = COALESCE("meta_lead_imports"."meta_form_id", EXCLUDED."meta_form_id"),
  "meta_campaign_id" = COALESCE(
    "meta_lead_imports"."meta_campaign_id",
    EXCLUDED."meta_campaign_id"
  ),
  "meta_campaign_name" = COALESCE(
    "meta_lead_imports"."meta_campaign_name",
    EXCLUDED."meta_campaign_name"
  ),
  "meta_ad_set_id" = COALESCE(
    "meta_lead_imports"."meta_ad_set_id",
    EXCLUDED."meta_ad_set_id"
  ),
  "meta_ad_set_name" = COALESCE(
    "meta_lead_imports"."meta_ad_set_name",
    EXCLUDED."meta_ad_set_name"
  ),
  "meta_ad_id" = COALESCE("meta_lead_imports"."meta_ad_id", EXCLUDED."meta_ad_id"),
  "meta_ad_name" = COALESCE("meta_lead_imports"."meta_ad_name", EXCLUDED."meta_ad_name"),
  "meta_creative_id" = COALESCE(
    "meta_lead_imports"."meta_creative_id",
    EXCLUDED."meta_creative_id"
  ),
  "preferred_contact_channel" = COALESCE(
    "meta_lead_imports"."preferred_contact_channel",
    EXCLUDED."preferred_contact_channel"
  ),
  "source_created_at" = COALESCE(
    "meta_lead_imports"."source_created_at",
    EXCLUDED."source_created_at"
  ),
  "raw_payload" = COALESCE("meta_lead_imports"."raw_payload", EXCLUDED."raw_payload");

-- Espelha envios automaticos ja confirmados pela Meta no Chat do painel.
-- A versao anterior gravava somente a timeline, deixando a conversa sem a
-- mensagem visivel. O external_id (wamid) torna este backfill idempotente.
DO $$
DECLARE
  item RECORD;
  conversation_id UUID;
BEGIN
  FOR item IN
    SELECT
      timeline."client_id",
      timeline."lead_id",
      timeline."occurred_at",
      timeline."metadata"->>'message_id' AS message_id,
      timeline."notes" AS content
    FROM "lead_timeline" AS timeline
    WHERE timeline."event_type" = 'message'
      AND timeline."origin" = 'whatsapp'
      AND timeline."metadata"->>'message_id' IS NOT NULL
  LOOP
    SELECT conversation."id"
      INTO conversation_id
    FROM "conversations" AS conversation
    WHERE conversation."client_id" = item."client_id"
      AND conversation."lead_id" = item."lead_id"
      AND conversation."channel" = 'whatsapp'
    ORDER BY conversation."last_message_at" DESC NULLS LAST, conversation."created_at" DESC
    LIMIT 1;

    IF conversation_id IS NULL THEN
      INSERT INTO "conversations" ("id", "client_id", "lead_id", "channel")
      VALUES (gen_random_uuid(), item."client_id", item."lead_id", 'whatsapp')
      RETURNING "id" INTO conversation_id;
    END IF;

    INSERT INTO "messages" (
      "id",
      "conversation_id",
      "sender_type",
      "content",
      "external_id",
      "created_at"
    )
    VALUES (
      gen_random_uuid(),
      conversation_id,
      'user',
      COALESCE(item."content", 'Template WhatsApp enviado'),
      item.message_id,
      item."occurred_at"
    )
    ON CONFLICT ("external_id") DO NOTHING;

    UPDATE "conversations"
    SET "last_message_at" = GREATEST(
      COALESCE("last_message_at", item."occurred_at"),
      item."occurred_at"
    )
    WHERE "id" = conversation_id;
  END LOOP;
END $$;
