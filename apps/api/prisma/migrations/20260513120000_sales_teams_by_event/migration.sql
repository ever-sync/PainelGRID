-- AlterTable
ALTER TABLE "sales_teams"
ADD COLUMN "event_id" UUID;

-- CreateIndex
CREATE INDEX "sales_teams_event_id_idx" ON "sales_teams"("event_id");

-- AddForeignKey
ALTER TABLE "sales_teams" ADD CONSTRAINT "sales_teams_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
