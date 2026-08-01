-- Vinculo explicito campanha -> cliente -> evento.
-- Fonte de verdade de "de quem e esta campanha" quando varios clientes
-- dividem a mesma conta de anuncio.

-- CreateTable
CREATE TABLE IF NOT EXISTS "meta_campaign_assignments" (
    "id" UUID NOT NULL,
    "meta_campaign_id" VARCHAR(100) NOT NULL,
    "client_id" UUID NOT NULL,
    "event_id" UUID,
    "assigned_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_campaign_assignments_pkey" PRIMARY KEY ("id")
);

-- Uma campanha pertence a no maximo um evento: impede que o mesmo gasto
-- seja contabilizado em dois eventos diferentes.
CREATE UNIQUE INDEX IF NOT EXISTS "meta_campaign_assignments_meta_campaign_id_key"
    ON "meta_campaign_assignments"("meta_campaign_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "meta_campaign_assignments_client_id_idx"
    ON "meta_campaign_assignments"("client_id");

CREATE INDEX IF NOT EXISTS "meta_campaign_assignments_event_id_idx"
    ON "meta_campaign_assignments"("event_id");

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "meta_campaign_assignments"
    ADD CONSTRAINT "meta_campaign_assignments_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- Evento apagado nao deve apagar o vinculo: a campanha volta a ficar
-- so no cliente, preservando o historico de gasto.
DO $$
BEGIN
  ALTER TABLE "meta_campaign_assignments"
    ADD CONSTRAINT "meta_campaign_assignments_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- Tabela nova precisa entrar no mesmo regime de 20260722232000_harden_public_schema:
-- RLS ligado e sem acesso pelos roles da Data API do Supabase.
ALTER TABLE "meta_campaign_assignments" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "meta_campaign_assignments" FROM "anon", "authenticated";
