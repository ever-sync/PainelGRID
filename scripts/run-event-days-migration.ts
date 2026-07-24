import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando migração: adicionando coluna event_days à tabela events...');

  try {
    // Adiciona a coluna event_days como JSONB se não existir
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "event_days" JSONB;`,
    );
    console.log('Coluna event_days adicionada ou já existente.');
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
