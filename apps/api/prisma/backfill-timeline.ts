/**
 * Backfill da LeadTimeline a partir do CrmHistory existente (eventos stage_moved).
 * Idempotente: cada entrada carrega `metadata.crm_history_id`; re-execucoes pulam o
 * que ja foi importado. Rode sob demanda: `npm run db:backfill-timeline`.
 *
 * Origem dos eventos historicos = 'crm' (o CrmHistory nao guarda a source original).
 */
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Ids de CrmHistory ja vinculados a alguma entrada da timeline (reais ou backfill).
  const existing = await prisma.leadTimeline.findMany({
    where: { event_type: 'stage_moved' },
    select: { metadata: true },
  });
  const seen = new Set<string>();
  for (const entry of existing) {
    const id = (entry.metadata as { crm_history_id?: unknown } | null)?.crm_history_id;
    if (typeof id === 'string') seen.add(id);
  }
  console.log(`Timeline ja possui ${seen.size} stage_moved vinculados ao CrmHistory.`);

  const BATCH = 1000;
  let cursor: string | undefined;
  let scanned = 0;
  let created = 0;

  for (;;) {
    const rows = await prisma.crmHistory.findMany({
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      include: { lead: { select: { client_id: true } } },
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;
    scanned += rows.length;

    const toCreate = rows
      .filter((row) => !seen.has(row.id))
      .map((row) => ({
        client_id: row.lead.client_id,
        lead_id: row.lead_id,
        event_type: 'stage_moved' as const,
        origin: 'crm' as const,
        from_stage_id: row.from_stage_id,
        to_stage_id: row.to_stage_id,
        actor_id: row.changed_by_user_id,
        notes: row.notes,
        occurred_at: row.created_at,
        metadata: { crm_history_id: row.id, backfilled: true } as Prisma.InputJsonValue,
      }));

    if (toCreate.length > 0) {
      await prisma.leadTimeline.createMany({ data: toCreate });
      created += toCreate.length;
      for (const item of toCreate) {
        seen.add((item.metadata as { crm_history_id: string }).crm_history_id);
      }
    }

    console.log(`Escaneados ${scanned} · criados ${created}`);
  }

  console.log(`Backfill concluido: ${created} entradas de timeline criadas.`);
}

main()
  .catch((error) => {
    console.error('Falha no backfill da timeline:', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
