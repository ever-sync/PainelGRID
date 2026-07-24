import { httpRequest } from "./http";

export type VendorScoreSummary = {
  vendor_id: string;
  client_id: string;
  total_points: number;
  scheduled: { points: number; count: number };
  checked_in: { points: number; count: number };
  sold: { points: number; count: number };
};

export type VendorScoreRankingItem = {
  vendor_id: string;
  vendor_name: string;
  total_points: number;
  assigned: number;
  visits: number;
  sales: number;
  scheduled: { points: number; count: number };
  checked_in: { points: number; count: number };
  sold: { points: number; count: number };
};

export function getVendorScoreSummary(token: string) {
  return httpRequest<VendorScoreSummary>("/vendor/score-summary", {
    method: "GET",
    token,
  });
}

export function getVendorScoreRanking(
  token: string,
  params: {
    client_id?: string;
    event_id?: string;
    from?: string;
    to?: string;
    limit?: number;
  } = {},
) {
  const qs = new URLSearchParams();
  if (params.client_id) qs.set("client_id", params.client_id);
  if (params.event_id) qs.set("event_id", params.event_id);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.limit) qs.set("limit", String(params.limit));
  return httpRequest<VendorScoreRankingItem[]>(
    `/vendor/score-ranking?${qs.toString()}`,
    {
      method: "GET",
      token,
    },
  );
}
