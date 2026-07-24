-- AlterTable
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "require_wristband" BOOLEAN NOT NULL DEFAULT false;
