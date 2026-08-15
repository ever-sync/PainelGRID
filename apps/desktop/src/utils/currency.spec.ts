import { maskCurrencyInput } from "./currency";

describe("maskCurrencyInput", () => {
  it("formata os dígitos como reais durante a digitação", () => {
    expect(maskCurrencyInput("1")).toBe("R$ 0,01");
    expect(maskCurrencyInput("12600000")).toBe("R$ 126.000,00");
  });

  it("mantém correto um valor decimal recebido da API", () => {
    expect(maskCurrencyInput("98111.28")).toBe("R$ 98.111,28");
  });

  it("limpa o campo quando não há dígitos", () => {
    expect(maskCurrencyInput("")).toBe("");
  });
});
