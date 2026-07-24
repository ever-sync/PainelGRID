import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const clientId = '2ba9e258-d2f2-4fef-87a7-549f71035e65';

async function main() {
  console.log(`Resetting Meta connection for client: ${clientId}`);
  
  const connection = await prisma.metaConnection.findFirst({
    where: {
      client_id: clientId,
      status: {
        in: ['connected', 'expired', 'pending', 'disconnected']
      }
    },
    orderBy: { updated_at: 'desc' }
  });

  if (!connection) {
    console.log('No Meta connection found in any state.');
    return;
  }

  console.log(`Found connection ID: ${connection.id}. Current status: ${connection.status}`);

  await prisma.$transaction([
    prisma.metaConnection.update({
      where: { id: connection.id },
      data: {
        status: 'disconnected',
        oauth_state: null,
        scopes: [],
      },
    }),
    prisma.metaAssetSelection.deleteMany({
      where: { meta_connection_id: connection.id },
    }),
    prisma.facebookAdAccount.deleteMany({
      where: { client_id: clientId },
    }),
    prisma.client.update({
      where: { id: clientId },
      data: {
        facebook_access_token: null,
        facebook_page_id: null,
      },
    })
  ]);

  console.log('Successfully set Meta connection status to disconnected in the database!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
