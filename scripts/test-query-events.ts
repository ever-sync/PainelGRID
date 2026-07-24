import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const event = await prisma.event.findUnique({
    where: { id: '294fa389-e81a-4a6d-b9f3-37035af57aeb' },
    select: {
      id: true,
      name: true,
      event_date: true,
      event_end_date: true,
      event_days: true,
    },
  });

  console.log('Dados do evento no banco de dados:', JSON.stringify(event, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
