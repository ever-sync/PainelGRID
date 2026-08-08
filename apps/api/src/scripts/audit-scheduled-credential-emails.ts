import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const appointments = await prisma.appointment.findMany({
    where: {
      status: { in: ["scheduled", "confirmed"] },
      lead: {
        deleted_at: null,
        client: {
          OR: [
            { company_name: { contains: "VOLKSWAGEN", mode: "insensitive" } },
            { company_name: { contains: "GWM", mode: "insensitive" } },
            { company_name: { contains: "GAC", mode: "insensitive" } },
          ],
        },
      },
    },
    include: {
      lead: { include: { client: true, crm_stage: true } },
    },
    orderBy: { scheduled_at: "desc" },
  });

  const latestByLead = new Map<string, (typeof appointments)[number]>();
  for (const appointment of appointments) {
    if (!latestByLead.has(appointment.lead_id)) {
      latestByLead.set(appointment.lead_id, appointment);
    }
  }

  const rows = [];
  for (const appointment of latestByLead.values()) {
    const dispatchKey = `lead-scheduled-email:${appointment.lead_id}:${appointment.scheduled_at.toISOString()}`;
    const timeline = await prisma.leadTimeline.findFirst({
      where: {
        lead_id: appointment.lead_id,
        metadata: { path: ["dispatch_key"], equals: dispatchKey },
      },
      select: { id: true },
    });
    rows.push({
      lead_id: appointment.lead_id,
      name: appointment.lead.name,
      company_name: appointment.lead.client.company_name,
      email: appointment.lead.email,
      scheduled_at: appointment.scheduled_at.toISOString(),
      confirmation_status: appointment.lead.confirmation_status,
      crm_stage_code: appointment.lead.crm_stage?.code ?? null,
      dispatch_key: dispatchKey,
      email_recorded: Boolean(timeline),
    });
  }

  const summary = Object.values(
    rows.reduce<
      Record<
        string,
        {
          company_name: string;
          scheduled: number;
          email_recorded: number;
          missing_email: number;
          no_email: number;
        }
      >
    >((acc, row) => {
      const item = (acc[row.company_name] ??= {
        company_name: row.company_name,
        scheduled: 0,
        email_recorded: 0,
        missing_email: 0,
        no_email: 0,
      });
      item.scheduled += 1;
      if (row.email_recorded) item.email_recorded += 1;
      else if (row.email) item.missing_email += 1;
      else item.no_email += 1;
      return acc;
    }, {}),
  );

  console.log(
    JSON.stringify({
      summary,
      inconsistent: rows.filter(
        (row) =>
          row.confirmation_status !== "scheduled" ||
          !row.crm_stage_code?.endsWith("_PRESENCA_AGENDADA"),
      ),
      missing: rows.filter((row) => row.email && !row.email_recorded),
      without_email: rows
        .filter((row) => !row.email)
        .map(({ dispatch_key: _dispatchKey, ...row }) => row),
    }),
  );
}

main().finally(async () => prisma.$disconnect());
