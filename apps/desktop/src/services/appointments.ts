import { httpRequest } from "./http";

export type AppointmentStatus =
  | "proposed"
  | "scheduled"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "no_show"
  | "rescheduled";

export type AppointmentResponse = {
  id: string;
  client_id: string;
  lead_id: string;
  event_id: string;
  scheduled_at: string;
  timezone: string;
  status: AppointmentStatus;
  created_by_id: string | null;
  completed_at: string | null;
};

export function createAppointment(
  token: string,
  body: {
    lead_id: string;
    event_id: string;
    scheduled_at: string;
    timezone?: string;
    notes?: string;
  },
) {
  return httpRequest<AppointmentResponse>("/appointments", {
    method: "POST",
    token,
    body,
  });
}

export function checkInAppointment(token: string, appointmentId: string) {
  return httpRequest<{
    checked_in: boolean;
    appointment_id: string;
    lead_id: string;
    status: AppointmentStatus;
    completed_at: string | null;
  }>(`/appointments/${appointmentId}/check-in`, {
    method: "POST",
    token,
  });
}

export type RescheduleAppointmentResponse = {
  rescheduled: boolean;
  from_appointment_id: string;
  to_appointment_id: string;
  lead_id: string;
  scheduled_at: string;
  idempotent_replay?: boolean;
};

export function rescheduleAppointment(
  token: string,
  appointmentId: string,
  body: {
    scheduled_at: string;
    timezone?: string;
    notes?: string;
  },
) {
  return httpRequest<RescheduleAppointmentResponse>(
    `/appointments/${appointmentId}/reschedule`,
    {
      method: "POST",
      token,
      body,
    },
  );
}
