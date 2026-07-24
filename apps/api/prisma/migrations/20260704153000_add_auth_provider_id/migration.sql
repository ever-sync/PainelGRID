-- AlterTable
ALTER TABLE "users" ADD COLUMN "auth_provider_id" VARCHAR(255);

-- CreateIndex
CREATE UNIQUE INDEX "users_auth_provider_id_key" ON "users"("auth_provider_id");
