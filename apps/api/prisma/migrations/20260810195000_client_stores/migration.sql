CREATE TABLE IF NOT EXISTS "stores" (
  "id" UUID NOT NULL,
  "client_id" UUID NOT NULL,
  "brand" VARCHAR(100) NOT NULL,
  "cnpj" VARCHAR(18),
  "name" VARCHAR(180) NOT NULL,
  "street" VARCHAR(180) NOT NULL DEFAULT '',
  "number" VARCHAR(30) NOT NULL DEFAULT '',
  "complement" VARCHAR(120),
  "neighborhood" VARCHAR(120) NOT NULL DEFAULT '',
  "zip_code" VARCHAR(10) NOT NULL DEFAULT '',
  "city" VARCHAR(120) NOT NULL,
  "state" CHAR(2) NOT NULL,
  "phone" VARCHAR(30) NOT NULL DEFAULT '',
  "website" VARCHAR(500),
  "instagram" VARCHAR(150),
  "email" VARCHAR(255),
  "status" BOOLEAN NOT NULL DEFAULT true,
  "business_hours" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "stores_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stores_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "stores_client_id_status_idx" ON "stores"("client_id", "status");
CREATE INDEX IF NOT EXISTS "stores_client_id_name_idx" ON "stores"("client_id", "name");
