-- AlterTable
ALTER TABLE "leads" ADD COLUMN "checkin_token" VARCHAR(64);

-- CreateIndex
CREATE UNIQUE INDEX "leads_checkin_token_key" ON "leads"("checkin_token");
