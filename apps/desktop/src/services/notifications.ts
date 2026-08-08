import { httpRequest } from "./http";

export type ApiNotification = {
  id: string;
  type: "info" | "alert" | "appointment" | "message";
  title: string;
  description: string;
  href: string | null;
  read: boolean;
  created_at: string;
};

export type NotificationsPage = {
  items: ApiNotification[];
  unread_count: number;
};

export function listNotifications(token: string, take = 50) {
  return httpRequest<NotificationsPage>(`/notifications?take=${take}`, {
    method: "GET",
    token,
  });
}

export function markNotificationRead(id: string, token: string) {
  return httpRequest<{ ok: boolean }>(`/notifications/${id}/read`, {
    method: "PATCH",
    token,
  });
}

export function markAllNotificationsRead(token: string) {
  return httpRequest<{ updated: number }>("/notifications/read-all", {
    method: "PATCH",
    token,
  });
}

export function clearNotifications(token: string) {
  return httpRequest<{ deleted: number }>("/notifications", {
    method: "DELETE",
    token,
  });
}
