import type { Lead } from "../../../types";
import {
  STAGE_AGE_CRITICAL_DAYS,
  STAGE_AGE_WARNING_DAYS,
  compareByDate,
  compareLeads,
  stageAgeInDays,
} from "./crm-view";

function lead(overrides: Partial<Lead> & { name: string }): Lead {
  return {
    id: `lead-${overrides.name}`,
    client_id: "client-1",
    email: "",
    phone: "",
    source: "form_page",
    crm_stage: "novo",
    crm_stage_id: "stage-1",
    crm_pipeline_id: null,
    tags: [],
    confirmation_status: "pending",
    assigned_vendor_id: null,
    registered_by_id: null,
    registered_by_name: null,
    event_interest: null,
    event_id: null,
    store_visit_datetime: null,
    notes: "",
    checkin_token: null,
    checkin_voucher: null,
    created_at: "2026-01-01T12:00:00.000Z",
    updated_at: "2026-01-01T12:00:00.000Z",
    ...overrides,
  } as Lead;
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

const order = (leads: Lead[], sort: Parameters<typeof compareLeads>[0]) =>
  [...leads].sort(compareLeads(sort)).map((item) => item.name);

describe("compareByDate", () => {
  it("ordena crescente e decrescente", () => {
    const antes = "2026-01-01T00:00:00.000Z";
    const depois = "2026-02-01T00:00:00.000Z";
    expect(compareByDate(antes, depois, "asc")).toBeLessThan(0);
    expect(compareByDate(antes, depois, "desc")).toBeGreaterThan(0);
  });

  it("manda data ausente ou invalida para o fim nas duas direcoes", () => {
    const data = "2026-01-01T00:00:00.000Z";
    for (const direcao of ["asc", "desc"] as const) {
      expect(compareByDate(null, data, direcao)).toBeGreaterThan(0);
      expect(compareByDate(data, null, direcao)).toBeLessThan(0);
      expect(compareByDate("nao-e-data", data, direcao)).toBeGreaterThan(0);
    }
    expect(compareByDate(null, undefined, "asc")).toBe(0);
  });
});

describe("compareLeads", () => {
  const leads = [
    lead({ name: "Bruno", created_at: daysAgo(1), updated_at: daysAgo(9) }),
    lead({ name: "Ana", created_at: daysAgo(10), updated_at: daysAgo(1) }),
    lead({ name: "Carla", created_at: daysAgo(5), updated_at: daysAgo(5) }),
  ];

  it("recent: mais novos primeiro", () => {
    expect(order(leads, "recent")).toEqual(["Bruno", "Carla", "Ana"]);
  });

  it("oldest: mais antigos primeiro", () => {
    expect(order(leads, "oldest")).toEqual(["Ana", "Carla", "Bruno"]);
  });

  it("updated: atualizados por ultimo primeiro", () => {
    expect(order(leads, "updated")).toEqual(["Ana", "Carla", "Bruno"]);
  });

  it("name: alfabetica", () => {
    expect(order(leads, "name")).toEqual(["Ana", "Bruno", "Carla"]);
  });

  it("stalled: parado ha mais tempo na etapa primeiro, sem data no fim", () => {
    const comEtapa = [
      lead({ name: "Recente", crm_stage_since: daysAgo(1) }),
      lead({ name: "Parado", crm_stage_since: daysAgo(30) }),
      lead({ name: "SemData", crm_stage_since: null }),
    ];
    expect(order(comEtapa, "stalled")).toEqual([
      "Parado",
      "Recente",
      "SemData",
    ]);
  });

  it("visit: visita mais proxima primeiro, sem visita no fim", () => {
    const comVisita = [
      lead({ name: "Depois", store_visit_datetime: daysAgo(-10) }),
      lead({ name: "Antes", store_visit_datetime: daysAgo(-1) }),
      lead({ name: "SemVisita", store_visit_datetime: null }),
    ];
    expect(order(comVisita, "visit")).toEqual(["Antes", "Depois", "SemVisita"]);
  });

  it("desempata por nome quando a data e igual", () => {
    const mesmaData = daysAgo(3);
    const empatados = [
      lead({ name: "Zeca", created_at: mesmaData }),
      lead({ name: "Alice", created_at: mesmaData }),
    ];
    expect(order(empatados, "recent")).toEqual(["Alice", "Zeca"]);
  });
});

describe("stageAgeInDays", () => {
  it("conta dias inteiros desde a entrada na etapa", () => {
    expect(
      stageAgeInDays(lead({ name: "x", crm_stage_since: daysAgo(3) })),
    ).toBe(3);
    expect(
      stageAgeInDays(lead({ name: "x", crm_stage_since: daysAgo(0) })),
    ).toBe(0);
  });

  it("devolve null sem data ou com data invalida", () => {
    expect(
      stageAgeInDays(lead({ name: "x", crm_stage_since: null })),
    ).toBeNull();
    expect(stageAgeInDays(lead({ name: "x" }))).toBeNull();
    expect(
      stageAgeInDays(lead({ name: "x", crm_stage_since: "nao-e-data" })),
    ).toBeNull();
  });

  it("data no futuro nao vira idade negativa", () => {
    expect(
      stageAgeInDays(lead({ name: "x", crm_stage_since: daysAgo(-5) })),
    ).toBeNull();
  });

  it("os limites de alerta seguem a ordem esperada", () => {
    expect(STAGE_AGE_WARNING_DAYS).toBeLessThan(STAGE_AGE_CRITICAL_DAYS);
  });
});
