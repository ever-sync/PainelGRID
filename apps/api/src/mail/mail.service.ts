import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * Envia e-mails via API HTTP do Resend (nao SMTP): a Railway bloqueia portas
 * SMTP de saida (465/587) por padrao, o que fazia o envio travar ate o
 * timeout e derrubar o login (2FA por e-mail e obrigatorio). A API HTTP nao
 * depende dessas portas.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly apiKey: string;
  private readonly from: string;
  private readonly frontendUrl: string;
  private readonly apiPublicUrl: string;
  private readonly platformLogoUrl: string;

  constructor(config: ConfigService) {
    this.apiKey =
      config.get<string>("RESEND_API_KEY", "") ||
      config.get<string>("SMTP_PASS", "");
    this.from = config.get<string>("SMTP_FROM", "noreply@painel.grid.com.br");
    this.frontendUrl = config
      .get<string>("FRONTEND_URL", "http://localhost:8080")
      .split(",")[0]
      .trim();
    this.platformLogoUrl =
      config.get<string>("PLATFORM_LOGO_URL", "").trim() ||
      `${this.frontendUrl.replace(/\/+$/, "")}/logo.png`;
    const railwayDomain = config.get<string>("RAILWAY_PUBLIC_DOMAIN", "");
    this.apiPublicUrl = (
      config.get<string>("API_PUBLIC_URL", "") ||
      (railwayDomain ? `https://${railwayDomain}` : "") ||
      "https://api.gpdevendas.app"
    ).replace(/\/+$/, "");

    if (this.apiKey) {
      this.logger.log("Resend (API HTTP) configurado para envio de e-mail");
    } else {
      this.logger.warn(
        "Resend nao configurado (RESEND_API_KEY/SMTP_PASS ausente)",
      );
    }
  }

  private async sendViaResend(params: {
    to: string;
    subject: string;
    html: string;
  }): Promise<string | null> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: params.to,
        subject: params.subject,
        html: params.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Resend respondeu ${response.status}: ${body}`);
    }

    const body = (await response.json().catch(() => null)) as {
      id?: unknown;
    } | null;
    return typeof body?.id === "string" ? body.id : null;
  }

  async sendCredentialRecoveryEmail(params: {
    to: string;
    leadName: string;
    eventName: string;
    eventDescription: string | null;
    clientName: string;
    whatsappUrl: string;
  }): Promise<{ providerMessageId: string | null; subject: string }> {
    if (!this.apiKey) throw new Error("Resend nao configurado");

    const subject = "IMPORTANTE: VOCÊ AINDA NÃO FINALIZOU SEU CREDENCIAMENTO";
    const providerMessageId = await this.sendViaResend({
      to: params.to,
      subject,
      html: this.buildCredentialRecoveryHtml(params),
    });
    this.logger.log("Email de recuperacao de credenciamento enviado");
    return { providerMessageId, subject };
  }

  private buildCredentialRecoveryHtml(params: {
    leadName: string;
    eventName: string;
    eventDescription: string | null;
    clientName: string;
    whatsappUrl: string;
  }): string {
    const escape = (value: string) =>
      value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    const firstName = escape(
      params.leadName.trim().split(/\s+/)[0] || params.leadName,
    );
    const eventName = escape(params.eventName);
    const clientName = escape(params.clientName);
    const whatsappUrl = escape(params.whatsappUrl);
    const offerPattern =
      /(desconto|taxa|entrada|financiamento|parcela|emplacamento|blindad|seminovo|fipe|transfer[eê]ncia|voucher|condi[cç][aã]o|oferta)/i;
    const offers = (params.eventDescription ?? "")
      .split(/\r?\n/)
      .map((line) =>
        line
          .replace(/^\s*[-*•#]+\s*/, "")
          .replace(/[*_`]/g, "")
          .trim(),
      )
      .filter((line) => line.length >= 8 && line.length <= 180)
      .filter((line) => offerPattern.test(line))
      .filter((line) => !/obrigat[oó]rio|regra|prompt|assistente/i.test(line))
      .slice(0, 4)
      .map(escape);
    const offerHtml = offers.length
      ? `<div class="offers"><strong>Algumas condições do evento:</strong><ul>${offers
          .map((offer) => `<li>${offer}</li>`)
          .join("")}</ul></div>`
      : `<div class="offers"><strong>Condições especiais estarão disponíveis durante o evento.</strong></div>`;

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 12px;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#17171b">
  <div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e7e7eb;border-radius:20px;overflow:hidden;box-shadow:0 8px 30px rgba(18,18,23,.07)">
    <div style="background:#ff1838;padding:28px 34px;color:#fff">
      <div style="font-size:12px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;opacity:.82">Atenção</div>
      <h1 style="font-size:25px;line-height:1.2;margin:7px 0 0">Seu credenciamento ainda não foi finalizado</h1>
    </div>
    <div style="padding:32px 34px">
      <p style="font-size:17px;margin:0 0 12px">Olá, <strong>${firstName}</strong>!</p>
      <p style="font-size:15px;line-height:1.65;color:#555;margin:0 0 20px">Sua inscrição no <strong>${eventName}</strong> está quase pronta. Finalize agora para garantir sua credencial e receber as orientações do evento.</p>
      ${offerHtml}
      <div style="text-align:center;margin:30px 0 20px">
        <a href="${whatsappUrl}" style="display:inline-block;background:#18a967;color:#fff;text-decoration:none;font-size:15px;font-weight:800;padding:15px 26px;border-radius:12px">GARANTIR MINHA VAGA</a>
      </div>
      <p style="font-size:12px;line-height:1.55;color:#8a8a94;margin:22px 0 0">Condições sujeitas à aprovação, disponibilidade e regras informadas no evento.</p>
    </div>
    <div style="padding:18px 34px;background:#fafafd;border-top:1px solid #eeeef2;text-align:center;color:#9a9aa4;font-size:12px">${clientName}</div>
  </div>
