import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const clientId = '2ba9e258-d2f2-4fef-87a7-549f71035e65';
  const stages = await prisma.crmStage.findMany({
    where: {
      pipeline: {
        client_id: clientId
      }
    },
    include: {
      pipeline: true
    }
  });

  console.log("=== EVERSYNC STAGES ===");
  for (const s of stages) {
    console.log(`Stage: ${s.name} (${s.id})`);
    console.log(`Code: ${s.code}`);
    console.log(`Pipeline Code: ${s.pipeline.code}`);
    console.log("-----------------------------------------");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
