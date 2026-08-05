import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const sql = `
-- Add new fields to leads table if they do not exist
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "vehicle_plate" VARCHAR(20);
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "companions" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "description" TEXT;
`;

async function main() {
  console.log(
    "Iniciando migração dos novos campos (placa, acompanhantes e descrição) na tabela leads...",
  );

  const queries = sql
    .split(";")
    .map((q) => q.trim())
    .filter((q) => q.length > 0);

  for (const query of queries) {
    try {
      console.log(`Executando query...`);
      await prisma.$executeRawUnsafe(query);
    } catch {
      console.error("Erro ao executar query.");
    }
  }

  console.log("Migração concluída com sucesso!");
}

main()
  .catch(() => {
    console.error("Falha na migração.");
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
