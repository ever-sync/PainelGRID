ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "vehicle_brand" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "vehicle_fipe_value" VARCHAR(50);
