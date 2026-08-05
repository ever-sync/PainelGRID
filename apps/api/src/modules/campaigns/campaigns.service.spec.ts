import { ForbiddenException } from "@nestjs/common";
import { Role } from "../../common/types";
import { CampaignsService } from "./campaigns.service";

describe("CampaignsService", () => {
  const clientId = "22222222-2222-4222-8222-222222222222";

  let prisma: any;
  let clientsService: any;
  let service: CampaignsService;

  beforeEach(() => {
    prisma = {
      campaign: {
        findMany: jest.fn(),
      },
    };

    clientsService = {
      assertGestorOwnsClient: jest.fn(),
    };

    service = new CampaignsService(prisma, clientsService);
  });

  it("permite gestor com vínculo ao cliente e retorna campanhas mapeadas", async () => {
    clientsService.assertGestorOwnsClient.mockResolvedValue(undefined);
    prisma.campaign.findMany.mockResolvedValue([
      {
        id: "campaign-1",
        client_id: clientId,
        name: "Campanha A",
        lead_filter_rules: { state: "SP" },
        distribution_method: "ROUND_ROBIN",
        status: "ACTIVE",
        created_at: new Date("2026-05-01T00:00:00Z"),
        updated_at: new Date("2026-05-02T00:00:00Z"),
        _count: { leads: 12 },
        vendors: [
          {
            vendor_id: "vendor-1",
            vendor: {
              id: "vendor-1",
              name: "Vendedor 1",
              email: "v1@teste.com",
            },
          },
        ],
      },
    ]);

    const result = await service.findAll(
      {
        sub: "gestor-1",
        role: Role.GESTOR,
        email: "g@teste.com",
        name: "Gestor",
      },
      { client_id: clientId },
    );

    expect(clientsService.assertGestorOwnsClient).toHaveBeenCalledWith(
      "gestor-1",
      clientId,
    );
    expect(prisma.campaign.findMany).toHaveBeenCalled();
    expect(result).toEqual([
      expect.objectContaining({
        id: "campaign-1",
        client_id: clientId,
        _count: { leads: 12 },
        vendors: [
          {
            vendor_id: "vendor-1",
            vendor: {
              id: "vendor-1",
              name: "Vendedor 1",
              email: "v1@teste.com",
            },
          },
        ],
      }),
    ]);
  });

  it("bloqueia cliente quando client_id do token diverge da query", async () => {
    await expect(
      service.findAll(
        {
          sub: "cliente-1",
          role: Role.CLIENTE,
          email: "c@teste.com",
          name: "Cliente",
          client_id: "outro",
        },
        { client_id: clientId },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("permite vendedor quando client_id do token confere", async () => {
    prisma.campaign.findMany.mockResolvedValue([]);

    const result = await service.findAll(
      {
        sub: "vend-1",
        role: Role.VENDEDOR,
        email: "v@teste.com",
        name: "Vendedor",
        client_id: clientId,
      },
      { client_id: clientId },
    );

    expect(result).toEqual([]);
  });

  it("bloqueia perfil sem permissão", async () => {
    await expect(
      service.findAll(
        {
          sub: "admin-1",
          role: "admin" as Role,
          email: "a@teste.com",
          name: "Admin",
        },
        { client_id: clientId },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
