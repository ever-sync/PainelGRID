-- CreateTable: SalesTeam
CREATE TABLE "sales_teams" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sales_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable: SalesTeamMember
CREATE TABLE "sales_team_members" (
    "team_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sales_team_members_pkey" PRIMARY KEY ("team_id","user_id")
);

-- CreateIndex
CREATE INDEX "sales_teams_client_id_idx" ON "sales_teams"("client_id");

-- CreateIndex
CREATE INDEX "sales_team_members_user_id_idx" ON "sales_team_members"("user_id");

-- AddForeignKey
ALTER TABLE "sales_teams" ADD CONSTRAINT "sales_teams_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_team_members" ADD CONSTRAINT "sales_team_members_team_id_fkey"
    FOREIGN KEY ("team_id") REFERENCES "sales_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_team_members" ADD CONSTRAINT "sales_team_members_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
