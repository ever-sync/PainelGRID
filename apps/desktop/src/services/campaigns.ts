import { httpRequest } from "./http";
import type {
  Campaign,
  CampaignStatus,
  DistributionMethod,
  LeadSource,
} from "../types";

export type ApiCampaign = {
  id: string;
  client_id: string;
  name: string;
  lead_filter_rules: Record<string, unknown>;
  distribution_method: "round_robin" | "weighted" | "manual";
  status: "draft" | "active" | "paused" | "completed";
  created_at: string;
  updated_at: string;
  vendors?: {
    vendor_id: string;
    vendor: { id: string; name: string; email: string };
  }[];
  _count?: { leads: number };
};

function mapStatus(s: ApiCampaign["status"]): CampaignStatus {
  if (s === "completed") return "finished";
  if (s === "paused") return "paused";
  return "active";
}

function mapDistribution(
  m: ApiCampaign["distribution_method"],
): DistributionMethod {
  if (m === "manual") return "manual";
  return "round_robin";
}

export function listCampaigns(clientId: string, token: string) {
  const qs = new URLSearchParams({ client_id: clientId });
  return httpRequest<ApiCampaign[]>(`/campaigns?${qs.toString()}`, {
    method: "GET",
    token,
  });
}

export function mapApiCampaignToCampaign(row: ApiCampaign): Campaign {
  const vendorIds = row.vendors?.map((v) => v.vendor_id) ?? [];
  return {
    id: row.id,
    client_id: row.client_id,
    name: row.name,
    status: mapStatus(row.status),
    distribution_method: mapDistribution(row.distribution_method),
    leads_count: row._count?.leads ?? 0,
    converted_count: 0,
    vendor_ids: vendorIds,
    sources: [] as LeadSource[],
    created_at: row.created_at,
  };
}
