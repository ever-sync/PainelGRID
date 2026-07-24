-- AlterTable
ALTER TABLE "service_ratings" ADD COLUMN "customer_name" VARCHAR(255),
ADD COLUMN "event_id" UUID;

-- CreateIndex
CREATE INDEX "service_ratings_event_id_idx" ON "service_ratings"("event_id");

-- AddForeignKey
ALTER TABLE "service_ratings" ADD CONSTRAINT "service_ratings_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
