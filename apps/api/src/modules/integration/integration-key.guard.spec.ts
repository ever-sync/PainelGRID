import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";
import { PrismaService } from "../../config/prisma.service";
import { IntegrationKeyGuard } from "./integration-key.guard";

const apiKey = "integration-secret-with-32-characters";
const clientId = "11111111-1111-4111-8111-111111111111";
const otherClientId = "22222222-2222-4222-8222-222222222222";

function contextFor(request: Partial<Request>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

function createGuard(
  prisma: Partial<PrismaService> = {},
  overrides: Record<string, string | undefined> = {},
) {
  const config = {
    get: (key: string) =>
      ({
        LEADFLOW_INTEGRATION_API_KEY: apiKey,
        LEADFLOW_INTEGRATION_CLIENT_ID: clientId,
        ...overrides,
      })[key],
  } as ConfigService;

  return new IntegrationKeyGuard(config, prisma as PrismaService);
}

describe("IntegrationKeyGuard tenant scope", () => {
  it("bloqueia client_id explícito de outro cliente", async () => {
    const guard = createGuard();
    const request = {
      headers: { "x-leadflow-integration-key": apiKey },
      body: { client_id: otherClientId },
      query: {},
      params: {},
      originalUrl: "/api/integrations/v1/leads",
      method: "POST",
    } as Partial<Request>;

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("permite client_id de outro cliente quando ambos compartilham o WhatsApp conectado", async () => {
    const prisma = {
      metaAssetSelection: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ phone_number_id: "shared-rubinho-phone" }]),
        findFirst: jest.fn().mockResolvedValue({ id: "target-phone-asset" }),
      },
    };
    const guard = createGuard(prisma as unknown as Partial<PrismaService>);
    const request = {
      headers: { "x-leadflow-integration-key": apiKey },
      body: {},
      query: { client_id: otherClientId },
      params: {},
      originalUrl: "/api/integrations/v1/leads",
      method: "GET",
    } as Partial<Request>;

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(prisma.metaAssetSelection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          meta_connection: expect.objectContaining({ client_id: clientId }),
        }),
      }),
    );
    expect(prisma.metaAssetSelection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          phone_number_id: { in: ["shared-rubinho-phone"] },
          meta_connection: expect.objectContaining({
            client_id: otherClientId,
          }),
        }),
      }),
    );
  });

  it("bloqueia operação por ID quando o lead pertence a outro cliente", async () => {
    const prisma = {
      lead: {
        findUnique: jest.fn().mockResolvedValue({ client_id: otherClientId }),
      },
    };
    const guard = createGuard(prisma as unknown as Partial<PrismaService>);
    const request = {
      headers: { "x-leadflow-integration-key": apiKey },
      body: {},
      query: {},
      params: { id: "33333333-3333-4333-8333-333333333333" },
      originalUrl:
        "/api/integrations/v1/leads/33333333-3333-4333-8333-333333333333",
      method: "PATCH",
    } as Partial<Request>;

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("permite operação por ID quando o recurso pertence ao cliente da chave", async () => {
    const prisma = {
      lead: {
        findUnique: jest.fn().mockResolvedValue({ client_id: clientId }),
      },
    };
    const guard = createGuard(prisma as unknown as Partial<PrismaService>);
    const request = {
      headers: { "x-leadflow-integration-key": apiKey },
      body: {},
      query: {},
      params: { id: "33333333-3333-4333-8333-333333333333" },
      originalUrl:
        "/api/integrations/v1/leads/33333333-3333-4333-8333-333333333333",
      method: "PATCH",
    } as Partial<Request>;

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
  });

  it("autentica uma credencial ativa armazenada como hash", async () => {
    const databaseKey = "lfi_database-secret-not-present-in-environment";
    const prisma = {
      integrationCredential: {
        findUnique: jest.fn().mockResolvedValue({
          id: "credential-1",
          client_id: clientId,
          expires_at: null,
          revoked_at: null,
          last_used_at: new Date(),
        }),
        update: jest.fn(),
      },
    };
    const guard = createGuard(prisma as unknown as Partial<PrismaService>);
    const request = {
      headers: { "x-leadflow-integration-key": databaseKey },
      body: { client_id: clientId },
      query: {},
      params: {},
      originalUrl: "/api/integrations/v1/leads",
      method: "POST",
    } as Partial<Request>;

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(
      (request as Partial<Request> & { integrationClientId?: string })
        .integrationClientId,
    ).toBe(clientId);
    expect(prisma.integrationCredential.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key_hash: expect.stringMatching(/^[a-f0-9]{64}$/) },
      }),
    );
  });

  it("permite cliente adicional explicitamente autorizado pela credencial", async () => {
    const databaseKey = "lfi_database-secret-with-client-scope";
    const prisma = {
      integrationCredential: {
        findUnique: jest.fn().mockResolvedValue({
          id: "credential-1",
          client_id: clientId,
          allowed_client_ids: [otherClientId],
          expires_at: null,
          revoked_at: null,
          last_used_at: new Date(),
        }),
        update: jest.fn(),
      },
    };
    const guard = createGuard(prisma as unknown as Partial<PrismaService>);
    const request = {
      headers: { "x-leadflow-integration-key": databaseKey },
      body: {},
      query: { client_id: otherClientId },
      params: {},
      originalUrl: "/api/integrations/v1/leads",
      method: "GET",
    } as Partial<Request>;

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(
      (request as Partial<Request> & { integrationClientId?: string })
        .integrationClientId,
    ).toBe(otherClientId);
  });

  it("rejeita credencial revogada", async () => {
    const prisma = {
      integrationCredential: {
        findUnique: jest.fn().mockResolvedValue({
          id: "credential-1",
          client_id: clientId,
          expires_at: null,
          revoked_at: new Date(),
          last_used_at: null,
        }),
      },
    };
    const guard = createGuard(prisma as unknown as Partial<PrismaService>);
    const request = {
      headers: { "x-leadflow-integration-key": "lfi_revoked-key" },
      body: {},
      query: {},
      params: {},
      originalUrl: "/api/integrations/v1/leads",
      method: "GET",
    } as Partial<Request>;

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("nao aceita chave global em producao sem opt-in de migracao", async () => {
    const guard = createGuard({}, { NODE_ENV: "production" });
    const request = {
      headers: { "x-leadflow-integration-key": apiKey },
      body: {},
      query: {},
      params: {},
      originalUrl: "/api/integrations/v1/leads",
      method: "GET",
    } as Partial<Request>;

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
