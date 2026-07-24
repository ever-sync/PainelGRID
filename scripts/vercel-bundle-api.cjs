/**
 * Copia apps/api/dist -> apps/api/api/_nest para o serverless em apps/api/api/index.js.
 * Tambem empacota Prisma Client + engines dentro de _nest/node_modules para evitar
 * falha de runtime na Vercel quando deps estao hoisted no monorepo.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'apps', 'api', 'dist');
const dest = path.join(root, 'apps', 'api', 'api', '_nest');

function copyDirOrFail(from, to, label) {
  if (!fs.existsSync(from)) {
    console.error(`[vercel-bundle-api] ${label} ausente:`, from);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
  console.log(`[vercel-bundle-api] ${label} copiado para`, to);
}

function firstExisting(candidates) {
  return candidates.find((p) => fs.existsSync(p));
}

if (!fs.existsSync(src)) {
  console.error('[vercel-bundle-api] Pasta ausente:', src, '— rode o build da API antes.');
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });
fs.cpSync(src, dest, { recursive: true });
console.log('[vercel-bundle-api] Build copiado para', dest);

const prismaClientSrc = firstExisting([
  path.join(root, 'apps', 'api', 'node_modules', '@prisma', 'client'),
  path.join(root, 'node_modules', '@prisma', 'client'),
]);
const prismaEngineSrc = firstExisting([
  path.join(root, 'apps', 'api', 'node_modules', '.prisma'),
  path.join(root, 'node_modules', '.prisma'),
]);

copyDirOrFail(
  prismaClientSrc,
  path.join(dest, 'node_modules', '@prisma', 'client'),
  '@prisma/client',
);
copyDirOrFail(prismaEngineSrc, path.join(dest, 'node_modules', '.prisma'), '.prisma engines');
