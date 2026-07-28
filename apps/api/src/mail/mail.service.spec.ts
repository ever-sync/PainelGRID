/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConfigService } from "@nestjs/config";
import { MailService } from "./mail.service";

describe("MailService", () => {
  it("usa a logo publica da plataforma e a foto publica do vendedor", () => {
    const values: Record<string, string> = {
      FRONTEND_URL: "https://gpdevendas.app,https://www.gpdevendas.app",
      API_PUBLIC_URL: "https://api.gpdevendas.app",
    };
    const config = {
      get: jest.fn((key: string, fallback = "") => values[key] ?? fallback),
    } as any as ConfigService;
    const service = new MailService(config);

    const html = (service as any).buildAppointmentWelcomeHtml({
      leadName: "Cliente Teste",
      eventName: "Evento Teste",
      eventLocation: "Sao Paulo",
      scheduledAt: new Date("2026-07-30T15:00:00.000Z"),
      timezone: "America/Sao_Paulo",
      vendorName: "Vendedor Teste",
      vendorAvatarUrl: "/auth/avatar/11111111-1111-4111-8111-111111111111?v=1",
      clientName: "Concessionaria Teste",
    });

    expect(html).toContain('src="https://gpdevendas.app/logo.png"');
    expect(html).toContain('alt="PainelGRID"');
    expect(html).toContain(
      'src="https://api.gpdevendas.app/auth/avatar/11111111-1111-4111-8111-111111111111?v=1"',
    );
    expect(html).toContain("Vendedor Teste");
  });
});
