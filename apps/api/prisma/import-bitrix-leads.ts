/**
 * Importa leads faltantes de um CSV do Bitrix para um cliente, ligados a um evento,
 * cada um na etapa do CRM mapeada da "Fase" do Bitrix. Idempotente: pula quem ja
 * existe (telefone/email) e captura violacao de unicidade.
 *
 * Uso: ts-node prisma/import-bitrix-leads.ts <csvPath> [--commit]
 * Sem --commit faz DRY-RUN (so relata, nao grava).
 */
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { ConfirmationStatus, LeadSource, Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const rawArgs = process.argv.slice(2);
const positional = rawArgs.filter((a) => !a.startsWith('--'));
const COMMIT = rawArgs.includes('--commit');

const CSV_PATH = positional[0] ?? '/Users/rapha/Downloads/596.csv';
const CLIENT_ID = positional[1] ?? '84b55a6d-7bcf-47a8-b004-2a07fa06d09d';
const EVENT_ID = positional[2] ?? '387c1d92-e42a-43ce-93fa-dc934b2867fa';
const SOURCE: LeadSource = LeadSource.facebook_ads;

const COL = { name: 6, fase: 4, phone: 82, email: 83 } as const;

// Fase Bitrix -> { stageName no CRM do cliente, status }
const FASE_MAP: Record<string, { stage: string; status: ConfirmationStatus }> = {
  'Presença agendada': { stage: 'Presença agendada', status: ConfirmationStatus.scheduled },
  Desinteresse: { stage: 'Desinteresse', status: ConfirmationStatus.cancelled },
  Avaliar: { stage: 'Avaliar', status: ConfirmationStatus.pending },
  'Tentativa de contato': { stage: 'Tentativa contato', status: ConfirmationStatus.pending },
  'Em contato': { stage: 'Em Contato', status: ConfirmationStatus.pending },
};

function digits(s: string | null | undefined) {
  return (s ?? '').replace(/\D/g, '');
}
function normalizePhone(raw: string | null | undefined): string | null {
  const d = digits(raw);
  let local = d;
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) local = d.slice(2);
  if (local.length === 11 || local.length === 10) return `+55${local}`;
  return null;
}
function phoneKey(raw: string | null | undefined) {
  const n = normalizePhone(raw);
  return n ? n.slice(-8) : '';
}
function emailKey(s: string | null | undefined) {
  return (s ?? '').trim().toLowerCase();
}
function resolveName(contato: string, email: string): string {
  const c = (contato ?? '').trim();
  if (c && c.toLowerCase() !== 'sem título') return c;
  const local = (email ?? '').split('@')[0]?.trim();
  return local || 'Lead Bitrix';
}

async function parseCsv(path: string): Promise<string[][]> {
  const rows: string[][] = [];
  const rl = createInterface({ input: createReadStream(path, { encoding: 'utf8' }) });
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  let first = true;
  for await (const raw of rl) {
    const line = first ? raw.replace(/^﻿/, '') : raw;
    first = false;
    let i = 0;
    while (i < line.length) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          inQuotes = false;
          i++;
        } else {
          field += ch;
          i++;
        }
      } else if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ';') {
        record.push(field);
        field = '';
        i++;
      } else {
        field += ch;
        i++;
      }
    }
    if (inQuotes) field += '\n';
    else {
      record.push(field);
      rows.push(record);
      record = [];
      field = '';
    }
  }
  if (field || record.length) {
    record.push(field);
    rows.push(record);
  }
  return rows;
}

async function main() {
  console.log(COMMIT ? '*** MODO COMMIT (vai gravar) ***' : '--- DRY-RUN (nao grava) ---');

  const pipeline = await prisma.crmPipeline.findFirst({
    where: { client_id: CLIENT_ID },
    select: { id: true, name: true },
    orderBy: { created_at: 'asc' },
  });
  if (!pipeline) throw new Error('Pipeline do cliente nao encontrado');

  const stages = await prisma.crmStage.findMany({
    where: { pipeline_id: pipeline.id },
    select: { id: true, name: true },
  });
  const stageIdByName = new Map(stages.map((s) => [s.name, s.id]));
  for (const { stage } of Object.values(FASE_MAP)) {
    if (!stageIdByName.has(stage)) throw new Error(`Etapa CRM nao encontrada: ${stage}`);
  }
  console.log('--- MAPEAMENTO Fase Bitrix -> Etapa CRM ---');
  for (const [fase, { stage, status }] of Object.entries(FASE_MAP)) {
    console.log(`  "${fase}"  ->  "${stage}" [${stageIdByName.get(stage)}]  (status ${status})`);
  }

  const existing = await prisma.lead.findMany({
    where: { client_id: CLIENT_ID },
    select: { phone: true, email: true },
  });
  const phoneSet = new Set(existing.map((l) => phoneKey(l.phone)).filter(Boolean));
  const emailSet = new Set(existing.map((l) => emailKey(l.email)).filter(Boolean));

  const all = await parseCsv(CSV_PATH);
  const data = all.slice(1).filter((r) => r.length > COL.phone);

  let created = 0;
  let skippedExisting = 0;
  let skippedNoPhone = 0;
  let skippedDup = 0;
  let unknownFase = 0;
  const byStatus: Record<string, number> = {};
  const byStage: Record<string, number> = {};

  for (const row of data) {
    const pk = phoneKey(row[COL.phone]);
    const ek = emailKey(row[COL.email]);
    if ((pk && phoneSet.has(pk)) || (ek && emailSet.has(ek))) {
      skippedExisting++;
      continue;
    }
    const phone = normalizePhone(row[COL.phone]);
    if (!phone) {
      skippedNoPhone++;
      continue;
    }
    const fase = (row[COL.fase] ?? '').trim();
    const map = FASE_MAP[fase];
    if (!map) {
      unknownFase++;
      console.warn(`Fase sem mapeamento: "${fase}" (${row[COL.name]})`);
      continue;
    }
    const data_ = {
      client_id: CLIENT_ID,
      name: resolveName(row[COL.name], row[COL.email]),
      phone,
      email: null, // por decisao: so nome/telefone/etapa. Email usado apenas no dedup.
      source: SOURCE,
      event_interest_id: EVENT_ID,
      crm_pipeline_id: pipeline.id,
      crm_stage_id: stageIdByName.get(map.stage)!,
      confirmation_status: ConfirmationStatus.pending, // por decisao: todos pending
    };

    byStatus[data_.confirmation_status] = (byStatus[data_.confirmation_status] ?? 0) + 1;
    byStage[map.stage] = (byStage[map.stage] ?? 0) + 1;

    if (COMMIT) {
      try {
        await prisma.lead.create({ data: data_ });
        if (pk) phoneSet.add(pk);
        if (ek) emailSet.add(ek);
        created++;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          skippedDup++;
        } else {
          throw e;
        }
      }
    } else {
      created++;
    }
  }

  console.log('--- RESUMO ---');
  console.log('Pipeline:', pipeline.name);
  console.log(COMMIT ? 'Criados:' : 'Seriam criados:', created);
  console.log('Pulados (ja existem):', skippedExisting);
  console.log('Pulados (sem telefone):', skippedNoPhone);
  console.log('Pulados (unique violation):', skippedDup);
  console.log('Fase sem mapeamento:', unknownFase);
  console.log('Por etapa:', byStage);
  console.log('Por status:', byStatus);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
