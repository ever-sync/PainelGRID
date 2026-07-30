-- Auto-cadastro publico de vendedores por cliente.
-- Idempotente: pode rodar de novo sem quebrar (ver 20260514190000_vendor_categories_multi).

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "UserApprovalStatus" AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable users
-- Default 'approved': todo usuario que ja existe foi criado pelo painel, entao ja e aprovado.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "approval_status" "UserApprovalStatus" NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approved_by_id" UUID;

-- Vendedor auto-cadastrado nao tem senha ate criar pelo link do e-mail.
-- Os 6 pontos de leitura em auth.service.ts ja fazem guard `!user.password_hash`.
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "users_client_id_approval_status_idx"
  ON "users"("client_id", "approval_status");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "users_approved_by_id_fkey"
    FOREIGN KEY ("approved_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable clients
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "vendor_signup_token" VARCHAR(64);

-- CreateIndex
-- Sem backfill em SQL: gen_random_bytes depende de pgcrypto e md5(random()) nao e
-- criptografico. O preenchimento e lazy na aplicacao (ensureVendorSignupToken),
-- mesmo padrao de ensureVendorRatingToken em users.service.ts.
CREATE UNIQUE INDEX IF NOT EXISTS "clients_vendor_signup_token_key"
  ON "clients"("vendor_signup_token");
