ALTER TABLE "events"
  ALTER COLUMN "allow_vendor_checkin" SET DEFAULT false,
  ALTER COLUMN "allow_vendor_fipe" SET DEFAULT false,
  ALTER COLUMN "allow_vendor_create_sale" SET DEFAULT false,
  ALTER COLUMN "allow_vendor_edit_sale" SET DEFAULT false,
  ALTER COLUMN "allow_vendor_delete_sale" SET DEFAULT false,
  ALTER COLUMN "allow_vendor_edit_own_lead" SET DEFAULT false,
  ALTER COLUMN "allow_vendor_delete_own_lead" SET DEFAULT false,
  ALTER COLUMN "allow_reception_create_sale" SET DEFAULT false,
  ALTER COLUMN "allow_reception_edit_sale" SET DEFAULT false,
  ALTER COLUMN "allow_reception_delete_sale" SET DEFAULT false,
  ALTER COLUMN "allow_reception_edit_lead" SET DEFAULT false,
  ALTER COLUMN "allow_reception_delete_lead" SET DEFAULT false,
  ALTER COLUMN "allow_reception_quick_create" SET DEFAULT false;
