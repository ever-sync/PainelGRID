-- CRM: pagina os leads ativos de uma etapa na mesma ordem usada pela API.
-- O id desempata created_at e permite que o cursor continue usando o indice.
CREATE INDEX IF NOT EXISTS "idx_leads_active_crm_board"
  ON "leads" (
    "client_id",
    "crm_pipeline_id",
    "crm_stage_id",
    "created_at" DESC,
    "id" DESC
  )
  WHERE "deleted_at" IS NULL;

-- Recepcao: encontra e ordena somente os check-ins do evento atual.
CREATE INDEX IF NOT EXISTS "idx_leads_active_reception_queue"
  ON "leads" (
    "client_id",
    "event_interest_id",
    "confirmation_status",
    "confirmation_date",
    "updated_at",
    "id"
  )
  WHERE "deleted_at" IS NULL;

-- Recepcao: torna barato o contador de pessoas aguardando atribuicao.
CREATE INDEX IF NOT EXISTS "idx_leads_active_reception_waiting"
  ON "leads" ("client_id", "event_interest_id")
  WHERE "deleted_at" IS NULL
    AND "confirmation_status" = 'checked_in'
    AND "assigned_vendor_id" IS NULL;
