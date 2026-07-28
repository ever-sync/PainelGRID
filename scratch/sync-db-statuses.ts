import { PrismaClient, EventStatus } from '@prisma/client';

const prisma = new PrismaClient();

function computeDynamicEventStatus(row: {
  status: EventStatus | string;
  launch_date?: Date | string | null;
  event_date: Date | string;
  event_end_date?: Date | string | null;
}): EventStatus {
  if (row.status === EventStatus.cancelled || row.status === 'cancelled') {
    return EventStatus.cancelled;
  }

  const now = new Date();
  const startDate = row.launch_date
    ? new Date(row.launch_date)
    : new Date(row.event_date);

  let endDate: Date;
  if (row.event_end_date) {
    endDate = new Date(row.event_end_date);
  } else {
    const eDate = new Date(row.event_date);
    eDate.setHours(23, 59, 59, 999);
    endDate = eDate;
  }

  if (now < startDate) {
    return EventStatus.draft;
  } else if (now > endDate) {
    return EventStatus.completed;
  } else {
    return EventStatus.active;
  }
}

async function main() {
  const events = await prisma.event.findMany({});
  for (const ev of events) {
    const dynamic = computeDynamicEventStatus(ev);
    if (ev.status !== dynamic) {
      await prisma.event.update({
        where: { id: ev.id },
        data: { status: dynamic },
      });
      console.log(`Updated event "${ev.name}" status from "${ev.status}" to "${dynamic}"`);
    } else {
      console.log(`Event "${ev.name}" is already up to date: "${dynamic}"`);
    }
  }
}

main().finally(() => prisma.$disconnect());
