export type StringMap = Record<string, string | number | undefined>;

export interface GraphErrorPayload {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
}

export interface GraphListResponse<T> extends GraphErrorPayload {
  data?: T[];
  paging?: { next?: string };
}

export interface MetaBusinessSummary {
  id: string;
  name?: string;
}

export interface MetaAdAccountSummary {
  id: string;
  account_id?: string;
  name?: string;
}

export interface MetaPageSummary {
  id: string;
  name?: string;
  access_token?: string;
}

export interface MetaWhatsappBusinessSummary {
  id: string;
  name?: string;
}

export interface MetaPhoneNumberSummary {
  id: string;
  display_phone_number?: string;
}

export interface MetaLeadFormSummary {
  id: string;
  page_id?: string;
  name?: string;
  status?: string;
  questions?: unknown[];
}

export interface WhatsappSendMessageResponse {
  messages?: Array<{ id?: string }>;
}

export interface WhatsappExtractedMessagePayload {
  content: string;
  mediaId: string | null;
  mediaUrl: string | null;
}

export interface WhatsappUploadMediaResponse {
  id?: string;
}

export interface MetaOauthStateCache {
  kind?: 'client' | 'gestor';
  clientId?: string;
  gestorId?: string;
  createdAt: string;
}

export interface MetaOauthSessionCache {
  id: string;
  clientId: string;
  state: string;
  accessToken: string;
  tokenType?: string;
  expiresIn?: number;
  tokenExpiresAt?: string;
  scopes: string[];
  businesses: MetaBusinessSummary[];
  createdAt: string;
}

export interface MetaSelectionSession {
  accessToken: string;
  scopes: string[];
  tokenExpiresAt?: string | null;
  state: string | null;
  businesses: MetaBusinessSummary[];
}

export interface MetaCampaignPayload {
  id: string;
  name?: string;
  status?: string;
  objective?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
}

export interface MetaAdSetPayload {
  id: string;
  name?: string;
  status?: string;
  campaign_id?: string;
  daily_budget?: string;
  lifetime_budget?: string;
}

export interface MetaAdPayload {
  id: string;
  name?: string;
  status?: string;
  effective_status?: string;
  campaign_id?: string;
  adset_id?: string;
  creative?: { id?: string; name?: string };
}

export interface MetaCreativePayload {
  id: string;
  name?: string;
  title?: string;
  body?: string;
  image_url?: string;
  video_id?: string;
  url_tags?: string;
  object_story_id?: string;
}

export interface MetaInsightPayload {
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  date_start?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  cpc?: string;
  ctr?: string;
  reach?: string;
  frequency?: string;
  actions?: Array<{ action_type?: string; value?: string }>;
}

export type MetaInsightLevel = 'campaign' | 'adset' | 'ad';

export interface MetaLeadPayload {
  id?: string;
  created_time?: string;
  field_data?: Array<{ name?: string; values?: string[] }>;
  form_id?: string;
  ad_id?: string;
  adgroup_id?: string;
  campaign_id?: string;
  is_organic?: boolean;
}

export interface InitialSyncResult {
  status: 'completed' | 'failed' | 'queued';
  message?: string;
  summary?: Record<string, unknown>;
}
