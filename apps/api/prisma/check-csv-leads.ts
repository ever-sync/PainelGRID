/**
 * Cruza um CSV de leads do Bitrix com os leads ja existentes de um cliente e
 * reporta quais NAO entraram (por telefone normalizado OU email). Exporta os
 * faltantes para um CSV de reimportacao.
 *
 * Uso: ts-node prisma/check-csv-leads.ts <csvPath> <clientId> [outPath]
 */
import { createReadStream, writeFileSync } from 'fs';
import { createInterface } from 'readline';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CSV_PATH = process.argv[2];
const CLIENT_ID = process.argv[3];
const OUT_PATH = process.argv[4] ?? '/Users/rapha/Downloads/596_faltantes.csv';

const COL = { name: 6, phone: 82, email: 83, lastName: 88 } as const;

function digits(s: string | null | undefined) {
  return (s ?? '').replace(/\D/g, '');
}
/** Forma nacional: remove DDI 55, retorna DD + numero (10 ou 11 digitos). */
function national(s: string | null | undefined) {
  let d = digits(s);
  if ((d.length === 13 || d.length === 12) && d.startsWith('55')) d = d.slice(2);
  return d;
}
/** Chave robusta para comparar: ultimos 8 digitos significativos (sem 9 e sem DDD-ambiguidade). */
function phoneKey(s: string | null | undefined) {
  const n = national(s);
  if (!n) return '';
  return n.length >= 8 ? n.slice(-8) : n;
}
function emailKey(s: string | null | undefined) {
  return (s ?? '').trim().toLowerCase();
}

async function parseCsv(path: string): Promise<string[][]> {
  const rows: string[][] = [];
  const rl = createInterface({ input: createReadStream(path, { encoding: 'utf8' }) });
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  let firstLine = true;
  for await (const rawLine of rl) {
    const line = firstLine ? rawLine.replace(/^﻿/, '') : rawLine;
    firstLine = false;
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
          continue;
        }
        field += ch;
        i++;
      } else {
        if (ch === '"') {
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
    }
    if (inQuotes) {
      field += '\n';
    } else {
      record.push(field);
      rows.push(record);
      record = [];
      field = '';
    }
  }
  if (record.length > 0 || field) {
    record.push(field);
    rows.push(record);
  }
  return rows;
}

async function main() {
  if (!CSV_PATH || !CLIENT_ID) {
    console.error('Uso: ts-node prisma/check-csv-leads.ts <csvPath> <clientId> [outPath]');
    process.exit(1);
  }

  const all = await parseCsv(CSV_PATH);
  const header = all[0];
  const data = all.slice(1).filter((r) => r.length >= COL.lastName + 1);
  console.log(`CSV: ${data.length} linhas de dados (${header.length} colunas).`);

  const leads = await prisma.lead.findMany({
    where: { client_id: CLIENT_ID },
    select: { id: true, name: true, phone: true, email: true, deleted_at: true },
  });
  console.log(`Banco: ${leads.length} leads no cliente (inclui deletados).`);

  const phoneSet = new Set<string>();
  const emailSet = new Set<string>();
  for (const l of leads) {
    const pk = phoneKey(l.phone);
    if (pk) phoneSet.add(pk);
    const ek = emailKey(l.email);
    if (ek) emailSet.add(ek);
  }

  const missing: string[][] = [];
  let matchedPhone = 0;
  let matchedEmailOnly = 0;
  let noKey = 0;

  for (const row of data) {
    const pk = phoneKey(row[COL.phone]);
    const ek = emailKey(row[COL.email]);
    if (!pk && !ek) {
      noKey++;
      missing.push(row);
      continue;
    }
    const byPhone = pk && phoneSet.has(pk);
    const byEmail = ek && emailSet.has(ek);
    if (byPhone) {
      matchedPhone++;
    } else if (byEmail) {
      matchedEmailOnly++;
    } else {
      missing.push(row);
    }
  }

  console.log('--- RESULTADO ---');
  console.log('Match por telefone:', matchedPhone);
  console.log('Match so por email:', matchedEmailOnly);
  console.log('Sem telefone e sem email:', noKey);
  console.log('NAO entraram (faltantes):', missing.length);

  const out = [header, ...missing]
    .map((r) => r.map((c) => `"${(c ?? '').replace(/"/g, '""')}"`).join(';'))
    .join('\n');
  writeFileSync(OUT_PATH, '﻿' + out, 'utf8');
  console.log(`Faltantes exportados para: ${OUT_PATH}`);

  console.log('--- amostra de faltantes (nome | telefone | email) ---');
  for (const r of missing.slice(0, 15)) {
    console.log(`${r[COL.name]} | ${r[COL.phone]} | ${r[COL.email]}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
