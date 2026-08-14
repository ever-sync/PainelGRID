import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";
import { createHash, timingSafeEqual } from "crypto";
import { PrismaService } from "../../config/prisma.service";
import type { IntegrationRequest } from "./integration-request";

const HEADER = "x-leadflow-integration-key";
const CREDENTIAL_CACHE_TTL_MS = 60_000;

type CredentialScope = {
  clientId: string;
  allowedClientIds: string[];
};

@Injectable()
export class IntegrationKeyGuard implements CanActivate {
  private readonly credentialScopeCache = new Map<
    string,
    CredentialScope & { validUntil: number }
  >();

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<IntegrationRequest>();
    const provided = String(req.headers[HEADER] ?? "").trim();
    if (!provided) {
      throw new UnauthorizedException("Chave de integracao invalida");
    }

    const credentialScope = await this.findCredentialScope(provided);
    if (credentialScope) {
      await this.assertClientScope(
        req,
        credentialScope.clientId,
        credentialScope.allowedClientIds,
      );
      req.integrationClientId =
        this.explicitClientId(req) ?? credentialScope.clientId;
      return true;
    }

    const legacyKey = this.config
      .get<string>("LEADFLOW_INTEGRATION_API_KEY")
      ?.trim();
    const nodeEnv = (
      this.config.get<string>("NODE_ENV") ?? "development"
    ).toLowerCase();
    const legacyFlag = this.config
      .get<string>("ALLOW_LEGACY_INTEGRATION_KEY")
      ?.trim()
      .toLowerCase();
    const legacyEnabled =
      nodeEnv !== "production" || legacyFlag === "true" || legacyFlag === "1";
    const legacyClientId = this.config
      .get<string>("LEADFLOW_INTEGRATION_CLIENT_ID")
      ?.trim();
    if (!legacyEnabled || !legacyKey || !this.safeEqual(provided, legacyKey)) {
      throw new UnauthorizedException("Chave de integracao invalida");
    }
    if (legacyClientId) {
      await this.assertClientScope(req, legacyClientId);
      req.integrationClientId = legacyClientId;
    }

