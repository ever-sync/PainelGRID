ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "vendor_categories" "VendorCategory"[] NOT NULL DEFAULT ARRAY[]::"VendorCategory"[];

UPDATE "users"
SET "vendor_categories" = ARRAY["vendor_category"]
WHERE "vendor_category" IS NOT NULL
  AND array_length("vendor_categories", 1) IS NULL;
