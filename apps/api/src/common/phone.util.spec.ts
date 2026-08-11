import { isValidBrazilianPhone, normalizeBrazilianPhone } from "./phone.util";

describe("phone.util", () => {
  it.each(["(12) 98109-2776", "+55 11 98765-4321", "(11) 3456-7890"])(
    "aceita telefone brasileiro estruturalmente válido: %s",
    (phone) => {
      expect(isValidBrazilianPhone(phone)).toBe(true);
    },
  );

  it.each([
    "(00) 98109-2776",
    "(20) 98109-2776",
    "(12) 88109-2776",
    "(12) 1111-1111",
    "(12) 1234-567",
  ])("rejeita telefone brasileiro inválido: %s", (phone) => {
    expect(isValidBrazilianPhone(phone)).toBe(false);
  });

  it("normaliza um telefone válido para E.164", () => {
    expect(normalizeBrazilianPhone("(12) 98109-2776")).toBe("+5512981092776");
  });
});
