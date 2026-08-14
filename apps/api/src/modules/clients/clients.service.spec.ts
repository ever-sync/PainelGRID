import { ConflictException, ForbiddenException } from "@nestjs/common";
import { Role } from "../../common/types";
import { ClientsService } from "./clients.service";

describe("ClientsService", () => {
  const clientId = "33333333-3333-4333-8333-333333333333";
  const gestorId = "gestor-1";

  let prisma: any;
  let redis: any;
  let service: ClientsService;

  beforeEach(() => {
    prisma = {
      client: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    redis = {
      client: {
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
      },
    };

    service = new ClientsService(prisma, redis);
  });

  describe("assertGestorOwnsClient", () => {
    it("cache hit: retorna sem consultar Postgres", async () => {
      const cached = {
        id: clientId,
        gestor_id: gestorId,
        company_name: "Acme",
      };
      redis.client.get.mockResolvedValue(JSON.stringify(cached));

      const result = await service.assertGestorOwnsClient(gestorId, clientId);

      expect(redis.client.get).toHaveBeenCalledWith(
        `clients:access:${clientId}`,
      );
      expect(prisma.client.findFirst).not.toHaveBeenCalled();
      expect(result).toMatchObject({ id: clientId });
    });

    it("cache miss: consulta DB e popula cache", async () => {
      redis.client.get.mockResolvedValue(null);
      prisma.client.findFirst.mockResolvedValue({
        id: clientId,
        gestor_id: gestorId,
      });

      await service.assertGestorOwnsClient(gestorId, clientId);

      // Gestor e papel global: a checagem e de existencia, nao de propriedade.
      expect(prisma.client.findFirst).toHaveBeenCalledWith({
        where: { id: clientId },
      });
      expect(redis.client.set).toHaveBeenCalledWith(
        `clients:access:${clientId}`,
        expect.any(String),
        "EX",
        300,
      );
    });

    it("cliente inexistente: lança ForbiddenException e não cacheia", async () => {
      redis.client.get.mockResolvedValue(null);
      prisma.client.findFirst.mockResolvedValue(null);

      await expect(
        service.assertGestorOwnsClient(gestorId, clientId),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(redis.client.set).not.toHaveBeenCalled();
    });

    it("falha de Redis no get: cai para o DB sem propagar erro", async () => {
      redis.client.get.mockRejectedValue(new Error("redis down"));
      prisma.client.findFirst.mockResolvedValue({
        id: clientId,
        gestor_id: gestorId,
      });

      const result = await service.assertGestorOwnsClient(gestorId, clientId);
      expect(result).toMatchObject({ id: clientId });
    });
  });

  describe("deleteForUser", () => {
    it("remove avaliações dos vendedores antes de excluir eventos e usuários", async () => {
      const transactionModels = new Map<string | symbol, any>();
      const tx = new Proxy(
        {},
        {
          get: (_target, property) => {
            if (!transactionModels.has(property)) {
              transactionModels.set(property, {
                delete: jest.fn().mockResolvedValue(undefined),
                deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
                updateMany: jest.fn().mockResolvedValue({ count: 0 }),
              });
            }
            return transactionModels.get(property);
          },
        },
      ) as any;

      prisma.$transaction = jest.fn(async (callback) => callback(tx));
      redis.client.get.mockResolvedValue(
        JSON.stringify({
          id: clientId,
          gestor_id: gestorId,
          company_name: "Acme",
        }),
      );
      // So cliente desativado pode ser excluido.
      prisma.client.findUnique.mockResolvedValue({
        settings: { is_active: false },
      });

      await service.deleteForUser(
        {
          sub: gestorId,
          role: Role.GESTOR,
          email: "gestor@example.com",
          name: "Gestor",
          client_id: null,
        },
        clientId,
      );

      expect(tx.serviceRating.deleteMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { vendor: { client_id: clientId } },
            { event: { client_id: clientId } },
          ],
        },
      });
      expect(
        tx.serviceRating.deleteMany.mock.invocationCallOrder[0],
      ).toBeLessThan(tx.event.deleteMany.mock.invocationCallOrder[0]);
      expect(
        tx.serviceRating.deleteMany.mock.invocationCallOrder[0],
      ).toBeLessThan(tx.user.deleteMany.mock.invocationCallOrder[0]);
      expect(redis.client.del).toHaveBeenCalledWith(`clients:item:${clientId}`);
      expect(redis.client.del).toHaveBeenCalledWith(
        `clients:access:${clientId}`,
      );
    });

    it.each([
      ["ativo explicitamente", { is_active: true }],
      // Cadastro antigo sem a flag conta como ativo.
      ["sem a flag is_active", {}],
    ])("cliente %s: bloqueia a exclusao", async (_label, settings) => {
      prisma.$transaction = jest.fn();
      redis.client.get.mockResolvedValue(
        JSON.stringify({ id: clientId, gestor_id: gestorId }),
      );
      prisma.client.findUnique.mockResolvedValue({ settings });

      await expect(
        service.deleteForUser(
          {
            sub: gestorId,
            role: Role.GESTOR,
            email: "gestor@example.com",
            name: "Gestor",
            client_id: null,
          },
          clientId,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("findAllForUser", () => {
    it("VENDEDOR: bloqueia (não previsto na regra)", async () => {
      await expect(
        service.findAllForUser({
          sub: "v",
          role: Role.VENDEDOR,
          email: "v@x",
          name: "V",
          client_id: clientId,
        } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("CLIENTE sem client_id: bloqueia", async () => {
      await expect(
        service.findAllForUser({
          sub: "c",
          role: Role.CLIENTE,
          email: "c@x",
          name: "C",
          client_id: null,
        } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  it("grava a marca principal dentro das configuracoes do cliente", async () => {
    redis.client.get.mockResolvedValue(
      JSON.stringify({ id: clientId, gestor_id: gestorId }),
    );
    prisma.client.findUnique.mockResolvedValue({
      settings: { is_active: true, address: "Rua A" },
    });
    prisma.client.update.mockResolvedValue({
      id: clientId,
      gestor_id: gestorId,
      company_name: "Acme",
      settings: { is_active: true, address: "Rua A", vehicle_brand: "Toyota" },
      _count: { leads: 0, event_participations: 0, vehicles: 0 },
      facebook_ad_accounts: [],
    });

    await service.updateForUser(
      {
        sub: gestorId,
        role: Role.GESTOR,
        email: "gestor@example.com",
        name: "Gestor",
        client_id: null,
      },
      clientId,
      { vehicle_brand: " Toyota " },
    );

    expect(prisma.client.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: clientId },
        data: expect.objectContaining({
          settings: expect.objectContaining({
            is_active: true,
            address: "Rua A",
            vehicle_brand: "Toyota",
          }),
        }),
      }),
    );
  });
});
