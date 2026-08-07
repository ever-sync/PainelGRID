import { API_BASE, httpRequest } from "./http";

export type RatingTarget = {
  vendor_name: string;
  company_name: string | null;
};

export async function fetchRatingTarget(token: string): Promise<RatingTarget> {
  const res = await fetch(
    `${API_BASE}/public/rating/${encodeURIComponent(token)}`,
  );
  if (!res.ok) {
    throw new Error("rating_target_failed");
  }
  return res.json() as Promise<RatingTarget>;
}

export async function submitServiceRating(
  token: string,
  payload: {
    score: number;
    event_score?: number;
    nps_score?: number;
    comment?: string;
    customer_name?: string;
  },
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/public/rating/${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) {
    const raw = await res.text();
    let message = "Falha ao enviar avaliação";
    try {
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed?.message) message = String(parsed.message);
    } catch {
      /* mantém mensagem padrão */
    }
    throw new Error(message);
  }
}

export type ServiceRatingSummary = {
  average: number;
  count: number;
};

export function getMyServiceRatingSummary(token: string) {
  return httpRequest<ServiceRatingSummary>("/service-ratings/summary", {
    method: "GET",
    token,
  });
}

export type VendorScoreMetrics = {
  vendor_id: string;
  client_id: string;
  total_points: number;
  contacted: { points: number; count: number };
  scheduled: { points: number; count: number };
  checked_in: { points: number; count: number };
  sold: { points: number; count: number };
};

export type ServiceRatingItem = {
  id: string;
  score: number;
  comment: string | null;
  customer_name: string | null;
  event_name: string | null;
  created_at: string;
};

export type VendorProfileResponse = {
  vendor: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    client_id: string;
    vendor_categories: string[];
    is_active: boolean;
    created_at: string;
  };
  metrics: VendorScoreMetrics | null;
  rank: { position: number; total: number } | null;
  ratings: {
    average: number;
    count: number;
    items: ServiceRatingItem[];
  };
};

export function getVendorProfile(token: string, vendorId: string) {
  return httpRequest<VendorProfileResponse>(
    `/service-ratings/vendor/${vendorId}`,
    {
      method: "GET",
      token,
    },
  );
}
