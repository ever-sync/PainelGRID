import type { Lead } from "../../../types";
import { buildCampaignChartData, countCampaignMetrics } from "./campaign-chart";

/**
 * O grafico somava os leads criados *ate* cada dia (acumulado) e a serie saia
 * reta, repetindo o total da campanha em todas as barras. Estes testes fixam o
 * contrato: barra = leads criados naquele dia.
 */

const EVENT_ID = "event-1";

function lead(overrides: Partial<Lead> & { created_at: string }): Lead {
  return {
    id: `lead-${overrides.created_at}-${Math.random()}`,
    client_id: "client-1",
    name: "Lead",
    email: "",
    phone: "",
    source: "form_page",
    crm_stage: "novo",
    crm_stage_id: null,
    crm_pipeline_id: null,
    tags: [],
    confirmation_status: "pending",
    assigned_vendor_id: null,
    registered_by_id: null,
    registered_by_name: null,
    event_interest: null,
    event_id: EVENT_ID,
    store_visit_datetime: null,
    notes: "",
    checkin_token: null,
    checkin_voucher: null,
    updated_at: overrides.created_at,
    ...overrides,
  } as Lead;
}

/** Data local (mesmo fuso do navegador) as 12h, longe da virada do dia. */
function atNoon(daysAgo: number) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

describe("buildCampaignChartData", () => {
  it("conta os leads criados no dia, nao o acumulado ate o dia", () => {
    const leads = [
      lead({ created_at: atNoon(2) }),
      lead({ created_at: atNoon(2) }),
      lead({ created_at: atNoon(1) }),
    ];

    const series = buildCampaignChartData(EVENT_ID, leads, undefined, 7);

    expect(series).toHaveLength(7);
    const totals = series.map((point) => point.totalLeads);
    // Antes (acumulado) seria [0,0,0,0,2,3,3]; agora e o movimento do dia.
    expect(totals.slice(-3)).toEqual([2, 1, 0]);
    expect(totals.reduce((sum, n) => sum + n, 0)).toBe(3);
  });

  it("ignora lead de outra campanha", () => {
    const leads = [
      lead({ created_at: atNoon(1) }),
      lead({ created_at: atNoon(1), event_id: "outro-evento" }),
    ];

    const series = buildCampaignChartData(EVENT_ID, leads, undefined, 7);

    expect(series.reduce((sum, p) => sum + p.totalLeads, 0)).toBe(1);
  });

  it("janela termina hoje quando o evento ainda vai acontecer", () => {
    const futuro = new Date();
    futuro.setDate(futuro.getDate() + 30);
    const leads = [lead({ created_at: atNoon(0) })];

    const series = buildCampaignChartData(
      EVENT_ID,
      leads,
      futuro.toISOString(),
      7,
    );

    // O lead de hoje precisa aparecer: ancorar no evento futuro jogava a
    // janela inteira para frente, onde nao existe lead criado.
    expect(series[series.length - 1].totalLeads).toBe(1);
  });

  it("janela termina na data do evento quando ele ja passou", () => {
    const passado = new Date();
    passado.setDate(passado.getDate() - 10);
    const leads = [lead({ created_at: passado.toISOString() })];

    const series = buildCampaignChartData(
      EVENT_ID,
      leads,
      passado.toISOString(),
      7,
    );

    expect(series[series.length - 1].totalLeads).toBe(1);
  });

  it("respeita o tamanho do periodo escolhido", () => {
    for (const dias of [7, 15, 30] as const) {
      expect(
        buildCampaignChartData(EVENT_ID, [], undefined, dias),
      ).toHaveLength(dias);
    }
  });

  it("lead com created_at invalido nao derruba a serie", () => {
    const series = buildCampaignChartData(
      EVENT_ID,
      [lead({ created_at: "data-invalida" })],
      undefined,
      7,
    );

    expect(series.every((point) => point.totalLeads === 0)).toBe(true);
  });
});

describe("countCampaignMetrics", () => {
  it("classifica agendado por status, etapa ou agendamento ativo", () => {
    const counts = countCampaignMetrics([
      lead({ created_at: atNoon(0), confirmation_status: "scheduled" }),
      lead({ created_at: atNoon(0), crm_stage: "agendado" }),
      lead({
        created_at: atNoon(0),
        active_appointment: {
          id: "a1",
          event_id: EVENT_ID,
          scheduled_at: atNoon(0),
          status: "scheduled",
          created_by_id: null,
          completed_at: null,
          sale_id: null,
        },
      }),
      lead({ created_at: atNoon(0) }),
    ]);

    expect(counts.totalLeads).toBe(4);
    expect(counts.scheduledLeads).toBe(3);
  });

  it("conta cancelado por status ou por etapa perdida", () => {
    const counts = countCampaignMetrics([
      lead({ created_at: atNoon(0), confirmation_status: "cancelled" }),
      lead({ created_at: atNoon(0), crm_stage: "perdido" }),
      lead({ created_at: atNoon(0), confirmation_status: "confirmed" }),
      lead({ created_at: atNoon(0), confirmation_status: "checked_in" }),
    ]);

    expect(counts.cancelledLeads).toBe(2);
    expect(counts.confirmedLeads).toBe(1);
    expect(counts.checkedInLeads).toBe(1);
  });
});
