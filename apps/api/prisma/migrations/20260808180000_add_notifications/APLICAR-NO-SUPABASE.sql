-- PainelGRID · central de notificações
-- Cole inteiro no SQL Editor do Supabase e execute uma única vez.
-- Idempotente: rodar de novo não faz nada e não dá erro.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationType') THEN
    CREATE TYPE "NotificationType" AS ENUM ('info', 'alert', 'appointment', 'message');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "notifications" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'info',
    "title" VARCHAR(160) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "href" VARCHAR(300),
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "notifications_user_id_created_at_idx"
    ON "notifications"("user_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "notifications_user_id_read_at_idx"
    ON "notifications"("user_id", "read_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notifications_client_id_fkey'
  ) THEN
    ALTER TABLE "notifications"
      ADD CONSTRAINT "notifications_client_id_fkey"
      FOREIGN KEY ("client_id") REFERENCES "clients"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notifications_user_id_fkey'
  ) THEN
    ALTER TABLE "notifications"
      ADD CONSTRAINT "notifications_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Registra no controle do Prisma para o `migrate deploy` não tentar de novo.
-- O checksum é o sha256 do arquivo migration.sql versionado no repo.
INSERT INTO _prisma_migrations
  (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
SELECT
  gen_random_uuid()::text,
  'd2ffb531327cf52cdbaa206e4b30c93c47a83bc284856f61537ae3f78a9208ee',
  '20260808180000_add_notifications',
  now(), now(), 1
WHERE NOT EXISTS (
  SELECT 1 FROM _prisma_migrations
  WHERE migration_name = '20260808180000_add_notifications'
);

COMMIT;

-- Conferência: deve retornar 9 colunas e a migration registrada.
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name = 'notifications') AS colunas,
  (SELECT count(*) FROM _prisma_migrations
    WHERE migration_name = '20260808180000_add_notifications') AS registrada;
