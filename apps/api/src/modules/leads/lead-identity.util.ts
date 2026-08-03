import { Prisma } from '@prisma/client';
import { normalizeBrazilianPhone, phoneDigits } from '../../common/phone.util';

export function buildLeadPhoneCandidates(raw?: string | null) {
  const trimmed = raw?.trim();
  if (!trimmed) return null;

  const normalized = normalizeBrazilianPhone(trimmed);
  const digits = phoneDigits(trimmed);
  const candidates = new Set<string>([trimmed, normalized]);

  if (digits) {
    candidates.add(digits);
    candidates.add(`+${digits}`);
    if (digits.length >= 10) candidates.add(digits.slice(-10));
    if (digits.length >= 11) candidates.add(`+55${digits.slice(-11)}`);
  }

  return {
    trimmed,
    normalized,
    digits,
    candidates: Array.from(candidates).filter(Boolean),
  };
}

function asPrismaKnownRequestError(
  error: unknown,
): Pick<Prisma.PrismaClientKnownRequestError, 'code' | 'meta'> | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error;
  if (!error || typeof error !== 'object') return null;

  const candidate = error as { code?: unknown; meta?: unknown };
  if (typeof candidate.code !== 'string') return null;
  return {
    code: candidate.code,
    meta: candidate.meta as Prisma.PrismaClientKnownRequestError['meta'],
  };
}

function uniqueTargetEntries(error: unknown): string[] {
  const prismaError = asPrismaKnownRequestError(error);
  if (!prismaError || prismaError.code !== 'P2002') return [];

  const target = prismaError.meta?.target;
  return (Array.isArray(target) ? target : target ? [target] : []).map((item) =>
    String(item).toLowerCase(),
  );
}

export function isLeadPhoneUniqueViolation(error: unknown): boolean {
  const targets = uniqueTargetEntries(error);
  return targets.some(
    (entry) =>
      (entry.includes('client_id') && entry.includes('phone')) ||
      entry.includes('leads_client_id_phone_active_unique'),
  );
}

export function isLeadEmailUniqueViolation(error: unknown): boolean {
  const targets = uniqueTargetEntries(error);
  return targets.some(
    (entry) =>
      (entry.includes('client_id') && entry.includes('email')) ||
      entry.includes('leads_client_id_email_active_unique'),
  );
}

export function isLeadExternalRefUniqueViolation(error: unknown): boolean {
  const targets = uniqueTargetEntries(error);
  return targets.some(
    (entry) =>
      (entry.includes('client_id') && entry.includes('external_ref')) ||
      entry.includes('lead_client_external_ref'),
  );
}
