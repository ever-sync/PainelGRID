CREATE TYPE "VendorOperationalStatus" AS ENUM ('online', 'away', 'busy');
CREATE TYPE "VendorAttendanceStatus" AS ENUM ('pending', 'accepted', 'rejected', 'expired', 'finished');

CREATE TABLE "vendor_availability" (
  "vendor_id" UUID NOT NULL,
  "client_id" UUID NOT NULL,
  "status" "VendorOperationalStatus" NOT NULL DEFAULT 'online',
  "last_assigned_at" TIMESTAMP(3),
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "vendor_availability_pkey" PRIMARY KEY ("vendor_id")
);

CREATE TABLE "vendor_attendances" (
  "id" UUID NOT NULL,
  "client_id" UUID NOT NULL,
  "lead_id" UUID NOT NULL,
  "vendor_id" UUID NOT NULL,
  "event_id" UUID,
  "status" "VendorAttendanceStatus" NOT NULL DEFAULT 'pending',
  "called_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "accepted_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  "sold" BOOLEAN,
  "created_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "vendor_attendances_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "vendor_availability_client_id_status_idx" ON "vendor_availability"("client_id", "status");
CREATE INDEX "vendor_attendances_client_id_status_idx" ON "vendor_attendances"("client_id", "status");
CREATE INDEX "vendor_attendances_lead_id_status_idx" ON "vendor_attendances"("lead_id", "status");
CREATE INDEX "vendor_attendances_vendor_id_status_idx" ON "vendor_attendances"("vendor_id", "status");
CREATE INDEX "vendor_attendances_expires_at_status_idx" ON "vendor_attendances"("expires_at", "status");
CREATE UNIQUE INDEX "vendor_attendances_one_active_lead_idx" ON "vendor_attendances"("lead_id") WHERE "status" IN ('pending', 'accepted');
CREATE UNIQUE INDEX "vendor_attendances_one_active_vendor_idx" ON "vendor_attendances"("vendor_id") WHERE "status" IN ('pending', 'accepted');

ALTER TABLE "vendor_availability" ADD CONSTRAINT "vendor_availability_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vendor_availability" ADD CONSTRAINT "vendor_availability_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vendor_attendances" ADD CONSTRAINT "vendor_attendances_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vendor_attendances" ADD CONSTRAINT "vendor_attendances_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vendor_attendances" ADD CONSTRAINT "vendor_attendances_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vendor_attendances" ADD CONSTRAINT "vendor_attendances_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vendor_attendances" ADD CONSTRAINT "vendor_attendances_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
