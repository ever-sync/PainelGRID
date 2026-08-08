import type { ConfirmationStatus } from "../../types";
import type { LeadStatusValue } from "./LeadDrawer";

export function confirmationStatusFromLeadDrawer(
  status: LeadStatusValue,
): ConfirmationStatus {
  return status;
}
