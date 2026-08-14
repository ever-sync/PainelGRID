ALTER TABLE "events"
ALTER COLUMN "allow_reception_create_sale" SET DEFAULT true;

UPDATE "events"
SET "allow_reception_create_sale" = true;
