import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, FileText, Plus, Save, Trash2 } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import { PageHeader } from "../../components/shared/PageHeader";
import { MissingClientScope } from "../../components/shared/MissingClientScope";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Modal } from "../../components/ui/Modal";
import type { AppOutletContext } from "../../layouts/AppLayout";
import { readStoredSession } from "../../services/auth";
import {
  addRubinhoDocument,
  addRubinhoFaq,
  deleteRubinhoDocument,
  deleteRubinhoFaq,
  getRubinhoAgent,
  listRubinhoAgents,
  updateRubinhoDocument,
  updateRubinhoFaq,
  type RubinhoAgent,
  type RubinhoDocument,
  type RubinhoFaq,
} from "../../services/rubinho";
import { resolveClientId } from "../../utils/userContext";

type Editor =
  | { kind: "faq"; item?: RubinhoFaq }
  | { kind: "document"; item?: RubinhoDocument }
  | null;

export function FaqRagPage() {
  const { user } = useOutletContext<AppOutletContext>();
  const clientId = resolveClientId(user);
  const [agents, setAgents] = useState<RubinhoAgent[]>([]);
  const [agentId, setAgentId] = useState("");
  const [agent, setAgent] = useState<RubinhoAgent | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [editor, setEditor] = useState<Editor>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const token = readStoredSession()?.accessToken;
    if (!clientId || !token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void listRubinhoAgents(clientId, token)
      .then((rows) => {
        setAgents(rows);
        setAgentId((current) => current || rows[0]?.id || "");
      })
      .catch((reason: unknown) =>
        setMessage(
          reason instanceof Error
            ? reason.message
            : "Não foi possível carregar os agentes.",
        ),
      )
      .finally(() => setLoading(false));
  }, [clientId]);

  const loadAgent = useCallback(() => {
    const token = readStoredSession()?.accessToken;
    if (!agentId || !token) {
      setAgent(null);
      return;
    }
    setLoading(true);
    setMessage("");
    void getRubinhoAgent(agentId, token)
      .then(setAgent)
      .catch((reason: unknown) =>
        setMessage(
          reason instanceof Error
            ? reason.message
            : "Não foi possível carregar a base.",
        ),
      )
      .finally(() => setLoading(false));
  }, [agentId]);

  useEffect(() => loadAgent(), [loadAgent]);

  const counts = useMemo(
    () => ({
      faqs: agent?.faqs?.length ?? 0,
      documents: agent?.documents?.length ?? 0,
    }),
    [agent],
  );

  const openEditor = (next: Exclude<Editor, null>) => {
    setEditor(next);
    setTitle(
      next.kind === "faq"
        ? (next.item?.question ?? "")
        : (next.item?.title ?? ""),
    );
    setContent(
      next.kind === "faq"
        ? (next.item?.answer ?? "")
        : (next.item?.content ?? ""),
    );
    setMessage("");
  };

  const save = async () => {
    const token = readStoredSession()?.accessToken;
    if (!editor || !agentId || !token || !title.trim() || !content.trim())
      return;
    setSaving(true);
    setMessage("");
    try {
      if (editor.kind === "faq") {
        if (editor.item)
          await updateRubinhoFaq(
            editor.item.id,
            title.trim(),
            content.trim(),
            token,
          );
        else await addRubinhoFaq(agentId, title.trim(), content.trim(), token);
      } else if (editor.item) {
        await updateRubinhoDocument(
          editor.item.id,
          title.trim(),
          content.trim(),
          token,
        );
      } else {
        await addRubinhoDocument(agentId, title.trim(), content.trim(), token);
      }
      setEditor(null);
      loadAgent();
    } catch (reason) {
      setMessage(
        reason instanceof Error ? reason.message : "Não foi possível salvar.",
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async (kind: "faq" | "document", id: string) => {
    const token = readStoredSession()?.accessToken;
    if (
      !token ||
      !window.confirm("Deseja excluir este conteúdo da base de conhecimento?")
    )
      return;
    setMessage("");
    try {
      if (kind === "faq") await deleteRubinhoFaq(id, token);
      else await deleteRubinhoDocument(id, token);
      loadAgent();
    } catch (reason) {
      setMessage(
        reason instanceof Error ? reason.message : "Não foi possível excluir.",
      );
    }
  };

  if (!clientId) return <MissingClientScope />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="FAQ / RAG"
        subtitle="Gerencie as respostas e os documentos que orientam o Rubinho."
        breadcrumbs={[{ label: "Cliente" }, { label: "FAQ / RAG" }]}
      />

      <Card>
        <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500">
          Agente
        </label>
        <select
          value={agentId}
          onChange={(event) => setAgentId(event.target.value)}
          className="mt-2 h-11 w-full max-w-xl rounded-xl border border-zinc-200 bg-white px-4 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">Selecione um agente</option>
          {agents.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        {agent ? (
          <p className="mt-3 text-xs text-zinc-500">
            {agent.status ? "Agente ativo" : "Agente inativo"} · {counts.faqs}{" "}
            perguntas · {counts.documents} documentos
          </p>
        ) : null}
      </Card>

      {message ? (
        <p className="text-sm font-semibold text-red-500">{message}</p>
      ) : null}
      {loading ? (
        <p className="text-sm text-zinc-500">
          Carregando base de conhecimento...
        </p>
      ) : null}
      {!loading && !agents.length ? (
        <Card>
          <p className="text-sm text-zinc-500">
            Nenhum agente Rubinho foi configurado para esta empresa.
          </p>
        </Card>
      ) : null}

      {agent ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 font-bold">
                  <BookOpen size={18} /> Perguntas e respostas
                </h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Respostas objetivas para dúvidas frequentes dos leads.
                </p>
              </div>
              <Button
                icon={<Plus size={15} />}
                onClick={() => openEditor({ kind: "faq" })}
              >
                Adicionar
              </Button>
            </div>
            <div className="space-y-3">
              {(agent.faqs ?? []).map((faq) => (
                <div
                  key={faq.id}
                  className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800"
                >
                  <p className="font-bold">{faq.question}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-500">
                    {faq.answer}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => openEditor({ kind: "faq", item: faq })}
                      className="text-xs font-bold text-blue-600"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => void remove("faq", faq.id)}
                      className="inline-flex items-center gap-1 text-xs font-bold text-red-500"
                    >
                      <Trash2 size={12} /> Excluir
                    </button>
                  </div>
                </div>
              ))}
              {!agent.faqs?.length ? (
                <p className="text-sm text-zinc-500">
                  Nenhuma pergunta cadastrada.
                </p>
              ) : null}
            </div>
          </Card>

          <Card>
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 font-bold">
                  <FileText size={18} /> Documentos
                </h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Políticas, condições, informações do evento e argumentos
                  comerciais.
                </p>
              </div>
              <Button
                icon={<Plus size={15} />}
                onClick={() => openEditor({ kind: "document" })}
              >
                Adicionar
              </Button>
            </div>
            <div className="space-y-3">
              {(agent.documents ?? []).map((document) => (
                <div
                  key={document.id}
                  className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800"
                >
                  <p className="font-bold">{document.title}</p>
                  <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm text-zinc-500">
                    {document.content}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() =>
                        openEditor({ kind: "document", item: document })
                      }
                      className="text-xs font-bold text-blue-600"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => void remove("document", document.id)}
                      className="inline-flex items-center gap-1 text-xs font-bold text-red-500"
                    >
                      <Trash2 size={12} /> Excluir
                    </button>
                  </div>
                </div>
              ))}
              {!agent.documents?.length ? (
                <p className="text-sm text-zinc-500">
                  Nenhum documento cadastrado.
                </p>
              ) : null}
            </div>
          </Card>
        </div>
      ) : null}

      <Modal
        open={Boolean(editor)}
        onClose={() => setEditor(null)}
        title={
          editor?.kind === "faq" ? "Pergunta e resposta" : "Documento da base"
        }
      >
        <div className="space-y-4">
          <label className="block text-sm font-semibold">
            {editor?.kind === "faq" ? "Pergunta" : "Título"}
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-4 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="block text-sm font-semibold">
            {editor?.kind === "faq" ? "Resposta" : "Conteúdo"}
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={10}
              className="mt-2 w-full rounded-xl border border-zinc-200 p-4 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditor(null)}>
              Cancelar
            </Button>
            <Button
              icon={<Save size={15} />}
              loading={saving}
              onClick={() => void save()}
            >
              Salvar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
