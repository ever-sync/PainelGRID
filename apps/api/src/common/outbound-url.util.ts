import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

type LookupAddress = { address: string; family: number };
type LookupAll = (hostname: string) => Promise<LookupAddress[]>;

export type SafeWebhookDestination = {
  url: URL;
  address: string;
  family: 4 | 6;
};

export async function assertSafeWebhookUrl(
  raw: string,
  resolveAll: LookupAll = async (hostname) =>
    lookup(hostname, { all: true, verbatim: true }),
): Promise<string> {
  return (await resolveSafeWebhookDestination(raw, resolveAll)).url.toString();
}

export async function resolveSafeWebhookDestination(
  raw: string,
  resolveAll: LookupAll = async (hostname) =>
    lookup(hostname, { all: true, verbatim: true }),
): Promise<SafeWebhookDestination> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("URL de webhook invalida");
  }

  if (url.protocol !== "https:") {
    throw new Error("Webhook deve usar HTTPS");
  }
  if (url.username || url.password) {
    throw new Error("Webhook nao pode conter credenciais na URL");
  }
  if (url.port && url.port !== "443") {
    throw new Error("Webhook deve usar a porta HTTPS padrao");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !hostname.includes(".") ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".lan") ||
    hostname.endsWith(".home")
  ) {
    throw new Error("Host de webhook interno nao permitido");
  }

  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await resolveAll(hostname);
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => isPrivateAddress(address))
  ) {
    throw new Error("Host de webhook privado ou nao resolvido");
  }

  const selected = addresses[0];
  const family = isIP(selected.address);
  if (family !== 4 && family !== 6) {
    throw new Error("Endereco de webhook invalido");
  }

  url.hash = "";
  return {
    url,
    address: selected.address,
    family,
  };
}

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized.startsWith("::ffff:")) {
    return isPrivateAddress(normalized.slice("::ffff:".length));
  }

  if (isIP(normalized) === 6) {
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      /^fe[89ab]/.test(normalized)
    );
  }

  if (isIP(normalized) !== 4) {
    return true;
  }
  const [a, b] = normalized.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}
