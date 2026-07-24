import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const clientId = '2ba9e258-d2f2-4fef-87a7-549f71035e65';

async function main() {
  console.log("=== Checking Connection Status ===");
  const connection = await prisma.metaConnection.findFirst({
    where: {
      client_id: clientId
    },
    orderBy: { updated_at: 'desc' }
  });

  if (!connection) {
    console.log("❌ No connection found in the database.");
    return;
  }

  console.log(`Connection ID: ${connection.id}`);
  console.log(`Status: ${connection.status}`);
  console.log(`Scopes: ${connection.scopes.join(', ')}`);

  console.log("\n=== Checking Asset Selections ===");
  const assets = await prisma.metaAssetSelection.findMany({
    where: {
      meta_connection_id: connection.id
    }
  });

  if (assets.length === 0) {
    console.log("⚠️ No assets (pages/forms) selected/linked yet.");
  } else {
    console.log(JSON.stringify(assets, null, 2));
  }

  console.log("\n=== Checking Client Webhook Config ===");
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { webhook_url_n8n: true }
  });

  if (client?.webhook_url_n8n) {
    console.log(`✅ Webhook N8N URL is set: ${client.webhook_url_n8n}`);
  } else {
    console.log("❌ Webhook N8N URL is NOT configured for this client.");
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
