import { httpRequest } from "./http";

export type SaleType = "NOVO" | "SEMINOVO" | "VENDA_DIRETA" | "PCD";

export type SaleResponse = {
  id: string;
  client_id: string;
  lead_id: string;
  appointment_id: string;
  vendor_id: string;
  type: SaleType;
  product: string;
  value: string;
  sold_at: string;
  notes: string | null;
};

export type VendorSaleListItem = SaleResponse & {
  lead: {
    id: string;
    name: string;
    phone: string | null;
  } | null;
  appointment: {
    id: string;
    scheduled_at: string;
    status:
      | "proposed"
      | "scheduled"
      | "confirmed"
      | "cancelled"
      | "completed"
      | "no_show"
      | "rescheduled";
    event: {
      id: string;
      name: string;
    };
  } | null;
};

export function createSale(
  token: string,
  body: {
    appointment_id: string;
    type: SaleType;
    product: string;
    value: string;
    sold_at?: string;
    notes?: string;
  },
) {
  return httpRequest<SaleResponse>("/sales", {
    method: "POST",
    token,
    body,
  });
}

export function listVendorSales(token: string) {
  return httpRequest<VendorSaleListItem[]>("/sales/mine", {
    method: "GET",
    token,
  });
}
