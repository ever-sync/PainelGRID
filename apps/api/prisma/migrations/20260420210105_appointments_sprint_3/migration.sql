-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM (
    'proposed',
    'scheduled',
    'confirmed',
    'cancelled',
    'completed',
    'no_show',
    'rescheduled'
);

-- CreateEnum
CREATE TYPE "AppointmentChannel" AS ENUM (
    'whatsapp',
    'internal',
    'manual'
);

-- CreateEnum
CREATE TYPE "AppointmentSource" AS ENUM (
    'n8n_ai_agent',
    'gestor',
    'cliente',
    'vendedor',
    'recepcao',
    'system'
);

-- CreateEnum
CREATE TYPE "AppointmentActorType" AS ENUM (
    'user',
    'system',
    'external_agent'
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "conversation_id" UUID,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "timezone" VARCHAR(80) NOT NULL DEFAULT 'America/Sao_Paulo',
    "status" "AppointmentStatus" NOT NULL DEFAULT 'scheduled',
    "channel" "AppointmentChannel" NOT NULL DEFAULT 'whatsapp',
    "source" "AppointmentSource" NOT NULL DEFAULT 'n8n_ai_agent',
    "created_by_type" "AppointmentActorType" NOT NULL DEFAULT 'external_agent',
    "created_by_id" UUID,
    "confirmed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "no_show_at" TIMESTAMP(3),
    "rescheduled_from_appointment_id" UUID,
    "notes" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointments_client_id_idx" ON "appointments"("client_id");

-- CreateIndex
CREATE INDEX "appointments_lead_id_idx" ON "appointments"("lead_id");

-- CreateIndex
CREATE INDEX "appointments_event_id_idx" ON "appointments"("event_id");

-- CreateIndex
CREATE INDEX "appointments_conversation_id_idx" ON "appointments"("conversation_id");

-- CreateIndex
CREATE INDEX "appointments_scheduled_at_idx" ON "appointments"("scheduled_at");

-- CreateIndex
CREATE INDEX "appointments_status_idx" ON "appointments"("status");

-- CreateIndex
CREATE INDEX "appointments_rescheduled_from_appointment_id_idx" ON "appointments"("rescheduled_from_appointment_id");

-- AddForeignKey
ALTER TABLE "appointments"
ADD CONSTRAINT "appointments_client_id_fkey"
FOREIGN KEY ("client_id") REFERENCES "clients"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments"
ADD CONSTRAINT "appointments_lead_id_fkey"
FOREIGN KEY ("lead_id") REFERENCES "leads"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments"
ADD CONSTRAINT "appointments_event_id_fkey"
FOREIGN KEY ("event_id") REFERENCES "events"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments"
ADD CONSTRAINT "appointments_conversation_id_fkey"
FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments"
ADD CONSTRAINT "appointments_rescheduled_from_appointment_id_fkey"
FOREIGN KEY ("rescheduled_from_appointment_id") REFERENCES "appointments"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
