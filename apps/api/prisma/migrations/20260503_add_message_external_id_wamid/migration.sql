ALTER TABLE "messages"
ADD COLUMN "external_id" VARCHAR(191);

CREATE UNIQUE INDEX "messages_external_id_key"
ON "messages"("external_id");
