/**
 * Cria Appointment (status scheduled) para leads que estao na etapa "Presença agendada"
 * de um evento mas NAO tem agendamento — alinhando o dashboard ("AGENDARAM" conta
 * Appointments) com a etapa do CRM. Tambem seta confirmation_status = scheduled.
 * Idempotente: pula quem ja tem agendamento nao-cancelado.
 *
 * Uso: ts-node prisma/backfill-appointments.ts <eventId> [--commit]
 */
import {
  AppointmentActorType,
  AppointmentChannel,
  AppointmentSource,
  AppointmentStatus,
  ConfirmationStatus,
  PrismaClient,
} from '@prisma/client';

const prisma = new PrismaClient();

const rawArgs = process.argv.slice(2);
const positional = rawArgs.filter((a) => !a.startsWith('--'));
const COMMIT = rawArgs.includes('--commit');
const EVENT_ID = positional[0] ?? '387c1d92-e42a-43ce-93fa-dc934b2867fa';
const STAGE_NAME = 'Presença agendada';

async function main() {
  console.log(COMMIT ? '*** MODO COMMIT (vai gravar) ***' : '--- DRY-RUN (nao grava) ---');

  const event = await prisma.event.findUnique({
    where: { id: EVENT_ID },
    select: {
      id: true,
      name: true,
      event_date: true,
      participants: { select: { client_id: true } },
    },
  });
  if (!event) throw new Error('Evento nao encontrado');
  const scheduledAt = event.event_date;
  const clientIds = event.participants.map((p) => p.client_id);
  console.log(
    `Evento: ${event.name} | data: ${scheduledAt.toISOString()} | clientes: ${clientIds.length}`,
  );

  let created = 0;
  let skipped = 0;

  for (const clientId of clientIds) {
    const stages = await prisma.crmStage.findMany({
      where: { client_id: clientId, name: STAGE_NAME },
      select: { id: true },
    });
    const stageIds = stages.map((s) => s.id);
    if (!stageIds.length) continue;

    const leads = await prisma.lead.findMany({
      where: {
        event_interest_id: EVENT_ID,
        client_id: clientId,
        deleted_at: null,
        crm_stage_id: { in: stageIds },
      },
      select: { id: true, confirmation_status: true },
    });

    let cCreated = 0;
    for (const lead of leads) {
      const hasAppt = await prisma.appointment.findFirst({
        where: {
          event_id: EVENT_ID,
          lead_id: lead.id,
          status: { not: AppointmentStatus.cancelled },
        },
        select: { id: true },
      });
      if (hasAppt) {
        skipped++;
        continue;
      }
      if (COMMIT) {
        await prisma.$transaction([
          prisma.appointment.create({
            data: {
              client_id: clientId,
              lead_id: lead.id,
              event_id: EVENT_ID,
              scheduled_at: scheduledAt,
              status: AppointmentStatus.scheduled,
              channel: AppointmentChannel.whatsapp,
              source: AppointmentSource.system,
              created_by_type: AppointmentActorType.system,
              notes: 'Agendamento importado do Bitrix (presenca agendada)',
            },
          }),
          prisma.lead.update({
            where: { id: lead.id },
            data: { confirmation_status: ConfirmationStatus.scheduled },
          }),
        ]);
      }
      created++;
      cCreated++;
    }
    console.log(
      `  cliente ${clientId}: ${cCreated} agendamentos ${COMMIT ? 'criados' : 'a criar'}`,
    );
  }

  console.log('--- RESUMO ---');
  console.log(COMMIT ? 'Agendamentos criados:' : 'Agendamentos a criar:', created);
  console.log('Pulados (ja tinham agendamento):', skipped);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
