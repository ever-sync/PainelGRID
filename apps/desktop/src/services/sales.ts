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
  order_number: string | null;
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

export type EventSaleListItem = VendorSaleListItem & {
  vendor: { id: string; name: string };
  team: { id: string; name: string } | null;
};

export type PendingEventSale = {
  id: string;
  lead_id: string;
  lead_name: string;
  lead_phone: string | null;
  wristband_number: string | null;
  vendor_id: string;
  vendor_name: string;
  finished_at: string | null;
};

export type QuickSaleBuyer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

export function createSale(
  token: string,
  body: {
    appointment_id: string;
    type: SaleType;
    product: string;
    value: string;
    sold_at?: string;
    order_number?: string;
    notes?: string;
  },
) {
  return httpRequest<SaleResponse>("/sales", {
    method: "POST",
    token,
    body,
  });
}

export type QuickSalePayload = {
  client_id: string;
  event_id: string;
  vendor_id: string;
  lead_id?: string;
  lead_name?: string;
  lead_phone?: string;
  lead_email?: string;
  vehicle_id?: string;
  product?: string;
  type: SaleType;
  value: string;
  sold_at: string;
  order_number: string;
  wristband_number?: string;
  notes?: string;
};

export function createQuickSale(token: string, body: QuickSalePayload) {
  return httpRequest<SaleResponse>("/sales/quick", {
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

export function listEventSales(token: string, eventId: string) {
  return httpRequest<EventSaleListItem[]>(
    `/sales?event_id=${encodeURIComponent(eventId)}`,
    { method: "GET", token },
  );
}

export function listPendingEventSales(token: string, eventId: string) {
  return httpRequest<PendingEventSale[]>(
    `/sales/pending?event_id=${encodeURIComponent(eventId)}`,
    { method: "GET", token },
  );
}

export type UpdateSalePayload = {
  lead_id: string;
  vendor_id: string;
  type: SaleType;
  product: string;
  value: string;
  sold_at: string;
  order_number?: string;
  notes?: string;
};

export function updateSale(
  token: string,
  saleId: string,
  body: UpdateSalePayload,
) {
  return httpRequest<SaleResponse>(`/sales/${saleId}`, {
    method: "PATCH",
    token,
    body,
  });
}

export function deleteSale(token: string, saleId: string) {
  return httpRequest<{ deleted: boolean }>(`/sales/${saleId}`, {
    method: "DELETE",
    token,
  });
}

export function listQuickSaleBuyers(
  token: string,
  clientId: string,
  search = "",
) {
  const query = new URLSearchParams({ client_id: clientId });
  if (search.trim()) query.set("search", search.trim());
  return httpRequest<QuickSaleBuyer[]>(`/sales/buyers?${query.toString()}`, {
    method: "GET",
    token,
  });
}