    return true;
  }

  private async findCredentialScope(
    provided: string,
  ): Promise<CredentialScope | null> {
    if (!this.prisma?.integrationCredential) {
      return null;
    }
    const keyHash = createHash("sha256").update(provided, "utf8").digest("hex");
    const cached = this.credentialScopeCache.get(keyHash);
    if (cached && cached.validUntil > Date.now()) {
      return {
        clientId: cached.clientId,
        allowedClientIds: cached.allowedClientIds,
      };
    }
    if (cached) this.credentialScopeCache.delete(keyHash);

    const credential = await this.prisma.integrationCredential.findUnique({
      where: { key_hash: keyHash },
      select: {
        id: true,
        client_id: true,
        allowed_client_ids: true,
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
    const scope = {
      clientId: credential.client_id,
      allowedClientIds: credential.allowed_client_ids ?? [],
    };
    this.credentialScopeCache.set(keyHash, {
      ...scope,
      validUntil: Math.min(
        Date.now() + CREDENTIAL_CACHE_TTL_MS,
        credential.expires_at?.getTime() ?? Number.POSITIVE_INFINITY,
      ),
    });
    return scope;
  }

  private safeEqual(provided: string, expected: string): boolean {
    const left = Buffer.from(provided, "utf8");
    const right = Buffer.from(expected, "utf8");
    return left.length === right.length && timingSafeEqual(left, right);
  }

  private async assertClientScope(
    req: Request,
    clientId: string,
    allowedClientIds: string[] = [],
  ): Promise<void> {
    const body = this.asRecord(req.body);
    const query = this.asRecord(req.query);
    await this.assertExplicitClientId(
      body.client_id,
      clientId,
      allowedClientIds,
    );
    await this.assertExplicitClientId(
      query.client_id,
      clientId,
      allowedClientIds,
    );

    const path = (req.originalUrl || req.url).split("?")[0];
    const routeId = this.firstRouteParam(req.params);

    if (/\/agent\/appointments\/[^/]+(?:\/|$)/.test(path) && routeId) {
      const appointment = await this.prisma!.appointment.findUnique({
        where: { id: routeId },
        select: { client_id: true },
      });
      await this.assertOwned(appointment?.client_id, clientId);
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

    if (path.endsWith("/agent/appointments") && req.method === "POST") {
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
    await this.assertOwned(lead?.client_id, clientId);
  }

  private async assertConversation(
    id: string,
    clientId: string,
  ): Promise<void> {
    const conversation = await this.prisma!.conversation.findUnique({
      where: { id },
      select: { client_id: true },
    });
    await this.assertOwned(conversation?.client_id, clientId);
  }

  private async assertEvent(
    id: string | undefined,
    clientId: string,
  ): Promise<void> {
    if (!id) {
      return;
    }
    const participants = await this.prisma!.eventParticipant.findMany({
      where: { event_id: id },
      select: { client_id: true },
    });
    for (const participant of participants) {
      if (await this.isClientInScope(participant.client_id, clientId)) {
        return;
      }
    }
    throw new ForbiddenException("Recurso fora do escopo da integracao");
  }

  private async assertExplicitClientId(
    value: unknown,
    clientId: string,
    allowedClientIds: string[] = [],
  ): Promise<void> {
    const supplied = this.stringValue(value);
    if (
      supplied &&
      !allowedClientIds.includes(supplied) &&
      !(await this.isClientInScope(supplied, clientId))
    ) {
      throw new ForbiddenException("Cliente fora do escopo da integracao");
    }
  }

  private explicitClientId(req: Request): string | undefined {
    const body = this.asRecord(req.body);
    const query = this.asRecord(req.query);
    return (
      this.stringValue(body.client_id) ?? this.stringValue(query.client_id)
    );
  }

  private async assertOwned(
    resourceClientId: string | undefined,
    clientId: string,
  ): Promise<void> {
    if (
      !resourceClientId ||
      !(await this.isClientInScope(resourceClientId, clientId))
    ) {
      throw new ForbiddenException("Recurso fora do escopo da integracao");
    }
  }

  /**
   * Uma credencial continua pertencendo a um cliente. O acesso cruzado só é
   * permitido quando origem e destino compartilham explicitamente o mesmo
   * número de WhatsApp conectado. Esse é o vínculo operacional usado pelo
   * Rubinho multicliente e evita transformar a chave em uma credencial global.
   */
  private async isClientInScope(
    targetClientId: string,
    credentialClientId: string,
  ): Promise<boolean> {
    if (targetClientId === credentialClientId) {
      return true;
    }
    const explicitScope = this.prisma?.integrationCredential?.findFirst
      ? await this.prisma.integrationCredential.findFirst({
          where: {
            client_id: credentialClientId,
            allowed_client_ids: { has: targetClientId },
            revoked_at: null,
            OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
          },
          select: { id: true },
        })
      : null;
    if (explicitScope) {
      return true;
    }
    if (!this.prisma?.metaAssetSelection) {
      return false;
    }

    const sourceAssets = await this.prisma.metaAssetSelection.findMany({
      where: {
        phone_number_id: { not: null },
        meta_connection: {
          client_id: credentialClientId,
          status: "connected",
        },
      },
      select: { phone_number_id: true },
    });
    const sharedPhoneIds = [
      ...new Set(
        sourceAssets
          .map((asset) => asset.phone_number_id)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    if (sharedPhoneIds.length === 0) {
      return false;
    }

    const targetAsset = await this.prisma.metaAssetSelection.findFirst({
      where: {
        phone_number_id: { in: sharedPhoneIds },
        meta_connection: {
          client_id: targetClientId,
          status: "connected",
        },
      },
      select: { id: true },
    });
    return Boolean(targetAsset);
  }

  private firstRouteParam(params: Request["params"]): string | undefined {
    const record = this.asRecord(params);
    return this.stringValue(record.id);
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  }

  private stringValue(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }
}
