import { useEffect, useState, useMemo } from "react";
import {
  Sparkles,
  Bot,
  MessageSquare,
  TrendingUp,
  Settings,
  Calendar,
  Save,
  Clock,
  Volume2,
  FileText,
  Activity,
  UserCheck,
  CheckCircle,
  Plus,
  Trash2,
  ArrowLeft,
  BookOpen,
  HelpCircle,
  Edit2,
  Trash,
} from "lucide-react";
import { PageHeader } from "../../components/shared/PageHeader";
import { Tabs } from "../../components/ui/Tabs";
import { Card } from "../../components/ui/Card";
import { StatsCard } from "../../components/shared/StatsCard";
import { readStoredSession } from "../../services/auth";
import { listLeads, mapApiLeadToLead } from "../../services/leads";
import { useGestorClient } from "../../hooks/useGestorClient";
import { listEvents, mapApiEventToEvent } from "../../services/events";
import {
  listRubinhoAgents,
  getRubinhoAgent,
  createRubinhoAgent,
  updateRubinhoAgent,
  deleteRubinhoAgent,
  addRubinhoFaq,
  deleteRubinhoFaq,
  addRubinhoDocument,
  deleteRubinhoDocument,
  RubinhoAgent as RubinhoAgentType,
  RubinhoFaq,
  RubinhoDocument,
} from "../../services/rubinho";
import type { Lead, Event } from "../../types";

const TABS = [
  { id: "overview", label: "Visão Geral" },
  { id: "config", label: "Perguntas & Respostas" },
  { id: "logs", label: "Base de Conhecimento" },
];

