CREATE TABLE "event_participants" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL,
  "client_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "event_participants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_participants_event_id_client_id_key"
  ON "event_participants"("event_id", "client_id");

CREATE INDEX "event_participants_event_id_idx"
  ON "event_participants"("event_id");

CREATE INDEX "event_participants_client_id_idx"
  ON "event_participants"("client_id");

ALTER TABLE "event_participants"
  ADD CONSTRAINT "event_participants_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_participants"
  ADD CONSTRAINT "event_participants_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "event_participants" ("event_id", "client_id")
SELECT "id", "client_id"
FROM "events"
ON CONFLICT ("event_id", "client_id") DO NOTHING;

INSERT INTO "event_participants" ("event_id", "client_id")
SELECT e."id", extra_client_id::uuid
FROM "events" e,
LATERAL UNNEST(e."extra_client_ids") AS extra_client_id
ON CONFLICT ("event_id", "client_id") DO NOTHING;
