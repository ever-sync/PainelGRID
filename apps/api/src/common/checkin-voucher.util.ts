import { createHmac, timingSafeEqual } from "crypto";

export const CHECKIN_VOUCHER_TYP = "lf_chk_v1";

export type CheckinVoucherClaims = {
  typ: typeof CHECKIN_VOUCHER_TYP;
  lid: string;
  cid: string;
  /** checkin_token bruto */
  t: string;
  iat: number;
  exp: number;
};

function b64urlJson(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
}

function b64urlParse<T>(segment: string): T | null {
  try {
    const raw = Buffer.from(segment, "base64url").toString("utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** HS256 JWT compacto (sem dependência jsonwebtoken). */
export function signCheckinVoucher(
  secret: string,
  leadId: string,
  clientId: string,
  checkinToken: string,
  ttlSeconds: number,
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload: CheckinVoucherClaims = {
    typ: CHECKIN_VOUCHER_TYP,
    lid: leadId,
    cid: clientId,
    t: checkinToken,
    iat: now,
    exp: now + ttlSeconds,
  };
  const h = b64urlJson(header);
  const p = b64urlJson(payload);
  const sig = createHmac("sha256", secret).update(`${h}.${p}`).digest();
  const s = sig.toString("base64url");
  return `${h}.${p}.${s}`;
}

export function verifyCheckinVoucher(
  secret: string,
  jwt: string,
): CheckinVoucherClaims | null {
  const parts = jwt.trim().split(".");
  if (parts.length !== 3) {
    return null;
  }
  const [h, p, s] = parts;
  if (!h || !p || !s) {
    return null;
  }
  let sigBuf: Buffer;
  try {
    sigBuf = Buffer.from(s, "base64url");
  } catch {
    return null;
  }
  const expected = createHmac("sha256", secret).update(`${h}.${p}`).digest();
  if (expected.length !== sigBuf.length || !timingSafeEqual(expected, sigBuf)) {
    return null;
  }
  const header = b64urlParse<{ alg?: string }>(h);
  if (!header || header.alg !== "HS256") {
    return null;
  }
  const payload = b64urlParse<CheckinVoucherClaims>(p);
  if (
    !payload ||
    payload.typ !== CHECKIN_VOUCHER_TYP ||
    !payload.lid ||
    !payload.cid ||
    !payload.t
  ) {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp < now) {
    return null;
  }
  return payload;
}

export function looksLikeJwtCompact(value: string): boolean {
  const parts = value.trim().split(".");
  return parts.length === 3 && parts.every((x) => x.length > 0);
}
