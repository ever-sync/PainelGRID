import { httpRequest } from "./http";
import type { TeamMetrics, TeamVendorMetrics, UserRole } from "../types";

export type TeamMemberUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  client_id?: string | null;
  is_active: boolean;
  avatar_url?: string | null;
};

export type TeamMember = {
  team_id: string;
  user_id: string;
  queue_position?: number | null;
  added_at: string;
  user: TeamMemberUser;
};

export type SalesTeam = {
  id: string;
  client_id: string;
  event_id: string | null;
  name: string;
  logo_url?: string | null;
  created_at: string;
  updated_at: string;
  members: TeamMember[];
  metrics?: TeamMetrics;
  vendors?: TeamVendorMetrics[];
};

export function listSalesTeams(token: string, eventId: string) {
  return httpRequest<SalesTeam[]>(`/sales-teams?event_id=${eventId}`, {
    method: "GET",
    token,
  });
}

export function createSalesTeam(token: string, eventId: string, name: string) {
  return httpRequest<SalesTeam>(`/sales-teams?event_id=${eventId}`, {
    method: "POST",
    token,
    body: { name },
  });
}

export function updateSalesTeam(
  token: string,
  teamId: string,
  payload: { name?: string; logo_url?: string | null },
) {
  return httpRequest<SalesTeam>(`/sales-teams/${teamId}`, {
    method: "PATCH",
    token,
    body: payload,
  });
}

export function deleteSalesTeam(token: string, teamId: string) {
  return httpRequest<{ deleted: boolean }>(`/sales-teams/${teamId}`, {
    method: "DELETE",
    token,
  });
}

export function addTeamMember(token: string, teamId: string, userId: string) {
  return httpRequest<SalesTeam>(`/sales-teams/${teamId}/members`, {
    method: "POST",
    token,
    body: { user_id: userId },
  });
}

export function removeTeamMember(
  token: string,
  teamId: string,
  userId: string,
) {
  return httpRequest<SalesTeam>(`/sales-teams/${teamId}/members/${userId}`, {
    method: "DELETE",
    token,
  });
}

export function reorderTeamMembers(
  token: string,
  teamId: string,
  userIds: string[],
) {
  return httpRequest<{ team_id: string; user_ids: string[] }>(
    `/sales-teams/${teamId}/members/order`,
    {
      method: "PATCH",
      token,
      body: { user_ids: userIds },
    },
  );
}
