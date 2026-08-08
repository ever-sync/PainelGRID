import { confirmationStatusFromLeadDrawer } from "./lead-drawer.model";

describe("confirmationStatusFromLeadDrawer", () => {
  it.each([
    "pending",
    "scheduled",
    "confirmed",
    "checked_in",
    "cancelled",
  ] as const)("preserva o status %s enviado pelo seletor", (status) => {
    expect(confirmationStatusFromLeadDrawer(status)).toBe(status);
  });
});
