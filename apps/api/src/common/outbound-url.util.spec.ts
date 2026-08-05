import {
  assertSafeWebhookUrl,
  resolveSafeWebhookDestination,
} from "./outbound-url.util";

describe("assertSafeWebhookUrl", () => {
  const publicDns = async () => [{ address: "93.184.216.34", family: 4 }];

  it("aceita e normaliza HTTPS com DNS publico", async () => {
    await expect(
      assertSafeWebhookUrl(
        " https://hooks.example.com/path#fragment ",
        publicDns,
      ),
    ).resolves.toBe("https://hooks.example.com/path");
  });

  it.each([
    "http://hooks.example.com",
    "https://localhost/hook",
    "https://n8n.internal/hook",
    "https://127.0.0.1/hook",
    "https://169.254.169.254/latest/meta-data",
    "https://10.0.0.1/hook",
    "https://[::1]/hook",
    "https://user:pass@hooks.example.com/hook",
    "https://hooks.example.com:8443/hook",
  ])("rejeita destino inseguro: %s", async (url) => {
    await expect(assertSafeWebhookUrl(url, publicDns)).rejects.toThrow();
  });

  it("rejeita hostname que resolve para endereco privado", async () => {
    await expect(
      assertSafeWebhookUrl("https://hooks.example.com", async () => [
        { address: "192.168.1.10", family: 4 },
      ]),
    ).rejects.toThrow("privado");
  });

  it("retorna o IP publico validado para ser fixado na conexao", async () => {
    await expect(
      resolveSafeWebhookDestination(
        "https://hooks.example.com/webhook",
        publicDns,
      ),
    ).resolves.toMatchObject({
      address: "93.184.216.34",
      family: 4,
      url: new URL("https://hooks.example.com/webhook"),
    });
  });
});
