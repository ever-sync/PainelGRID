-- Central de notificacoes com historico no servidor.
-- Uma linha por destinatario: lido/limpeza sao por pessoa.

CREATE TYPE "NotificationType" AS ENUM ('info', 'alert', 'appointment', 'message');

CREATE TABLE "notifications" (
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

CREATE INDEX "notifications_user_id_created_at_idx"
    ON "notifications"("user_id", "created_at" DESC);

CREATE INDEX "notifications_user_id_read_at_idx"
    ON "notifications"("user_id", "read_at");

ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
