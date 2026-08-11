import { brazilianPhoneValidationError, normalizeBrPhoneToE164 } from "./phone";

describe("phone", () => {
  it.each([
    ["(12) 98109-2776", "+5512981092776"],
    ["+55 11 98765-4321", "+5511987654321"],
    ["(11) 3456-7890", "+551134567890"],
  ])("normaliza %s", (phone, expected) => {
    expect(brazilianPhoneValidationError(phone)).toBe("");
    expect(normalizeBrPhoneToE164(phone)).toBe(expected);
  });

  it.each([
    "(00) 98109-2776",
    "(20) 98109-2776",
    "(12) 88109-2776",
    "(12) 99999-9999",
    "(12) 1234-567",
  ])("rejeita %s", (phone) => {
    expect(brazilianPhoneValidationError(phone)).not.toBe("");
    expect(normalizeBrPhoneToE164(phone)).toBe("");
  });
});
