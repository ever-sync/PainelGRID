export interface MetaAdAccountOption {
  id: string;
  name: string;
}

export interface MetaPageOption {
  id: string;
  name: string;
}

export interface MetaFormOption {
  id: string;
  name: string;
  page_id: string;
}

export interface MetaWhatsappOption {
  id: string;
  waba_id: string;
  name: string;
  phone_number_id: string;
  display_phone_number: string;
}

export interface MetaBusinessOption {
  id: string;
  name: string;
  ad_accounts: MetaAdAccountOption[];
  pages: MetaPageOption[];
  forms: MetaFormOption[];
  whatsapp_accounts: MetaWhatsappOption[];
}

export interface MetaConnectionSummary {
  campaigns: number;
  ad_sets: number;
  ads: number;
  leads_imported: number;
  spend_today: number;
  daily_budget: number;
}

export interface MetaConnectionState {
  business_id: string;
  business_name: string;
  selected_ad_accounts: MetaAdAccountOption[];
  selected_pages: MetaPageOption[];
  selected_forms: MetaFormOption[];
  selected_whatsapp?: MetaWhatsappOption | null;
  selected_whatsapps?: MetaWhatsappOption[];
  phone_number_id?: string | null;
  last_sync_at: string;
  sync_summary: MetaConnectionSummary;
}
