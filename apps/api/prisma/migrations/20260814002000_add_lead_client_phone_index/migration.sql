CREATE INDEX IF NOT EXISTS "idx_leads_client_phone"
ON "leads"("client_id", "phone");
