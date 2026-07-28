ALTER TABLE "events"
ADD COLUMN "allow_vendor_checkin" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "allow_vendor_fipe" BOOLEAN NOT NULL DEFAULT true;
