import {
  encryptCheckinToken,
  decryptCheckinToken,
  generateRawCheckinToken,
} from "./crypto.util";

describe("CryptoUtil", () => {
  const secret = "test-secret-key-12345";

  it("should generate a 24-character hex raw token", () => {
    const token = generateRawCheckinToken();
    expect(token).toHaveLength(24);
    expect(token).toMatch(/^[0-9a-fA-F]+$/);
  });

  it("should encrypt and decrypt correctly", () => {
    const raw = generateRawCheckinToken();
    const encrypted = encryptCheckinToken(raw, secret);
    expect(encrypted).toHaveLength(24);
    expect(encrypted).not.toBe(raw);

    const decrypted = decryptCheckinToken(encrypted, secret);
    expect(decrypted).toBe(raw);
  });

  it("should be deterministic (same input and secret produces same output)", () => {
    const raw = "a1b2c3d4e5f6a1b2c3d4e5f6";
    const encrypted1 = encryptCheckinToken(raw, secret);
    const encrypted2 = encryptCheckinToken(raw, secret);
    expect(encrypted1).toBe(encrypted2);
  });

  it("should return original value on decryption if length is incorrect", () => {
    expect(decryptCheckinToken("too-short", secret)).toBe("too-short");
    expect(
      decryptCheckinToken("not-hex-at-all-should-be-twenty-four-chars", secret),
    ).toBe("not-hex-at-all-should-be-twenty-four-chars");
  });
});
