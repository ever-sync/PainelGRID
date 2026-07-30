import type {
  User,
  UserApprovalStatus,
  UserRole,
  VendorCategory,
} from "../types";
import { httpRequest } from "./http";

type ApiStaffUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  vendor_categories?: VendorCategory[];
  client_id?: string | null;
  rating_token?: string | null;
  phone?: string | null;
  is_active?: boolean;
  created_at?: string;
  approval_status?: UserApprovalStatus;
};

export function listClientStaff(clientId: string, token: string) {
  const qs = new URLSearchParams({ client_id: clientId });
  return httpRequest<ApiStaffUser[]>(`/client-staff?${qs.toString()}`, {
    method: "GET",
    token,
  });
}

export function mapStaffToUser(row: ApiStaffUser): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    vendor_categories: row.vendor_categories ?? [],
    client_id: row.client_id ?? undefined,
    rating_token: row.rating_token ?? undefined,
    phone: row.phone ?? undefined,
    // A API ja devolvia estes campos; o mapper os descartava.
    is_active: row.is_active,
    created_at: row.created_at,
    approval_status: row.approval_status,
  };
}
