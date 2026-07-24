-- Add 'contacted' value to ScoreEventKind enum
-- PostgreSQL 12+ allows ADD VALUE inside a transaction
ALTER TYPE "ScoreEventKind" ADD VALUE IF NOT EXISTS 'contacted';

-- Make appointment_id nullable so CRM-only score events don't require an appointment
ALTER TABLE "score_events" ALTER COLUMN "appointment_id" DROP NOT NULL;
