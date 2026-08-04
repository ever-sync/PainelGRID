// ─── User & Auth ────────────────────────────────────────────────────────────

export type UserRole = "gestor" | "cliente" | "vendedor" | "recepcao";
/** Estado do auto-cadastro publico. Independente de `is_active`. */
export type UserApprovalStatus = "pending" | "approved" | "rejected";
export type VendorCategory =
  "novo" | "semininovo" | "pdc" | "consorcio" | "assinatura";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  vendor_categories?: VendorCategory[];
  client_id?: string; // for cliente/vendedor/recepcao roles
  company_name?: string; // name of the associated company (Client)
  avatar?: string;
  /** Token do link publico de avaliacao de atendimento (somente vendedores). */
  rating_token?: string | null;
  phone?: string;
  is_active?: boolean;
  created_at?: string;
  approval_status?: UserApprovalStatus;
}

// ─── Client (empresa) ───────────────────────────────────────────────────────

export type PlanType = "starter" | "pro" | "enterprise";

export interface Client {
  id: string;
  company_name: string;
  cnpj: string;
  plan: PlanType;
  logo_url: string | null;
  facebook_page_id: string | null;
  facebook_ad_account_id: string | null;
  whatsapp_number: string | null;
  phone_number: string | null;
  webhook_url_n8n?: string | null;
  /** Token do link publico de auto-cadastro de vendedores. */
  vendor_signup_token?: string | null;
  address: string;
  contact_email: string;
  status: "active" | "inactive";
  leads_count: number;
  events_count: number;
  vehicles_count: number;
  crm_stage_status_rules?: CrmStageStatusRule[];
  created_at: string;
}

// ─── Lead ────────────────────────────────────────────────────────────────────

export type LeadSource =
  "facebook_ads" | "manual" | "whatsapp" | "form_page" | "import_excel";
export type CrmStage =
  | "novo"
  | "contactado"
  | "nao_responde"
  | "agendado"
  | "checkin"
  | "convertido"
  | "perdido";
export type ConfirmationStatus =
  "pending" | "scheduled" | "confirmed" | "cancelled" | "checked_in" | "closed";
export type CrmStageStatusRule = {
  status: ConfirmationStatus;
  stage_id: string;
  stage_code?: string | null;
  stage_name?: string | null;
};

export interface Lead {
  id: string;
  client_id: string;
  team_id?: string | null;
  name: string;
  email: string;
  phone: string;
  source: LeadSource;
  crm_stage: CrmStage;
  crm_stage_id: string | null;
  crm_stage_code?: string | null;
  crm_stage_name?: string | null;
  /** Quando o lead entrou na etapa atual; base do "parado ha X dias". */
  crm_stage_since?: string | null;
  crm_pipeline_id: string | null;
  tags: string[];
  confirmation_status: ConfirmationStatus;
  assigned_vendor_id: string | null;
  registered_by_id: string | null;
  registered_by_name: string | null;
  attendant_type?: "user" | "external_agent" | null;
  attendant_user_id?: string | null;
  sold_by_vendor_id?: string | null;
  event_interest: string | null;
  event_id: string | null;
  store_visit_datetime: string | null;
  notes: string;
  cpf?: string | null;
  wristband_number?: string | null;
  vehicle_plate?: string | null;
  companions?: string | null;
  description?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  birth_date?: string | null;
  facebook_lead_id?: string | null;
  facebook_form_id?: string | null;
  facebook_ad_id?: string | null;
  facebook_ad_name?: string | null;
  facebook_ad_set_id?: string | null;
  facebook_ad_set_name?: string | null;
  facebook_campaign_id?: string | null;
  facebook_campaign_name?: string | null;
  preferred_contact_channel?: string | null;
  source_created_at?: string | null;
  source_payload?: Record<string, unknown> | null;
  cpf_validated?: boolean;
  engagement_level?: "alto" | "medio" | "baixo";
  sentiment?: "positivo" | "neutro" | "negativo";
  contact_consent?: boolean;
  brand_interest?: string;
  model_interest?: string;
  store_name?: string;
  trade_vehicle?: string;
  ai_status?: string;
  ai_summary?: string;
  city?: string;
  state?: string;
  channel_code?: string;
  /** Presente após confirmação de presença; usado no check-in por código na recepção. */
  checkin_token: string | null;
  /** JWT assinado (90d) com token + lead + cliente; preferir no QR e no link /convite. */
  checkin_voucher: string | null;
  active_appointment?: {
    id: string;
    event_id: string;
    scheduled_at: string;
    status:
      | "proposed"
      | "scheduled"
      | "confirmed"
      | "cancelled"
      | "completed"
      | "no_show"
      | "rescheduled";
    created_by_type?: "user" | "external_agent" | null;
    created_by_id: string | null;
    completed_at: string | null;
    sale_id: string | null;
    sale_vendor_id?: string | null;
  } | null;
  created_at: string;
  updated_at: string;
}

