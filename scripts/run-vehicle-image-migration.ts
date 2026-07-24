import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando migração: adicionando coluna image_url à tabela vehicles...');

  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "image_url" TEXT;`,
    );
    console.log('Coluna image_url adicionada ou já existente.');
  } catch (e) {
    console.error('Erro ao adicionar coluna image_url:', e);
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
