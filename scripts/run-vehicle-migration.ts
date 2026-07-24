import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const sql = `
-- CreateTable
CREATE TABLE IF NOT EXISTS "vehicles" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "brand" VARCHAR(100) NOT NULL,
    "model" VARCHAR(150) NOT NULL,
    "year_or_km" VARCHAR(50) NOT NULL,
    "price" VARCHAR(100) NOT NULL,
    "stores" TEXT NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "vehicles_client_id_idx" ON "vehicles"("client_id");
`;

async function main() {
  console.log('Iniciando criação da tabela vehicles no banco de dados...');

  const queries = sql
    .split(';')
    .map((q) => q.trim())
    .filter((q) => q.length > 0);

  for (const query of queries) {
    try {
      console.log(`Executando query...`);
      await prisma.$executeRawUnsafe(query);
    } catch (e) {
      console.error(`Erro ao executar query:`, e);
    }
  }

  // Chaves estrangeiras (try/catch caso já existam)
  try {
    console.log('Adicionando chave estrangeira para client_id...');
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
  } catch (e) {
    console.log('Chave estrangeira já existe ou erro:', (e as Error).message);
  }

  console.log('Migração concluída com sucesso!');
}

main()
  .catch((e) => {
    console.error('Falha na migração:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
