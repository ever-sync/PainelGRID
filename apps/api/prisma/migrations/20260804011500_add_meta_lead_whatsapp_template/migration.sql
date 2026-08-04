ALTER TABLE "meta_lead_routing_rules"
  ADD COLUMN IF NOT EXISTS "whatsapp_template_name" VARCHAR(512),
  ADD COLUMN IF NOT EXISTS "whatsapp_template_language" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "whatsapp_template_parameter_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
