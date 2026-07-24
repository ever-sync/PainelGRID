import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log(
    'Iniciando migração: adicionando colunas condition, manufacturing_year, model_year e km à tabela vehicles...',
  );

  try {
    // Adiciona condition
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "condition" VARCHAR(50);`,
    );
    console.log('Coluna condition adicionada ou já existente.');

    // Adiciona manufacturing_year
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "manufacturing_year" VARCHAR(10);`,
    );
    console.log('Coluna manufacturing_year adicionada ou já existente.');

    // Adiciona model_year
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "model_year" VARCHAR(10);`,
    );
    console.log('Coluna model_year adicionada ou já existente.');

    // Adiciona km
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "km" VARCHAR(50);`,
    );
    console.log('Coluna km adicionada ou já existente.');
  } catch (e) {
    console.error('Erro ao executar comandos SQL de migração:', e);
    throw e;
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
