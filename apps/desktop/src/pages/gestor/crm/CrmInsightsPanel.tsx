import { useEffect, useState } from "react";
import clsx from "clsx";
import { Activity, AlertTriangle, BarChart3, Clock3, Target, X } from "lucide-react";
import { readStoredSession } from "../../../services/auth";
import {
  getCrmDashboardReport,
  type CrmDashboardReport,
} from "../../../services/crm";

function Metric({ label, value, accent, dark }: { label: string; value: string | number; accent?: boolean; dark: boolean }) {
  return (
    <div className={clsx("rounded-2xl border p-4", dark ? "border-zinc-800 bg-[#121212]" : "border-zinc-200 bg-white")}>
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-500">{label}</p>
      <p className={clsx("mt-2 text-3xl font-black", accent ? "text-[#FF0636]" : dark ? "text-white" : "text-zinc-950")}>{value}</p>
    </div>
  );
}

export function CrmInsightsPanel({ clientId, dark, onClose }: { clientId: string; dark: boolean; onClose: () => void }) {
  const [report, setReport] = useState<CrmDashboardReport | null>(null);
  useEffect(() => {
    const token = readStoredSession()?.accessToken;
    if (!token) return;
    getCrmDashboardReport(clientId, token).then(setReport);
  }, [clientId]);
  const execution = report?.execution;
  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/45 backdrop-blur-[2px]" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className={clsx("flex h-full w-full max-w-3xl flex-col shadow-2xl", dark ? "bg-[#0b0b0b] text-white" : "bg-zinc-50 text-zinc-950")}>
        <header className={clsx("flex items-center justify-between border-b p-5", dark ? "border-zinc-800" : "border-zinc-200")}>
          <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#FF0636]">Gestão do funil</p><h2 className="mt-1 flex items-center gap-2 text-2xl font-black"><BarChart3 className="text-[#FF0636]" />Indicadores CRM</h2></div>
          <button type="button" onClick={onClose} className={clsx("rounded-full p-3", dark ? "bg-zinc-900" : "bg-white")}><X size={20} /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {!report || !execution ? <p className="py-12 text-center text-zinc-500">Calculando indicadores…</p> : <div className="space-y-7">
            <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Metric label="Leads ativos" value={report.meta.total} dark={dark} />
              <Metric label="Vendas" value={execution.sales} accent dark={dark} />
              <Metric label="Conversão em venda" value={`${execution.sales_conversion_rate}%`} dark={dark} />
              <Metric label="Tempo 1º contato" value={execution.average_first_contact_minutes == null ? "—" : `${execution.average_first_contact_minutes} min`} dark={dark} />
              <Metric label="Ações pendentes" value={execution.pending_tasks} dark={dark} />
              <Metric label="Ações atrasadas" value={execution.overdue_tasks} accent dark={dark} />
              <Metric label="Sem próxima ação" value={execution.leads_without_next_action} dark={dark} />
              <Metric label="Esquecidos +24h" value={execution.forgotten_leads_24h} accent dark={dark} />
            </section>
            <section className={clsx("rounded-2xl border p-5", dark ? "border-zinc-800 bg-[#111]" : "border-zinc-200 bg-white")}>
              <h3 className="flex items-center gap-2 text-sm font-black"><Target size={16} className="text-[#FF0636]" />Distribuição por etapa</h3>
              <div className="mt-4 space-y-3">{report.stage_distribution.map((row) => <div key={row.stage}><div className="mb-1 flex justify-between text-xs font-bold"><span>{row.stage}</span><span>{row.count}</span></div><div className={clsx("h-2 overflow-hidden rounded-full", dark ? "bg-zinc-800" : "bg-zinc-100")}><div className="h-full rounded-full bg-[#FF0636]" style={{ width: `${Math.max(3, (row.count / Math.max(report.meta.total, 1)) * 100)}%` }} /></div></div>)}</div>
            </section>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="flex items-center gap-3 rounded-2xl bg-emerald-500/10 p-4 text-emerald-500"><Activity /><div><p className="text-xl font-black">{execution.completed_tasks}</p><p className="text-xs font-bold">ações concluídas</p></div></div>
              <div className="flex items-center gap-3 rounded-2xl bg-amber-500/10 p-4 text-amber-500"><Clock3 /><div><p className="text-xl font-black">{execution.contacted_leads}</p><p className="text-xs font-bold">leads contatados</p></div></div>
              <div className="flex items-center gap-3 rounded-2xl bg-red-500/10 p-4 text-red-500"><AlertTriangle /><div><p className="text-xl font-black">{execution.overdue_tasks}</p><p className="text-xs font-bold">SLA vencido</p></div></div>
            </div>
          </div>}
        </div>
      </aside>
    </div>
  );
}
