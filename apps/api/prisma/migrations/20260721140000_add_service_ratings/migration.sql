-- AlterTable
ALTER TABLE "users" ADD COLUMN "rating_token" VARCHAR(64);

-- CreateIndex
CREATE UNIQUE INDEX "users_rating_token_key" ON "users"("rating_token");

-- CreateTable
CREATE TABLE "service_ratings" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_ratings_vendor_id_idx" ON "service_ratings"("vendor_id");

-- AddForeignKey
ALTER TABLE "service_ratings" ADD CONSTRAINT "service_ratings_vendor_id_fkey"
    FOREIGN KEY ("vendor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
