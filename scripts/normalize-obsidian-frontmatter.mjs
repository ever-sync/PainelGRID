import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const vaultRoot = path.join(repositoryRoot, "docs", "obsidian");
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

async function markdownFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    if (entry.name === ".obsidian") continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await markdownFiles(target)));
    else if (entry.isFile() && entry.name.endsWith(".md")) result.push(target);
  }
  return result.sort();
}

function metadataFor(relativePath) {
  const folder = relativePath.split(path.sep)[0];
  const fileName = path.basename(relativePath, ".md");
  const types = {
    "01 - Produto": "produto",
    "02 - Arquitetura": "arquitetura",
    "03 - Dominios": "dominio",
    "04 - Jornadas": "jornada",
    "05 - Integracoes": "integracao",
    "06 - Operacao": "operacao",
    "07 - Referencia": "referencia",
    "08 - Decisoes": "decisao",
    "09 - Dashboards": "dashboard",
    _templates: "template",
  };
  let tipo = types[folder] ?? "guia";
  if (fileName.includes("Runbook")) tipo = "runbook";
  if (folder === "_templates" && fileName === "ADR") tipo = "adr";

  const owners = {
    "01 - Produto": "equipe-produto",
    "02 - Arquitetura": "equipe-arquitetura",
    "03 - Dominios": "equipe-produto-engenharia",
    "04 - Jornadas": "equipe-produto-operacao",
    "05 - Integracoes": "equipe-integracoes",
    "06 - Operacao": "equipe-plataforma",
    "07 - Referencia": "equipe-engenharia",
    "08 - Decisoes": "equipe-arquitetura",
    "09 - Dashboards": "equipe-engenharia",
    _templates: "a-definir",
  };

  const highCriticality = new Set(["integracao", "operacao", "runbook"]);
  return {
    tipo,
    status: folder === "_templates" ? "modelo" : "mantido",
    atualizado: folder === "_templates" ? '"{{date}}"' : today,
    responsavel: owners[folder] ?? "equipe-engenharia",
    criticidade: highCriticality.has(tipo) ? "alta" : "media",
    tags: `[painelgrid, ${tipo}]`,
  };
}

function addMissingProperties(content, metadata) {
  let normalized = content.replace(/\r\n/g, "\n");
  if (metadata.responsavel !== "a-definir") {
    normalized = normalized.replace(
      /^responsavel: equipe-painelgrid$/m,
      `responsavel: ${metadata.responsavel}`,
    );
  }
  const properties = Object.entries(metadata);

  if (!normalized.startsWith("---\n")) {
    const frontmatter = properties
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n");
    return `---\n${frontmatter}\n---\n\n${normalized}`;
  }

  const end = normalized.indexOf("\n---\n", 4);
  if (end < 0) {
    throw new Error("Frontmatter aberto sem delimitador final");
  }
  const header = normalized.slice(4, end);
  const missing = properties.filter(
    ([key]) => !new RegExp(`^${key}:`, "m").test(header),
  );
  if (missing.length === 0) return normalized;

  const additions = missing
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  return `${normalized.slice(0, end)}\n${additions}${normalized.slice(end)}`;
}

let changed = 0;
for (const file of await markdownFiles(vaultRoot)) {
  const relativePath = path.relative(vaultRoot, file);
  const original = await fs.readFile(file, "utf8");
  const updated = addMissingProperties(original, metadataFor(relativePath));
  if (updated !== original) {
    await fs.writeFile(file, updated, "utf8");
    changed += 1;
  }
}

console.log(`Frontmatter normalizado: ${changed} arquivo(s) alterado(s).`);
