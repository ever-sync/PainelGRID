import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando migração: adicionando colunas gallery e category à tabela vehicles...');

  try {
    // Adiciona a coluna gallery como TEXT[] se não existir
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "gallery" TEXT[] DEFAULT '{}';`,
    );
    console.log('Coluna gallery adicionada ou já existente.');

    // Adiciona a coluna category como VARCHAR(100) se não existir
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "category" VARCHAR(100);`,
    );
    console.log('Coluna category adicionada ou já existente.');
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
