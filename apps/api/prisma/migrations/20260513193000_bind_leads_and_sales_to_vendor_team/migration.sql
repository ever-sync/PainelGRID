ALTER TABLE "leads"
ADD COLUMN "team_id" UUID;

ALTER TABLE "sales"
ADD COLUMN "team_id" UUID;

CREATE INDEX "leads_team_id_idx" ON "leads"("team_id");
CREATE INDEX "sales_team_id_idx" ON "sales"("team_id");

ALTER TABLE "leads"
ADD CONSTRAINT "leads_team_id_fkey"
FOREIGN KEY ("team_id") REFERENCES "sales_teams"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "sales"
ADD CONSTRAINT "sales_team_id_fkey"
FOREIGN KEY ("team_id") REFERENCES "sales_teams"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

UPDATE "leads" AS l
SET "team_id" = stm."team_id"
FROM "sales_team_members" AS stm
INNER JOIN "sales_teams" AS st ON st."id" = stm."team_id"
WHERE l."assigned_vendor_id" = stm."user_id"
  AND l."event_interest_id" = st."event_id"
  AND l."team_id" IS NULL;

UPDATE "sales" AS s
SET "team_id" = stm."team_id"
FROM "appointments" AS a,
     "sales_team_members" AS stm,
     "sales_teams" AS st
WHERE s."appointment_id" = a."id"
  AND stm."user_id" = s."vendor_id"
  AND st."id" = stm."team_id"
  AND a."event_id" = st."event_id"
  AND s."team_id" IS NULL;
