import { useEffect, useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  Plus,
  Search,
  ShoppingCart,
  UserPlus,
} from "lucide-react";
import { Modal } from "../ui/Modal";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Button } from "../ui/Button";
import { Notice } from "../ui/Notice";
import { readStoredSession } from "../../services/auth";
import {
  getClient,
  listClients,
  mapApiClientToClient,
} from "../../services/clients";
import { listEvents, type ApiEvent } from "../../services/events";
import {
  createVehicle,
  listClientVehicles,
  type Vehicle,
} from "../../services/vehicles";
import {
  createQuickSale,
  listQuickSaleBuyers,
  type QuickSaleBuyer,
  type SaleType,
} from "../../services/sales";
import { listSalesTeams } from "../../services/salesTeams";
import type { Client, User } from "../../types";

const NEW_LEAD = "__new__";
const NEW_VEHICLE = "__new_vehicle__";

function localDateTimeValue() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

export function QuickSaleModal({
  open,
  onClose,
  user,
}: {
  open: boolean;
  onClose: () => void;
  user: User;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [vendors, setVendors] = useState<User[]>([]);
  const [leads, setLeads] = useState<QuickSaleBuyer[]>([]);
  const [initialLeads, setInitialLeads] = useState<QuickSaleBuyer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [clientId, setClientId] = useState("");
  const [eventId, setEventId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [leadId, setLeadId] = useState("");
  const [leadName, setLeadName] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [buyerSearch, setBuyerSearch] = useState("");
  const [buyerResultsOpen, setBuyerResultsOpen] = useState(false);
  const [vehicleId, setVehicleId] = useState("");
  const [newVehicleBrand, setNewVehicleBrand] = useState("");
  const [newVehicleModel, setNewVehicleModel] = useState("");
  const [newVehicleYearOrKm, setNewVehicleYearOrKm] = useState("");
  const [saleType, setSaleType] = useState<SaleType>("NOVO");
  const [value, setValue] = useState("");
  const [soldAt, setSoldAt] = useState(localDateTimeValue);
  const [orderNumber, setOrderNumber] = useState("");
  const [wristband, setWristband] = useState("");
  const [loading, setLoading] = useState(false);
  const [buyersLoading, setBuyersLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  const selectedEvent = events.find((event) => event.id === eventId);
  const creatingLead = leadId === NEW_LEAD;

  useEffect(() => {
    if (!open) return;
    const token = readStoredSession()?.accessToken;
    if (!token) return;
    setLoading(true);
    setMessage("");
    setSuccess(false);
    const clientsRequest =
      user.role === "recepcao" && user.client_id
        ? getClient(user.client_id, token).then((client) => [client])
        : listClients(token);
    void clientsRequest
      .then((rows) => {
        const mapped = rows.map(mapApiClientToClient);
        setClients(mapped);
        setClientId((current) => current || mapped[0]?.id || "");
      })
      .catch((error) =>
        setMessage(
          error instanceof Error
            ? error.message
            : "Falha ao carregar empresas.",
        ),
      )
      .finally(() => setLoading(false));
  }, [open, user.client_id, user.role]);

  useEffect(() => {
    if (!open || !clientId) return;
    const token = readStoredSession()?.accessToken;
    if (!token) return;
    setLoading(true);
    setEventId("");
    setVendorId("");
    setLeadId("");
    setBuyerSearch("");
    setVehicleId("");
    setNewVehicleBrand("");
    setNewVehicleModel("");
    setNewVehicleYearOrKm("");
    void Promise.all([
      listEvents({ client_id: clientId }, token),
      listClientVehicles(clientId, { status: true }, token),
    ])
      .then(([eventRows, vehicleRows]) => {
        setEvents(eventRows);
        setVendors([]);
        setVehicles(vehicleRows);
      })
      .catch((error) =>
        setMessage(
          error instanceof Error
            ? error.message
            : "Falha ao carregar dados da venda.",
        ),
      )
      .finally(() => setLoading(false));
  }, [clientId, open]);

  useEffect(() => {
    if (!open || !clientId) return;
    const token = readStoredSession()?.accessToken;
    if (!token) return;
    setBuyersLoading(true);
    void listQuickSaleBuyers(token, clientId)
      .then((rows) => {
        setLeads(rows);
        setInitialLeads(rows);
      })
      .catch(() => setLeads([]))
      .finally(() => setBuyersLoading(false));
  }, [clientId, open]);

  useEffect(() => {
    if (!open || !eventId) {
      setVendors([]);
      return;
    }
    const token = readStoredSession()?.accessToken;
    if (!token) return;
    setVendorId("");
    setLoading(true);
    void listSalesTeams(token, eventId)
      .then((teams) => {
        const uniqueVendors = new Map<string, User>();
        for (const member of teams.flatMap((team) => team.members)) {
          if (member.user.role === "vendedor" && member.user.is_active) {
            uniqueVendors.set(member.user.id, member.user as User);
          }
        }
        setVendors([...uniqueVendors.values()]);
      })
      .catch((error) =>
        setMessage(
          error instanceof Error
            ? error.message
            : "Falha ao carregar vendedores do evento.",
        ),
      )
      .finally(() => setLoading(false));
  }, [eventId, open]);

  const eventOptions = useMemo(
    () => events.map((event) => ({ value: event.id, label: event.name })),
    [events],
  );

  useEffect(() => {
    const query = buyerSearch.trim();
    if (!open || !clientId || !query || leadId === NEW_LEAD) return;
    const token = readStoredSession()?.accessToken;
    if (!token) return;

    let active = true;
    const timeout = window.setTimeout(() => {
      setBuyersLoading(true);
      void listQuickSaleBuyers(token, clientId, query)
        .then((rows) => {
          if (active) setLeads(rows);
        })
        .catch(() => undefined)
        .finally(() => {
          if (active) setBuyersLoading(false);
        });
    }, 200);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [buyerSearch, clientId, leadId, open]);

  const sortedBuyerResults = useMemo(() => {
    const query = buyerSearch.trim().toLocaleLowerCase("pt-BR");
    const source = query ? leads : initialLeads;
    return [...source]
      .filter((lead) => {
        if (!query) return true;
        return `${lead.name} ${lead.phone ?? ""} ${lead.email ?? ""}`
          .toLocaleLowerCase("pt-BR")
          .includes(query);
      })
      .sort((a, b) =>
        a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }),
      )
      .slice(0, 50);
  }, [buyerSearch, initialLeads, leads]);

  async function submit() {
    const token = readStoredSession()?.accessToken;
    if (!token) return;
    if (
      !clientId ||
      !eventId ||
      !vendorId ||
      !leadId ||
      !value ||
      !orderNumber
    ) {
      setMessage(
        "Preencha empresa, evento, vendedor, comprador, valor e pedido.",
      );
      return;
    }
    if (creatingLead && (!leadName.trim() || !leadPhone.trim())) {
      setMessage("Informe nome e telefone para cadastrar o comprador.");
      return;
    }
    if (!vehicleId) {
      setMessage("Selecione um veículo ou cadastre um novo carro.");
      return;
    }
    if (
      vehicleId === NEW_VEHICLE &&
      (!newVehicleBrand.trim() || !newVehicleModel.trim())
    ) {
      setMessage("Informe a marca e o modelo do novo carro.");
      return;
    }
    if (selectedEvent?.require_wristband && !wristband.trim()) {
      setMessage("Este evento exige o número da pulseira.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      let selectedVehicleId = vehicleId;
      if (vehicleId === NEW_VEHICLE) {
        const createdVehicle = await createVehicle(
          {
            client_id: clientId,
            brand: newVehicleBrand.trim(),
            model: newVehicleModel.trim(),
            year_or_km: newVehicleYearOrKm.trim() || "A definir",
            price: value,
            stores: "Cadastrado na venda rápida",
            status: true,
            tags: ["Venda rápida"],
            condition: saleType === "SEMINOVO" ? "seminovo" : "novo",
          },
          token,
        );
        selectedVehicleId = createdVehicle.id;
        setVehicles((current) => [...current, createdVehicle]);
        setVehicleId(createdVehicle.id);
      }
      await createQuickSale(token, {
        client_id: clientId,
        event_id: eventId,
        vendor_id: vendorId,
        ...(creatingLead
          ? {
              lead_name: leadName.trim(),
              lead_phone: leadPhone.trim(),
              lead_email: leadEmail.trim() || undefined,
            }
          : { lead_id: leadId }),
        vehicle_id: selectedVehicleId,
        type: saleType,
        value,
        sold_at: new Date(soldAt).toISOString(),
        order_number: orderNumber.trim(),
        wristband_number: wristband.trim() || undefined,
      });
      setSuccess(true);
      setMessage("Venda registrada e pontuação atribuída ao vendedor.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível registrar a venda.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Venda rápida" size="2xl">
      <div className="space-y-5">
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF0636] text-white">
              <ShoppingCart size={20} />
            </span>
            <div>
              <p className="font-bold">Registrar venda no evento</p>
              <p className="text-xs text-muted-foreground">
                A venda entra no ranking e na pontuação do vendedor selecionado.
              </p>
            </div>
          </div>
        </div>

        {message && (
          <Notice tone={success ? "success" : "error"}>{message}</Notice>
        )}

        {!success && (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <Select
                label="Empresa / cliente"
                value={clientId}
                onValueChange={setClientId}
                options={clients.map((client) => ({
                  value: client.id,
                  label: client.company_name,
                }))}
                placeholder="Selecione a empresa"
                disabled={loading}
              />
              <Select
                label="Evento"
                value={eventId}
                onValueChange={setEventId}
                options={eventOptions}
                placeholder="Selecione o evento"
                disabled={loading || !clientId}
              />
              <Select
                label="Vendedor"
                value={vendorId}
                onValueChange={setVendorId}
                options={vendors.map((vendor) => ({
                  value: vendor.id,
                  label: vendor.name,
                }))}
                placeholder="Selecione o vendedor"
                disabled={loading || !clientId}
              />
              <div className="relative flex flex-col gap-1">
                <label
                  htmlFor="quick-sale-buyer"
                  className="text-sm font-medium text-foreground"
                >
                  Comprador
                </label>
                <div className="relative">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    id="quick-sale-buyer"
                    value={buyerSearch}
                    disabled={loading || !clientId}
                    autoComplete="off"
                    placeholder="Digite o nome ou telefone"
                    onFocus={() => setBuyerResultsOpen(true)}
                    onBlur={() =>
                      window.setTimeout(() => setBuyerResultsOpen(false), 150)
                    }
                    onChange={(event) => {
                      setBuyerSearch(event.target.value);
                      setLeadId("");
                      setBuyerResultsOpen(true);
                    }}
                    className="h-9 w-full rounded-2xl border border-input bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>

                {buyerResultsOpen && !loading && clientId && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-2xl">
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setLeadId(NEW_LEAD);
                        setBuyerSearch("");
                        setBuyerResultsOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-[#E51838] transition hover:bg-muted"
                    >
                      <UserPlus size={16} />
                      Cadastrar novo comprador
                    </button>

                    {sortedBuyerResults.map((lead) => (
                      <button
                        key={lead.id}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setLeadId(lead.id);
                          setBuyerSearch(
                            `${lead.name}${lead.phone ? ` · ${lead.phone}` : ""}`,
                          );
                          setBuyerResultsOpen(false);
                        }}
                        className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-muted"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">
                            {lead.name}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {lead.phone ||
                              lead.email ||
                              "Sem contato informado"}
                          </span>
                        </span>
                        {leadId === lead.id && (
                          <Check
                            size={16}
                            className="shrink-0 text-[#E51838]"
                          />
                        )}
                      </button>
                    ))}

                    {sortedBuyerResults.length === 0 && (
                      <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                        {buyersLoading
                          ? "Buscando compradores..."
                          : "Nenhum comprador encontrado."}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {creatingLead && (
              <div className="grid gap-4 rounded-2xl border border-border bg-muted/30 p-4 md:grid-cols-3">
                <Input
                  label="Nome do comprador"
                  value={leadName}
                  onChange={(event) => setLeadName(event.target.value)}
                />
                <Input
                  label="Telefone"
                  value={leadPhone}
                  onChange={(event) => setLeadPhone(event.target.value)}
                />
                <Input
                  label="E-mail (opcional)"
                  type="email"
                  value={leadEmail}
                  onChange={(event) => setLeadEmail(event.target.value)}
                />
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <Select
                label="Carro"
                value={vehicleId}
                onValueChange={(next) => {
                  setVehicleId(next);
                  if (next !== NEW_VEHICLE) {
                    setNewVehicleBrand("");
                    setNewVehicleModel("");
                    setNewVehicleYearOrKm("");
                  }
                }}
                options={[
                  ...vehicles.map((vehicle) => ({
                    value: vehicle.id,
                    label: `${vehicle.brand} ${vehicle.model} · ${vehicle.year_or_km}`,
                  })),
                  {
                    value: NEW_VEHICLE,
                    label: "+ Cadastrar carro que não está na lista",
                  },
                ]}
                placeholder="Selecione do estoque"
                disabled={loading || !clientId}
              />
              {vehicleId === NEW_VEHICLE ? (
                <div className="rounded-2xl border border-[#E51838]/20 bg-[#E51838]/5 p-4 md:col-span-2">
                  <div className="mb-3 flex items-center gap-2 text-sm font-bold text-[#E51838]">
                    <Plus size={16} />
                    Cadastrar novo carro na vitrine
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Input
                      label="Marca"
                      value={newVehicleBrand}
                      onChange={(event) =>
                        setNewVehicleBrand(event.target.value)
                      }
                      placeholder="Ex.: Volkswagen"
                    />
                    <Input
                      label="Modelo"
                      value={newVehicleModel}
                      onChange={(event) =>
                        setNewVehicleModel(event.target.value)
                      }
                      placeholder="Ex.: T-Cross Highline"
                    />
                    <Input
                      label="Ano / KM (opcional)"
                      value={newVehicleYearOrKm}
                      onChange={(event) =>
                        setNewVehicleYearOrKm(event.target.value)
                      }
                      placeholder="Ex.: 2026 / 0 km"
                    />
                  </div>
                </div>
              ) : null}
              <Select
                label="Tipo da venda"
                value={saleType}
                onValueChange={(next) => setSaleType(next as SaleType)}
                options={[
                  { value: "NOVO", label: "Novo" },
                  { value: "SEMINOVO", label: "Seminovo" },
                  { value: "VENDA_DIRETA", label: "Venda direta" },
                  { value: "PCD", label: "PCD" },
                ]}
              />
              <Input
                label="Valor do carro"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder="R$ 120.000,00"
                inputMode="decimal"
              />
              <Input
                label="Data da venda"
                type="datetime-local"
                value={soldAt}
                onChange={(event) => setSoldAt(event.target.value)}
              />
              <Input
                label="Número do pedido"
                value={orderNumber}
                onChange={(event) => setOrderNumber(event.target.value)}
              />
              {selectedEvent?.require_wristband && (
                <Input
                  label="Número da pulseira"
                  value={wristband}
                  onChange={(event) => setWristband(event.target.value)}
                />
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-border pt-4">
              <Button variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                loading={saving}
                icon={<Plus size={16} />}
                onClick={() => void submit()}
              >
                Registrar venda
              </Button>
            </div>
          </>
        )}

        {success && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle2 size={48} className="text-emerald-500" />
            <Button onClick={onClose}>Concluir</Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
