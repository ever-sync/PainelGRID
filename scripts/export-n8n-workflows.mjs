import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const apiKey = process.env.N8N_API_KEY?.trim();
const apiUrl = (
  process.env.N8N_API_URL ?? "https://n9n.gridlabs.digital/api/v1"
).replace(/\/$/, "");
const checkOnly = process.argv.includes("--check");

if (!apiKey) {
  throw new Error("Defina N8N_API_KEY somente no ambiente antes de exportar.");
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workflows = [
  { id: "xrF95mmbiH38K1kS", file: "form-evento.json" },
  { id: "MWIRTrZl44bVjTZW", file: "rubinho-v1.json" },
];

const secretPatterns = [
  /EAF[A-Za-z0-9]{20,}/g,
  /lfi_[A-Za-z0-9_-]{20,}/g,
  /Bearer\s+[A-Za-z0-9._-]{20,}/gi,
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
];

function scrubString(input) {
  let value = input
    .replace(
      /((?:verifyToken|token)\s*!==\s*["'])([^"']+)(["'])/g,
      "$1<META_WEBHOOK_VERIFY_TOKEN>$3",
    )
    .replace(/("to"\s*:\s*")[^"]+("\s*[,}])/g, "$1<PHONE_REDACTED>$2")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<EMAIL_REDACTED>")
    .replace(/\b55\d{10,11}\b/g, "<PHONE_REDACTED>");

  for (const pattern of secretPatterns) {
    value = value.replace(pattern, "<SECRET_REDACTED>");
  }

  return value;
}

function scrubValue(value) {
  if (typeof value === "string") return scrubString(value);
  if (Array.isArray(value)) return value.map(scrubValue);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      key === "id" &&
      Object.hasOwn(value, "name") &&
      Object.keys(value).length <= 3
        ? "<CREDENTIAL_ID>"
        : scrubValue(entry),
    ]),
  );
}

function scrubNode(node) {
  const clean = scrubValue(node);
  const headerParameters = clean.parameters?.headerParameters?.parameters;

  if (Array.isArray(headerParameters)) {
    for (const parameter of headerParameters) {
      const name = String(parameter.name ?? "")
        .replace(/^=/, "")
        .toLowerCase();
      if (
        ["authorization", "x-leadflow-integration-key"].includes(name) &&
        typeof parameter.value === "string" &&
        !parameter.value.startsWith("={{")
      ) {
        parameter.value = "<CREDENTIAL_REQUIRED>";
      }
    }
  }

  const queryParameters = clean.parameters?.queryParameters?.parameters;
  if (Array.isArray(queryParameters)) {
    for (const parameter of queryParameters) {
      if (String(parameter.name ?? "").toLowerCase() === "access_token") {
        parameter.value = "<CREDENTIAL_REQUIRED>";
      }
    }
  }

  return clean;
}

function assertSanitized(serialized, workflowName) {
  const forbidden = [...secretPatterns, /"access_token"\s*:\s*"(?!<)[^"]+"/g];

  for (const pattern of forbidden) {
    pattern.lastIndex = 0;
    if (pattern.test(serialized)) {
      throw new Error(
        `Possível segredo encontrado no export de ${workflowName}.`,
      );
    }
  }
}

async function fetchWorkflow(id) {
  const response = await fetch(`${apiUrl}/workflows/${id}`, {
    headers: { "X-N8N-API-KEY": apiKey },
  });

  if (!response.ok) {
    throw new Error(`Falha ao buscar workflow ${id}: HTTP ${response.status}.`);
  }

  return response.json();
}

for (const workflow of workflows) {
  const source = await fetchWorkflow(workflow.id);
  const exported = {
    sourceWorkflowId: source.id,
    sourceUpdatedAt: source.updatedAt,
    name: source.name,
    active: source.active,
    nodes: source.nodes.map(scrubNode),
    connections: scrubValue(source.connections),
    settings: scrubValue(source.settings),
  };
  const serialized = `${JSON.stringify(exported, null, 2)}\n`;
  const destination = resolve(
    repositoryRoot,
    "docs/n8n/workflows",
    workflow.file,
  );

  assertSanitized(serialized, source.name);

  if (checkOnly) {
    const current = await readFile(destination, "utf8").catch(() => null);
    const currentObject = current ? JSON.parse(current) : null;
    if (JSON.stringify(currentObject) !== JSON.stringify(exported)) {
      throw new Error(`Export desatualizado: ${workflow.file}.`);
    }
    continue;
  }

  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, serialized, "utf8");
  console.log(`Export sanitizado atualizado: ${workflow.file}`);
}
