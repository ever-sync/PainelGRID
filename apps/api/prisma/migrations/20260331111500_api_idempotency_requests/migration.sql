-- CreateTable
CREATE TABLE "api_idempotency_requests" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "endpoint" VARCHAR(120) NOT NULL,
    "idempotency_key" VARCHAR(120) NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "response" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_idempotency_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_idempotency_requests_client_id_endpoint_idempotency_key_key"
  ON "api_idempotency_requests"("client_id", "endpoint", "idempotency_key");
CREATE INDEX "api_idempotency_requests_created_at_idx" ON "api_idempotency_requests"("created_at");

-- AddForeignKey
ALTER TABLE "api_idempotency_requests" ADD CONSTRAINT "api_idempotency_requests_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
