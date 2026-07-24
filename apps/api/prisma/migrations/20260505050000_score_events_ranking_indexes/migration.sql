-- Índices para acelerar ranking de pontuação por cliente/período.
CREATE INDEX IF NOT EXISTS "idx_score_events_client_earned_at"
  ON "score_events" ("client_id", "earned_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_score_events_client_vendor_kind"
  ON "score_events" ("client_id", "vendor_id", "kind");
