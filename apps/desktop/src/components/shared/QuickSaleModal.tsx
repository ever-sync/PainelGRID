import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Plus, ShoppingCart } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Button } from "../ui/Button";
import { Notice } from "../ui/Notice";
import { readStoredSession } from "../../services/auth";
import { listClients, mapApiClientToClient } from "../../services/clients";
import { listEvents, type ApiEvent } from "../../services/events";
import { listLeads, type ApiLead } from "../../services/leads";
import { listClientVehicles, type Vehicle } from "../../services/vehicles";
import { createQuickSale, type SaleType } from "../../services/sales";
import { listSalesTeams } from "../../services/salesTeams";
import type { Client, User } from "../../types";

const NEW_LEAD = "__new__";

function localDateTimeValue() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

export function QuickSaleModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [vendors, setVendors] = useState<User[]>([]);
  const [leads, setLeads] = useState<ApiLead[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [clientId, setClientId] = useState("");
  const [eventId, setEventId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [leadId, setLeadId] = useState("");
  const [leadName, setLeadName] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [product, setProduct] = useState("");
  const [saleType, setSaleType] = useState<SaleType>("NOVO");
  const [value, setValue] = useState("");
  const [soldAt, setSoldAt] = useState(localDateTimeValue);
  const [orderNumber, setOrderNumber] = useState("");
  const [wristband, setWristband] = useState("");
  const [loading, setLoading] = useState(false);
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
    void listClients(token)
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
  }, [open]);

  useEffect(() => {
    if (!open || !clientId) return;
    const token = readStoredSession()?.accessToken;
    if (!token) return;
    setLoading(true);
    setEventId("");
    setVendorId("");
    setLeadId("");
    setVehicleId("");
    void Promise.all([
      listEvents({ client_id: clientId }, token),
      listLeads({ client_id: clientId, take: 100 }, token),
      listClientVehicles(clientId, { status: true }, token),
    ])
      .then(([eventRows, leadRows, vehicleRows]) => {
        setEvents(eventRows);
        setVendors([]);
        setLeads(leadRows);
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
    if (!vehicleId && !product.trim()) {
      setMessage("Selecione um veículo ou informe o modelo vendido.");
      return;
    }
    if (selectedEvent?.require_wristband && !wristband.trim()) {
      setMessage("Este evento exige o número da pulseira.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
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
        vehicle_id: vehicleId || undefined,
        product: vehicleId ? undefined : product.trim(),
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
              <Select
                label="Comprador"
                value={leadId}
                onValueChange={setLeadId}
                options={[
                  { value: NEW_LEAD, label: "+ Cadastrar novo comprador" },
                  ...leads.map((lead) => ({
                    value: lead.id,
                    label: `${lead.name}${lead.phone ? ` · ${lead.phone}` : ""}`,
                  })),
                ]}
                placeholder="Localize ou cadastre"
                disabled={loading || !clientId}
              />
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
                onValueChange={setVehicleId}
                options={vehicles.map((vehicle) => ({
                  value: vehicle.id,
                  label: `${vehicle.brand} ${vehicle.model} · ${vehicle.year_or_km}`,
                }))}
                placeholder="Selecione do estoque"
                disabled={loading || !clientId}
              />
              {!vehicleId && (
                <Input
                  label="Ou informe o carro"
                  value={product}
                  onChange={(event) => setProduct(event.target.value)}
                  placeholder="Ex.: Volkswagen T-Cross"
                />
              )}
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
