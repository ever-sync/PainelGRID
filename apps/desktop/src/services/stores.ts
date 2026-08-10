import { httpRequest } from "./http";

export type StoreBusinessHours = Record<
  string,
  { open: string; close: string; active: boolean }
>;

export type ApiStore = {
  id: string;
  client_id: string;
  brand: string;
  cnpj: string | null;
  name: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  zip_code: string;
  city: string;
  state: string;
  phone: string;
  website: string | null;
  instagram: string | null;
  email: string | null;
  status: boolean;
  business_hours: StoreBusinessHours;
  created_at: string;
  updated_at: string;
};

export type StorePayload = {
  client_id?: string;
  brand?: string;
  cnpj?: string;
  name?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  zip_code?: string;
  city?: string;
  state?: string;
  phone?: string;
  website?: string;
  instagram?: string;
  email?: string;
  status?: boolean;
  business_hours?: StoreBusinessHours;
};

export function listStores(clientId: string, token: string) {
  return httpRequest<ApiStore[]>(
    `/stores?client_id=${encodeURIComponent(clientId)}`,
    { token },
  );
}

export function createStore(payload: StorePayload, token: string) {
  return httpRequest<ApiStore>("/stores", {
    method: "POST",
    token,
    body: payload,
  });
}

export function updateStore(id: string, payload: StorePayload, token: string) {
  return httpRequest<ApiStore>(`/stores/${id}`, {
    method: "PATCH",
    token,
    body: payload,
  });
}

export function deleteStore(id: string, token: string) {
  return httpRequest<{ success: true }>(`/stores/${id}`, {
    method: "DELETE",
    token,
  });
}
