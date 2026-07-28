import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const distDir = path.join(workspaceDir, "dist");
const manifestPath = path.join(distDir, ".vite", "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const gzipSizeCache = new Map();

function gzipSize(file) {
  if (!gzipSizeCache.has(file)) {
    const contents = readFileSync(path.join(distDir, file));
    gzipSizeCache.set(file, gzipSync(contents).byteLength);
  }
  return gzipSizeCache.get(file);
}

function collectStaticFiles(chunk, files = new Set()) {
  if (!chunk || files.has(chunk.file)) {
    return files;
  }

  files.add(chunk.file);
  for (const importedChunkKey of chunk.imports ?? []) {
    collectStaticFiles(manifest[importedChunkKey], files);
  }
  return files;
}

function formatKilobytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

const chunks = Object.values(manifest);
const entryChunk = chunks.find((chunk) => chunk.isEntry);
if (!entryChunk) {
  throw new Error("Entrada principal não encontrada no manifesto do Vite.");
}

const initialFiles = collectStaticFiles(entryChunk);
const initialGzipBytes = [...initialFiles].reduce(
  (total, file) => total + gzipSize(file),
  0,
);

const routeRows = chunks
  .filter(
    (chunk) =>
      chunk.isDynamicEntry &&
      chunk.src?.startsWith("src/pages/") &&
      chunk.file.endsWith(".js"),
  )
  .map((chunk) => {
    const additionalFiles = [...collectStaticFiles(chunk)].filter(
      (file) => !initialFiles.has(file),
    );
    const additionalGzipBytes = additionalFiles.reduce(
      (total, file) => total + gzipSize(file),
      0,
    );

    return {
      route: chunk.name ?? path.basename(chunk.src, path.extname(chunk.src)),
      additionalGzipBytes,
      requestCount: additionalFiles.length,
    };
  })
  .sort((left, right) => right.additionalGzipBytes - left.additionalGzipBytes);

console.log(
  `\nEntrada inicial de JS: ${formatKilobytes(initialGzipBytes)} gzip`,
);
console.log("Peso adicional por rota (JS estático, após a entrada inicial):\n");
console.log(
  `${"Rota".padEnd(31)} ${"Gzip".padStart(10)} ${"Req.".padStart(6)}`,
);
console.log("-".repeat(49));

for (const row of routeRows) {
  console.log(
    `${row.route.padEnd(31)} ${formatKilobytes(row.additionalGzipBytes).padStart(10)} ${String(row.requestCount).padStart(6)}`,
  );
}
