import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter | null = null;
  private readonly from: string;
  private readonly frontendUrl: string;

  constructor(config: ConfigService) {
    const host = config.get<string>('SMTP_HOST', '');
    const port = Number(config.get<string>('SMTP_PORT', '587'));
    const secure = config.get<string>('SMTP_SECURE', 'false') === 'true';
    const user = config.get<string>('SMTP_USER', '');
    const pass = config.get<string>('SMTP_PASS', '');
    this.from = config.get<string>('SMTP_FROM', 'noreply@painel.grid.com.br');
    this.frontendUrl = config
      .get<string>('FRONTEND_URL', 'http://localhost:8080')
      .split(',')[0]
      .trim();

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
      });
      this.logger.log(
        `SMTP configurado: host=${host} port=${port} secure=${secure} from=${this.from} user=${user} pass=${pass.slice(0, 8)}...`,
      );
    } else {
      this.logger.warn(
        `SMTP NAO configurado — host="${host}" user="${user}" pass="${pass ? '[definida]' : '[vazia]'}"`,
      );
    }
  }

  async sendWelcome(params: { to: string; name: string; password: string }): Promise<void> {
    const { to, name, password } = params;
    const subject = 'Bem-vindo ao PainelGRID — suas credenciais de acesso';
    const html = this.buildWelcomeHtml({ name, email: to, password, loginUrl: this.frontendUrl });

    if (!this.transporter) {
      this.logger.log(
        `[DEV] Email de boas-vindas para ${to} — senha: ${password} — link: ${this.frontendUrl}`,
      );
      return;
    }

    try {
      const info = await this.transporter.sendMail({ from: this.from, to, subject, html });
      this.logger.log(`Email de boas-vindas enviado para ${to} — messageId: ${info.messageId}`);
    } catch (err) {
      this.logger.error(
        `Falha ao enviar email para ${to}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private buildWelcomeHtml(p: { name: string; email: string; password: string; loginUrl: string }) {
    const firstName = p.name.split(' ')[0];
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
}
