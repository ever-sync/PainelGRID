ALTER TYPE "LeadTimelineEventType" ADD VALUE IF NOT EXISTS 'task_created';
ALTER TYPE "LeadTimelineEventType" ADD VALUE IF NOT EXISTS 'task_completed';
ALTER TYPE "LeadTimelineEventType" ADD VALUE IF NOT EXISTS 'action_recorded';

CREATE TYPE "CrmTaskType" AS ENUM ('call', 'whatsapp', 'appointment', 'proposal', 'follow_up', 'other');
CREATE TYPE "CrmTaskStatus" AS ENUM ('pending', 'completed', 'cancelled');

CREATE TABLE "crm_tasks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "client_id" UUID NOT NULL,
  "lead_id" UUID NOT NULL,
  "assigned_user_id" UUID,
  "created_by_id" UUID NOT NULL,
  "type" "CrmTaskType" NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "notes" TEXT,
  "due_at" TIMESTAMP(3) NOT NULL,
  "status" "CrmTaskStatus" NOT NULL DEFAULT 'pending',
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "crm_tasks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "crm_tasks_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "crm_tasks_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "crm_tasks_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "crm_tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "crm_tasks_client_id_status_due_at_idx" ON "crm_tasks"("client_id", "status", "due_at");
CREATE INDEX "crm_tasks_assigned_user_id_status_due_at_idx" ON "crm_tasks"("assigned_user_id", "status", "due_at");
CREATE INDEX "crm_tasks_lead_id_created_at_idx" ON "crm_tasks"("lead_id", "created_at");
