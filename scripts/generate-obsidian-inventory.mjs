import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const generatedInventoryPath = path.join(
  repositoryRoot,
  "docs",
  "obsidian",
  "07 - Referencia",
  "Inventario Automatico.md",
);

async function walk(directory, predicate) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(target, predicate)));
    else if (entry.isFile() && predicate(target)) result.push(target);
  }
  return result.sort();
}

function routePath(base, suffix) {
  return `/${[base, suffix].filter(Boolean).join("/").replace(/\/+/g, "/")}`;
}

async function backendRoutes() {
  const modulesRoot = path.join(
    repositoryRoot,
    "apps",
    "api",
    "src",
    "modules",
  );
  const controllers = await walk(modulesRoot, (file) =>
    file.endsWith("controller.ts"),
  );
  const routes = [];
  for (const file of controllers) {
    const source = await fs.readFile(file, "utf8");
    const base = source.match(/@Controller\(\s*["']([^"']*)["']\s*\)/)?.[1];
    if (base === undefined) continue;
    for (const match of source.matchAll(
      /@(Get|Post|Patch|Put|Delete)\(\s*(?:["']([^"']*)["'])?\s*\)/g,
    )) {
      routes.push({
        controller: path.relative(repositoryRoot, file),
        method: match[1].toUpperCase(),
        path: `/api${routePath(base, match[2] ?? "")}`,
      });
    }
  }
  return routes.sort((a, b) =>
    `${a.path}:${a.method}`.localeCompare(`${b.path}:${b.method}`),
  );
}

async function frontendRoutes() {
  const appPath = path.join(
    repositoryRoot,
    "apps",
    "desktop",
    "src",
    "App.tsx",
  );
  const source = await fs.readFile(appPath, "utf8");
  return [
    ...new Set(
      [...source.matchAll(/\bpath=["']([^"']+)["']/g)].map((match) => match[1]),
    ),
  ].sort();
}

async function prismaInventory() {
  const schemaPath = path.join(
    repositoryRoot,
    "apps",
    "api",
    "prisma",
    "schema.prisma",
  );
  const source = await fs.readFile(schemaPath, "utf8");
  return {
    models: [...source.matchAll(/^model\s+(\w+)/gm)]
      .map((match) => match[1])
      .sort(),
    enums: [...source.matchAll(/^enum\s+(\w+)/gm)]
      .map((match) => match[1])
      .sort(),
    env: [...source.matchAll(/env\(["']([A-Z][A-Z0-9_]+)["']\)/g)].map(
      (match) => match[1],
    ),
  };
}

async function environmentInventory() {
  const apiFiles = await walk(
    path.join(repositoryRoot, "apps", "api", "src"),
    (file) => file.endsWith(".ts"),
  );
  const desktopFiles = await walk(
    path.join(repositoryRoot, "apps", "desktop", "src"),
    (file) => file.endsWith(".ts") || file.endsWith(".tsx"),
  );
  const backend = new Set((await prismaInventory()).env);
  for (const file of apiFiles) {
    const source = await fs.readFile(file, "utf8");
    for (const match of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) {
      backend.add(match[1]);
    }
    for (const match of source.matchAll(/\benv\.([A-Z][A-Z0-9_]+)/g)) {
      backend.add(match[1]);
    }
    for (const match of source.matchAll(
      /(?:configService|this\.configService|this\.config|config)\s*\.\s*get(?:<[^>]+>)?\s*\(\s*["']([A-Z][A-Z0-9_]+)["']/g,
    )) {
      backend.add(match[1]);
    }
  }
  const frontend = new Set();
  for (const file of desktopFiles) {
    const source = await fs.readFile(file, "utf8");
    for (const match of source.matchAll(
      /import\.meta\.env\.([A-Z][A-Z0-9_]+)/g,
    )) {
      frontend.add(match[1]);
    }
  }
  return {
    backend: [...backend].sort(),
    frontend: [...frontend].sort(),
  };
}

function bulletCode(values) {
  return values.map((value) => `- \`${value}\``).join("\n");
}

export async function generateInventory(updatedDate) {
  const [routes, webRoutes, prisma, environment] = await Promise.all([
    backendRoutes(),
    frontendRoutes(),
    prismaInventory(),
    environmentInventory(),
  ]);
  const routeRows = routes
    .map(
      (route) =>
        `| \`${route.method}\` | \`${route.path}\` | \`${route.controller}\` |`,
    )
    .join("\n");
  const webRouteRows = webRoutes.map((route) => `| \`${route}\` |`).join("\n");

  return `---
tipo: referencia
status: gerado
atualizado: ${updatedDate}
responsavel: equipe-engenharia
criticidade: alta
tags: [painelgrid, referencia, inventario, automatico]
---

# Inventário Automático

> [!warning] Arquivo gerado
> Não edite manualmente. Execute \`npm run docs:sync\` após alterar controllers, rotas do frontend, schema Prisma ou variáveis de ambiente.

## Resumo

| Item | Quantidade |
|---|---:|
| Rotas HTTP | ${routes.length} |
| Rotas do frontend | ${webRoutes.length} |
| Models Prisma | ${prisma.models.length} |
| Enums Prisma | ${prisma.enums.length} |
| Variáveis do backend detectadas | ${environment.backend.length} |
| Variáveis públicas do frontend | ${environment.frontend.length} |

## Rotas HTTP

| Método | Rota | Controller |
|---|---|---|
${routeRows}

## Rotas do frontend

| Rota |
|---|
${webRouteRows}

## Models Prisma

${bulletCode(prisma.models)}

## Enums Prisma

${bulletCode(prisma.enums)}

## Variáveis detectadas no backend

${bulletCode(environment.backend)}

## Variáveis públicas detectadas no frontend

${bulletCode(environment.frontend)}

## Relacionamentos

- [[Catalogo Backend]]
- [[Catalogo Frontend]]
- [[Catalogo do Banco]]
- [[Configuracao e Variaveis]]
`;
}

function currentDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const content = await generateInventory(currentDate());
  await fs.writeFile(generatedInventoryPath, content, "utf8");
  console.log(
    `Inventário atualizado: ${path.relative(repositoryRoot, generatedInventoryPath)}`,
  );
}
