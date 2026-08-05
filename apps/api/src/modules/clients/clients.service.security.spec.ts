import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { Role } from "../../common/types";
import type { RedisService } from "../../config/redis.service";
import type { PrismaService } from "../../config/prisma.service";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ClientsService } from "./clients.service";

describe("ClientsService security", () => {
  const prisma = {
    client: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const redis = {
    client: {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    },
  };
  const service = new ClientsService(
    prisma as unknown as PrismaService,
    redis as unknown as RedisService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    { plan: "premium" },
    { is_active: false },
    { webhook_url_n8n: "https://hooks.example.com" },
    { crm_stage_status_rules: [] },
  ])("impede cliente de alterar campo administrativo: %o", async (dto) => {
    const user: AuthenticatedUser = {
      sub: "user-1",
      email: "cliente@example.com",
      name: "Cliente",
      role: Role.CLIENTE,
      client_id: "client-1",
    };

    await expect(
      service.updateForUser(user, "client-1", dto),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.client.update).not.toHaveBeenCalled();
  });

  it("rejeita webhook apontando para servico de metadata", async () => {
    const user: AuthenticatedUser = {
      sub: "gestor-1",
      email: "gestor@example.com",
      name: "Gestor",
      role: Role.GESTOR,
      client_id: null,
    };
    redis.client.get.mockResolvedValue(null);
    prisma.client.findFirst.mockResolvedValue({
      id: "client-1",
      gestor_id: "gestor-1",
    });
    prisma.client.findUnique.mockResolvedValue({ settings: {} });

    await expect(
      service.updateForUser(user, "client-1", {
        webhook_url_n8n: "https://169.254.169.254/latest/meta-data",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.client.update).not.toHaveBeenCalled();
  });
});
