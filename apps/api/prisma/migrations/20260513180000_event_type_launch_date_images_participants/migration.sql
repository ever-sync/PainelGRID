-- AlterTable: add event_type, launch_date, event_end_date, image_urls, extra_client_ids
ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "event_type"       VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "launch_date"      DATE,
  ADD COLUMN IF NOT EXISTS "event_end_date"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "image_urls"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "extra_client_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
