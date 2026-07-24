/**
 * Aplica a automacao etapa->status (CRM Automacoes) aos leads de um evento, igual
 * faria o fluxo de MOVER lead: resolve o status pela regra da etapa atual e
 * reconcilia o Appointment (cria/confirma/completa/cancela). Idempotente.
 * NAO cria score events (pontos) — leads importados nao tem vendedor; pre-existentes
 * com vendedor ja receberam pontos pelo fluxo real.
 *
 * Uso: ts-node prisma/apply-crm-automation.ts <eventId> [--commit]
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

const ACTIVE: AppointmentStatus[] = [
  AppointmentStatus.proposed,
  AppointmentStatus.scheduled,
  AppointmentStatus.confirmed,
  AppointmentStatus.completed,
];

function rulesFor(settings: unknown): Map<string, ConfirmationStatus> {
  const map = new Map<string, ConfirmationStatus>();
  const rules = (settings as { crm_stage_status_rules?: unknown })?.crm_stage_status_rules;
  if (Array.isArray(rules)) {
    for (const r of rules) {
      if (r?.stage_id && r?.status) map.set(r.stage_id, r.status as ConfirmationStatus);
    }
  }
  return map;
}

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
  console.log(`Evento: ${event.name} | clientes: ${event.participants.length}`);

  const stats = {
    statusChanged: 0,
    apptCreated: 0,
    apptConfirmed: 0,
    apptCompleted: 0,
    apptCancelled: 0,
    untouched: 0,
    noRule: 0,
  };

  for (const { client_id } of event.participants) {
    const client = await prisma.client.findUnique({
      where: { id: client_id },
      select: { settings: true },
    });
    const ruleMap = rulesFor(client?.settings);
    if (ruleMap.size === 0) continue;

    const leads = await prisma.lead.findMany({
      where: { event_interest_id: EVENT_ID, client_id, deleted_at: null },
      select: {
        id: true,
        client_id: true,
        crm_stage_id: true,
        confirmation_status: true,
        assigned_vendor_id: true,
      },
    });

    for (const lead of leads) {
      const target = lead.crm_stage_id ? ruleMap.get(lead.crm_stage_id) : undefined;
      if (!target) {
        stats.noRule++;
        continue;
      }

      const existing = await prisma.appointment.findFirst({
        where: { lead_id: lead.id, event_id: EVENT_ID, status: { in: ACTIVE } },
        orderBy: { created_at: 'desc' },
      });

      const now = new Date();
      let willChange = false;

      if (lead.confirmation_status !== target) {
        willChange = true;
        stats.statusChanged++;
        if (COMMIT)
          await prisma.lead.update({
            where: { id: lead.id },
            data: { confirmation_status: target },
          });
      }

      if (target === ConfirmationStatus.cancelled) {
        if (existing) {
          willChange = true;
          stats.apptCancelled++;
          if (COMMIT)
            await prisma.appointment.update({
              where: { id: existing.id },
              data: { status: AppointmentStatus.cancelled, cancelled_at: now },
            });
        }
      } else if (target !== ConfirmationStatus.pending) {
        let appt = existing;
        if (!appt) {
          willChange = true;
          stats.apptCreated++;
          if (COMMIT) {
            appt = await prisma.appointment.create({
              data: {
                client_id: lead.client_id,
                lead_id: lead.id,
                event_id: EVENT_ID,
                scheduled_at: event.event_date,
                status: AppointmentStatus.scheduled,
                channel: AppointmentChannel.internal,
                source: AppointmentSource.system,
                created_by_type: AppointmentActorType.system,
                notes: 'Status aplicado pela automacao de etapa (backfill import)',
              },
            });
          }
        }
        if (target === ConfirmationStatus.confirmed) {
          if (existing && existing.status !== 'confirmed' && existing.status !== 'completed') {
            willChange = true;
            stats.apptConfirmed++;
            if (COMMIT)
              await prisma.appointment.update({
                where: { id: existing.id },
                data: {
                  status: AppointmentStatus.confirmed,
                  confirmed_at: existing.confirmed_at ?? now,
                },
              });
          }
        } else if (target === ConfirmationStatus.checked_in) {
          if (!existing || existing.status !== 'completed') {
            willChange = true;
            stats.apptCompleted++;
            if (COMMIT && appt)
              await prisma.appointment.update({
                where: { id: appt.id },
                data: {
                  status: AppointmentStatus.completed,
                  completed_at: existing?.completed_at ?? now,
                  confirmed_at: existing?.confirmed_at ?? now,
                },
              });
          }
        }
      }

      if (!willChange) stats.untouched++;
    }
  }

  console.log('--- RESUMO ---');
  console.log('Status alterado:', stats.statusChanged);
  console.log('Agendamentos criados:', stats.apptCreated);
  console.log('Agendamentos confirmados:', stats.apptConfirmed);
  console.log('Agendamentos completados:', stats.apptCompleted);
  console.log('Agendamentos cancelados:', stats.apptCancelled);
  console.log('Sem regra (etapa nao mapeada):', stats.noRule);
  console.log('Sem alteracao (ja coerentes):', stats.untouched);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
