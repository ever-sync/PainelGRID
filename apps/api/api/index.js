const path = require('path');

/** Build copiado por `scripts/vercel-bundle-api.cjs` após `npm run build` na raiz do monorepo. */
const buildPath = path.join(__dirname, '_nest', 'vercel.js');
try {
  const vercelHandler = require(buildPath);
  module.exports = vercelHandler.default || vercelHandler;
} catch (err) {
  console.error(
    '[apps/api/api/index] Falha ao carregar Nest. Rode `npm run build` na raiz do repositório antes do deploy.',
    err,
  );
  module.exports = async function errorHandler(_req, res) {
    res.status(500).setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: 'API bundle indisponivel',
        hint: 'Build na raiz gera apps/api/api/_nest a partir de apps/api/dist. Veja DEPLOY_VERCEL.txt.',
        message: err instanceof Error ? err.message : String(err),
      }),
    );
  };
}
