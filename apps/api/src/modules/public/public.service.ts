import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventStatus } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { verifyCheckinVoucher } from '../../common/checkin-voucher.util';
import { encryptCheckinToken } from '../../common/utils/crypto.util';
import type { SubmitRatingDto } from './dto/submit-rating.dto';
import type { SubmitVendorSignupDto } from './dto/submit-vendor-signup.dto';
import { UsersService } from '../users/users.service';

const PREVIEW_WINDOW_MS = 60_000;
const PREVIEW_MAX_PER_WINDOW = 48;

/** Envio de avaliacao (escrita): janela mais curta que a preview, so-leitura. */
const RATING_SUBMIT_WINDOW_MS = 60_000;
const RATING_SUBMIT_MAX_PER_WINDOW = 5;
/** Evita que o mesmo IP reavalie o mesmo vendedor em sequencia. */
const RATING_SUBMIT_COOLDOWN_MS = 6 * 60 * 60_000;

/** Auto-cadastro de vendedor: mais restritivo que avaliacao (cria linha em users). */
const SIGNUP_SUBMIT_WINDOW_MS = 60_000;
const SIGNUP_SUBMIT_MAX_PER_WINDOW = 3;
const SIGNUP_SUBMIT_COOLDOWN_MS = 60 * 60_000;

@Injectable()
export class PublicService {
  private readonly previewHitsByKey = new Map<string, number[]>();
  private readonly ratingSubmitHitsByKey = new Map<string, number[]>();
  private readonly ratingSubmitCooldownByTokenAndIp = new Map<string, number>();
  private readonly signupSubmitHitsByKey = new Map<string, number[]>();
  private readonly signupCooldownByTokenAndIp = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  private voucherSecret(): string {
    const dedicated = this.config.get<string>('LEADFLOW_CHECKIN_VOUCHER_SECRET')?.trim();
    if (dedicated) {
      return dedicated;
    }
    return this.config.get<string>('JWT_SECRET', 'leadflow_access_secret');
  }

