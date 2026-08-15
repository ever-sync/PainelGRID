import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateInventory,
  generatedInventoryPath,
} from "./generate-obsidian-inventory.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const vaultRoot = path.join(repositoryRoot, "docs", "obsidian");
const requiredProperties = [
  "tipo",
  "status",
  "atualizado",
  "responsavel",
  "criticidade",
  "tags",
];
const errors = [];
const warnings = [];

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    if (entry.name === ".obsidian") continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(target)));
    else if (entry.isFile()) result.push(target);
  }
  return result;
}

function relative(file) {
  return path.relative(repositoryRoot, file);
}

function parseFrontmatter(content, file) {
  if (!content.startsWith("---\n")) {
    errors.push(`${relative(file)}: frontmatter ausente`);
    return {};
  }
  const end = content.indexOf("\n---\n", 4);
  if (end < 0) {
    errors.push(`${relative(file)}: frontmatter sem fechamento`);
    return {};
  }
  const header = content.slice(4, end);
  const properties = {};
  for (const line of header.split("\n")) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
    if (match) properties[match[1]] = match[2].trim();
  }
  for (const property of requiredProperties) {
    if (!properties[property]) {
      errors.push(`${relative(file)}: propriedade '${property}' ausente`);
    }
  }
  return properties;
}

function normalizeWikiTarget(raw) {
  return raw.split("|")[0].split("#")[0].trim().replace(/\\/g, "/");
}

function noteKey(target) {
  return path
    .basename(target)
    .replace(/\.(md|base)$/i, "")
    .toLocaleLowerCase();
}

const files = await walk(vaultRoot);
const markdownFiles = files.filter((file) => file.endsWith(".md"));
const linkableFiles = files.filter((file) => /\.(md|base)$/i.test(file));
const notesByName = new Map();
for (const file of linkableFiles) {
  const key = noteKey(file);
  const list = notesByName.get(key) ?? [];
  list.push(file);
  notesByName.set(key, list);
}
for (const [name, matches] of notesByName) {
  if (matches.length > 1) {
    errors.push(
      `nome de nota duplicado '${name}': ${matches.map(relative).join(", ")}`,
    );
  }
}

const markdownByFile = new Map();
for (const file of markdownFiles) {
  const content = await fs.readFile(file, "utf8");
  markdownByFile.set(file, content);
  const properties = parseFrontmatter(content, file);

  const updated = properties.atualizado?.replaceAll('"', "");
  if (updated && !updated.includes("{{date}}")) {
    const timestamp = Date.parse(`${updated}T00:00:00Z`);
    if (Number.isNaN(timestamp)) {
      errors.push(`${relative(file)}: data 'atualizado' inválida (${updated})`);
    } else {
      const ageDays = (Date.now() - timestamp) / 86_400_000;
      if (ageDays > 120) {
        warnings.push(
          `${relative(file)}: revisão vencida há ${Math.floor(ageDays)} dias`,
        );
      }
    }
  }

  for (const match of content.matchAll(/!?\[\[([^\]]+)\]\]/g)) {
    const target = normalizeWikiTarget(match[1]);
    if (!target || target.includes("{{")) continue;
    const key = noteKey(target);
    if (!notesByName.has(key)) {
      errors.push(`${relative(file)}: wikilink sem destino [[${match[1]}]]`);
    }
  }

  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].split("#")[0].trim();
    if (!target || /^(https?:|mailto:|obsidian:)/i.test(target)) continue;
    const resolved = path.resolve(path.dirname(file), decodeURI(target));
    try {
      await fs.access(resolved);
    } catch {
      errors.push(`${relative(file)}: link Markdown sem destino (${match[1]})`);
    }
  }

  for (const match of content.matchAll(
    /`((?:apps|packages|docs|scripts|e2e|supabase)\/[A-Za-z0-9_./*-]+|package\.json|docker-compose\.yml)`/g,
  )) {
    const target = match[1];
    if (target.includes("*") || target.endsWith("/")) continue;
    const resolved = path.resolve(repositoryRoot, target);
    try {
      await fs.access(resolved);
    } catch {
      errors.push(
        `${relative(file)}: caminho de código inexistente (${target})`,
      );
    }
  }
}

const schemaPath = path.join(
  repositoryRoot,
  "apps",
  "api",
  "prisma",
  "schema.prisma",
);
const catalogPath = path.join(
  vaultRoot,
  "07 - Referencia",
  "Catalogo do Banco.md",
);
const schema = await fs.readFile(schemaPath, "utf8");
const dataCatalog = await fs.readFile(catalogPath, "utf8");
const modelNames = [...schema.matchAll(/^model\s+(\w+)/gm)].map(
  (match) => match[1],
);
for (const model of modelNames) {
  if (!dataCatalog.includes(`\`${model}\``)) {
    errors.push(
      `Catalogo do Banco.md: model Prisma não documentado (${model})`,
    );
  }
}

try {
  const committedInventory = await fs.readFile(generatedInventoryPath, "utf8");
  const inventoryDate =
    committedInventory.match(/^atualizado:\s*(\d{4}-\d{2}-\d{2})$/m)?.[1] ??
    "1970-01-01";
  const expectedInventory = await generateInventory(inventoryDate);
  if (committedInventory !== expectedInventory) {
    errors.push(
      "Inventario Automatico.md está divergente do código; execute 'npm run docs:sync'",
    );
  }
} catch (error) {
  errors.push(
    `não foi possível validar Inventario Automatico.md (${error instanceof Error ? error.message : String(error)})`,
  );
}

if (warnings.length) {
  console.warn(`Avisos da documentação (${warnings.length}):`);
  for (const warning of warnings) console.warn(`- ${warning}`);
}
if (errors.length) {
  console.error(`Erros da documentação (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `Documentação válida: ${markdownFiles.length} notas, ${modelNames.length} models Prisma e nenhum link quebrado.`,
  );
}
