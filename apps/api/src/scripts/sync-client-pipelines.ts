import { PrismaClient } from '@prisma/client';
import { provisionDefaultCrmPipeline } from '../modules/crm/default-crm-pipeline';

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando sincronização de etapas do CRM para todos os clientes...');
  
  // Buscar todos os clientes cadastrados
  const clients = await prisma.client.findMany({
    select: { id: true, company_name: true }
  });
  
  console.log(`Encontrados ${clients.length} clientes. Iniciando provisionamento...`);
  
  for (const client of clients) {
    try {
      console.log('Provisionando funil para cliente...');
      await provisionDefaultCrmPipeline(prisma, client.id);
      console.log('Funil provisionado com sucesso.');
    } catch {
      console.error('Erro ao provisionar funil para cliente.');
    }
  }
  
  console.log('Sincronização de etapas do CRM concluída com sucesso!');
}

main()
  .catch(() => {
    console.error('Falha ao rodar script de sincronização.');
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
