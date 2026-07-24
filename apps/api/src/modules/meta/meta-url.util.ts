const GRAPH_HOST = 'graph.facebook.com';
const MEDIA_HOSTS = new Set([
  GRAPH_HOST,
  'lookaside.fbsbx.com',
  'lookaside.facebook.com',
]);

export function assertMetaGraphUrl(raw: string | URL): URL {
  return assertMetaHttpsUrl(raw, (hostname) => hostname === GRAPH_HOST, 'Graph API');
}

export function assertMetaMediaUrl(raw: string | URL): URL {
  return assertMetaHttpsUrl(
    raw,
    (hostname) => MEDIA_HOSTS.has(hostname) || hostname.endsWith('.fbcdn.net'),
    'midia',
  );
}

function assertMetaHttpsUrl(
  raw: string | URL,
  isAllowedHost: (hostname: string) => boolean,
  purpose: string,
): URL {
  let url: URL;
  try {
    url = new URL(raw.toString());
  } catch {
    throw new Error(`URL de ${purpose} da Meta invalida`);
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (
    url.protocol !== 'https:' ||
    Boolean(url.username || url.password) ||
    Boolean(url.port && url.port !== '443') ||
    !isAllowedHost(hostname)
  ) {
    throw new Error(`Destino de ${purpose} da Meta nao permitido`);
  }

  url.hash = '';
  return url;
}
