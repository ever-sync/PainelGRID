-- Permite armazenar data URL (base64) além de URL pública
ALTER TABLE "sales_teams" ALTER COLUMN "logo_url" TYPE TEXT;
