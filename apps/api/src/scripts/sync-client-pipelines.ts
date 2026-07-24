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
      console.log(`Provisionando funil para o cliente: ${client.company_name} (${client.id})...`);
      const result = await provisionDefaultCrmPipeline(prisma, client.id);
      console.log(`Sucesso para o cliente ${client.company_name}. ID do Pipeline: ${result.pipeline_id}`);
    } catch (error) {
      console.error(`Erro ao provisionar para o cliente ${client.company_name}:`, error);
    }
  }
  
  console.log('Sincronização de etapas do CRM concluída com sucesso!');
}

main()
  .catch((e) => {
    console.error('Falha ao rodar script de sincronização:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
