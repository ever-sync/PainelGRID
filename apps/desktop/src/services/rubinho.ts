import { httpRequest } from "./http";

export type RubinhoAgent = {
  id: string;
  client_id: string;
  name: string;
  status: boolean;
  prompt: string;
  tone: string;
  delay_minutes: number;
  created_at: string;
  updated_at: string;
  events?: {
    id: string;
    rubinho_agent_id: string;
    event_id: string;
    event: { id: string; name: string };
  }[];
  faqs?: RubinhoFaq[];
  documents?: RubinhoDocument[];
  _count?: {
    faqs: number;
    documents: number;
  };
};

export type RubinhoFaq = {
  id: string;
  rubinho_agent_id: string;
  question: string;
  answer: string;
  created_at: string;
};

export type RubinhoDocument = {
  id: string;
  rubinho_agent_id: string;
  title: string;
  content: string;
  created_at: string;
};

export function listRubinhoAgents(clientId: string, token: string) {
  const qs = new URLSearchParams({ client_id: clientId });
  return httpRequest<RubinhoAgent[]>(`/rubinho?${qs.toString()}`, {
    method: "GET",
    token,
  });
}

export function getRubinhoAgent(id: string, token: string) {
  return httpRequest<RubinhoAgent>(`/rubinho/${id}`, { method: "GET", token });
}

export function createRubinhoAgent(
  dto: {
    client_id: string;
    name: string;
    status?: boolean;
    prompt: string;
    tone?: string;
    delay_minutes?: number;
    event_ids?: string[];
  },
  token: string,
) {
  return httpRequest<RubinhoAgent>("/rubinho", {
    method: "POST",
    token,
    body: dto,
  });
}

export function updateRubinhoAgent(
  id: string,
  dto: {
    name?: string;
    status?: boolean;
    prompt?: string;
    tone?: string;
    delay_minutes?: number;
    event_ids?: string[];
  },
  token: string,
) {
  return httpRequest<RubinhoAgent>(`/rubinho/${id}`, {
    method: "PATCH",
    token,
    body: dto,
  });
}

export function deleteRubinhoAgent(id: string, token: string) {
  return httpRequest<{ success: boolean }>(`/rubinho/${id}`, {
    method: "DELETE",
    token,
  });
}

// FAQs CRUD
export function addRubinhoFaq(
  agentId: string,
  question: string,
  answer: string,
  token: string,
) {
  return httpRequest<RubinhoFaq>(`/rubinho/${agentId}/faqs`, {
    method: "POST",
    token,
    body: { question, answer },
  });
}

export function deleteRubinhoFaq(faqId: string, token: string) {
  return httpRequest<{ success: boolean }>(`/rubinho/faqs/${faqId}`, {
    method: "DELETE",
    token,
  });
}

// Documents CRUD
export function addRubinhoDocument(
  agentId: string,
  title: string,
  content: string,
  token: string,
) {
  return httpRequest<RubinhoDocument>(`/rubinho/${agentId}/documents`, {
    method: "POST",
    token,
    body: { title, content },
  });
}

export function deleteRubinhoDocument(docId: string, token: string) {
  return httpRequest<{ success: boolean }>(`/rubinho/documents/${docId}`, {
    method: "DELETE",
    token,
  });
}
