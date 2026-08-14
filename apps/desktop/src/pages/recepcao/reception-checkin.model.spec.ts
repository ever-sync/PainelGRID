import {
  parseWristbandNumbers,
  serializeWristbandNumbers,
  validateWristbandNumbers,
} from "./reception-checkin.model";

describe("pulseiras do check-in", () => {
  it("converte o valor persistido em campos individuais", () => {
    expect(parseWristbandNumbers("127, 128,  129")).toEqual([
      "127",
      "128",
      "129",
    ]);
    expect(parseWristbandNumbers(null)).toEqual([""]);
  });

  it("serializa somente pulseiras preenchidas", () => {
    expect(serializeWristbandNumbers([" 127 ", "128"])).toBe("127, 128");
    expect(serializeWristbandNumbers([""])).toBeNull();
  });

  it("valida obrigatoriedade, campos vazios e duplicidade", () => {
    expect(validateWristbandNumbers([""], true)).toBe(
      "Informe pelo menos uma pulseira.",
    );
    expect(validateWristbandNumbers(["127", ""], false)).toContain("vazios");
    expect(validateWristbandNumbers(["127", "127"], true)).toContain(
      "mais de uma vez",
    );
    expect(validateWristbandNumbers(["127", "128"], true)).toBe("");
  });
});
