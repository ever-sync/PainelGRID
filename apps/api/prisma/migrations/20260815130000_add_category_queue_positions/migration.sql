ALTER TABLE "sales_team_members"
ADD COLUMN "queue_positions" JSONB NOT NULL DEFAULT '{}'::jsonb;
