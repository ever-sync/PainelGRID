import { useEffect, useState } from "react";
import clsx from "clsx";
import { useOutletContext } from "react-router-dom";
import { Plus } from "lucide-react";
import { PageHeader } from "../../components/shared/PageHeader";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { Input } from "../../components/ui/Input";
import { CampaignStatusBadge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import type { Campaign, User } from "../../types";
import { resolveClientId } from "../../utils/userContext";
import { MissingClientScope } from "../../components/shared/MissingClientScope";
import { readStoredSession } from "../../services/auth";
import {
  listCampaigns,
  mapApiCampaignToCampaign,
} from "../../services/campaigns";
import { listClientStaff, mapStaffToUser } from "../../services/staff";
import {
  DASHBOARD_DARK_CHANGE_EVENT,
  readDashboardDarkEnabled,
} from "../../lib/dashboard-dark-mode";

type OutletContext = {
  user: User;
};

const distributionLabels: Record<string, string> = {
  round_robin: "Round Robin",
  manual: "Manual",
  by_region: "Por Região",
};

export function CampanhasPage() {
  const { user } = useOutletContext<OutletContext>();
  const clientId = resolveClientId(user);
  const [isDarkMode, setIsDarkMode] = useState(() =>
    readDashboardDarkEnabled(user.id),
  );
  const [showModal, setShowModal] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [vendors, setVendors] = useState<User[]>([]);

  useEffect(() => {
    const t = readStoredSession()?.accessToken;
    if (!clientId || !t) return;
    void Promise.all([
      listCampaigns(clientId, t),
      listClientStaff(clientId, t),
    ]).then(([c, s]) => {
      setCampaigns(c.map(mapApiCampaignToCampaign));
      setVendors(s.map(mapStaffToUser).filter((u) => u.role === "vendedor"));
    });
  }, [clientId]);

  useEffect(() => {
    setIsDarkMode(readDashboardDarkEnabled(user.id));
  }, [user.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setIsDarkMode(readDashboardDarkEnabled(user.id));
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    window.addEventListener(DASHBOARD_DARK_CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener(DASHBOARD_DARK_CHANGE_EVENT, sync);
    };
  }, [user.id]);

  const secondaryBtnDark =
    "!border-zinc-600 !bg-zinc-900 !text-zinc-200 hover:!bg-zinc-800 hover:!border-zinc-500";

  const fieldAccent = "accent-[rgb(229,24,56)]";

  if (!clientId) return <MissingClientScope />;

  return (
    <div
      className={clsx(
        isDarkMode &&
          "dashboard-dark cliente-detail-dark -mx-4 -mt-4 rounded-none px-4 pb-8 pt-4 md:-mx-6 md:-mt-6 md:px-6 xl:-mx-8 xl:-mt-8 xl:px-8",
        isDarkMode && "bg-black",
      )}
    >
      <PageHeader
        title="Campanhas"
        breadcrumbs={[{ label: "TechStore" }, { label: "Campanhas" }]}
        dark={isDarkMode}
        actions={
          <Button icon={<Plus size={16} />} onClick={() => setShowModal(true)}>
            Nova Campanha
          </Button>
        }
      />

      <div className="space-y-4">
        {campaigns.map((camp) => {
          const campVendors = vendors.filter((v) =>
            camp.vendor_ids.includes(v.id),
          );
          const convRate =
            camp.leads_count > 0
              ? Math.round((camp.converted_count / camp.leads_count) * 100)
              : 0;

          return (
            <Card key={camp.id} className={clsx(isDarkMode && "card-surface")}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3
                    className={clsx(
                      "font-semibold",
                      isDarkMode ? "text-zinc-100" : "text-gray-900",
                    )}
                  >
                    {camp.name}
                  </h3>
                  <p
                    className={clsx(
                      "mt-0.5 text-xs",
                      isDarkMode ? "text-zinc-500" : "text-gray-400",
                    )}
                  >
                    Criada em{" "}
                    {new Date(camp.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <CampaignStatusBadge status={camp.status} />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <p
                    className={clsx(
                      "text-xs",
                      isDarkMode ? "text-zinc-500" : "text-gray-400",
                    )}
                  >
                    Distribuição
                  </p>
                  <p
                    className={clsx(
                      "text-sm font-medium",
                      isDarkMode ? "text-zinc-200" : "text-gray-900",
                    )}
                  >
                    {distributionLabels[camp.distribution_method]}
                  </p>
                </div>
                <div>
                  <p
                    className={clsx(
                      "text-xs",
                      isDarkMode ? "text-zinc-500" : "text-gray-400",
                    )}
                  >
                    Leads
                  </p>
                  <p
                    className={clsx(
                      "text-sm font-medium",
                      isDarkMode ? "text-zinc-200" : "text-gray-900",
                    )}
                  >
                    {camp.leads_count}
                  </p>
                </div>
                <div>
                  <p
                    className={clsx(
                      "text-xs",
                      isDarkMode ? "text-zinc-500" : "text-gray-400",
                    )}
                  >
                    Convertidos
                  </p>
                  <p
                    className={clsx(
                      "text-sm font-semibold",
                      isDarkMode ? "text-emerald-400" : "text-green-600",
                    )}
                  >
                    {camp.converted_count}
                  </p>
                </div>
                <div>
                  <p
                    className={clsx(
                      "text-xs",
                      isDarkMode ? "text-zinc-500" : "text-gray-400",
                    )}
                  >
                    Taxa Conversão
                  </p>
                  <p
                    className={clsx(
                      "text-sm font-semibold",
                      isDarkMode ? "text-orange-400" : "text-orange-500",
                    )}
                  >
                    {convRate}%
                  </p>
                </div>
              </div>

              {/* Sources */}
              <div className="flex flex-wrap gap-2 mb-3">
                <span
                  className={clsx(
                    "text-xs",
                    isDarkMode ? "text-zinc-500" : "text-gray-400",
                  )}
                >
                  Fontes:
                </span>
                {camp.sources.map((src) => (
                  <span
                    key={src}
                    className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full"
                  >
                    {src === "facebook_ads"
                      ? "Facebook Ads"
                      : src === "whatsapp"
                        ? "WhatsApp"
                        : src === "form_page"
                          ? "Formulário"
                          : "Manual"}
                  </span>
                ))}
              </div>

              {/* Vendors */}
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={clsx(
                    "text-xs",
                    isDarkMode ? "text-zinc-500" : "text-gray-400",
                  )}
                >
                  Vendedores:
                </span>
                {campVendors.map((v) => (
                  <span
                    key={v.id}
                    className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full"
                  >
                    {v.name.split(" ")[0]}
                  </span>
                ))}
              </div>

              {/* Progress bar */}
              <div className="mt-4">
                <div
                  className={clsx(
                    "mb-1 flex justify-between text-xs",
                    isDarkMode ? "text-zinc-500" : "text-gray-400",
                  )}
                >
                  <span>Conversão</span>
                  <span>{convRate}%</span>
                </div>
                <div
                  className={clsx(
                    "h-1.5 overflow-hidden rounded-full",
                    isDarkMode ? "bg-zinc-800" : "bg-gray-100",
                  )}
                >
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${convRate}%` }}
                  />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title="Nova Campanha"
        size="lg"
        dark={isDarkMode}
        footer={
          <>
            <Button
              variant="secondary"
              className={isDarkMode ? secondaryBtnDark : undefined}
              onClick={() => setShowModal(false)}
            >
              Cancelar
            </Button>
            <Button onClick={() => setShowModal(false)}>Criar Campanha</Button>
          </>
        }
      >
        <div className="space-y-5">
          <Input
            label="Nome da Campanha"
            placeholder="Ex: Campanha iPhone 16 — Facebook"
            dark={isDarkMode}
          />

          <div>
            <p
              className={clsx(
                "mb-2 text-sm font-medium",
                isDarkMode ? "text-zinc-300" : "text-gray-700",
              )}
            >
              Fontes de Leads
            </p>
            <div className="space-y-2">
              {[
                { value: "facebook_ads", label: "Facebook Ads" },
                { value: "whatsapp", label: "WhatsApp" },
                { value: "form_page", label: "Formulário da Página" },
                { value: "manual", label: "Cadastro Manual" },
              ].map((src) => (
                <label
                  key={src.value}
                  className={clsx(
                    "flex cursor-pointer items-center gap-2 text-sm",
                    isDarkMode ? "text-zinc-200" : "text-gray-700",
                  )}
                >
                  <input
                    type="checkbox"
                    className={clsx(
                      "h-4 w-4 rounded border-gray-300",
                      fieldAccent,
                      isDarkMode && "border-zinc-600 bg-zinc-900",
                    )}
                  />
                  {src.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <p
              className={clsx(
                "mb-2 text-sm font-medium",
                isDarkMode ? "text-zinc-300" : "text-gray-700",
              )}
            >
              Vendedores
            </p>
            <div className="space-y-2">
              {vendors.map((v) => (
                <label
                  key={v.id}
                  className={clsx(
                    "flex cursor-pointer items-center gap-2 text-sm",
                    isDarkMode ? "text-zinc-200" : "text-gray-700",
                  )}
                >
                  <input
                    type="checkbox"
                    className={clsx(
                      "h-4 w-4 rounded border-gray-300",
                      fieldAccent,
                      isDarkMode && "border-zinc-600 bg-zinc-900",
                    )}
                  />
                  {v.name}
                </label>
              ))}
            </div>
          </div>

          <div>
            <p
              className={clsx(
                "mb-2 text-sm font-medium",
                isDarkMode ? "text-zinc-300" : "text-gray-700",
              )}
            >
              Método de Distribuição
            </p>
            <div className="space-y-2">
              {[
                {
                  value: "round_robin",
                  label: "Round Robin (automático, alternado)",
                },
                { value: "manual", label: "Manual (gestor atribui)" },
                { value: "by_region", label: "Por Região" },
              ].map((method) => (
                <label
                  key={method.value}
                  className={clsx(
                    "flex cursor-pointer items-center gap-2 text-sm",
                    isDarkMode ? "text-zinc-200" : "text-gray-700",
                  )}
                >
                  <input
                    type="radio"
                    name="distribution"
                    value={method.value}
                    className={clsx(
                      "h-4 w-4 border-gray-300",
                      fieldAccent,
                      isDarkMode && "border-zinc-600 bg-zinc-900",
                    )}
                  />
                  {method.label}
                </label>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
