import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { CalendarCheck, Check, Clock3, Phone, X } from "lucide-react";
import { readStoredSession } from "../../../services/auth";
import {
  listCrmTasks,
  updateCrmTask,
  type ApiCrmTask,
} from "../../../services/crm";

function localDay(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function TaskGroup({
  title,
  tasks,
  tone,
  dark,
  completing,
  onOpen,
  onComplete,
}: {
  title: string;
  tasks: ApiCrmTask[];
  tone: "red" | "amber" | "zinc";
  dark: boolean;
  completing: string | null;
  onOpen: (leadId: string) => void;
  onComplete: (task: ApiCrmTask) => void;
}) {
  const tones = {
    red: "text-red-500 bg-red-500/10",
    amber: "text-amber-500 bg-amber-500/10",
    zinc: dark ? "text-zinc-300 bg-zinc-800" : "text-zinc-600 bg-zinc-100",
  };
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-black uppercase tracking-[0.16em]">{title}</h3>
        <span className={clsx("rounded-full px-2.5 py-1 text-xs font-bold", tones[tone])}>
          {tasks.length}
        </span>
      </div>
      {tasks.length === 0 ? (
        <p className={clsx("rounded-2xl border border-dashed p-4 text-sm", dark ? "border-zinc-800 text-zinc-600" : "border-zinc-200 text-zinc-400")}>
          Nenhuma ação neste grupo.
        </p>
      ) : (
        tasks.map((task) => (
          <article key={task.id} className={clsx("rounded-2xl border p-4", dark ? "border-zinc-800 bg-[#121212]" : "border-zinc-200 bg-white")}>
            <div className="flex items-start justify-between gap-3">
              <button type="button" onClick={() => onOpen(task.lead_id)} className="min-w-0 text-left">
                <p className="truncate text-sm font-black">{task.lead.name}</p>
                <p className={clsx("mt-0.5 truncate text-xs", dark ? "text-zinc-500" : "text-zinc-500")}>
                  {task.title} · {task.assigned_user?.name ?? "Sem responsável"}
                </p>
              </button>
              <button type="button" disabled={completing === task.id} onClick={() => onComplete(task)} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                <Check size={14} /> Concluir
              </button>
            </div>
            <div className={clsx("mt-3 flex flex-wrap items-center gap-3 text-xs", dark ? "text-zinc-500" : "text-zinc-500")}>
              <span className="inline-flex items-center gap-1"><Clock3 size={13} />{new Date(task.due_at).toLocaleString("pt-BR")}</span>
              {task.lead.phone && <span className="inline-flex items-center gap-1"><Phone size={13} />{task.lead.phone}</span>}
            </div>
          </article>
        ))
      )}
    </section>
  );
}

export function MyDayPanel({
  clientId,
  dark,
  onClose,
  onOpenLead,
}: {
  clientId: string;
  dark: boolean;
  onClose: () => void;
  onOpenLead: (leadId: string) => void;
}) {
  const [tasks, setTasks] = useState<ApiCrmTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState<string | null>(null);
  const load = useCallback(async () => {
    const token = readStoredSession()?.accessToken;
    if (!token) return;
    setLoading(true);
    try {
      const response = await listCrmTasks({ client_id: clientId, scope: "all" }, token);
      setTasks(response.tasks);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);
  const groups = useMemo(() => {
    const today = localDay();
    return {
      overdue: tasks.filter((task) => localDay(new Date(task.due_at)) < today),
      today: tasks.filter((task) => localDay(new Date(task.due_at)) === today),
      upcoming: tasks.filter((task) => localDay(new Date(task.due_at)) > today),
    };
  }, [tasks]);

  const complete = async (task: ApiCrmTask) => {
    const token = readStoredSession()?.accessToken;
    if (!token) return;
    setCompleting(task.id);
    try {
      await updateCrmTask(task.id, { status: "completed" }, token);
      setTasks((current) => current.filter((item) => item.id !== task.id));
    } finally {
      setCompleting(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/45 backdrop-blur-[2px]" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className={clsx("flex h-full w-full max-w-xl flex-col shadow-2xl", dark ? "bg-[#0b0b0b] text-white" : "bg-zinc-50 text-zinc-950")}>
        <header className={clsx("flex items-center justify-between border-b p-5", dark ? "border-zinc-800" : "border-zinc-200")}>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#FF0636]">Execução comercial</p>
            <h2 className="mt-1 flex items-center gap-2 text-2xl font-black"><CalendarCheck className="text-[#FF0636]" />Meu Dia</h2>
          </div>
          <button type="button" onClick={onClose} className={clsx("rounded-full p-3", dark ? "bg-zinc-900" : "bg-white")}><X size={20} /></button>
        </header>
        <div className="min-h-0 flex-1 space-y-7 overflow-y-auto p-5">
          {loading ? <p className="py-10 text-center text-sm text-zinc-500">Carregando próximas ações…</p> : <>
            <TaskGroup title="Atrasadas" tasks={groups.overdue} tone="red" dark={dark} completing={completing} onOpen={onOpenLead} onComplete={complete} />
            <TaskGroup title="Hoje" tasks={groups.today} tone="amber" dark={dark} completing={completing} onOpen={onOpenLead} onComplete={complete} />
            <TaskGroup title="Próximas" tasks={groups.upcoming} tone="zinc" dark={dark} completing={completing} onOpen={onOpenLead} onComplete={complete} />
          </>}
        </div>
      </aside>
    </div>
  );
}
