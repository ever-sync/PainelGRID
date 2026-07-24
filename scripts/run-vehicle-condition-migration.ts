import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando migração: adicionando coluna condition à tabela vehicles...');

  try {
    // Adiciona a coluna condition como VARCHAR(50) se não existir
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "condition" VARCHAR(50);`,
    );
    console.log('Coluna condition adicionada ou já existente.');
  } catch (e) {
    console.error('Erro ao executar comando SQL de migração:', e);
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