// ─── Event ───────────────────────────────────────────────────────────────────

export type EventStatus = "draft" | "active" | "completed" | "cancelled";

export interface Event {
  id: string;
  client_id: string;
  participant_client_ids: string[];
  name: string;
  event_type: string | null;
  description: string;
  launch_date: string | null;
  event_date: string;
  event_end_date: string | null;
  location: string;
  capacity: number | null;
  sales_target: number | null;
  scheduled_target?: number | null;
  require_wristband?: boolean;
  total_investment?: number | null;
  paid_traffic_investment?: number | null;
  status: EventStatus;
  cover_image_url?: string | null;
  image_urls: string[];
  event_days?: Array<{ start: string; end: string }> | null;
  leads_count: number;
  confirmed_count: number;
  checkin_count: number;
  created_at: string;
  updated_at: string;
}

export interface ScoreBucket {
  points: number;
  count: number;
}

export interface TeamMetrics {
  total_points: number;
  assigned: number;
  visits: number;
  sales: number;
  scheduled: ScoreBucket;
  checked_in: ScoreBucket;
  sold: ScoreBucket;
}

export interface TeamVendorMetrics extends TeamMetrics {
  vendor_id: string;
  vendor_name: string;
  client_id?: string | null;
}

// ─── Campaign ────────────────────────────────────────────────────────────────

export type DistributionMethod = "round_robin" | "manual" | "by_region";
export type CampaignStatus = "active" | "paused" | "finished";

export interface Campaign {
  id: string;
  client_id: string;
  name: string;
  status: CampaignStatus;
  distribution_method: DistributionMethod;
  leads_count: number;
  converted_count: number;
  vendor_ids: string[];
  sources: LeadSource[];
  created_at: string;
}

// ─── Conversation / Chat ─────────────────────────────────────────────────────

export type ConversationChannel = "whatsapp" | "internal";

/** Envio próprio no painel: relógio (sending), checks (servidor confirmou), falha opcional */
export type MessageSendStatus =
  "sending" | "sent" | "delivered" | "read" | "failed";

export interface Message {
  id: string;
  sender: "lead" | "vendor" | "system";
  text: string;
  media_id?: string | null;
  media_url?: string | null;
  timestamp: string;
  /** Só mensagens próprias (vendor); omitido ou `sent` = mostrar conferido ao servidor */
  send_status?: MessageSendStatus;
}

export interface AgentActionLog {
  id: string;
  conversation_id: string;
  provider: string | null;
  model: string | null;
  trigger_type: string;
  decision_type: string;
  confidence: number | null;
  input_summary: string | null;
  output_summary: string | null;
  action_payload: unknown;
  result_status: string;
  error_message: string | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  client_id: string;
  lead_id: string;
  lead_name: string;
  channel: ConversationChannel;
  last_message: string;
  last_message_time: string;
  unread_count: number;
  handoff_required: boolean;
  handoff_reason: string | null;
  last_agent_action: string | null;
  handoff_updated_at: string | null;
  agent_actions: AgentActionLog[];
  messages: Message[];
}

// ─── Course ──────────────────────────────────────────────────────────────────

export interface Lesson {
  id: string;
  title: string;
  duration_min: number;
  video_url: string;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  cover_url: string | null;
  lessons: Lesson[];
  total_lessons: number;
}

export interface VendorCourseProgress {
  vendor_id: string;
  course_id: string;
  completed_lessons: number;
  last_access: string;
  score: number;
}

// ─── Stats ───────────────────────────────────────────────────────────────────

export interface StatsCardData {
  title: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon?: string;
}
