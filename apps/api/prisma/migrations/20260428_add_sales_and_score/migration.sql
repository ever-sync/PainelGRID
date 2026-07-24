-- CreateEnum
CREATE TYPE "SaleType" AS ENUM ('NOVO', 'SEMINOVO', 'VENDA_DIRETA', 'PCD');

-- CreateEnum
CREATE TYPE "ScoreEventKind" AS ENUM ('scheduled', 'checked_in', 'sold');

-- CreateTable
CREATE TABLE "sales" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "type" "SaleType" NOT NULL,
    "model" VARCHAR(255) NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "sold_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "sale_id" UUID,
    "kind" "ScoreEventKind" NOT NULL,
    "points" INTEGER NOT NULL,
    "earned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "score_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_appointment_id_key" ON "sales"("appointment_id");

-- CreateIndex
CREATE INDEX "sales_client_id_idx" ON "sales"("client_id");

-- CreateIndex
CREATE INDEX "sales_lead_id_idx" ON "sales"("lead_id");

-- CreateIndex
CREATE INDEX "sales_vendor_id_idx" ON "sales"("vendor_id");

-- CreateIndex
CREATE INDEX "sales_sold_at_idx" ON "sales"("sold_at");

-- CreateIndex
CREATE UNIQUE INDEX "score_events_appointment_id_kind_key" ON "score_events"("appointment_id", "kind");

-- CreateIndex
CREATE INDEX "score_events_client_id_idx" ON "score_events"("client_id");

-- CreateIndex
CREATE INDEX "score_events_vendor_id_idx" ON "score_events"("vendor_id");

-- CreateIndex
CREATE INDEX "score_events_lead_id_idx" ON "score_events"("lead_id");

-- CreateIndex
CREATE INDEX "score_events_sale_id_idx" ON "score_events"("sale_id");

-- CreateIndex
CREATE INDEX "score_events_earned_at_idx" ON "score_events"("earned_at");

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_lead_id_fkey"
    FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_appointment_id_fkey"
    FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_vendor_id_fkey"
    FOREIGN KEY ("vendor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_events" ADD CONSTRAINT "score_events_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_events" ADD CONSTRAINT "score_events_vendor_id_fkey"
    FOREIGN KEY ("vendor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_events" ADD CONSTRAINT "score_events_lead_id_fkey"
    FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_events" ADD CONSTRAINT "score_events_appointment_id_fkey"
    FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_events" ADD CONSTRAINT "score_events_sale_id_fkey"
    FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
