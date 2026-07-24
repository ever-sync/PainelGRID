import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { createHash, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../config/prisma.service';

const HEADER = 'x-leadflow-integration-key';

@Injectable()
export class IntegrationKeyGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const provided = String(req.headers[HEADER] ?? '').trim();
    if (!provided) {
      throw new UnauthorizedException('Chave de integracao invalida');
    }

    const credentialClientId = await this.findCredentialClientId(provided);
    if (credentialClientId) {
      await this.assertClientScope(req, credentialClientId);
      return true;
    }

    const legacyKey = this.config
      .get<string>('LEADFLOW_INTEGRATION_API_KEY')
      ?.trim();
    const nodeEnv = (
      this.config.get<string>('NODE_ENV') ?? 'development'
    ).toLowerCase();
    const legacyFlag = this.config
      .get<string>('ALLOW_LEGACY_INTEGRATION_KEY')
      ?.trim()
      .toLowerCase();
    const legacyEnabled =
      nodeEnv !== 'production' || legacyFlag === 'true' || legacyFlag === '1';
    const legacyClientId = this.config
      .get<string>('LEADFLOW_INTEGRATION_CLIENT_ID')
      ?.trim();
    if (
      !legacyEnabled ||
      !legacyKey ||
      !this.safeEqual(provided, legacyKey)
    ) {
      throw new UnauthorizedException('Chave de integracao invalida');
    }
    if (legacyClientId) {
      await this.assertClientScope(req, legacyClientId);
    }

    return true;
  }

  private async findCredentialClientId(provided: string): Promise<string | null> {
    if (!this.prisma?.integrationCredential) {
      return null;
    }
    const keyHash = createHash('sha256').update(provided, 'utf8').digest('hex');
    const credential = await this.prisma.integrationCredential.findUnique({
      where: { key_hash: keyHash },
      select: {
        id: true,
        client_id: true,
        expires_at: true,
        revoked_at: true,
        last_used_at: true,
      },
    });
    if (
      !credential ||
      credential.revoked_at ||
      (credential.expires_at && credential.expires_at.getTime() <= Date.now())
    ) {
      return null;
    }

    if (
      !credential.last_used_at ||
      credential.last_used_at.getTime() < Date.now() - 5 * 60_000
    ) {
      await this.prisma.integrationCredential
        .update({
          where: { id: credential.id },
          data: { last_used_at: new Date() },
        })
        .catch(() => undefined);
    }
    return credential.client_id;
  }

  private safeEqual(provided: string, expected: string): boolean {
    const left = Buffer.from(provided, 'utf8');
    const right = Buffer.from(expected, 'utf8');
    return left.length === right.length && timingSafeEqual(left, right);
  }

  private async assertClientScope(
    req: Request,
    clientId: string,
  ): Promise<void> {
    const body = this.asRecord(req.body);
    const query = this.asRecord(req.query);
    this.assertExplicitClientId(body.client_id, clientId);
    this.assertExplicitClientId(query.client_id, clientId);

    const path = (req.originalUrl || req.url).split('?')[0];
    const routeId = this.firstRouteParam(req.params);

    if (/\/agent\/appointments\/[^/]+(?:\/|$)/.test(path) && routeId) {
      const appointment = await this.prisma!.appointment.findUnique({
        where: { id: routeId },
        select: { client_id: true },
      });
      this.assertOwned(appointment?.client_id, clientId);
    } else if (/\/agent\/conversations\/[^/]+(?:\/|$)/.test(path) && routeId) {
      await this.assertConversation(routeId, clientId);
    } else if (
      /\/integrations\/v1\/leads\/[^/]+(?:\/|$)/.test(path) &&
      routeId
    ) {
      await this.assertLead(routeId, clientId);
    } else if (
      /\/integrations\/v1\/events\/[^/]+(?:\/|$)/.test(path) &&
      routeId
    ) {
      await this.assertEvent(routeId, clientId);
    }

    if (path.endsWith('/agent/appointments') && req.method === 'POST') {
      await this.assertLead(this.stringValue(body.lead_id), clientId);
      await this.assertEvent(this.stringValue(body.event_id), clientId);
      const conversationId = this.stringValue(body.conversation_id);
      if (conversationId) {
        await this.assertConversation(conversationId, clientId);
      }
    }

    const leadId = this.stringValue(query.lead_id);
    const conversationId = this.stringValue(query.conversation_id);
    const eventId = this.stringValue(query.event_id);
    if (leadId) {
      await this.assertLead(leadId, clientId);
    }
    if (conversationId) {
      await this.assertConversation(conversationId, clientId);
    }
    if (eventId) {
      await this.assertEvent(eventId, clientId);
    }
  }

  private async assertLead(
    id: string | undefined,
    clientId: string,
  ): Promise<void> {
    if (!id) {
      return;
    }
    const lead = await this.prisma!.lead.findUnique({
      where: { id },
      select: { client_id: true },
    });
    this.assertOwned(lead?.client_id, clientId);
  }

  private async assertConversation(
    id: string,
    clientId: string,
  ): Promise<void> {
    const conversation = await this.prisma!.conversation.findUnique({
      where: { id },
      select: { client_id: true },
    });
    this.assertOwned(conversation?.client_id, clientId);
  }

  private async assertEvent(
    id: string | undefined,
    clientId: string,
  ): Promise<void> {
    if (!id) {
      return;
    }
    const participant = await this.prisma!.eventParticipant.findFirst({
      where: { event_id: id, client_id: clientId },
      select: { id: true },
    });
    if (!participant) {
      throw new ForbiddenException('Recurso fora do escopo da integracao');
    }
  }

  private assertExplicitClientId(value: unknown, clientId: string): void {
    const supplied = this.stringValue(value);
    if (supplied && supplied !== clientId) {
      throw new ForbiddenException('Cliente fora do escopo da integracao');
    }
  }

  private assertOwned(
    resourceClientId: string | undefined,
    clientId: string,
  ): void {
    if (!resourceClientId || resourceClientId !== clientId) {
      throw new ForbiddenException('Recurso fora do escopo da integracao');
    }
  }

  private firstRouteParam(params: Request['params']): string | undefined {
    const record = this.asRecord(params);
    return this.stringValue(record.id);
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  }

  private stringValue(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }
}
