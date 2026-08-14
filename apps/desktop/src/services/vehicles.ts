import { httpRequest } from "./http";

type FipeBrandResponse = {
  codigo: string;
  nome: string;
};

type FipeModelsResponse = {
  modelos?: Array<{
    codigo: number;
    nome: string;
  }>;
};

type FipeYearsResponse = Array<{
  codigo: string;
  nome: string;
}>;

export type VehicleOption = {
  value: string;
  label: string;
};

export type VehicleCatalogItem = {
  id: string;
  brand_code: string;
  brand: string;
  model_code: string;
  model: string;
  imported: boolean;
};

export type VehicleCatalogResponse = {
  brand: string;
  brand_code: string;
  synced: number;
  items: VehicleCatalogItem[];
};

export type Vehicle = {
  id: string;
  client_id: string;
  brand: string;
  model: string;
  year_or_km: string;
  price: string;
  stores: string;
  status: boolean;
  tags: string[];
  image_url?: string | null;
  category?: string | null;
  gallery?: string[];
  condition?: string | null;
  manufacturing_year?: string | null;
  model_year?: string | null;
  km?: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateVehicleDto = {
  client_id: string;
  brand: string;
  model: string;
  year_or_km: string;
  price: string;
  stores: string;
  status?: boolean;
  tags?: string[];
  image_url?: string;
  category?: string;
  gallery?: string[];
  condition?: string;
  manufacturing_year?: string;
  model_year?: string;
  km?: string;
};

export type UpdateVehicleDto = Partial<CreateVehicleDto>;

const FIPE_BASE = "https://parallelum.com.br/fipe/api/v1";

async function fipeFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${FIPE_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`Falha ao consultar FIPE (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

export async function listCarBrands(): Promise<VehicleOption[]> {
  const rows = await fipeFetch<FipeBrandResponse[]>("/carros/marcas");
  return rows
    .map((row) => ({ value: row.codigo, label: row.nome }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

export async function listCarModelsByBrand(
  brandCode: string,
): Promise<VehicleOption[]> {
  const payload = await fipeFetch<FipeModelsResponse>(
    `/carros/marcas/${brandCode}/modelos`,
  );
  const models = payload.modelos ?? [];
  return models
    .map((row) => ({ value: String(row.codigo), label: row.nome }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

export async function listCarYearsByBrandAndModel(
  brandCode: string,
  modelCode: string,
): Promise<VehicleOption[]> {
  const rows = await fipeFetch<FipeYearsResponse>(
    `/carros/marcas/${brandCode}/modelos/${modelCode}/anos`,
  );
  return rows
    .map((row) => ({ value: row.codigo, label: row.nome }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

export function listClientVehicles(
  clientId: string,
  params: { search?: string; status?: boolean; tag?: string },
  token: string,
) {
  const qs = new URLSearchParams({ client_id: clientId });
  if (params.search) qs.append("search", params.search);
  if (params.status !== undefined) qs.append("status", String(params.status));
  if (params.tag) qs.append("tag", params.tag);

  return httpRequest<Vehicle[]>(`/vehicles?${qs.toString()}`, {
    method: "GET",
    token,
  });
}

export function getVehicle(id: string, token: string) {
  return httpRequest<Vehicle>(`/vehicles/${id}`, { method: "GET", token });
}

export function createVehicle(dto: CreateVehicleDto, token: string) {
  return httpRequest<Vehicle>("/vehicles", {
    method: "POST",
    token,
    body: dto,
  });
}

export function syncVehicleCatalog(clientId: string, token: string) {
  return httpRequest<VehicleCatalogResponse>("/vehicles/catalog/sync", {
    method: "POST",
    token,
    body: { client_id: clientId },
  });
}

export function importVehicleCatalog(
  clientId: string,
  catalogIds: string[],
  token: string,
) {
  return httpRequest<{ imported: number; skipped: number }>(
    "/vehicles/catalog/import",
    {
      method: "POST",
      token,
      body: { client_id: clientId, catalog_ids: catalogIds },
    },
  );
}

export function updateVehicle(
  id: string,
  dto: UpdateVehicleDto,
  token: string,
) {
  return httpRequest<Vehicle>(`/vehicles/${id}`, {
    method: "PATCH",
    token,
    body: dto,
  });
}

export function deleteVehicle(id: string, token: string) {
  return httpRequest<{ success: boolean }>(`/vehicles/${id}`, {
    method: "DELETE",
    token,
  });
}
