-- AlterTable
ALTER TABLE "users" ADD COLUMN "client_id" UUID;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "users_client_id_idx" ON "users"("client_id");
