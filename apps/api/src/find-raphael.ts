import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const leads = await prisma.lead.findMany({
    where: {
      name: {
        contains: 'Raphael',
        mode: 'insensitive',
      },
    },
    select: {
      id: true,
      name: true,
      phone: true,
      checkin_token: true,
      confirmation_status: true,
      event_interest: true,
    },
  });

  console.log('Raphael leads found:', JSON.stringify(leads, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
