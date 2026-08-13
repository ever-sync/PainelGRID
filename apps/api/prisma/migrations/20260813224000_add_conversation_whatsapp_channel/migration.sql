ALTER TABLE "conversations"
ADD COLUMN IF NOT EXISTS "whatsapp_phone_number_id" VARCHAR(100);

CREATE INDEX IF NOT EXISTS "conversations_whatsapp_phone_number_id_idx"
ON "conversations"("whatsapp_phone_number_id");
