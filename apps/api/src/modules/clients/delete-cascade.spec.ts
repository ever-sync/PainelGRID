import { readdirSync, readFileSync } from "fs";
import { join } from "path";

/**
 * A exclusao de cliente (`ClientsService.deleteForUser`) apaga ~30 tabelas na
 * mao, em ordem. Toda tabela nova com FK `ON DELETE RESTRICT` para uma das
 * tabelas desse caminho quebra a transacao inteira — e o sintoma na tela e um
 * botao que "nao faz nada", sem pista de qual constraint barrou.
 *
 * Ja aconteceu duas vezes com tabelas do Meta. Este teste le as migrations,
 * acha essas FKs e cobra que a tabela esteja no cascade. Falha aqui e barato;
 * falha em producao custa o gestor achar que o sistema esta quebrado.
 */

const PRISMA_DIR = join(__dirname, "..", "..", "..", "prisma");
const MIGRATIONS_DIR = join(PRISMA_DIR, "migrations");
const SCHEMA_PATH = join(PRISMA_DIR, "schema.prisma");
const SERVICE_PATH = join(__dirname, "clients.service.ts");

/** Tabelas que a transacao apaga/atualiza e que, portanto, disparam RESTRICT. */
const CASCADE_TARGETS = new Set([
  "clients",
  "leads",
  "crm_stages",
  "crm_pipelines",
  "events",
  "users",
  "sales_teams",
  "campaigns",
  "conversations",
]);

/**
 * Nome da tabela -> propriedade no Prisma Client, lido do proprio schema.
 * Adivinhar por camelCase erra em nomes como `whatsapp_attribution_events`,
 * cujo model e `WhatsAppAttributionEvent` (maiuscula no meio).
 */
function buildTableToPrismaModel() {
  const schema = readFileSync(SCHEMA_PATH, "utf8");
  const map = new Map<string, string>();
  for (const [, model, body] of schema.matchAll(
    /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g,
  )) {
    const mapped = /@@map\("([^"]+)"\)/.exec(body);
    const table = mapped ? mapped[1] : model;
    map.set(table, model[0].toLowerCase() + model.slice(1));
  }
  return map;
}

function readAllMigrations() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((entry) => !entry.startsWith("."))
    .map((dir) => join(MIGRATIONS_DIR, dir, "migration.sql"))
    .filter((file) => {
      try {
        readFileSync(file);
        return true;
      } catch {
        return false;
      }
    })
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
}

/** Tabelas com FK RESTRICT apontando para alguma tabela do caminho. */
function findRestrictingTables(sql: string) {
  const pattern =
    /ALTER TABLE\s+"(\w+)"\s+ADD CONSTRAINT\s+"[^"]+"\s+FOREIGN KEY \("(\w+)"\)\s+REFERENCES\s+"(\w+)"\("[^"]+"\)\s+ON DELETE (\w+)/gs;

  const found = new Map<string, string[]>();
  for (const [, table, column, referenced, action] of sql.matchAll(pattern)) {
    if (!CASCADE_TARGETS.has(referenced)) continue;
    if (action.toUpperCase() !== "RESTRICT") continue;
    const refs = found.get(table) ?? [];
    refs.push(`${column} -> ${referenced}`);
    found.set(table, refs);
  }
  return found;
}

describe("exclusao de cliente: cascade x schema", () => {
  const sql = readAllMigrations();
  const service = readFileSync(SERVICE_PATH, "utf8");
  const deleteBlock = service.slice(service.indexOf("async deleteForUser"));

  it("encontra as migrations e o metodo de exclusao", () => {
    expect(sql.length).toBeGreaterThan(0);
    expect(deleteBlock).toContain("$transaction");
  });

  it("toda tabela com FK RESTRICT para o caminho da exclusao esta no cascade", () => {
    const restricting = findRestrictingTables(sql);
    const tableToModel = buildTableToPrismaModel();
    expect(restricting.size).toBeGreaterThan(0);

    const missing: string[] = [];
    for (const [table, refs] of restricting) {
      const model = tableToModel.get(table);
      // Tabela sem model no schema saiu do Prisma: nao ha o que apagar via tx.
      if (!model) continue;
      if (!deleteBlock.includes(`tx.${model}.`)) {
        missing.push(
          `${table} (${refs.join(", ")}) — falta tx.${model}.deleteMany em deleteForUser`,
        );
      }
    }

    expect(missing).toEqual([]);
  });
});
