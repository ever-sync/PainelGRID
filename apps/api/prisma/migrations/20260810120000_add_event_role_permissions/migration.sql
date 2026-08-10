ALTER TABLE "events"
ADD COLUMN "allow_vendor_create_sale" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "allow_vendor_edit_sale" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "allow_vendor_delete_sale" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "allow_vendor_edit_own_lead" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "allow_vendor_delete_own_lead" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "allow_reception_create_sale" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "allow_reception_edit_sale" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "allow_reception_delete_sale" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "allow_reception_edit_lead" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "allow_reception_delete_lead" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "allow_reception_quick_create" BOOLEAN NOT NULL DEFAULT true;
