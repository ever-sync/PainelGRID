CREATE TABLE "integration_credentials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "key_prefix" VARCHAR(24) NOT NULL,
    "key_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "integration_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integration_credentials_key_hash_key"
ON "integration_credentials"("key_hash");

CREATE INDEX "integration_credentials_client_id_revoked_at_idx"
ON "integration_credentials"("client_id", "revoked_at");

ALTER TABLE "integration_credentials"
ADD CONSTRAINT "integration_credentials_client_id_fkey"
FOREIGN KEY ("client_id") REFERENCES "clients"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "integration_credentials" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "integration_credentials" FROM "anon", "authenticated";
