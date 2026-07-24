import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const clientId = '2ba9e258-d2f2-4fef-87a7-549f71035e65';

async function main() {
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

  console.log("=== Checking Recent Leads (Last 15m) ===");
  const recentLeads = await prisma.lead.findMany({
    where: {
      client_id: clientId,
      created_at: { gte: fifteenMinutesAgo }
    },
    orderBy: { created_at: 'desc' }
  });

  if (recentLeads.length === 0) {
    console.log("❌ No leads were created in the database in the last 15 minutes.");
  } else {
    console.log(`Found ${recentLeads.length} recent lead(s):`);
    recentLeads.forEach(lead => {
      console.log(` - Name: ${lead.name}, Phone: ${lead.phone}, Source: ${lead.source}, Created At: ${lead.created_at.toISOString()}`);
    });
  }

  console.log("\n=== Checking Recent Webhook Events (Last 15m) ===");
  const recentWebhooks = await prisma.webhookEvent.findMany({
    where: {
      client_id: clientId,
      created_at: { gte: fifteenMinutesAgo }
    },
    orderBy: { created_at: 'desc' }
  });

  if (recentWebhooks.length === 0) {
    console.log("❌ No webhook dispatch events were logged in the last 15 minutes.");
  } else {
    console.log(`Found ${recentWebhooks.length} webhook event(s):`);
    recentWebhooks.forEach(ev => {
      console.log(` - Event Type: ${ev.event_type}, Status: ${ev.http_status}, Retries: ${ev.retries}, Sent At: ${ev.sent_at?.toISOString() || 'Pending'}`);
    });
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
