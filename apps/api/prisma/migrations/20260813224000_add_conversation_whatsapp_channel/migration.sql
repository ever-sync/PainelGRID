ALTER TABLE "conversations"
ADD COLUMN "whatsapp_phone_number_id" VARCHAR(100);

CREATE INDEX "conversations_whatsapp_phone_number_id_idx"
ON "conversations"("whatsapp_phone_number_id");
