import { httpRequest } from "./http";
import type { UserApprovalStatus, UserRole, VendorCategory } from "../types";

export type CreatePrincipalClientAccessPayload = {
  name: string;
  email: string;
  password: string;
  client_id: string;
};

export type CreateStaffUserPayload = {
  name: string;
  email: string;
  password: string;
  role: "vendedor" | "recepcao";
  client_id: string;
  phone?: string;
  vendor_categories?: VendorCategory[];
};

export type UpdateStaffUserPayload = {
  name?: string;
  email?: string;
  password?: string;
  role?: "cliente" | "vendedor" | "recepcao";
  phone?: string | null;
  vendor_categories?: VendorCategory[];
};

export type StaffUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  vendor_categories: VendorCategory[];
  client_id?: string | null;
  is_active: boolean;
  phone?: string | null;
  created_at: string;
  rating_token?: string | null;
  approval_status: UserApprovalStatus;
};

type ApiUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  vendor_categories?: VendorCategory[];
  client_id?: string | null;
  is_active: boolean;
  phone?: string | null;
  created_at: string;
  rating_token?: string | null;
  approval_status?: UserApprovalStatus;
};

function toStaffUser(u: ApiUser): StaffUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as UserRole,
    vendor_categories: u.vendor_categories ?? [],
    client_id: u.client_id,
    is_active: u.is_active,
    phone: u.phone,
    created_at: u.created_at,
    rating_token: u.rating_token,
    approval_status: u.approval_status ?? "approved",
  };
}

export function createPrincipalClientAccess(
  token: string,
  payload: CreatePrincipalClientAccessPayload,
) {
  return httpRequest<ApiUser>("/users", {
    method: "POST",
    token,
    body: { ...payload, role: "cliente" },
  });
}

export function createStaffUser(
  token: string,
  payload: CreateStaffUserPayload,
) {
  return httpRequest<ApiUser>("/users", {
    method: "POST",
    token,
    body: payload,
  }).then(toStaffUser);
}

/** Aprova ou recusa um auto-cadastro. Gestor dono e o proprio cliente podem. */
export function setStaffApproval(
  token: string,
  userId: string,
  status: "approved" | "rejected",
) {
  return httpRequest<{ user: ApiUser; email_sent: boolean }>(
    `/client-staff/${userId}/approval`,
    { method: "PATCH", token, body: { status } },
  );
}

export function toggleUserActive(
  token: string,
  userId: string,
  isActive: boolean,
) {
  return httpRequest<ApiUser>(`/users/${userId}/active`, {
    method: "PATCH",
    token,
    body: { is_active: isActive },
  }).then(toStaffUser);
}

export function updateStaffUser(
  token: string,
  userId: string,
  payload: UpdateStaffUserPayload,
) {
  return httpRequest<ApiUser>(`/users/${userId}`, {
    method: "PUT",
    token,
    body: payload,
  }).then(toStaffUser);
}

export function deleteStaffUser(token: string, userId: string) {
  return httpRequest<{ deleted: boolean }>(`/users/${userId}`, {
    method: "DELETE",
    token,
  });
}

export function listUsers(token: string) {
  return httpRequest<ApiUser[]>("/users", {
    method: "GET",
    token,
  }).then((rows) => rows.map(toStaffUser));
}

export function listStaffByClient(token: string, clientId: string) {
  const qs = new URLSearchParams({ client_id: clientId });
  return httpRequest<ApiUser[]>(`/client-staff?${qs}`, {
    method: "GET",
    token,
  }).then((rows) => rows.map(toStaffUser));
}
