import {
  DEFAULT_CRM_PREFERENCES,
  readCrmPreferences,
  writeCrmPreferences,
} from "./crm-preferences";

describe("preferencias do CRM", () => {
  it("isola as preferencias por usuario e cliente", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    writeCrmPreferences(storage, "gestor-1", "cliente-a", {
      ...DEFAULT_CRM_PREFERENCES,
      viewMode: "list",
      scrollLeft: 420,
    });
    expect(readCrmPreferences(storage, "gestor-1", "cliente-a")).toMatchObject({
      viewMode: "list",
      scrollLeft: 420,
    });
    expect(readCrmPreferences(storage, "gestor-1", "cliente-b")).toEqual(
      DEFAULT_CRM_PREFERENCES,
    );
  });

  it("recupera o padrao quando o armazenamento esta corrompido", () => {
    expect(readCrmPreferences({ getItem: () => "invalido" }, "u", "c")).toEqual(
      DEFAULT_CRM_PREFERENCES,
    );
  });
});
