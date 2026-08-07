import { ConfirmationStatus, PrismaClient } from "@prisma/client";
import {
  encryptCheckinToken,
  generateRawCheckinToken,
} from "../src/common/utils/crypto.util";

const prisma = new PrismaClient();

type Correction = {
  first_name?: string;
  last_name?: string;
  companions?: string;
  day?: 14 | 15 | 16;
  description?: string;
  vehicle_plate?: string;
  vehicle_model?: string;
  vehicle_year?: string;
};

const corrections: Record<string, Correction> = {
  "f6796a01-def5-4d2c-ae3c-5d17d4b697cf": {
    companions: "Sem acompanhantes",
    description: "Carro na troca: não",
  },
  "b8609625-eebb-4a74-8cc8-45f9144f5bc4": {
    companions: "3 acompanhantes, nomes ainda não informados",
    description:
      "Carro na troca: sim | Modelo: HB20 Comfort Plus 1.6 Automático Hatch | Ano: 2016/2017",
    vehicle_model: "HB20 Comfort Plus 1.6 Automático Hatch",
    vehicle_year: "2016/2017",
  },
  "f265ecb4-3c5a-4205-b691-c217e781f34d": {
    first_name: "Arlen",
    last_name: "Eduardo",
    companions: "Sem acompanhantes",
    day: 15,
    description: "Carro na troca: não",
  },
  "9f8a1126-6ba3-4618-8f83-5634aac68039": {
    companions:
      "3 acompanhantes: Samara Antomaria Pereira Almeida, Bruna Pereira Almeida, Eloá Pereira Almeida",
    description: "Carro na troca: não",
  },
  "da1dd42c-2c43-45b2-b64b-5db7d92a0d4c": {
    companions:
      "2 acompanhantes: Elaine Alves Viana de Oliveira, Vitor Matheus de Oliveira Santos",
    day: 16,
    description:
      "Carro na troca: sim | Modelo: Ecosport SE automática | Ano: 2020",
    vehicle_plate: "QXY3A98",
    vehicle_model: "Ecosport SE automática",
    vehicle_year: "2020",
  },
  "3711aa20-532c-4f40-b930-efdac81e9d6c": {
    first_name: "Evair",
    last_name: "dos Santos",
    day: 16,
    description: "Carro na troca: não",
  },
  "a8f64aad-498d-4f63-b579-c2070dfc1982": {
    companions: "1 acompanhante: Katia Silva Andrade",
    description: "Carro na troca: sim | Modelo: T-Cross | Ano: 2024",
    vehicle_plate: "SUB1B72",
    vehicle_model: "T-Cross",
    vehicle_year: "2024",
  },
  "57b3809f-d68a-4822-b191-e6527d893dae": {
    companions: "1 acompanhante: Renata Graziela da Silva",
    description: "Carro na troca: não",
  },
  "6f411829-baba-444c-b860-9b9002c531ce": {
    companions:
      "2 acompanhantes: Matheus Hoffmann Rohde, Manuela Hoffmann Rohde",
    description: "Carro na troca: não",
  },
  "8cf2e22c-2860-4b41-abc4-c4426dd62f67": {
    companions: "1 acompanhante: Terezinha Meneses",
    day: 15,
    description: "Carro na troca: sim | Modelo: Logan 1.0 | Ano: 2015",
    vehicle_plate: "FYL8A78",
    vehicle_model: "Logan 1.0",
    vehicle_year: "2015",
  },
  "448de17c-0660-408c-8daa-5be9a6e59729": {
    companions: "2 acompanhantes: Camila Silva Lourenço, Bianca Lourenço",
    day: 14,
    description: "Carro na troca: não",
  },
  "d83aa481-6f4c-4606-8116-4c6dc80fcf21": {
    first_name: "Marcos",
    last_name: "Paulo Costa Manso",
    companions: "Sem acompanhantes",
    day: 15,
    description:
      "Carro na troca: sim | Modelo: Cruze HB Sport LT 1.8 16V FlexP. 5p Mec | Ano: 2015",
    vehicle_plate: "FYR3D06",
    vehicle_model: "Cruze HB Sport LT 1.8 16V FlexP. 5p Mec",
    vehicle_year: "2015",
  },
  "60256e2c-9528-42d0-8a7f-e35415806c6c": {
    companions: "1 acompanhante: Ana Cláudia Thomas da Silva",
    day: 15,
    description: "Carro na troca: sim | Modelo: KA Hatch SE | Ano: 2017/2018",
    vehicle_plate: "GCW8A97",
    vehicle_model: "KA Hatch SE",
    vehicle_year: "2017/2018",
  },
  "82ed4e3f-15ae-4901-963f-fa1d695c9833": {
    companions: "Sem acompanhantes",
    day: 15,
    description:
      "Carro na troca: sim | Modelo: Ford Focus câmbio manual | Ano: 2017",
    vehicle_model: "Ford Focus câmbio manual",
    vehicle_year: "2017",
  },
  "c4241b97-4bfc-4a5f-93e4-8a55b0377120": {
    first_name: "Rafaela",
    last_name: "Rocha",
    companions: "Sem acompanhantes",
    day: 16,
    description: "Carro na troca: não",
  },
  "b078e403-87e8-4b31-9cad-adb9bae174c5": {
    first_name: "Tatiane",
    last_name: "Jesus",
    companions: "Sem acompanhantes",
    day: 16,
    description: "Carro na troca: sim | Modelo: Renault Stepway | Ano: 2017",
    vehicle_model: "Renault Stepway",
    vehicle_year: "2017",
  },
  "95450674-392b-42a6-937f-fa3c68e19e25": {
    day: 16,
    description: "Carro na troca: sim | Modelo: Voyage Comfortline | Ano: 2013",
    vehicle_model: "Voyage Comfortline",
    vehicle_year: "2013",
  },
  "422863f2-d3dd-49c8-aaec-8b721c10385a": {
    companions: "1 acompanhante: Marli Silva Pinheiro",
    day: 15,
  },
};