export function RubinhoPage() {
  const { gestorClientId } = useGestorClient();
  const [agents, setAgents] = useState<RubinhoAgentType[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);

  // UI states
  const [loading, setLoading] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<RubinhoAgentType | null>(
    null,
  );
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [status, setStatus] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [tone, setTone] = useState("Amigável");
  const [delay, setDelay] = useState(5);
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);

  // FAQ Form states
  const [faqQuestion, setFaqQuestion] = useState("");
  const [faqAnswer, setFaqAnswer] = useState("");

  // Document Form states
  const [docTitle, setDocTitle] = useState("");
  const [docContent, setDocContent] = useState("");

  const token = readStoredSession()?.accessToken;

  // Helper for Toast alerts
  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Load all agents, events and leads on mount/client change
  const loadInitialData = () => {
    if (!token || !gestorClientId) return;
    setLoading(true);

    Promise.all([
      listRubinhoAgents(gestorClientId, token),
      listEvents({ client_id: gestorClientId }, token),
      listLeads({ client_id: gestorClientId }, token),
    ])
      .then(([agentsData, eventsData, leadsData]) => {
        setAgents(agentsData);
        setEvents(eventsData.map(mapApiEventToEvent));

        const leadItems = Array.isArray(leadsData)
          ? leadsData
          : (leadsData as any).items || [];
        setLeads(leadItems.map(mapApiLeadToLead));
      })
      .catch((err) => {
        console.error("Erro ao carregar dados do Rubinho:", err);
        triggerToast("Erro ao carregar dados do painel.");
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadInitialData();
    setSelectedAgentId(null);
    setSelectedAgent(null);
    setIsEditing(false);
    setIsCreating(false);
  }, [gestorClientId]);

  // Load specific agent details when selected
  useEffect(() => {
    if (!selectedAgentId || !token) {
      setSelectedAgent(null);
      return;
    }

    setLoading(true);
    getRubinhoAgent(selectedAgentId, token)
      .then((data) => {
        setSelectedAgent(data);
        // Fill form fields
        setName(data.name);
        setStatus(data.status);
        setPrompt(data.prompt);
        setTone(data.tone);
        setDelay(data.delay_minutes);
        setSelectedEventIds(data.events?.map((e) => e.event_id) || []);
      })
      .catch((err) => {
        console.error("Erro ao buscar agente Rubinho:", err);
        triggerToast("Não foi possível carregar os detalhes do robô.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [selectedAgentId]);

  // Statistics calculation for the selected agent
  const agentStats = useMemo(() => {
    if (!selectedAgent || leads.length === 0) {
      return { engaged: 0, scheduled: 0, rate: "0.0%" };
    }

    // Get event ids associated with this agent
    const linkedEventIds = selectedEventIds;
    if (linkedEventIds.length === 0) {
      return { engaged: 0, scheduled: 0, rate: "0.0%" };
    }

    // Filter leads that are interested in any of these events
    const agentLeads = leads.filter(
      (l) => l.event_id && linkedEventIds.includes(l.event_id),
    );

    const engaged = agentLeads.filter(
      (l) => l.crm_stage && l.crm_stage !== "novo" && l.crm_stage !== "perdido",
    ).length;

    const scheduled = agentLeads.filter(
      (l) => l.crm_stage === "agendado" || l.crm_stage === "convertido",
    ).length;

    const rate = engaged > 0 ? ((scheduled / engaged) * 100).toFixed(1) : "0.0";

    return {
      engaged,
      scheduled,
      rate: `${rate}%`,
    };
  }, [leads, selectedAgent, selectedEventIds]);

  // Save general settings (Create or Update)
  const handleSaveAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !gestorClientId) return;

    if (!name.trim()) {
      triggerToast("Por favor, informe o nome do robô.");
      return;
    }
    if (!prompt.trim()) {
      triggerToast("Por favor, cadastre um script/prompt básico.");
      return;
    }

    try {
      setLoading(true);
      if (isCreating) {
        const payload = {
          client_id: gestorClientId,
          name,
          status,
          prompt,
          tone,
          delay_minutes: delay,
          event_ids: selectedEventIds,
        };
        const newAgent = await createRubinhoAgent(payload, token);
        triggerToast("Robô Rubinho criado com sucesso!");
        setIsCreating(false);
        setSelectedAgentId(newAgent.id);
        setIsEditing(false);
      } else if (selectedAgentId) {
        const payload = {
          name,
          status,
          prompt,
          tone,
          delay_minutes: delay,
          event_ids: selectedEventIds,
        };
        await updateRubinhoAgent(selectedAgentId, payload, token);
        triggerToast("Configurações salvas!");
        setIsEditing(false);
      }
      loadInitialData();
    } catch (err) {
      console.error("Erro ao salvar robô Rubinho:", err);
      triggerToast("Erro ao salvar as configurações.");
    } finally {
      setLoading(false);
    }
  };

  // Delete Agent
  const handleDeleteAgent = async (agentId: string) => {
    if (!token) return;
    if (
      !confirm(
        "Deseja realmente excluir este agente Rubinho? Todas as FAQs e documentos dele serão perdidos.",
      )
    ) {
      return;
    }

    try {
      setLoading(true);
      await deleteRubinhoAgent(agentId, token);
      triggerToast("Agente Rubinho excluído com sucesso.");
      setSelectedAgentId(null);
      setSelectedAgent(null);
      setIsEditing(false);
      setIsCreating(false);
      loadInitialData();
    } catch (err) {
      console.error("Erro ao excluir agente:", err);
      triggerToast("Erro ao excluir o robô.");
    } finally {
      setLoading(false);
    }
  };

  // FAQ handlers
  const handleAddFaq = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgentId || !token || !faqQuestion.trim() || !faqAnswer.trim())
      return;

    try {
      setLoading(true);
      const newFaq = await addRubinhoFaq(
        selectedAgentId,
        faqQuestion,
        faqAnswer,
        token,
      );
      setSelectedAgent((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          faqs: [...(prev.faqs || []), newFaq],
        };
      });
      setFaqQuestion("");
      setFaqAnswer("");
      triggerToast("Pergunta e resposta adicionada!");
    } catch (err) {
      console.error("Erro ao adicionar FAQ:", err);
      triggerToast("Erro ao adicionar FAQ.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFaq = async (faqId: string) => {
    if (!token) return;
    try {
      setLoading(true);
      await deleteRubinhoFaq(faqId, token);
      setSelectedAgent((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          faqs: (prev.faqs || []).filter((f) => f.id !== faqId),
        };
      });
      triggerToast("FAQ removida.");
    } catch (err) {
      console.error("Erro ao deletar FAQ:", err);
      triggerToast("Erro ao deletar FAQ.");
    } finally {
      setLoading(false);
    }
  };

  // Document handlers
  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgentId || !token || !docTitle.trim() || !docContent.trim())
      return;

    try {
      setLoading(true);
      const newDoc = await addRubinhoDocument(
        selectedAgentId,
        docTitle,
        docContent,
        token,
      );
      setSelectedAgent((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          documents: [...(prev.documents || []), newDoc],
        };
      });
      setDocTitle("");
      setDocContent("");
      triggerToast("Documento adicionado à base de conhecimento!");
    } catch (err) {
      console.error("Erro ao adicionar documento:", err);
      triggerToast("Erro ao adicionar documento.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!token) return;
    try {
      setLoading(true);
      await deleteRubinhoDocument(docId, token);
      setSelectedAgent((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          documents: (prev.documents || []).filter((d) => d.id !== docId),
        };
      });
      triggerToast("Documento removido.");
    } catch (err) {
      console.error("Erro ao deletar documento:", err);
      triggerToast("Erro ao deletar documento.");
    } finally {
      setLoading(false);
    }
  };

  const handleEventCheckboxChange = (eventId: string, checked: boolean) => {
    if (checked) {
      setSelectedEventIds((prev) => [...prev, eventId]);
    } else {
      setSelectedEventIds((prev) => prev.filter((id) => id !== eventId));
    }
  };

  // Render lists of events linked
  const getLinkedEventNames = (agent: RubinhoAgentType) => {
    const linked =
      agent.events?.map((e) => e.event?.name).filter(Boolean) || [];
    if (linked.length === 0)
      return (
        <span className="text-zinc-400 italic">Nenhum evento vinculado</span>
      );
    return (
      <div className="flex flex-wrap gap-1">
        {linked.map((name, i) => (
          <span
            key={i}
            className="rounded bg-rose-50 border border-rose-100 px-2 py-0.5 text-[10px] font-semibold text-[#E51838]"
          >
            {name}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title="Rubinho"
        breadcrumbs={[{ label: "Gestor" }, { label: "Agente de IA" }]}
      />

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-[100] flex items-center gap-2 rounded-xl border border-rose-200 bg-white p-4 shadow-lg text-sm text-zinc-800 animate-slide-in">
          <CheckCircle size={18} className="text-emerald-500" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ────────────────── LIST VIEW ────────────────── */}
      {!selectedAgentId && !isCreating && (
        <div className="space-y-6">
          {/* Banner */}
          <div className="overflow-hidden rounded-[24px] border border-white/60 bg-gradient-to-r from-[#141414] to-[#240c10] p-6 text-white shadow-xl flex justify-between items-center flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#E51838] to-[#ff4b66] shadow-[0_0_20px_rgba(229,24,56,0.3)]">
                <Bot className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold tracking-tight">
                  Lista de Agentes Rubinho
                </h2>
                <p className="text-xs text-zinc-400">
                  Cadastre múltiplos scripts de atendimento direcionados para
                  eventos específicos e integre dinamicamente ao n8n.
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setIsCreating(true);
                setName("");
                setStatus(true);
                setPrompt(
                  "Você é o Rubinho, o assistente inteligente de vendas da empresa. Seu objetivo é engajar o lead de forma amigável no WhatsApp e tentar agendar uma visita presencial...",
                );
                setTone("Amigável");
                setDelay(5);
                setSelectedEventIds([]);
              }}
              className="flex items-center gap-2 rounded-xl bg-[#E51838] hover:bg-[#c9122f] px-5 py-3 text-sm font-semibold text-white shadow-md transition-colors"
            >
              <Plus size={16} />
              Novo Agente Rubinho
            </button>
          </div>

          {/* Agents Grid/Table */}
          {loading ? (
            <div className="py-12 text-center text-zinc-400">
              Carregando agentes Rubinho...
            </div>
          ) : agents.length === 0 ? (
            <Card className="text-center py-12">
              <Bot size={48} className="mx-auto mb-3 text-zinc-300" />
              <h4 className="text-sm font-bold text-zinc-700">
                Nenhum agente Rubinho cadastrado
              </h4>
              <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
                Crie seu primeiro atendente virtual de IA e vincule-o a eventos
                de lançamento para automatizar contatos via WhatsApp.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {agents.map((agent) => (
                <Card
                  key={agent.id}
                  className="relative flex flex-col justify-between hover:shadow-md transition-all duration-200"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Sparkles size={16} className="text-[#E51838]" />
                        <h4 className="font-bold text-zinc-800 text-sm">
                          {agent.name}
                        </h4>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          agent.status
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                            : "bg-zinc-100 text-zinc-400 border border-zinc-200"
                        }`}
                      >
                        {agent.status ? "Ativo" : "Pausado"}
                      </span>
                    </div>

                    <div className="space-y-2 mt-4 text-xs text-zinc-500">
                      <div className="flex items-center justify-between">
                        <span>Tom de Voz:</span>
                        <span className="font-semibold text-zinc-700">
                          {agent.tone}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Delay:</span>
                        <span className="font-semibold text-zinc-700">
                          {agent.delay_minutes} min
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>FAQs cadastrados:</span>
                        <span className="font-semibold text-zinc-700">
                          {agent._count?.faqs || 0}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Documentos de Apoio:</span>
                        <span className="font-semibold text-zinc-700">
                          {agent._count?.documents || 0}
                        </span>
                      </div>
                      <div className="pt-2 border-t border-zinc-100 mt-3">
                        <span className="block text-[10px] text-zinc-400 mb-1">
                          Eventos Vinculados:
                        </span>
                        {getLinkedEventNames(agent)}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-4 border-t border-zinc-100 mt-4">
                    <button
                      onClick={() => setSelectedAgentId(agent.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-700 transition-colors"
                    >
                      <Settings size={14} />
                      Configurar
                    </button>
                    <button
                      onClick={() => handleDeleteAgent(agent.id)}
                      className="rounded-lg border border-rose-200 hover:bg-rose-50 p-2 text-rose-500 transition-colors"
                    >
                      <Trash size={14} />
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* n8n Integration Guide banner */}
          <Card className="bg-[#fffcf7] border-[#f4e6c8]">
            <h4 className="text-sm font-bold text-zinc-800 flex items-center gap-2">
              <Bot size={18} className="text-[#3D56A2]" />
              Como integrar com o n8n?
            </h4>
            <p className="text-xs text-zinc-600 mt-1 max-w-3xl leading-relaxed">
              No seu fluxo do n8n, ao receber o lead, faça uma chamada HTTP do
              tipo <code>GET</code> para a URL:
              <br />
              <code className="bg-zinc-100 rounded px-1.5 py-0.5 text-rose-600 block w-fit mt-1.5">
                https://leadflowapi-production.up.railway.app/api/integrations/v1/rubinho/config?event_id=ID_DO_EVENTO
              </code>
              Passe o header <code>X-Leadflow-Integration-Key</code> com a sua
              chave. O retorno trará as regras daquele robô para alimentar a
              inteligência artificial automaticamente.
            </p>
          </Card>
        </div>
      )}

      {/* ────────────────── CREATE OR CONFIG VIEW ────────────────── */}
      {(selectedAgentId || isCreating) && (
        <div className="space-y-6">
          {/* Header com voltar */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setSelectedAgentId(null);
                setSelectedAgent(null);
                setIsCreating(false);
                setIsEditing(false);
                setActiveTab("overview");
              }}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 transition-colors"
            >
              <ArrowLeft size={16} />
            </button>
            <div>
              <h2 className="text-lg font-bold text-zinc-950">
                {isCreating
                  ? "Novo Agente Rubinho"
                  : `Configurar: ${selectedAgent?.name || "Carregando..."}`}
              </h2>
              <p className="text-xs text-zinc-400">
                {isCreating
                  ? "Cadastre e configure um novo robô de atendimento"
                  : "Configurações de prompt, FAQs e documentos"}
              </p>
            </div>
          </div>

          {!isCreating && (
            <Tabs
              tabs={TABS}
              active={activeTab}
              onChange={setActiveTab}
              className="mb-4"
            />
          )}

          {/* Loading details state */}
          {loading && !selectedAgent && !isCreating ? (
            <div className="py-12 text-center text-zinc-400">
              Carregando detalhes do robô...
            </div>
          ) : (
            <>
              {/* TAB 1: VISÃO GERAL / GERAL CONFIG */}
              {(activeTab === "overview" || isCreating) && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Form Config */}
                  <div className="lg:col-span-2 space-y-6">
                    <Card>
                      <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-4 flex items-center gap-2">
                        <Settings size={16} className="text-[#E51838]" />
                        Parâmetros do Agente
                      </h3>
                      <form onSubmit={handleSaveAgent} className="space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-zinc-500 mb-1.5">
                            Nome do Agente
                          </label>
                          <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Ex: Rubinho Empreendimento X"
                            className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-800 shadow-sm focus:border-[#E51838] focus:ring-1 focus:ring-[#E51838]"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-zinc-500 mb-1.5">
                              Tom de Voz
                            </label>
                            <select
                              value={tone}
                              onChange={(e) => setTone(e.target.value)}
                              className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-800 shadow-sm focus:border-[#E51838] focus:ring-1 focus:ring-[#E51838]"
                            >
                              <option value="Amigável">
                                Amigável (Acolhedor e prestativo)
                              </option>
                              <option value="Persuasivo">
                                Persuasivo (Focado em conversão)
                              </option>
                              <option value="Formal">
                                Formal (Polido e corporativo)
                              </option>
                              <option value="Descontraído">
                                Descontraído (Divertido, usa emojis)
                              </option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-zinc-500 mb-1.5">
                              Delay de Resposta ({delay} min)
                            </label>
                            <input
                              type="range"
                              min="1"
                              max="20"
                              value={delay}
                              onChange={(e) =>
                                setDelay(parseInt(e.target.value, 10))
                              }
                              className="w-full h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-[#E51838] mt-3"
                            />
                            <div className="flex justify-between text-[10px] text-zinc-400 mt-1">
                              <span>Imediato (1 min)</span>
                              <span>Natural (20 min)</span>
                            </div>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-zinc-500 mb-1.5">
                            Status de Funcionamento
                          </label>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => setStatus(!status)}
                              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors border ${
                                status
                                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                  : "bg-zinc-50 border-zinc-200 text-zinc-400"
                              }`}
                            >
                              <span
                                className={`h-2.5 w-2.5 rounded-full ${status ? "bg-emerald-500" : "bg-zinc-400"}`}
                              ></span>
                              {status ? "Robô Ativo" : "Robô Pausado"}
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-zinc-500 mb-1.5">
                            Instruções do Sistema (Prompt Principal)
                          </label>
                          <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            rows={6}
                            placeholder="Descreva detalhadamente o script que a IA deve seguir para responder aos leads..."
                            className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-800 shadow-sm focus:border-[#E51838] focus:ring-1 focus:ring-[#E51838]"
                          />
                        </div>

                        <div className="flex justify-end pt-4">
                          <button
                            type="submit"
                            className="flex items-center gap-2 rounded-xl bg-[#E51838] hover:bg-[#c9122f] px-6 py-3 text-sm font-semibold text-white shadow-md transition-colors"
                          >
                            <Save size={16} />
                            {isCreating
                              ? "Criar Robô Rubinho"
                              : "Salvar Configurações"}
                          </button>
                        </div>
                      </form>
                    </Card>
                  </div>

                  {/* Sidebar stats & Event select */}
                  <div className="space-y-6">
                    {/* Stats Card */}
                    {!isCreating && (
                      <Card className="bg-gradient-to-b from-white to-zinc-50">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-4 flex items-center gap-2">
                          <Activity size={16} className="text-[#3D56A2]" />
                          Resultados deste Robô
                        </h3>
                        <div className="space-y-4 text-sm mt-3">
                          <div className="flex justify-between border-b border-zinc-100 pb-2">
                            <span className="text-zinc-500">
                              Leads Iniciados:
                            </span>
                            <span className="font-semibold text-zinc-800">
                              {agentStats.engaged}
                            </span>
                          </div>
                          <div className="flex justify-between border-b border-zinc-100 pb-2">
                            <span className="text-zinc-500">
                              Visitas Agendadas:
                            </span>
                            <span className="font-semibold text-zinc-850 text-emerald-600">
                              {agentStats.scheduled}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">
                              Conversão de IA:
                            </span>
                            <span className="font-semibold text-zinc-850 text-[#E51838]">
                              {agentStats.rate}
                            </span>
                          </div>
                        </div>
                      </Card>
                    )}

                    {/* Linked Events selection check list */}
                    <Card>
                      <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-2 flex items-center gap-2">
                        <Calendar size={16} className="text-[#E51838]" />
                        Vincular Eventos
                      </h3>
                      <p className="text-[10px] text-zinc-400 mb-4">
                        Este script será selecionado quando o lead for criado
                        manifestando interesse em um dos eventos marcados.
                      </p>

                      {events.length === 0 ? (
                        <p className="text-xs text-zinc-400 italic">
                          Nenhum evento ativo cadastrado no sistema.
                        </p>
                      ) : (
                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                          {events.map((event) => {
                            const isChecked = selectedEventIds.includes(
                              event.id,
                            );
                            return (
                              <label
                                key={event.id}
                                className="flex items-start gap-3 rounded-lg border border-zinc-100 bg-zinc-50/50 p-2.5 cursor-pointer hover:bg-zinc-50 transition-colors"
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) =>
                                    handleEventCheckboxChange(
                                      event.id,
                                      e.target.checked,
                                    )
                                  }
                                  className="rounded border-zinc-300 text-[#E51838] focus:ring-[#E51838] mt-0.5"
                                />
                                <div className="text-xs">
                                  <p className="font-semibold text-zinc-850">
                                    {event.name}
                                  </p>
                                  <p className="text-[10px] text-zinc-400 mt-0.5">
                                    {event.event_date
                                      ? new Date(
                                          event.event_date,
                                        ).toLocaleDateString("pt-BR")
                                      : "—"}
                                  </p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </Card>
                  </div>
                </div>
              )}

              {/* TAB 2: PERGUNTAS E RESPOSTAS (FAQ) */}
              {activeTab === "config" && selectedAgent && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* FAQ Form */}
                  <div className="md:col-span-1">
                    <Card>
                      <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-4 flex items-center gap-2">
                        <HelpCircle size={16} className="text-[#E51838]" />
                        Adicionar FAQ
                      </h3>
                      <form onSubmit={handleAddFaq} className="space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-zinc-500 mb-1.5">
                            Pergunta Frequente
                          </label>
                          <input
                            type="text"
                            value={faqQuestion}
                            onChange={(e) => setFaqQuestion(e.target.value)}
                            placeholder="Ex: Qual o preço do apartamento?"
                            className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-800 shadow-sm focus:border-[#E51838] focus:ring-1 focus:ring-[#E51838]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-zinc-500 mb-1.5">
                            Resposta
                          </label>
                          <textarea
                            value={faqAnswer}
                            onChange={(e) => setFaqAnswer(e.target.value)}
                            rows={4}
                            placeholder="Ex: Os apartamentos partem de R$ 350 mil, dependendo da planta..."
                            className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-800 shadow-sm focus:border-[#E51838] focus:ring-1 focus:ring-[#E51838]"
                          />
                        </div>
                        <button
                          type="submit"
                          className="w-full flex items-center justify-center gap-2 rounded-xl bg-zinc-900 hover:bg-zinc-850 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors"
                        >
                          <Plus size={16} />
                          Adicionar FAQ
                        </button>
                      </form>
                    </Card>
                  </div>

                  {/* FAQ List */}
                  <div className="md:col-span-2">
                    <Card padding="none">
                      <div className="p-6 border-b border-zinc-100">
                        <h3 className="text-base font-semibold text-gray-900">
                          Perguntas & Respostas
                        </h3>
                        <p className="text-xs text-zinc-400 mt-1">
                          Essas informações ajudam a IA a tirar dúvidas comuns
                          dos clientes no WhatsApp sem inventar dados.
                        </p>
                      </div>

                      <div className="divide-y divide-zinc-100 max-h-[500px] overflow-y-auto">
                        {!selectedAgent.faqs ||
                        selectedAgent.faqs.length === 0 ? (
                          <div className="p-8 text-center text-zinc-400 text-sm">
                            Nenhuma FAQ cadastrada para este robô. Adicione ao
                            lado.
                          </div>
                        ) : (
                          selectedAgent.faqs.map((faq) => (
                            <div
                              key={faq.id}
                              className="p-4 hover:bg-zinc-50/50 flex justify-between items-start gap-4"
                            >
                              <div className="text-xs space-y-1">
                                <p className="font-bold text-zinc-800">
                                  P: {faq.question}
                                </p>
                                <p className="text-zinc-600">R: {faq.answer}</p>
                              </div>
                              <button
                                onClick={() => handleDeleteFaq(faq.id)}
                                className="text-zinc-400 hover:text-rose-500 p-1.5 rounded transition-colors shrink-0"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </Card>
                  </div>
                </div>
              )}

              {/* TAB 3: DOCUMENTOS / BASE DE CONHECIMENTO */}
              {activeTab === "logs" && selectedAgent && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Doc Form */}
                  <div className="md:col-span-1">
                    <Card>
                      <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-4 flex items-center gap-2">
                        <BookOpen size={16} className="text-[#E51838]" />
                        Adicionar Documento
                      </h3>
                      <form onSubmit={handleAddDocument} className="space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-zinc-500 mb-1.5">
                            Título do Documento
                          </label>
                          <input
                            type="text"
                            value={docTitle}
                            onChange={(e) => setDocTitle(e.target.value)}
                            placeholder="Ex: Regulamento da Promoção"
                            className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-800 shadow-sm focus:border-[#E51838] focus:ring-1 focus:ring-[#E51838]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-zinc-500 mb-1.5">
                            Conteúdo do Documento
                          </label>
                          <textarea
                            value={docContent}
                            onChange={(e) => setDocContent(e.target.value)}
                            rows={8}
                            placeholder="Ex: Cole aqui textos institucionais, regras, descrições completas do empreendimento..."
                            className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-800 shadow-sm focus:border-[#E51838] focus:ring-1 focus:ring-[#E51838]"
                          />
                        </div>
                        <button
                          type="submit"
                          className="w-full flex items-center justify-center gap-2 rounded-xl bg-zinc-900 hover:bg-zinc-850 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors"
                        >
                          <Plus size={16} />
                          Adicionar Documento
                        </button>
                      </form>
                    </Card>
                  </div>

                  {/* Documents List */}
                  <div className="md:col-span-2">
                    <Card padding="none">
                      <div className="p-6 border-b border-zinc-100">
                        <h3 className="text-base font-semibold text-gray-900">
                          Base de Conhecimento
                        </h3>
                        <p className="text-xs text-zinc-400 mt-1">
                          Documentos longos (como folders de regras, textos
                          descritivos) de apoio que a IA lerá como contexto.
                        </p>
                      </div>

                      <div className="divide-y divide-zinc-100 max-h-[500px] overflow-y-auto">
                        {!selectedAgent.documents ||
                        selectedAgent.documents.length === 0 ? (
                          <div className="p-8 text-center text-zinc-400 text-sm">
                            Nenhum documento cadastrado. Adicione ao lado.
                          </div>
                        ) : (
                          selectedAgent.documents.map((doc) => (
                            <div
                              key={doc.id}
                              className="p-5 hover:bg-zinc-50/50 flex justify-between items-start gap-4"
                            >
                              <div className="text-xs space-y-2">
                                <p className="font-bold text-zinc-850 text-sm">
                                  {doc.title}
                                </p>
                                <p className="text-zinc-500 leading-relaxed max-w-2xl whitespace-pre-line line-clamp-4">
                                  {doc.content}
                                </p>
                              </div>
                              <button
                                onClick={() => handleDeleteDocument(doc.id)}
                                className="text-zinc-400 hover:text-rose-500 p-1.5 rounded transition-colors shrink-0"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </Card>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
