import { ConfirmationStatus, Prisma } from "@prisma/client";

export type CrmStageStatusRule = {
  status: ConfirmationStatus;
  stage_id: string;
  stage_code?: string | null;
  stage_name?: string | null;
};

const VALID_CONFIRMATION_STATUSES = new Set<ConfirmationStatus>([
  ConfirmationStatus.pending,
  ConfirmationStatus.scheduled,
  ConfirmationStatus.confirmed,
  ConfirmationStatus.cancelled,
  ConfirmationStatus.checked_in,
  ConfirmationStatus.closed,
]);

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeCrmStageStatusRules(
  value: unknown,
): CrmStageStatusRule[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const rules: CrmStageStatusRule[] = [];
  for (const item of value) {
    if (!isObjectRecord(item)) continue;
    const status = item.status;
    const stageId = item.stage_id;
    if (
      typeof status !== "string" ||
      !VALID_CONFIRMATION_STATUSES.has(status as ConfirmationStatus)
    ) {
      continue;
    }
    if (typeof stageId !== "string" || !stageId.trim()) {
      continue;
    }

    rules.push({
      status: status as ConfirmationStatus,
      stage_id: stageId.trim(),
      stage_code:
        typeof item.stage_code === "string"
          ? item.stage_code.trim() || null
          : null,
      stage_name:
        typeof item.stage_name === "string"
          ? item.stage_name.trim() || null
          : null,
    });
  }

  return rules;
}

export function extractClientSettings(
  currentSettings: unknown,
): Record<string, Prisma.InputJsonValue> {
  if (
    currentSettings &&
    typeof currentSettings === "object" &&
    !Array.isArray(currentSettings)
  ) {
    return { ...(currentSettings as Record<string, Prisma.InputJsonValue>) };
  }
  return {};
}

export function resolveConfirmationStatusForStage(
  currentSettings: unknown,
  stageId: string | null | undefined,
): ConfirmationStatus | null {
  if (!stageId) return null;
  const rules = normalizeCrmStageStatusRules(
    isObjectRecord(currentSettings)
      ? currentSettings.crm_stage_status_rules
      : null,
  );
  const matched = rules.find((rule) => rule.stage_id === stageId);
  return matched?.status ?? null;
}

export function withCrmStageStatusRules(
  currentSettings: unknown,
  rules: CrmStageStatusRule[] | null | undefined,
): Prisma.InputJsonValue {
  const base = extractClientSettings(currentSettings);

  if (!rules || rules.length === 0) {
    delete base.crm_stage_status_rules;
    return base as Prisma.InputJsonValue;
  }

  base.crm_stage_status_rules = rules.map((rule) => ({
    status: rule.status,
    stage_id: rule.stage_id,
    stage_code: rule.stage_code ?? null,
    stage_name: rule.stage_name ?? null,
  })) as Prisma.InputJsonValue;

  return base as Prisma.InputJsonValue;
}