  private assertPreviewRateLimit(clientKey: string) {
    const now = Date.now();
    const since = now - PREVIEW_WINDOW_MS;
    const hits = (this.previewHitsByKey.get(clientKey) ?? []).filter((t) => t > since);
    if (hits.length >= PREVIEW_MAX_PER_WINDOW) {
      throw new HttpException(
        'Muitas consultas. Aguarde cerca de um minuto.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    hits.push(now);
    this.previewHitsByKey.set(clientKey, hits);
  }

  async checkInPreview(voucherJwt: string, clientKey: string) {
    this.assertPreviewRateLimit(clientKey || 'unknown');

    const claims = verifyCheckinVoucher(this.voucherSecret(), voucherJwt);
    if (!claims) {
      throw new NotFoundException('Convite invalido ou expirado');
    }

    const encryptedToken = encryptCheckinToken(claims.t, this.voucherSecret());

    const lead = await this.prisma.lead.findFirst({
      where: {
        id: claims.lid,
        client_id: claims.cid,
        checkin_token: { in: [claims.t, encryptedToken] },
        deleted_at: null,
      },
      select: {
        name: true,
        client: { select: { company_name: true } },
        event_interest: { select: { name: true } },
      },
    });

    if (!lead) {
      throw new NotFoundException('Convite invalido ou expirado');
    }

    const first = lead.name.trim().split(/\s+/)[0] ?? lead.name;

    return {
      lead_first_name: first,
      company_name: lead.client.company_name,
      event_name: lead.event_interest?.name ?? null,
    };
  }

  private assertRatingSubmitRateLimit(clientKey: string) {
    const now = Date.now();
    const since = now - RATING_SUBMIT_WINDOW_MS;
    const hits = (this.ratingSubmitHitsByKey.get(clientKey) ?? []).filter((t) => t > since);
    if (hits.length >= RATING_SUBMIT_MAX_PER_WINDOW) {
      throw new HttpException(
        'Muitas tentativas. Aguarde um instante e tente novamente.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    hits.push(now);
    this.ratingSubmitHitsByKey.set(clientKey, hits);
  }

  private assertRatingSubmitCooldown(token: string, clientKey: string) {
    const key = `${token}:${clientKey}`;
    const last = this.ratingSubmitCooldownByTokenAndIp.get(key);
    if (last != null && Date.now() - last < RATING_SUBMIT_COOLDOWN_MS) {
      throw new HttpException(
        'Voce ja avaliou este vendedor recentemente. Obrigado pelo feedback!',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.ratingSubmitCooldownByTokenAndIp.set(key, Date.now());
  }

  private assertSignupSubmitRateLimit(clientKey: string) {
    const now = Date.now();
    const since = now - SIGNUP_SUBMIT_WINDOW_MS;
    const hits = (this.signupSubmitHitsByKey.get(clientKey) ?? []).filter(
      (t) => t > since,
    );
    if (hits.length >= SIGNUP_SUBMIT_MAX_PER_WINDOW) {
      throw new HttpException(
        'Muitas tentativas. Aguarde cerca de um minuto.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    hits.push(now);
    this.signupSubmitHitsByKey.set(clientKey, hits);
  }

  private assertSignupCooldown(token: string, clientKey: string) {
    const key = `${token}:${clientKey}`;
    const last = this.signupCooldownByTokenAndIp.get(key);
    if (last != null && Date.now() - last < SIGNUP_SUBMIT_COOLDOWN_MS) {
      throw new HttpException(
        'Ja recebemos um cadastro deste dispositivo ha pouco. Aguarde um pouco.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.signupCooldownByTokenAndIp.set(key, Date.now());
  }

  /** Resolve o cliente pelo token do link. 404 generico: nao revela se o token existe. */
  private async findClientBySignupToken(token: string) {
    const client = await this.prisma.client.findUnique({
      where: { vendor_signup_token: token },
      select: { id: true, company_name: true, logo_url: true },
    });

    if (!client) {
      throw new NotFoundException('Link de cadastro invalido');
    }

    return client;
  }

  /** Preview do formulario publico: so o necessario para a pessoa se situar. */
  async vendorSignupTarget(token: string, clientKey: string) {
    this.assertPreviewRateLimit(clientKey || 'unknown');
    const client = await this.findClientBySignupToken(token);
    return {
      company_name: client.company_name,
      logo_url: client.logo_url,
    };
  }

  async submitVendorSignup(
    token: string,
    dto: SubmitVendorSignupDto,
    clientKey: string,
  ) {
    const key = clientKey || 'unknown';
    this.assertSignupSubmitRateLimit(key);
    this.assertSignupCooldown(token, key);

    const client = await this.findClientBySignupToken(token);
    await this.usersService.createSelfSignupVendor(client.id, dto);

    return {
      received: true,
      message:
        'Cadastro enviado! Voce recebera um e-mail assim que a empresa aprovar.',
    };
  }

  private async findVendorByRatingToken(token: string) {
    const vendor = await this.prisma.user.findUnique({
      where: { rating_token: token },
      select: {
        id: true,
        name: true,
        is_active: true,
        client_id: true,
        client: { select: { company_name: true } },
      },
    });

    if (!vendor || !vendor.is_active) {
      throw new NotFoundException('Link de avaliacao invalido');
    }

    return vendor;
  }

  /** Evento ativo mais recente do cliente; se nao houver, cai no evento mais recente. */
  private async resolveActiveEventId(clientId: string): Promise<string | null> {
    const active = await this.prisma.event.findFirst({
      where: { client_id: clientId, status: EventStatus.active },
      orderBy: { event_date: 'desc' },
      select: { id: true },
    });
    if (active) {
      return active.id;
    }

    const latest = await this.prisma.event.findFirst({
      where: { client_id: clientId },
      orderBy: { event_date: 'desc' },
      select: { id: true },
    });
    return latest?.id ?? null;
  }

  async ratingTarget(token: string, clientKey: string) {
    this.assertPreviewRateLimit(clientKey || 'unknown');
    const vendor = await this.findVendorByRatingToken(token);

    return {
      vendor_name: vendor.name,
      company_name: vendor.client?.company_name ?? null,
    };
  }

  async submitRating(token: string, dto: SubmitRatingDto, clientKey: string) {
    const key = clientKey || 'unknown';
    this.assertRatingSubmitRateLimit(key);
    this.assertRatingSubmitCooldown(token, key);

    const vendor = await this.findVendorByRatingToken(token);
    const eventId = vendor.client_id ? await this.resolveActiveEventId(vendor.client_id) : null;

    await this.prisma.serviceRating.create({
      data: {
        vendor_id: vendor.id,
        score: dto.score,
        comment: dto.comment?.trim() || null,
        customer_name: dto.customer_name?.trim() || null,
        event_id: eventId,
      },
    });

    return { message: 'Avaliacao enviada com sucesso' };
  }
}
