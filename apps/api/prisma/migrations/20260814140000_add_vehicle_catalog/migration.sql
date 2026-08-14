CREATE TABLE "vehicle_catalog" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "brand_code" VARCHAR(30) NOT NULL,
  "brand" VARCHAR(100) NOT NULL,
  "model_code" VARCHAR(30) NOT NULL,
  "model" VARCHAR(180) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "vehicle_catalog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vehicle_catalog_brand_code_model_code_key"
ON "vehicle_catalog"("brand_code", "model_code");

CREATE INDEX "vehicle_catalog_brand_idx" ON "vehicle_catalog"("brand");