</body>
</html>`;
  }

  async sendWelcome(params: {
    to: string;
    name: string;
    password: string;
  }): Promise<void> {
    const { to, name, password } = params;
    const subject = "Bem-vindo ao PainelGRID — suas credenciais de acesso";
    const html = this.buildWelcomeHtml({
      name,
      email: to,
      password,
      loginUrl: this.frontendUrl,
    });

    if (!this.apiKey) {
      this.logger.warn(
        "Email de boas-vindas nao enviado: Resend nao configurado",
      );
      return;
    }

    try {
      await this.sendViaResend({ to, subject, html });
      this.logger.log("Email de boas-vindas enviado");
    } catch (err) {
      this.logger.error(
        `Falha ao enviar email de boas-vindas: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Vendedor aprovado no auto-cadastro. Diferente do sendWelcome, NAO envia senha:
   * manda um link de uso unico para a pessoa criar a propria.
   *
   * Lanca em caso de falha (o sendWelcome so loga) porque quem aprova precisa
   * saber que o e-mail nao saiu, para poder reenviar.
   */
  async sendVendorActivated(params: {
    to: string;
    name: string;
    companyName: string | null;
    setupToken: string;
  }): Promise<void> {
    const firstName = params.name.trim().split(/\s+/)[0] || params.name;
    const setupUrl = `${this.frontendUrl.replace(/\/+$/, "")}/definir-senha/${params.setupToken}`;
    const subject = `Seu cadastro foi ativado, ${firstName.toUpperCase()} — crie sua senha`;
    const html = this.buildVendorActivatedHtml({
      firstName,
      companyName: params.companyName,
      setupUrl,
    });

    if (!this.apiKey) {
      this.logger.warn("Email de ativacao nao enviado: Resend nao configurado");
      throw new Error("Resend nao configurado");
    }

    try {
      await this.sendViaResend({ to: params.to, subject, html });
      this.logger.log("Email de ativacao de vendedor enviado");
    } catch (err) {
      this.logger.error(
        `Falha ao enviar email de ativacao: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  private buildVendorActivatedHtml(p: {
    firstName: string;
    companyName: string | null;
    setupUrl: string;
  }) {
    const team = p.companyName ? ` — equipe ${p.companyName}` : "";
    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Seu cadastro foi ativado</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #f4f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .wrapper { max-width: 560px; margin: 40px auto; }
    .card { background: #fff; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,.08); }
    .header { background: #FF0636; padding: 36px 40px; text-align: center; }
    .header h1 { color: #fff; font-size: 22px; font-weight: 800; letter-spacing: -.3px; }
    .header p { color: rgba(255,255,255,.75); font-size: 13px; margin-top: 4px; }
    .body { padding: 36px 40px; }
    .body h2 { font-size: 18px; font-weight: 700; color: #111; }
    .body > p { color: #555; font-size: 14px; line-height: 1.6; margin-top: 8px; }
    .creds { background: #f8f8fa; border: 1.5px solid #e8e8ed; border-radius: 14px; padding: 16px 20px; margin: 24px 0; word-break: break-all; font-size: 12px; color: #555; font-family: 'SF Mono', 'Fira Code', monospace; }
    .cta { text-align: center; margin: 28px 0 8px; }
    .cta a { display: inline-block; background: #FF0636; color: #fff; text-decoration: none; font-weight: 700; font-size: 15px; padding: 14px 36px; border-radius: 12px; letter-spacing: -.1px; }
    .warning { background: #fff8ec; border: 1.5px solid #f5c842; border-radius: 10px; padding: 14px 18px; margin-top: 24px; font-size: 13px; color: #7a5c00; line-height: 1.5; }
    .footer { padding: 20px 40px; text-align: center; font-size: 12px; color: #aaa; line-height: 1.7; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <h1>PainelGRID</h1>
        <p>Plataforma de gestão de vendas</p>
      </div>
      <div class="body">
        <h2>Seu cadastro foi ativado, ${p.firstName.toUpperCase()}! 🎉</h2>
        <p>
          Seja bem-vindo ao PainelGRID${team}. Sua conta já está liberada —
          falta só um passo: criar a sua senha de acesso.
        </p>

        <div class="cta">
          <a href="${p.setupUrl}">Criar minha senha</a>
        </div>

        <p style="font-size:13px;color:#888;margin-top:20px;">
          Se o botão não funcionar, copie e cole este endereço no navegador:
        </p>
        <div class="creds">${p.setupUrl}</div>

        <div class="warning">
          ⏳ Este link é <strong>pessoal e de uso único</strong>, e expira em 7 dias.
          Se ele expirar, peça um novo à empresa.
        </div>
      </div>
      <div class="footer">
        <p>Você está recebendo este e-mail porque se cadastrou pelo link da equipe.</p>
        <p>PainelGRID · Gestão de Vendas</p>
      </div>
    </div>
  </div>
</body>
</html>`;
  }

  private buildWelcomeHtml(p: {
    name: string;
    email: string;
    password: string;
    loginUrl: string;
  }) {
    const firstName = p.name.split(" ")[0];
    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bem-vindo ao PainelGRID</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #f4f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .wrapper { max-width: 560px; margin: 40px auto; }
    .card { background: #fff; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,.08); }
    .header { background: #FF0636; padding: 36px 40px; text-align: center; }
    .header h1 { color: #fff; font-size: 22px; font-weight: 800; letter-spacing: -.3px; }
    .header p { color: rgba(255,255,255,.75); font-size: 13px; margin-top: 4px; }
    .body { padding: 36px 40px; }
    .body h2 { font-size: 18px; font-weight: 700; color: #111; }
    .body > p { color: #555; font-size: 14px; line-height: 1.6; margin-top: 8px; }
    .creds { background: #f8f8fa; border: 1.5px solid #e8e8ed; border-radius: 14px; padding: 20px 24px; margin: 24px 0; }
    .creds-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #ececec; }
    .creds-row:last-child { border-bottom: none; padding-bottom: 0; }
    .creds-label { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: #888; }
    .creds-value { font-size: 14px; font-weight: 600; color: #111; font-family: 'SF Mono', 'Fira Code', monospace; }
    .cta { text-align: center; margin: 28px 0 8px; }
    .cta a { display: inline-block; background: #FF0636; color: #fff; text-decoration: none; font-weight: 700; font-size: 15px; padding: 14px 36px; border-radius: 12px; letter-spacing: -.1px; }
    .warning { background: #fff8ec; border: 1.5px solid #f5c842; border-radius: 10px; padding: 14px 18px; margin-top: 24px; font-size: 13px; color: #7a5c00; line-height: 1.5; }
    .footer { padding: 20px 40px; text-align: center; font-size: 12px; color: #aaa; line-height: 1.7; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <h1>PainelGRID</h1>
        <p>Plataforma de gestão de vendas</p>
      </div>
      <div class="body">
        <h2>Olá, ${firstName}! 👋</h2>
        <p>
          Sua conta foi criada com sucesso. Use as credenciais abaixo para acessar
          a plataforma pela primeira vez.
        </p>

        <div class="creds">
          <div class="creds-row">
            <span class="creds-label">E-mail</span>
            <span class="creds-value">${p.email}</span>
          </div>
          <div class="creds-row">
            <span class="creds-label">Senha provisória</span>
            <span class="creds-value">${p.password}</span>
          </div>
        </div>

        <div class="cta">
          <a href="${p.loginUrl}">Acessar o PainelGRID</a>
        </div>

        <div class="warning">
          ⚠️ <strong>Recomendamos</strong> que você altere sua senha após o primeiro acesso
          em <em>Perfil → Segurança</em>.
        </div>
      </div>
      <div class="footer">
        <p>Você está recebendo este e-mail porque uma conta foi criada em seu nome.</p>
        <p>PainelGRID · Gestão de Vendas</p>
      </div>
    </div>
  </div>
</body>
</html>`;
  }

  async sendAppointmentWelcome(params: {
    to: string;
    leadName: string;
    eventName: string;
    eventLocation: string | null;
    scheduledAt: Date;
    timezone: string;
    vendorName: string | null;
    vendorAvatarUrl: string | null;
    clientName: string;
    checkinToken?: string | null;
  }): Promise<{ providerMessageId: string | null; subject: string }> {
    if (!this.apiKey) {
      this.logger.warn(
        "Email de boas-vindas ao evento nao enviado: Resend nao configurado",
      );
      throw new Error("Resend nao configurado");
    }

    const subject = `Bem-vindo(a) ao ${params.eventName}! 🏁 Seu QR Code de Check-in`;
    const html = this.buildAppointmentWelcomeHtml(params);

    try {
      const providerMessageId = await this.sendViaResend({
        to: params.to,
        subject,
        html,
      });
      this.logger.log("Email de boas-vindas ao evento enviado com QR Code");
      return { providerMessageId, subject };
    } catch (err) {
      this.logger.error(
        `Falha ao enviar email de boas-vindas ao evento: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  private toAbsoluteMediaUrl(path: string | null): string | null {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path;
    return `${this.apiPublicUrl}${path.startsWith("/") ? "" : "/"}${path}`;
  }

  private buildGoogleCalendarUrl(p: {
    title: string;
    details: string;
    location: string;
    start: Date;
    durationMinutes?: number;
  }): string {
    const end = new Date(
      p.start.getTime() + (p.durationMinutes ?? 60) * 60_000,
    );
    const fmt = (d: Date) =>
      d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const query = new URLSearchParams({
      action: "TEMPLATE",
      text: p.title,
      dates: `${fmt(p.start)}/${fmt(end)}`,
      details: p.details,
      location: p.location,
    });
    return `https://calendar.google.com/calendar/render?${query.toString()}`;
  }

  private buildCredenciamentoWhatsAppUrl(): string {
    const phoneDigits = "551152970742";
    return `https://wa.me/${phoneDigits}?text=${encodeURIComponent("Continuar Credenciamento")}`;
  }

  private buildAppointmentWelcomeHtml(p: {
    leadName: string;
    eventName: string;
    eventLocation: string | null;
    scheduledAt: Date;
    timezone: string;
    vendorName: string | null;
    vendorAvatarUrl: string | null;
    clientName: string;
    checkinToken?: string | null;
  }): string {
    const firstName = p.leadName.split(" ")[0];
    const vendorFirstName = p.vendorName?.split(" ")[0] ?? null;
    const location = p.eventLocation?.trim() || "Local a confirmar";

    const dateLabel = new Intl.DateTimeFormat("pt-BR", {
      timeZone: p.timezone || "America/Sao_Paulo",
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(p.scheduledAt);
    const timeLabel = new Intl.DateTimeFormat("pt-BR", {
      timeZone: p.timezone || "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
    }).format(p.scheduledAt);

    const calendarUrl = this.buildGoogleCalendarUrl({
      title: p.eventName,
      details: vendorFirstName
        ? `Seu horário no ${p.eventName}. ${vendorFirstName} vai te aguardar por lá!`
        : `Seu horário no ${p.eventName}.`,
      location,
      start: p.scheduledAt,
    });

    const whatsappUrl = this.buildCredenciamentoWhatsAppUrl();
    const vendorAvatarUrl = this.toAbsoluteMediaUrl(p.vendorAvatarUrl);
    const vendorInitials = (vendorFirstName ?? "?").slice(0, 2).toUpperCase();

    const logoBlock = `<img src="${this.platformLogoUrl}" alt="PainelGRID" width="64" height="64" style="width:64px;height:64px;border-radius:14px;object-fit:cover;display:inline-block;" />`;

    const vendorAvatarBlock = vendorAvatarUrl
      ? `<img src="${vendorAvatarUrl}" alt="${p.vendorName}" style="width:56px;height:56px;border-radius:50%;object-fit:cover;display:block;" />`
      : `<div style="width:56px;height:56px;border-radius:50%;background:#f0f0f3;color:#888;font-weight:800;font-size:18px;display:flex;align-items:center;justify-content:center;">${vendorInitials}</div>`;

    const vendorBlock = p.vendorName
      ? `
        <table role="presentation" style="width:100%;margin-top:24px;border:1.5px solid #e8e8ed;border-radius:14px;">
          <tr>
            <td style="padding:18px 20px;">
              <table role="presentation"><tr>
                <td style="width:56px;">${vendorAvatarBlock}</td>
                <td style="padding-left:14px;">
                  <p style="margin:0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#888;">Seu vendedor</p>
                  <p style="margin:2px 0 0;font-size:15px;font-weight:700;color:#111;">${p.vendorName}</p>
                  <p style="margin:2px 0 0;font-size:13px;color:#555;">vai te aguardar pessoalmente no evento 🤝</p>
                </td>
              </tr></table>
            </td>
          </tr>
        </table>`
      : "";

    const checkinToken =
      p.checkinToken?.trim() ||
      `CHK-${firstName.toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const checkinUrl = `${this.frontendUrl.replace(/\/+$/, "")}/recepcao/checkin?v=${encodeURIComponent(checkinToken)}`;
    const qrCodeApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(checkinUrl)}`;

    const qrCodeBlock = `
        <div style="background:#ffffff; border:2px dashed #FF0636; border-radius:18px; padding:24px 20px; margin:24px 0; text-align:center;">
          <p style="font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:1px; color:#FF0636; margin:0 0 12px 0;">
            🎟️ SEU QR CODE DE CREDENCIAMENTO RÁPIDO
          </p>
          <img src="${qrCodeApiUrl}" alt="QR Code Check-in" width="200" height="200" style="border-radius:12px; border:1px solid #eee; display:block; margin:0 auto 12px; max-width:200px;" />
          <p style="font-size:14px; font-weight:700; color:#111; font-family:monospace; margin:0 0 4px 0;">
            Código: ${checkinToken}
          </p>
          <p style="font-size:12px; color:#666; margin:0;">
            Apresente este QR Code na recepção para credenciamento imediato!
          </p>
        </div>`;

    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bem-vindo ao ${p.eventName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #f4f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .wrapper { max-width: 560px; margin: 40px auto; }
    .card { background: #fff; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,.08); }
    .header { background: #FF0636; padding: 30px 40px; text-align: center; }
    .header p { color: rgba(255,255,255,.8); font-size: 13px; margin-top: 8px; font-weight: 600; letter-spacing: .02em; }
    .body { padding: 36px 40px; }
    .body h2 { font-size: 19px; font-weight: 700; color: #111; }
    .body > p.lead { color: #555; font-size: 14px; line-height: 1.6; margin-top: 8px; }
    .details { background: #f8f8fa; border: 1.5px solid #e8e8ed; border-radius: 14px; padding: 20px 24px; margin: 24px 0 0; }
    .details-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #ececec; }
    .details-row:last-child { border-bottom: none; padding-bottom: 0; }
    .details-label { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: #888; }
    .details-value { font-size: 14px; font-weight: 600; color: #111; text-align: right; }
    .cta { text-align: center; margin: 16px 0 8px; }
    .cta a { display: inline-block; background: #111; color: #fff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 13px 28px; border-radius: 12px; letter-spacing: -.1px; }
    .cta-whatsapp { text-align: center; margin: 28px 0 8px; }
    .cta-whatsapp a { display: inline-block; background: #25D366; color: #fff; text-decoration: none; font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 12px; letter-spacing: -.1px; }
    .footer { padding: 20px 40px; text-align: center; font-size: 12px; color: #aaa; line-height: 1.7; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        ${logoBlock}
        <p>Bem-vindo(a) ao ${p.eventName}</p>
      </div>
      <div class="body">
        <h2>Olá, ${firstName}! 🏁</h2>
        <p class="lead">
          Recebemos sua pré-agenda e já reservamos seu horário. Confira os detalhes
          abaixo e apresente seu QR Code na recepção para entrada rápida.
        </p>

        ${qrCodeBlock}

        <div class="details">
          <div class="details-row">
            <span class="details-label">Evento</span>
            <span class="details-value">${p.eventName}</span>
          </div>
          <div class="details-row">
            <span class="details-label">Data</span>
            <span class="details-value">${dateLabel}</span>
          </div>
          <div class="details-row">
            <span class="details-label">Horário</span>
            <span class="details-value">${timeLabel}</span>
          </div>
          <div class="details-row">
            <span class="details-label">Local</span>
            <span class="details-value">${location}</span>
          </div>
        </div>

        ${vendorBlock}

        <div class="cta-whatsapp">
          <a href="${whatsappUrl}">💬 Continuar Credenciamento</a>
        </div>
        <div class="cta">
          <a href="${calendarUrl}">📅 Adicionar ao Google Agenda</a>
        </div>
      </div>
      <div class="footer">
        <p>Você está recebendo este e-mail porque um horário foi reservado em seu nome.</p>
        <p>${p.clientName}</p>
      </div>
    </div>
  </div>
</body>
</html>`;
  }

  async sendTwoFactorCode(params: {
    to: string;
    name: string;
    code: string;
  }): Promise<void> {
    const { to, name, code } = params;
    const subject = `Código de Verificação PainelGRID: ${code}`;
    const html = this.buildTwoFactorHtml({ name, code });

    if (!this.apiKey) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("Resend nao configurado");
      }
      this.logger.warn(
        "Email 2FA nao enviado em desenvolvimento: Resend nao configurado",
      );
      return;
    }

    try {
      await this.sendViaResend({ to, subject, html });
      this.logger.log("Email de 2FA enviado");
    } catch (err) {
      this.logger.error(`Falha ao enviar email 2FA: ${(err as Error).message}`);
      throw err;
    }
  }

  private buildTwoFactorHtml(p: { name: string; code: string }) {
    const firstName = p.name.split(" ")[0];
    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Código de Autenticação — PainelGRID</title>
</head>
<body style="background:#f4f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:40px 10px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:20px;padding:36px;box-shadow:0 4px 24px rgba(0,0,0,.08);text-align:center;">
    <h1 style="color:#FF0636;font-size:24px;font-weight:800;margin:0 0 12px;">PainelGRID</h1>
    <h2 style="font-size:18px;color:#111;margin:0 0 16px;">Código de Verificação de 2 Fatores</h2>
    <p style="color:#555;font-size:14px;line-height:1.5;margin-bottom:24px;">
      Olá ${firstName}, use o código de 6 dígitos abaixo para confirmar seu login no PainelGRID. Este código expira em 10 minutos.
    </p>
    <div style="background:#f8f8fa;border:2px dashed #FF0636;border-radius:14px;padding:18px 24px;display:inline-block;margin-bottom:24px;">
      <span style="font-size:32px;font-weight:900;letter-spacing:10px;color:#FF0636;font-family:monospace;">${p.code}</span>
    </div>
    <p style="color:#888;font-size:12px;margin:0;">Se você não solicitou este acesso, por favor ignore este e-mail.</p>
  </div>
</body>
</html>`;
  }
}
