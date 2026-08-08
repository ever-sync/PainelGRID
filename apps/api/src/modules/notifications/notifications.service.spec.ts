import { NotificationType, Role } from "@prisma/client";
import { NotificationsService } from "./notifications.service";
import { PrismaService } from "../../config/prisma.service";
import { AuthenticatedUser } from "../auth/auth.types";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const GESTOR_ID = "22222222-2222-4222-8222-222222222222";
const VENDEDOR_ID = "33333333-3333-4333-8333-333333333333";

function createPrisma() {
  return {
    notification: {
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 3 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 5 }),
    },
    user: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: VENDEDOR_ID, role: Role.vendedor }]),
    },
    client: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ gestor: { id: GESTOR_ID, role: Role.gestor } }),
    },
  };
}

describe("NotificationsService", () => {
  let prisma: ReturnType<typeof createPrisma>;
  let service: NotificationsService;

  beforeEach(() => {
    prisma = createPrisma();
    service = new NotificationsService(prisma as unknown as PrismaService);
  });

  it("entrega para a equipe da empresa e para o gestor dono dela", async () => {
    await service.notifyClientTeam({
      clientId: CLIENT_ID,
      type: NotificationType.alert,
      title: "🚨 Cliente na recepção",
      description: "Fulano chegou.",
      target: "leads",
    });

    const rows = prisma.notification.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(2);
    expect(rows.map((row: { user_id: string }) => row.user_id).sort()).toEqual(
      [VENDEDOR_ID, GESTOR_ID].sort(),
    );
  });

  it("resolve a rota conforme o perfil de quem recebe", async () => {
    await service.notifyClientTeam({
      clientId: CLIENT_ID,
      type: NotificationType.message,
      title: "💬 Nova mensagem",
      description: "Oi",
      target: "chat",
    });

    const rows = prisma.notification.createMany.mock.calls[0][0].data;
    const byUser = new Map(
      rows.map((row: { user_id: string; href: string | null }) => [
        row.user_id,
        row.href,
      ]),
    );
    // Mesmo destino, caminhos diferentes: cada papel tem a sua tela.
    expect(byUser.get(GESTOR_ID)).toBe("/gestor/chat");
    expect(byUser.get(VENDEDOR_ID)).toBe("/vendedor/chat");
  });

  it("restringe a entrega quando o evento tem dono", async () => {
    await service.notifyClientTeam({
      clientId: CLIENT_ID,
      type: NotificationType.alert,
      title: "🚨 Cliente na recepção",
      description: "Fulano chegou.",
      target: "leads",
      userIds: [VENDEDOR_ID],
    });

    const rows = prisma.notification.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(VENDEDOR_ID);
  });

  it("nao propaga erro: notificacao nao pode derrubar a acao de origem", async () => {
    prisma.notification.createMany.mockRejectedValue(new Error("sem tabela"));

    await expect(
      service.notifyClientTeam({
        clientId: CLIENT_ID,
        type: NotificationType.info,
        title: "x",
        description: "y",
      }),
    ).resolves.toBe(0);
  });

  it("so mexe nas notificacoes do proprio usuario", async () => {
    const user = { sub: VENDEDOR_ID, role: "vendedor" } as AuthenticatedUser;

    await service.markRead(user, "44444444-4444-4444-8444-444444444444");
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: {
        id: "44444444-4444-4444-8444-444444444444",
        user_id: VENDEDOR_ID,
        read_at: null,
      },
      data: { read_at: expect.any(Date) },
    });

    await service.clear(user);
    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
      where: { user_id: VENDEDOR_ID },
    });
  });
});
