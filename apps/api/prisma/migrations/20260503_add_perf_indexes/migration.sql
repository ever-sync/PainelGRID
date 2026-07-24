-- Performance indexes recommended by MELHORIAS.md (Sec. 4)
-- Partial composite index for the most common Leads listing query
-- (filter por cliente + ordenar por created_at desc, ignorando soft-deleted).
CREATE INDEX IF NOT EXISTS "idx_leads_client_created"
  ON "leads" ("client_id", "created_at" DESC)
  WHERE "deleted_at" IS NULL;

-- Nota: crm_stages já possui UNIQUE (pipeline_id, display_order) — esse
-- índice único atende as consultas de Kanban; nenhuma criação adicional necessária.
