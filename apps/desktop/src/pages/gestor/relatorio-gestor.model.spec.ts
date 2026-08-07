import type { Lead } from "../../types";
import {
  filterOperationalReportLeads,
  groupOperationalLeadsBySource,
  leadsForOperationalEvent,
  operationalLeadSourceLabel,
  REPORT_METRIC_CONTRACT,
  summarizeOperationalLeads,
  buildOperationalReportCsv,
} from "./relatorio-gestor.model";

const lead = (overrides: Partial<Lead>): Lead =>
  ({
    id: "lead-1",
    client_id: "client-1",
    event_id: "event-1",
    crm_stage: "novo",
    source: "manual",
    ...overrides,
  }) as Lead;

describe("relatório operacional do gestor — contrato atual", () => {
  it("filtra por cliente antes de calcular os indicadores", () => {
    const result = filterOperationalReportLeads(
      [lead({ id: "a" }), lead({ id: "b", client_id: "client-2" })],
      "client-1",
      "all",
    );

    expect(result.map(({ id }) => id)).toEqual(["a"]);
  });

  it("não inclui no evento um lead do mesmo cliente vinculado a outro evento", () => {
    const unrelatedLead = lead({
      id: "other-event",
      event_id: "event-2",
      client_id: "client-1",
    });

    const result = filterOperationalReportLeads(
      [unrelatedLead],
      "all",
      "event-1",
    );

    expect(result).toEqual([]);
  });

  it("seleciona leads de cada evento exclusivamente pelo vínculo do lead", () => {
    const firstEventLead = lead({ id: "first", event_id: "event-1" });
    const secondEventLead = lead({ id: "second", event_id: "event-2" });
    const withoutEvent = lead({ id: "none", event_id: undefined });

    expect(
      leadsForOperationalEvent(
        [firstEventLead, secondEventLead, withoutEvent],
        "event-1",
      ),
    ).toEqual([firstEventLead]);
  });

  it("mantém a semântica atual de agendamento, check-in e conversão", () => {
    const result = summarizeOperationalLeads([
      lead({ id: "new", crm_stage: "novo" }),
      lead({ id: "scheduled", crm_stage: "agendado" }),
      lead({ id: "checked", crm_stage: "checkin" }),
      lead({ id: "sold", crm_stage: "convertido" }),
    ]);

    expect(result).toEqual({
      totalLeads: 4,
      scheduled: 3,
      checkedIn: 2,
      converted: 1,
      conversionRate: 25,
      checkinRate: 50,
    });
  });

  it("agrupa as variações conhecidas de origem", () => {
    expect(
      groupOperationalLeadsBySource([
        lead({ id: "meta", source: "facebook_ads" }),
        lead({ id: "wa", source: "whatsapp" }),
        lead({ id: "web", source: "form_page" }),
        lead({ id: "other", source: undefined }),
      ]),
    ).toEqual([
      { name: "Facebook Ads (Meta)", value: 1 },
      { name: "WhatsApp Direct", value: 1 },
      { name: "Formulário Web", value: 1 },
      { name: "Outros Canais", value: 1 },
    ]);
    expect(operationalLeadSourceLabel("instagram")).toBe(
      "Facebook Ads (Meta)",
    );
  });

  it("expõe a confiança atual das métricas operacionais", () => {
    const confidenceByKey = Object.fromEntries(
      REPORT_METRIC_CONTRACT.map((metric) => [metric.key, metric.confidence]),
    );

    expect(confidenceByKey).toMatchObject({
      leads: "real",
      crm_funnel: "real",
      campaign_performance: "real",
      event_investment: "real",
      event_revenue: "real",
      vendor_team_fallback: "unavailable",
      export: "real",
    });
  });

  it("gera CSV compatível com Excel e protege textos com separador e aspas", () => {
    const csv = buildOperationalReportCsv([
      {
        id: "lead-1",
        client_id: "client-1",
        name: 'Maria "Silva"',
        email: "maria@example.com",
        phone: "+5511999999999",
        source: "facebook_ads",
        confirmation_status: "scheduled",
        created_at: "2026-08-07T12:00:00.000Z",
        updated_at: "2026-08-07T12:00:00.000Z",
        crm_stage_id: "stage-1",
        event_interest_id: "event-1",
        crm_stage: {
          id: "stage-1",
          code: "PRESENCA_AGENDADA",
          name: "Presença agendada",
          color: null,
        },
        event_interest: { id: "event-1", name: "Evento; SJC" },
        client: { id: "client-1", company_name: "Original VW" },
      },
    ] as never);

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"Maria ""Silva"""');
    expect(csv).toContain('"Evento; SJC"');
    expect(csv).toContain('"Facebook Ads (Meta)"');
  });
});