async function main() {
  if (process.env.APPLY_BACKFILL !== "1") {
    throw new Error("Defina APPLY_BACKFILL=1 para executar o backfill");
  }

  const leads = await prisma.lead.findMany({
    where: {
      deleted_at: null,
      crm_stage: { code: { endsWith: "PRESENCA_AGENDADA" } },
    },
    select: {
      id: true,
      client_id: true,
      event_interest_id: true,
      first_name: true,
      last_name: true,
      companions: true,
      store_visit_datetime: true,
      description: true,
      vehicle_plate: true,
      vehicle_model: true,
      vehicle_year: true,
      tags: true,
      confirmation_status: true,
      checkin_token: true,
      event_interest: { select: { event_days: true } },
      appointments: { select: { id: true }, take: 1 },
      conversations: {
        select: { id: true },
        orderBy: { last_message_at: "desc" },
        take: 1,
      },
    },
  });

  let leadsUpdated = 0;
  let datesNormalized = 0;
  let appointmentsCreated = 0;
  let scheduledTagsAdded = 0;
  let confirmationStatusesScheduled = 0;

  await prisma.$transaction(
    async (tx) => {
      for (const lead of leads) {
        const correction = corrections[lead.id] ?? {};
        const eventDays = Array.isArray(lead.event_interest?.event_days)
          ? (lead.event_interest.event_days as Array<{ start?: string }>)
          : [];
        const starts = eventDays
          .map((day) => (day.start ? new Date(day.start) : null))
          .filter((date): date is Date => Boolean(date));
        const requestedDay =
          correction.day ?? lead.store_visit_datetime?.getUTCDate();
        const canonicalDate = starts.find(
          (date) => date.getUTCDate() === requestedDay,
        );
        const currentIsCanonical = starts.some(
          (date) => lead.store_visit_datetime?.getTime() === date.getTime(),
        );

        const data = {
          ...(!lead.first_name && correction.first_name
            ? { first_name: correction.first_name }
            : {}),
          ...(!lead.last_name && correction.last_name
            ? { last_name: correction.last_name }
            : {}),
          ...(!lead.companions && correction.companions
            ? { companions: correction.companions }
            : {}),
          ...(!lead.description && correction.description
            ? { description: correction.description }
            : {}),
          ...(!lead.vehicle_plate && correction.vehicle_plate
            ? { vehicle_plate: correction.vehicle_plate }
            : {}),
          ...(!lead.vehicle_model && correction.vehicle_model
            ? { vehicle_model: correction.vehicle_model }
            : {}),
          ...(!lead.vehicle_year && correction.vehicle_year
            ? { vehicle_year: correction.vehicle_year }
            : {}),
          ...(!lead.tags.some((tag) => tag.toLowerCase() === "agendado")
            ? { tags: [...lead.tags, "agendado"] }
            : {}),
          ...(lead.confirmation_status !== ConfirmationStatus.scheduled
            ? {
                confirmation_status: ConfirmationStatus.scheduled,
              }
            : {}),
          ...(!lead.checkin_token
            ? {
                checkin_token: encryptCheckinToken(
                  generateRawCheckinToken(),
                  process.env.LEADFLOW_CHECKIN_VOUCHER_SECRET,
                ),
              }
            : {}),
          ...((!lead.store_visit_datetime || !currentIsCanonical) &&
          canonicalDate
            ? { store_visit_datetime: canonicalDate }
            : {}),
        };

        if (Object.keys(data).length > 0) {
          await tx.lead.update({ where: { id: lead.id }, data });
          leadsUpdated += 1;
          if ("store_visit_datetime" in data) datesNormalized += 1;
          if ("tags" in data) scheduledTagsAdded += 1;
          if ("confirmation_status" in data) {
            confirmationStatusesScheduled += 1;
          }
          await tx.leadTimeline.create({
            data: {
              client_id: lead.client_id,
              lead_id: lead.id,
              event_type: "note",
              origin: "gestor",
              actor_label: "Backfill de dados confirmados",
              notes:
                "Campos recuperados da conversa e data normalizada conforme event_days.",
              metadata: { fields: Object.keys(data) },
            },
          });
        }

        const scheduledAt =
          ("store_visit_datetime" in data
            ? data.store_visit_datetime
            : lead.store_visit_datetime) ?? canonicalDate;
        if (
          lead.appointments.length === 0 &&
          scheduledAt &&
          lead.event_interest_id
        ) {
          await tx.appointment.create({
            data: {
              client_id: lead.client_id,
              lead_id: lead.id,
              event_id: lead.event_interest_id,
              conversation_id: lead.conversations[0]?.id ?? null,
              scheduled_at: scheduledAt,
              status: "scheduled",
              source: "system",
              created_by_type: "system",
              notes:
                "Appointment criado por backfill a partir da data confirmada na conversa.",
              metadata: { backfill: "scheduled_lead_data_v1" },
            },
          });
          appointmentsCreated += 1;
        }
      }
    },
    { maxWait: 20_000, timeout: 120_000 },
  );

  console.log(
    JSON.stringify(
      {
        leads_scanned: leads.length,
        leads_updated: leadsUpdated,
        dates_normalized: datesNormalized,
        appointments_created: appointmentsCreated,
        scheduled_tags_added: scheduledTagsAdded,
        confirmation_statuses_scheduled: confirmationStatusesScheduled,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
