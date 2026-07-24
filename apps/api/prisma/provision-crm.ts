import { PrismaClient } from '@prisma/client';
import { provisionDefaultCrmPipeline } from '../src/modules/crm/default-crm-pipeline';

const prisma = new PrismaClient();

async function main() {
  const clients = await prisma.client.findMany({ select: { id: true, company_name: true } });

  if (clients.length === 0) {
    console.log('[provision-crm] Nenhum cliente encontrado.');
    return;
  }

  for (const client of clients) {
    await provisionDefaultCrmPipeline(prisma, client.id);
    console.log(
      `[provision-crm] Pipeline padrao (18 etapas) provisionado: ${client.company_name} (${client.id})`,
    );
  }

  console.log(`[provision-crm] Concluido para ${clients.length} cliente(s).`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
