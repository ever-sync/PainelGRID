import { API_BASE } from "./http";

export type CheckInPreview = {
  lead_first_name: string;
  company_name: string;
  event_name: string | null;
};

export async function fetchCheckInPreview(
  voucher: string,
): Promise<CheckInPreview> {
  const qs = new URLSearchParams({ v: voucher });
  const res = await fetch(
    `${API_BASE}/public/check-in/preview?${qs.toString()}`,
  );
  if (!res.ok) {
    throw new Error("preview_failed");
  }
  return res.json() as Promise<CheckInPreview>;
}
