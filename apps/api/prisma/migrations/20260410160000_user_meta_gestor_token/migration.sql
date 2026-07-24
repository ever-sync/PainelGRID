-- AlterTable
ALTER TABLE "users" ADD COLUMN "meta_gestor_access_token" TEXT,
ADD COLUMN "meta_gestor_token_expires_at" TIMESTAMP(3),
ADD COLUMN "meta_gestor_scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "meta_gestor_connected_at" TIMESTAMP(3);
